/** @import { ClientContext, Job, JobSpec, Options } from "../../private.js" */
import {
	CancelError,
	HttpError,
	NetworkError,
	TimeoutError
} from "../errors.js"
import { random_key } from "../key.js"
import {
	clamp_delay,
	link_signal,
	noop,
	race_signal,
	sleep
} from "../signal.js"
import {
	call_hook,
	merge_headers,
	omit_keys
} from "./config.js"
import {
	get_refresh_state,
	reject_refreshed,
	wait_refresh
} from "./refresh.js"
import {
	read_body,
	read_error_data,
	track_progress
} from "./response.js"
import {
	check_retry,
	get_retry_wait,
	is_idempotent,
	is_retryable
} from "./retry.js"
import { throttle } from "./throttle.js"
import { build_url } from "./url.js"
import { send_with_xhr } from "./xhr.js"
const option_keys = new Set(
	[
		"as",
		"body",
		"debounce",
		"dedupe",
		"headers",
		"idempotent",
		"lastEventId",
		"latest",
		"lock",
		"ok",
		"params",
		"parse",
		"progress",
		"reconnect",
		"retry",
		"signal",
		"throttle",
		"timeout",
		"upload"
	]
)
export const scheme_regex = /^[a-z][\d+\-.a-z]*:/i
const stream_types = new Set(
	[ "events", "ndjson", "stream" ]
)
const unshared_option_keys = [
	"ok",
	"parse",
	"progress",
	"retry",
	"timeout",
	"upload"
]
/**
 * @template T
 * @param {T} data
 * @returns {T}
 */
function clone_data(data) {
	if (data == null || typeof data != "object" || data instanceof Blob) return data
	try {
		return structuredClone(data)
	} catch {
		return data
	}
}
/**
 * @param {ClientContext} c
 * @param {JobSpec} spec
 * @param {AbortSignal} signal
 * @returns {Promise<import("../../public.js").RawResponse<unknown>>}
 */
async function execute(c, spec, signal) {
	const { method, options, summary } = spec
	const retry_option = options.retry ?? c.config.retry ?? 0
	const retry = typeof retry_option == "number" ? { count: retry_option } : retry_option
	const is_stream_body = spec.body instanceof ReadableStream
	const retry_count = is_stream_body ? 0 : Number(retry.count) || 0
	let attempt = 0
	let refreshed = false
	try {
		for (;;) {
			attempt++
			const refresh_state = c.config.refresh ? get_refresh_state(c.config.refresh) : void 0
			const generation = refresh_state?.generation ?? 0
			try {
				return await send(c, spec, attempt, signal)
			} catch (error) {
				if (signal.aborted) throw to_cancel_error(signal.reason, summary)
				const is_unauthorized = error instanceof HttpError && error.status == 401
				if (is_unauthorized && refresh_state) {
					if (refreshed) reject_refreshed(c, refresh_state, generation, error)
					else {
						refreshed = true
						await wait_refresh(
							c,
							spec,
							refresh_state,
							generation,
							error,
							signal
						)
						if (is_stream_body) throw error
						attempt--
						continue
					}
				}
				if (attempt > retry_count) throw error
				if (!spec.idempotency_key && options.retry == null && !is_idempotent(method)) throw error
				const retryable = retry.when
					? await race_signal(
						Promise.resolve(retry.when(error, attempt)),
						signal
					)
						.catch(
							(/** @type {unknown} */ reason) => {
								throw signal.aborted ? to_cancel_error(signal.reason, summary) : reason
							}
						)
					: is_retryable(error)
				if (!retryable) throw error
				const delay = get_retry_wait(retry, attempt, error)
				if (delay == null) throw error
				await sleep(delay, signal)
					.catch(
						(/** @type {unknown} */ reason) => {
							throw to_cancel_error(reason, summary)
						}
					)
			}
		}
	} catch (error) {
		if (!spec.silent) report(c, error)
		throw error
	}
}
/**
 * @param {unknown} body
 * @returns {boolean}
 */
function is_raw_body(body) {
	return typeof body == "string"
	|| body instanceof ArrayBuffer
	|| ArrayBuffer.isView(body)
	|| body instanceof Blob
	|| body instanceof FormData
	|| body instanceof ReadableStream
	|| body instanceof URLSearchParams
}
/**
 * @param {AsyncIterable<unknown>} lines
 * @param {(data: unknown) => unknown} parse
 * @returns {AsyncGenerator<unknown, void, undefined>}
 */
async function* map_lines(lines, parse) {
	for await (const line of lines) yield parse(line)
}
/**
 * @param {ClientContext} c
 * @param {unknown} error
 * @returns {void}
 */
export function report(c, error) {
	if (!(error instanceof CancelError)) call_hook(c.config.on?.error, error)
}
/**
 * @param {ClientContext} c
 * @template T
 * @param {string} method
 * @param {string} path
 * @param {import("../../public.js").QueryParams | undefined} params
 * @param {unknown} body
 * @param {Options} options
 * @param {boolean} silent
 * @returns {import("../../public.js").LubeRequest<T>}
 */
export function request(
	c,
	method,
	path,
	params,
	body,
	options,
	silent
) {
	/** @type {import("../../public.js").RequestSummary} */
	const summary = { method, url: path }
	const controller = new AbortController()
	/**
	 * @param {unknown} reason
	 * @returns {void}
	 */
	function cancel(reason) {
		return controller.abort(
			reason instanceof CancelError
				? reason
				: new CancelError(reason ?? "Cancelled", summary)
		)
	}
	const is_stream = options.as != null && stream_types.has(options.as)
	const raw = (async () => {
		const unlink = link_signal(
			controller,
			options.signal ?? void 0
		)
		let from_job = false
		let keeps_link = false
		/** @type {string | undefined} */
		let latest_key
		function forget_latest() {
			if (latest_key != null && c.shared.latest.get(latest_key) == cancel) c.shared.latest.delete(latest_key)
		}
		/** @type {Job | undefined} */
		let job
		try {
			if ((method == "GET" || method == "HEAD") && body !== void 0) throw TypeError(
				`A ${method} request cannot have a body: ${path}`
			)
			if (is_stream && options.lock != null) throw TypeError(
				`A request read as "${options.as}" cannot be locked, because its body is read once: ${path}`
			)
			check_retry(
				options.retry ?? c.config.retry,
				"request"
			)
			const url = build_url(
				c.config.base,
				path,
				params,
				c.config.query
			)
			summary.url = url
			if (!c.config.fetch && typeof location == "undefined" && !scheme_regex.test(url)) throw TypeError(
				`The URL "${url}" is relative: set base, or use an absolute URL`
			)
			if (controller.signal.aborted) throw controller.signal.reason
			if (options.latest != null) latest_key = [
				c.client_id,
				"latest",
				options.latest
			].join(" ")
			else if (options.debounce) latest_key = [
				c.client_id,
				"debounce",
				method,
				url.replace(/[?#].*/s, "")
			].join(" ")
			if (latest_key != null) {
				c.shared.latest.get(latest_key)?.(
					"Superseded by a newer request"
				)
				c.shared.latest.set(latest_key, cancel)
			}
			if (options.debounce) await sleep(
				options.debounce,
				controller.signal
			)
			if (options.throttle) await throttle(
				c,
				[
					c.client_id,
					"throttle",
					method,
					url.replace(/[?#].*/s, "")
				].join(" "),
				options.throttle,
				cancel,
				controller.signal
			)
			if (controller.signal.aborted) throw controller.signal.reason
			const is_shareable = options.dedupe !== false
				&& (method == "GET" || method == "HEAD")
				&& latest_key == null
				&& !is_stream
				&& options.as != "formData"
				&& unshared_option_keys.every(
					key => options[/** @type {keyof Options} */(key)/**/] == null
				)
				&& Object.keys(options).every(key => option_keys.has(key))
			const share_key = options.lock != null
				? [
					c.client_id,
					"lock",
					method,
					url.replace(/[?#].*/s, ""),
					options.lock
				].join(" ")
				: is_shareable
					? [
						c.client_id,
						method,
						url,
						options.as ?? "",
						options.headers
							? JSON.stringify(
								[
									...new Headers(options.headers)
								]
							)
							: ""
					].join(" ")
					: void 0
			job = share_key == null ? void 0 : c.shared.shared.get(share_key)
			if (job?.controller.signal.aborted) job = void 0
			const joined = !!job
			if (!job) {
				job = start_job(
					c,
					{
						body,
						idempotency_key: options.idempotent
							? typeof options.idempotent == "string"
								? options.idempotent
								: random_key()
							: void 0,
						method,
						options,
						silent,
						summary,
						url
					},
					share_key
				)
			}
			job.refs++
			if (is_stream) link_signal(
				job.controller,
				controller.signal
			)
			from_job = true
			const result = await race_signal(job.promise, controller.signal)
			if (joined) return {
				...result,
				data: clone_data(result.data)
			}
			if (!is_stream) return result
			keeps_link = true
			function done() {
				unlink()
				forget_latest()
			}
			return {
				...result,
				data: options.as == "stream"
					? watch_stream(
						/** @type {ReadableStream<Uint8Array<ArrayBuffer>> | null} */(result.data)/**/,
						done
					)
					: watch_records(
						/** @type {AsyncIterable<unknown>} */(result.data)/**/,
						(left, failure) => {
							if (left) cancel(void 0)
							else if (failure && !silent) report(c, failure.value)
							done()
						}
					)
			}
		} catch (error) {
			if (controller.signal.aborted) throw to_cancel_error(
				controller.signal.reason,
				summary
			)
			if (!from_job && !silent) report(c, error)
			throw error
		} finally {
			if (!keeps_link) {
				unlink()
				forget_latest()
			}
			if (job && !--job.refs && !job.settled) {
				if (job.key != null && c.shared.shared.get(job.key) == job) c.shared.shared.delete(job.key)
				job.controller.abort(
					new CancelError(
						"Cancelled by all callers",
						summary
					)
				)
			}
		}
	})()
	const data = raw.then(result => result.data)
	return /** @type {import("../../public.js").LubeRequest<T>} */(Object.assign(
		data,
		{
			cancel,
			raw: () => {
				data.catch(noop)
				return raw
			},
			safe: () => {
				data.catch(noop)
				return raw.then(
					result => [ void 0, result.data ],
					(/** @type {unknown} */ error) => [ error, void 0 ]
				)
			}
		}
	))/**/
}
/**
 * @param {ClientContext} c
 * @param {JobSpec} spec
 * @param {number} attempt
 * @param {AbortSignal} job_signal
 * @returns {Promise<import("../../public.js").RawResponse<unknown>>}
 */
async function send(c, spec, attempt, job_signal) {
	const { method, options, summary } = spec
	const controller = new AbortController()
	const is_stream = options.as != null && stream_types.has(options.as)
	const unlink = link_signal(controller, job_signal)
	const timeout = options.timeout ?? c.config.timeout
	let timed_out = false
	const timer = timeout
		? setTimeout(
			() => {
				timed_out = true
				controller.abort()
			},
			clamp_delay(timeout)
		)
		: void 0
	let keeps_link = false
	/** @type {Response | undefined} */
	let response
	function abort_error() {
		return timed_out
			? new TimeoutError(
				/** @type {number} */(timeout)/**/,
				summary
			)
			: to_cancel_error(job_signal.reason, summary)
	}
	/**
	 * @param {AsyncIterable<unknown>} lines
	 * @returns {AsyncGenerator<unknown, void, undefined>}
	 */
	async function* guard_lines(lines) {
		try {
			yield* lines
		} catch (error) {
			if (controller.signal.aborted) throw abort_error()
			if (error instanceof SyntaxError) throw invalid_json(error)
			throw new NetworkError(error, summary)
		}
	}
	/**
	 * @param {SyntaxError} error
	 * @returns {SyntaxError}
	 */
	function invalid_json(error) {
		/** @type {SyntaxError & { request?: import("../../public.js").RequestSummary, response?: Response | undefined }} */
		const invalid = new SyntaxError(
			`Invalid JSON in the response of ${summary.method} ${summary.url}: ${error.message}`
		)
		invalid.cause = error
		invalid.request = summary
		invalid.response = response
		return invalid
	}
	try {
		const headers = new Headers()
		await race_signal(
			merge_headers(c.config.headers, headers),
			controller.signal
		)
		await race_signal(
			merge_headers(options.headers, headers),
			controller.signal
		)
		/** @type {import("../../public.js").RequestContext} */
		const context = {
			attempt,
			body: spec.body,
			headers,
			method,
			options: /** @type {import("../../public.js").RequestOptions} */(options)/**/,
			url: spec.url
		}
		if (controller.signal.aborted) throw abort_error()
		await race_signal(
			Promise.resolve(
				c.config.on?.request?.(context)
			),
			controller.signal
		)
		summary.url = context.url
		const raw_body = context.body === void 0 || is_raw_body(context.body)
		const body = raw_body ? context.body : JSON.stringify(context.body)
		if (!raw_body && !headers.has("Content-Type")) headers.set(
			"Content-Type",
			"application/json"
		)
		if (body instanceof FormData) headers.delete("Content-Type")
		if (spec.idempotency_key && !headers.has("Idempotency-Key")) {
			headers.set(
				"Idempotency-Key",
				spec.idempotency_key
			)
		}
		/** @type {RequestInit & { duplex?: string, headers: Headers }} */
		const init = {
			...c.base_init,
			...omit_keys(options, option_keys),
			body: /** @type {BodyInit | null} */(body ?? null)/**/,
			headers,
			method,
			signal: controller.signal
		}
		if (body instanceof ReadableStream) init.duplex = "half"
		const uses_xhr = !!options.upload && !c.config.fetch && typeof XMLHttpRequest != "undefined"
		if (uses_xhr && body instanceof ReadableStream) throw TypeError(
			"Upload progress cannot be reported for a ReadableStream body"
		)
		const started = Date.now()
		try {
			response = await race_signal(
				uses_xhr
					? send_with_xhr(
						context.url,
						init,
						/** @type {(progress: import("../../public.js").Progress) => void} */(options.upload)/**/
					)
					: (c.config.fetch ?? fetch)(context.url, init),
				controller.signal
			)
		} catch (error) {
			throw controller.signal.aborted ? abort_error() : new NetworkError(error, summary)
		}
		const received = response
		if (!(options.ok ?? c.config.ok ?? (() => received.ok))(received)) {
			const error_data = await race_signal(
				read_error_data(received),
				controller.signal
			)
			throw new HttpError(received, error_data, summary)
		}
		if (is_stream) clearTimeout(timer)
		/** @type {unknown} */
		let data
		try {
			data = await race_signal(
				read_body(
					track_progress(received, options.progress),
					options.as,
					method,
					received.url || context.url
				),
				controller.signal
			)
		} catch (error) {
			if (controller.signal.aborted) throw abort_error()
			if (!(error instanceof SyntaxError)) throw new NetworkError(error, summary)
			throw invalid_json(error)
		}
		if (options.as == "ndjson" || options.as == "events") data = guard_lines(
			/** @type {AsyncIterable<unknown>} */(data)/**/
		)
		if (options.parse) {
			const parse = options.parse
			data = options.as == "ndjson"
				? map_lines(
					/** @type {AsyncIterable<unknown>} */(data)/**/,
					parse
				)
				: await race_signal(
					Promise.resolve(data).then(parse),
					controller.signal
				)
		}
		/** @type {import("../../public.js").RawResponse<unknown>} */
		const result = {
			data,
			headers: received.headers,
			response: received,
			status: received.status
		}
		await race_signal(
			Promise.resolve(
				c.config.on?.response?.(
					{
						...context,
						...result,
						duration: Date.now() - started
					}
				)
			),
			controller.signal
		)
		keeps_link = is_stream
		return result
	} catch (error) {
		if (response && !response.bodyUsed && !response.body?.locked) response.body?.cancel().catch(noop)
		const is_known = error instanceof CancelError
			|| error instanceof HttpError
			|| error instanceof NetworkError
			|| error instanceof TimeoutError
		if (controller.signal.aborted && !is_known) throw abort_error()
		throw error
	} finally {
		clearTimeout(timer)
		if (!keeps_link) unlink()
	}
}
/**
 * @param {ClientContext} c
 * @param {JobSpec} spec
 * @param {string | undefined} key
 * @returns {Job}
 */
function start_job(c, spec, key) {
	/** @type {Job} */
	const job = {
		controller: new AbortController(),
		key,
		promise: Promise.resolve(
			/** @type {import("../../public.js").RawResponse<unknown>} */(/** @type {unknown} */(void 0))/**/
		),
		refs: 0,
		settled: false
	}
	job.promise = execute(c, spec, job.controller.signal)
	if (key != null) c.shared.shared.set(key, job)
	job.promise.then(noop, noop)
		.finally(
			() => {
				job.settled = true
				if (key != null && c.shared.shared.get(key) == job) c.shared.shared.delete(key)
			}
		)
	return job
}
/**
 * @param {string} text
 * @returns {string}
 */
export function to_byte_string(text) {
	return String.fromCharCode(
		...new TextEncoder().encode(text)
	)
}
/**
 * @param {unknown} reason
 * @param {import("../../public.js").RequestSummary} summary
 * @returns {CancelError}
 */
function to_cancel_error(reason, summary) {
	return reason instanceof CancelError ? reason : new CancelError(reason, summary)
}
/**
 * @template T
 * @param {AsyncIterable<T>} records
 * @param {(left: boolean, failure: { value: unknown } | undefined) => void} finish
 * @returns {AsyncIterableIterator<T>}
 */
export function watch_records(records, finish) {
	const reader = records[Symbol.asyncIterator]()
	let finished = false
	return {
		[Symbol.asyncIterator]() {
			return this
		},
		async next() {
			if (finished) return { done: true, value: void 0 }
			try {
				const step = await reader.next()
				if (finished) return { done: true, value: void 0 }
				if (step.done) {
					finished = true
					finish(false, void 0)
				}
				return step
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finished = true
				finish(false, { value: error })
				throw error
			}
		},
		async return() {
			if (!finished) {
				finished = true
				finish(true, void 0)
				try {
					Promise.resolve(reader.return?.())
						.catch(noop)
				} catch {}
			}
			return { done: true, value: void 0 }
		}
	}
}
/**
 * @param {ReadableStream<Uint8Array<ArrayBuffer>> | null} stream
 * @param {() => void} done
 * @returns {ReadableStream<Uint8Array<ArrayBuffer>> | null}
 */
function watch_stream(stream, done) {
	if (!stream) {
		done()
		return stream
	}
	const reader = stream.getReader()
	return new ReadableStream(
		{
			/**
			 * @param {unknown} reason
			 */
			cancel(reason) {
				done()
				return reader.cancel(reason)
			},
			async pull(controller) {
				try {
					const { done: finished, value } = await reader.read()
					if (finished) {
						done()
						controller.close()
					} else controller.enqueue(value)
				} catch (error) {
					done()
					controller.error(error)
				}
			}
		}
	)
}
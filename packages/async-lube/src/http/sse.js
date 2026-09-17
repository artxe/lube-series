/** @import { ClientContext, StreamRecord } from "../../private.js" */
import {
	CancelError,
	HttpError,
	NetworkError,
	TimeoutError
} from "../errors.js"
import {
	clamp_delay,
	link_signal,
	noop,
	on_abort,
	race_signal,
	sleep_until
} from "../signal.js"
import { omit_keys } from "./config.js"
import {
	report,
	request,
	to_byte_string,
	watch_records
} from "./request.js"
import {
	check_reconnect,
	get_reconnect_wait,
	read_retry_after
} from "./retry.js"
const event_stream_regex = /^text\/event-stream(?:$|[;\s])/i
const request_only_keys = new Set(
	[
		"debounce",
		"dedupe",
		"idempotent",
		"latest",
		"lock",
		"progress",
		"retry",
		"throttle",
		"upload"
	]
)
const sse_keys = new Set(
	[
		"as",
		"body",
		"headers",
		"lastEventId",
		"method",
		"ok",
		"onStatus",
		"params",
		"parse",
		"reconnect",
		"signal",
		"timeout"
	]
)
const sse_retry_statuses = new Set([ 408, 425, 429 ])
const stable_delay = 5000
/**
 * @param {import("../../public.js").SseOptions} options
 * @returns {void}
 */
function check_sse_options(options) {
	for (const key of Object.keys(options)) {
		if (request_only_keys.has(key)) throw TypeError(`Unknown sse option "${key}"`)
	}
	if (options.as != null && options.as != "json" && options.as != "text") throw TypeError(
		"The as of sse() must be \"json\" or \"text\""
	)
	check_reconnect(options.reconnect, "sse")
}
/**
 * @param {unknown} error
 * @returns {boolean}
 */
function is_reconnectable(error) {
	return error instanceof NetworkError
	|| error instanceof TimeoutError
	|| error instanceof HttpError && (error.status < 400 || error.status >= 500 || sse_retry_statuses.has(error.status))
}
/**
 * @param {string} data
 * @returns {unknown}
 */
function read_json(data) {
	try {
		return JSON.parse(data)
	} catch {
		return data
	}
}
/**
 * @param {ClientContext} c
 * @param {string} path
 * @param {import("../../public.js").QueryParams | undefined} params
 * @param {import("../../public.js").SseOptions} options
 * @returns {import("../../public.js").EventStream<unknown>}
 */
export function sse(c, path, params, options) {
	check_sse_options(options)
	const init = omit_keys(options, sse_keys)
	const closed = new AbortController()
	const method = (options.method ?? "GET").toUpperCase()
	const reconnect = options.reconnect ?? method == "GET"
	const reconnect_count = typeof reconnect == "object" ? reconnect.count ?? Infinity : Infinity
	const as_json = options.as == "json"
	const parse = options.parse
	let last_event_id = options.lastEventId ?? ""
	/** @type {import("../../public.js").ConnectionStatus} */
	let stream_status = "idle"
	/** @type {AbortController | undefined} */
	let current
	const signal = options.signal
	const unwatch = options.onStatus && signal && !signal.aborted
		? on_abort(
			signal,
			() => {
				closed.abort(signal.reason)
				set_status("closed")
			}
		)
		: noop
	/**
	 * @param {AbortController} controller
	 * @returns {AsyncGenerator<import("../../public.js").ServerEvent<unknown>, void, undefined>}
	 */
	async function* connect(controller) {
		const unlink = link_signal(closed, options.signal ?? void 0)
		const unlink_closed = link_signal(controller, closed.signal)
		let failures = 0
		/** @type {unknown} */
		let last_error
		/** @type {number | undefined} */
		let server_retry
		/**
		 * @param {import("../../public.js").ConnectionStatus} next
		 * @returns {void}
		 */
		function show(next) {
			if (current == controller && !controller.signal.aborted) set_status(next)
		}
		try {
			if (controller.signal.aborted) return
			show("connecting")
			if (reconnect && options.body instanceof ReadableStream) throw TypeError(
				"An event stream with a ReadableStream body cannot reconnect: set reconnect to false"
			)
			for (;;) {
				const connection = new AbortController()
				let opened_at = 0
				const unlink_connection = link_signal(connection, controller.signal)
				/** @type {unknown} */
				let fatal
				try {
					const headers = new Headers(options.headers)
					headers.set("Accept", "text/event-stream")
					if (last_event_id) headers.set(
						"Last-Event-ID",
						to_byte_string(last_event_id)
					)
					/** @type {import("../../public.js").RawResponse<unknown>} */
					const {
						data,
						headers: response_headers,
						status
					} = await request(
						c,
						method,
						path,
						{ ...options.params, ...params },
						options.body,
						{
							...init,
							as: "events",
							dedupe: false,
							headers,
							ok: options.ok,
							retry: 0,
							signal: connection.signal,
							timeout: options.timeout
						},
						true
					)
						.raw()
					if (status == 204) return
					if (!event_stream_regex.test(
						response_headers.get("Content-Type") ?? ""
					)) {
						fatal = TypeError(
							`Expected text/event-stream from ${path}, but received ${response_headers.get("Content-Type")}`
						)
						throw fatal
					}
					opened_at = Date.now()
					show("open")
					const records = /** @type {AsyncIterable<StreamRecord>} */(data)/**/
					for await (const record of records) {
						if (record.type == "retry") server_retry = record.retry
						else if (record.type == "id") last_event_id = record.id
						else {
							last_event_id = record.event.id
							const event_data = as_json ? read_json(record.event.data) : record.event.data
							if (!parse) {
								yield as_json
									? {
										...record.event,
										data: event_data
									}
									: record.event
								continue
							}
							/** @type {unknown} */
							let parsed
							try {
								parsed = await race_signal(
									Promise.resolve(parse(event_data)),
									controller.signal
								)
							} catch (error) {
								fatal = error
								throw error
							}
							yield { ...record.event, data: parsed }
						}
					}
					failures = 0
				} catch (error) {
					if (controller.signal.aborted) return
					last_error = error
					report(c, error)
					if (opened_at && Date.now() - opened_at >= stable_delay) failures = 0
					if (error === fatal || !reconnect || !is_reconnectable(error) || ++failures > reconnect_count) throw error
				} finally {
					unlink_connection()
					connection.abort(
						new CancelError(
							"The event stream connection was closed"
						)
					)
				}
				if (!reconnect || controller.signal.aborted) return
				show("connecting")
				const delay = failures
					? get_reconnect_wait(reconnect, failures, last_error)
					: server_retry ?? 3000
				if (delay == null) throw last_error
				await wait(
					delay,
					controller.signal,
					!!failures && read_retry_after(last_error) == null
				)
				if (controller.signal.aborted) return
			}
		} catch (error) {
			if (error !== last_error) report(c, error)
			throw error
		} finally {
			if (current == controller) set_status(
				closed.signal.aborted ? "closed" : "idle"
			)
			unlink()
			unlink_closed()
			controller.abort(
				new CancelError("The event stream was closed")
			)
		}
	}
	/**
	 * @param {import("../../public.js").ConnectionStatus} next
	 * @returns {void}
	 */
	function set_status(next) {
		if (stream_status == next) return
		stream_status = next
		try {
			options.onStatus?.(next)
		} catch {}
	}
	return {
		[Symbol.asyncIterator]() {
			const controller = new AbortController()
			current = controller
			return watch_records(
				connect(controller),
				left => {
					if (!left) return
					controller.abort(
						new CancelError("The event stream was closed")
					)
					if (current == controller) set_status(
						closed.signal.aborted ? "closed" : "idle"
					)
				}
			)
		},
		/**
		 * @param {unknown} reason
		 * @returns {void}
		 */
		cancel(reason) {
			unwatch()
			closed.abort(
				new CancelError(reason ?? "Cancelled")
			)
			set_status("closed")
		},
		get lastEventId() {
			return last_event_id
		},
		get status() {
			return options.signal?.aborted ? "closed" : stream_status
		}
	}
}
/**
 * @param {number} delay
 * @param {AbortSignal} signal
 * @param {boolean} online
 * @returns {Promise<void>}
 */
function wait(delay, signal, online) {
	if (!online || typeof globalThis.addEventListener != "function") {
		return sleep_until(Date.now() + delay, signal)
			.catch(noop)
	}
	return new Promise(
		resolve => {
			if (signal.aborted) {
				resolve()
				return
			}
			function done() {
				clearTimeout(timer)
				unwatch()
				globalThis.removeEventListener("online", done)
				resolve()
			}
			const timer = setTimeout(done, clamp_delay(delay))
			const unwatch = on_abort(signal, done)
			globalThis.addEventListener("online", done)
		}
	)
}
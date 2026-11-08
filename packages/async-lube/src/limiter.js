/** @import { LimiterJob, LimiterState } from "../private.js" */
import { CancelError } from "./errors.js"
import { check_options } from "./options.js"
import { clamp_delay, noop, on_abort } from "./signal.js"
/**
 * @param {{ concurrency?: number | undefined, rate?: { count: number, per: number, window?: "fixed" | "sliding" | undefined } | undefined }} options
 * @param {() => void=} on_idle
 * @returns {LimiterState}
 */
function create_state(options, on_idle) {
	const { concurrency = Infinity, rate } = options
	const fixed = rate?.window == "fixed"
	/** @type {LimiterJob[]} */
	const queue = []
	/** @type {number[]} */
	const starts = []
	let window_start = 0
	let used = 0
	/** @type {LimiterState} */
	const state = {
		queue,
		running: 0,
		schedule: pump,
		take
	}
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	return state
	/** @returns {void} */
	function done() {
		state.running--
		pump()
	}
	/** @returns {void} */
	function pump() {
		while (queue.length && state.running < concurrency) {
			if (rate) {
				const wait = reserve(Date.now())
				if (wait > 0) {
					timer ??= setTimeout(
						() => {
							timer = void 0
							pump()
						},
						clamp_delay(wait)
					)
					return
				}
			}
			const job = /** @type {LimiterJob} */(queue.shift())/**/
			job.unlink()
			state.running++
			const { fn } = job
			if (fn) {
				Promise.resolve()
					.then(fn)
					.then(job.resolve, job.reject)
					.finally(done)
				continue
			}
			let released = false
			job.resolve(
				{
					release: () => {
						if (released) {
							return
						}
						released = true
						done()
					}
				}
			)
		}
		if (queue.length || state.running || timer || !on_idle) {
			return
		}
		const left = !rate
			? 0
			: fixed
				? used
					? window_start + rate.per - Date.now()
					: 0
				: starts.length
					? /** @type {number} */(starts.at(-1))/**/ + rate.per - Date.now()
					: 0
		if (left > 0) {
			timer = setTimeout(
				() => {
					timer = void 0
					pump()
				},
				clamp_delay(left)
			)
			return
		}
		on_idle()
	}
	/**
	 * @param {number} now
	 * @returns {number}
	 */
	function reserve(now) {
		const { count, per } = /** @type {{ count: number, per: number }} */(rate)/**/
		if (fixed) {
			if (used && now - window_start >= per) {
				used = 0
			}
			if (used >= count) {
				return window_start + per - now
			}
			if (!used) {
				window_start = now
			}
			used++
			return 0
		}
		while (starts.length && now - /** @type {number} */(starts[0])/**/ >= per) {
			starts.shift()
		}
		if (starts.length >= count) {
			return /** @type {number} */(starts[0])/**/ + per - now
		}
		starts.push(now)
		return 0
	}
	/** @returns {number} */
	function take() {
		return reserve(Date.now())
	}
}
/**
 * Limits the calls that run at the same time, and the calls that start per interval, across everything that shares it:
 * a database pool, a file system, an API quota. Use it inside flow nodes to limit them across runs.
 * With a `rate`, `take()` answers at once whether a start is free, e.g. for a packet limit per socket.
 * @example
 * const db = limiter({ concurrency: 10 })
 * const openai = limiter({ rate: { count: 60, per: 60000 } })
 * const user = await db(() => pool.query("select ..."))
 * const packets = limiter({ rate: { count: 20, per: 1000, window: "fixed" } })
 * const retry_after = packets.take(socket.id)
 * @param {{ concurrency?: number | undefined, rate?: { count: number, per: number, window?: "fixed" | "sliding" | undefined } | undefined }} options
 * @returns {import("../public.js").Limiter}
 */
export function limiter(options) {
	check_options(
		options,
		[ "concurrency", "rate" ],
		"limiter"
	)
	check_options(
		options.rate,
		[ "count", "per", "window" ],
		"limiter",
		"rate."
	)
	const { concurrency = Infinity, rate } = options
	if (!(concurrency === Infinity || Number.isInteger(concurrency) && concurrency >= 1)) {
		throw TypeError(
			"The concurrency of limiter() must be a positive integer or Infinity"
		)
	}
	if (rate && !(Number.isInteger(rate.count) && rate.count >= 1 && typeof rate.per == "number" && rate.per > 0)) {
		throw TypeError(
			"The rate of limiter() must be { count, per } with a positive integer count and positive milliseconds"
		)
	}
	if (rate?.window !== void 0 && rate.window != "sliding" && rate.window != "fixed") {
		throw TypeError(
			"The rate.window of limiter() must be \"sliding\" or \"fixed\""
		)
	}
	/** @type {Map<unknown, LimiterState>} */
	const keyed = new Map()
	const root = create_state(options)
	return to_limiter(
		() => root,
		() => root,
		key,
		name => take(() => root, name)
	)
	/**
	 * @param {unknown} name
	 * @returns {import("../public.js").Limiter}
	 */
	function key(name) {
		return to_limiter(
			() => state_of(name),
			() => keyed.get(name),
			key,
			other => take(() => state_of(name), other)
		)
	}
	/**
	 * @param {unknown} name
	 * @returns {LimiterState}
	 */
	function state_of(name) {
		let state = keyed.get(name)
		if (!state) {
			state = create_state(
				options,
				() => keyed.delete(name)
			)
			keyed.set(name, state)
		}
		return state
	}
	/**
	 * @param {() => LimiterState} own
	 * @param {unknown} name
	 * @returns {number}
	 */
	function take(own, name) {
		if (!rate) {
			throw TypeError(
				"take() of limiter() needs a rate"
			)
		}
		const state = name === void 0 ? own() : state_of(name)
		const wait = state.take()
		state.schedule()
		return wait
	}
}
/**
 * @param {unknown} reason
 * @returns {CancelError}
 */
function to_cancel_error(reason) {
	return reason instanceof CancelError ? reason : new CancelError(reason)
}
/**
 * @param {() => LimiterState} current
 * @param {() => LimiterState | undefined} peek
 * @param {(key: unknown) => import("../public.js").Limiter} key
 * @param {(key: unknown) => number} take
 * @returns {import("../public.js").Limiter}
 */
function to_limiter(current, peek, key, take) {
	return /** @type {import("../public.js").Limiter} */(Object.defineProperties(
		limit,
		{
			acquire: {
				value: (
					/** @type {AbortSignal=} */ signal
				) => enqueue(void 0, signal)
			},
			key: { value: key },
			pending: {
				get: () => peek()?.queue.length ?? 0
			},
			running: {
				get: () => peek()?.running ?? 0
			},
			take: { value: take }
		}
	))/**/
	/**
	 * @param {(() => unknown) | undefined} fn
	 * @param {AbortSignal | undefined} signal
	 * @returns {Promise<unknown>}
	 */
	function enqueue(fn, signal) {
		return new Promise(
			(resolve, reject) => {
				if (signal?.aborted) {
					reject(to_cancel_error(signal.reason))
					return
				}
				const state = current()
				/** @type {LimiterJob} */
				const job = { fn, reject, resolve, unlink: noop }
				if (signal) {
					job.unlink = on_abort(
						signal,
						() => {
							const index = state.queue.indexOf(job)
							if (index < 0) {
								return
							}
							state.queue.splice(index, 1)
							reject(to_cancel_error(signal.reason))
							state.schedule()
						}
					)
				}
				state.queue.push(job)
				state.schedule()
			}
		)
	}
	/**
	 * @param {() => unknown} fn
	 * @param {AbortSignal=} signal
	 * @returns {Promise<unknown>}
	 */
	function limit(fn, signal) {
		return enqueue(fn, signal)
	}
}
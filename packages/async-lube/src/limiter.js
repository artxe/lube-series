/** @import { LimiterJob, LimiterState } from "../private.js" */
import { CancelError } from "./errors.js"
import { check_options } from "./options.js"
import { clamp_delay, noop, on_abort } from "./signal.js"
/**
 * @param {{ concurrency?: number | undefined, rate?: { count: number, per: number } | undefined }} options
 * @param {() => void=} on_idle
 * @returns {LimiterState}
 */
function create_state(options, on_idle) {
	const { concurrency = Infinity, rate } = options
	/** @type {LimiterJob[]} */
	const queue = []
	/** @type {number[]} */
	const starts = []
	/** @type {LimiterState} */
	const state = { queue, running: 0, schedule: pump }
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	/**
	 * @returns {void}
	 */
	function done() {
		state.running--
		pump()
	}
	/**
	 * @returns {void}
	 */
	function pump() {
		while (queue.length && state.running < concurrency) {
			if (rate) {
				const now = Date.now()
				while (starts.length && now - /** @type {number} */(starts[0])/**/ >= rate.per) starts.shift()
				if (starts.length >= rate.count) {
					timer ??= setTimeout(
						() => {
							timer = void 0
							pump()
						},
						clamp_delay(
							/** @type {number} */(starts[0])/**/ + rate.per - now
						)
					)
					return
				}
				starts.push(now)
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
						if (released) return
						released = true
						done()
					}
				}
			)
		}
		if (queue.length || state.running || timer || !on_idle) return
		const left = rate && starts.length
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
	return state
}
/**
 * Limits the calls that run at the same time, and the calls that start per interval, across everything that shares it:
 * a database pool, a file system, an API quota. Use it inside flow nodes to limit them across runs.
 * @example
 * const db = limiter({ concurrency: 10 })
 * const openai = limiter({ rate: { count: 60, per: 60000 } })
 * const user = await db(() => pool.query("select ..."))
 * @param {{ concurrency?: number | undefined, rate?: { count: number, per: number } | undefined }} options
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
		[ "count", "per" ],
		"limiter",
		"rate."
	)
	const { concurrency = Infinity, rate } = options
	if (!(concurrency === Infinity || Number.isInteger(concurrency) && concurrency >= 1)) throw TypeError(
		"The concurrency of limiter() must be a positive integer or Infinity"
	)
	if (rate && !(Number.isInteger(rate.count) && rate.count >= 1 && typeof rate.per == "number" && rate.per > 0)) throw TypeError(
		"The rate of limiter() must be { count, per } with a positive integer count and positive milliseconds"
	)
	/** @type {Map<unknown, LimiterState>} */
	const keyed = new Map()
	const root = create_state(options)
	/**
	 * @param {unknown} name
	 * @returns {import("../public.js").Limiter}
	 */
	function key(name) {
		/**
		 * @returns {LimiterState}
		 */
		function current() {
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
		return to_limiter(
			current,
			() => keyed.get(name),
			key
		)
	}
	return to_limiter(() => root, () => root, key)
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
 * @returns {import("../public.js").Limiter}
 */
function to_limiter(current, peek, key) {
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
							if (index < 0) return
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
			}
		}
	))/**/
}
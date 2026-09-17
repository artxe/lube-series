/** @type {WeakMap<AbortSignal, { callbacks: Set<() => void>, listener: () => void }>} */
const abort_entries = new WeakMap()
const max_delay = 2147483647
/**
 * @param {number} ms
 * @returns {number}
 */
export function clamp_delay(ms) {
	return ms > 0 ? Math.min(ms, max_delay) : 0
}
/**
 * @param {Pick<AbortController, "abort">} controller
 * @param {AbortSignal=} signal
 * @returns {() => void}
 */
export function link_signal(controller, signal) {
	if (!signal) return noop
	if (signal.aborted) {
		controller.abort(signal.reason)
		return noop
	}
	return on_abort(
		signal,
		() => controller.abort(signal.reason)
	)
}
export function noop() {}
/**
 * @param {AbortSignal} signal
 * @param {() => void} callback
 * @returns {() => void}
 */
export function on_abort(signal, callback) {
	/** @type {{ callbacks: Set<() => void>, listener: () => void } | undefined} */
	let entry = abort_entries.get(signal)
	if (!entry) {
		/** @type {Set<() => void>} */
		const callbacks = new Set()
		function listener() {
			abort_entries.delete(signal)
			for (const call of [ ...callbacks ]) call()
		}
		entry = { callbacks, listener }
		abort_entries.set(signal, entry)
		signal.addEventListener("abort", listener, { once: true })
	}
	const current = entry
	current.callbacks.add(callback)
	return () => {
		if (!current.callbacks.delete(callback) || current.callbacks.size || abort_entries.get(signal) != current) return
		abort_entries.delete(signal)
		signal.removeEventListener("abort", current.listener)
	}
}
/**
 * @template T
 * @param {PromiseLike<T>} promise
 * @param {AbortSignal} signal
 * @returns {Promise<T>}
 */
export function race_signal(promise, signal) {
	return new Promise(
		(resolve, reject) => {
			if (signal.aborted) {
				promise.then(void 0, noop)
				reject(signal.reason)
				return
			}
			const unlink = on_abort(
				signal,
				() => reject(signal.reason)
			)
			promise.then(resolve, reject)
				.then(unlink)
		}
	)
}
/**
 * @param {number} ms
 * @param {AbortSignal=} signal
 * @returns {Promise<void>}
 */
export function sleep(ms, signal) {
	return new Promise(
		(resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason)
				return
			}
			const timer = setTimeout(
				() => {
					unlink()
					resolve()
				},
				clamp_delay(ms)
			)
			const unlink = signal
				? on_abort(
					signal,
					() => {
						clearTimeout(timer)
						reject(signal.reason)
					}
				)
				: noop
		}
	)
}
/**
 * @param {number} deadline
 * @param {AbortSignal=} signal
 * @returns {Promise<void>}
 */
export function sleep_until(deadline, signal) {
	const left = deadline - Date.now()
	if (left <= max_delay) return sleep(left, signal)
	return sleep(max_delay, signal)
		.then(
			() => sleep_until(deadline, signal)
		)
}
import { check_options } from "./options.js"
import { clamp_delay, on_abort } from "./signal.js"
/**
 * Keeps one connection up: calls `connect` at once and again after each close, waiting `base` milliseconds
 * after a connection that opened and doubling the wait up to `most` after each one that closed without opening,
 * until the `signal` aborts. The connector tells it when its connection opened and closed, so a WebSocket or a
 * server stream reconnects. The result resolves once the signal has aborted and the connection in hand has closed.
 * `connect` gets `{ attempt, signal, open, close }`: `attempt` counts every call from 1, so it can rotate addresses;
 * `signal` of the connection aborts when the outer signal does, so close the connection on it; `open()` marks the
 * connection up and resets the wait; `close()` ends it, and only its first call counts. A `connect` that throws or
 * returns a promise that rejects counts as a close.
 * @example
 * const stop = new AbortController()
 * const stopped = redial(
 * 	({ attempt, signal, open, close }) => {
 * 		const socket = new WebSocket(urls[(attempt - 1) % urls.length])
 * 		socket.onopen = open
 * 		socket.onclose = close
 * 		signal.addEventListener("abort", () => socket.close(), { once: true })
 * 	},
 * 	{ signal: stop.signal, base: 1000, most: 30000 }
 * )
 * stop.abort()
 * await stopped
 * @param {(context: import("../public.js").RedialContext) => unknown} connect
 * @param {import("../public.js").RedialOptions} options
 * @returns {Promise<void>}
 */
export function redial(connect, options) {
	check_options(
		options,
		[ "base", "most", "signal" ],
		"redial"
	)
	const signal = options?.signal
	if (!(signal instanceof AbortSignal)) {
		throw TypeError(
			"The signal of redial() must be an AbortSignal"
		)
	}
	const base = options.base ?? 1000
	const most = options.most ?? 30000
	if (!(typeof base == "number" && base > 0)) {
		throw TypeError(
			"The base of redial() must be a positive number of milliseconds"
		)
	}
	if (!(typeof most == "number" && most >= base)) {
		throw TypeError(
			"The most of redial() must be a number of milliseconds that is not less than base"
		)
	}
	if (signal.aborted) {
		return Promise.resolve()
	}
	return new Promise(
		resolve => {
			let count = 0
			let failures = 0
			/** @type {ReturnType<typeof setTimeout> | undefined} */
			let timer
			/** @type {AbortController | undefined} */
			let current
			const unlink = on_abort(
				signal,
				() => {
					clearTimeout(timer)
					if (current) {
						current.abort(signal.reason)
					} else {
						resolve()
					}
				}
			)
			start()
			/** @returns {void} */
			function start() {
				const controller = new AbortController()
				let opened = false
				let closed = false
				current = controller
				count++
				try {
					Promise.resolve(
						connect(
							{
								attempt: count,
								close,
								open,
								signal: controller.signal
							}
						)
					).catch(close)
				} catch {
					close()
				}
				/** @returns {void} */
				function close() {
					if (closed) {
						return
					}
					closed = true
					current = void 0
					if (signal.aborted) {
						unlink()
						resolve()
						return
					}
					failures = opened ? 0 : failures + 1
					timer = setTimeout(
						start,
						clamp_delay(
							Math.min(
								base * 2 ** Math.max(failures - 1, 0),
								most
							)
						)
					)
				}
				/** @returns {void} */
				function open() {
					if (!closed) {
						opened = true
					}
				}
			}
		}
	)
}
import { CancelError, TimeoutError } from "./errors.js"
import { check_retry } from "./http/retry.js"
import { check_options } from "./options.js"
import {
	clamp_delay,
	link_signal,
	race_signal,
	sleep
} from "./signal.js"
/**
 * Runs any async work again after it fails, with a timeout for each attempt, like the `retry` and `timeout` of a request
 * or a flow node: a database query, a file, a message queue. Pass the `signal` of the context on, so a timeout stops the work.
 * @example
 * const rows = await attempt(({ signal }) => db.query(sql, { signal }), { retry: 3, timeout: 5000 })
 * @template T
 * @param {(context: { attempt: number, signal: AbortSignal }) => T} fn
 * @param {import("../public.js").AttemptOptions=} options
 * @returns {Promise<Awaited<T>>}
 */
export async function attempt(fn, options = {}) {
	check_options(
		options,
		[ "retry", "signal", "timeout" ],
		"attempt"
	)
	check_retry(options.retry, "attempt")
	const {
		retry: retry_option,
		signal,
		timeout
	} = options
	if (timeout != null && !(typeof timeout == "number" && timeout > 0)) throw TypeError(
		"The timeout of attempt() must be a positive number of milliseconds"
	)
	const retry = typeof retry_option == "number" ? { count: retry_option } : retry_option
	for (let count = 1; ; count++) {
		const controller = new AbortController()
		const unlink = link_signal(controller, signal)
		const timer = timeout
			? setTimeout(
				() => controller.abort(new TimeoutError(timeout)),
				clamp_delay(timeout)
			)
			: void 0
		try {
			if (controller.signal.aborted) throw controller.signal.reason
			return /** @type {Awaited<T>} */(await race_signal(
				Promise.resolve()
					.then(
						() => fn(
							{
								attempt: count,
								signal: controller.signal
							}
						)
					),
				controller.signal
			))/**/
		} catch (error) {
			if (signal?.aborted) throw to_cancel_error(signal.reason)
			if (!retry || count > retry.count || retry.when && !await retry.when(error, count)) throw error
			const delay = typeof retry.delay == "function"
				? retry.delay(count, error, 0)
				: retry.delay ?? 0
			if (delay == null) throw error
			clearTimeout(timer)
			if (delay > 0) {
				await sleep(delay, signal)
					.catch(
						reason => {
							throw to_cancel_error(reason)
						}
					)
			}
		} finally {
			clearTimeout(timer)
			unlink()
		}
	}
}
/**
 * @param {unknown} reason
 * @returns {CancelError}
 */
function to_cancel_error(reason) {
	return reason instanceof CancelError ? reason : new CancelError(reason)
}
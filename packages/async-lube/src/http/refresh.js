/** @import { ClientContext, JobSpec, RefreshState } from "../../private.js" */
import {
	CancelError,
	HttpError,
	TimeoutError
} from "../errors.js"
import {
	clamp_delay,
	link_signal,
	race_signal
} from "../signal.js"
import { call_hook } from "./config.js"
/** @type {WeakMap<(signal: AbortSignal) => unknown, RefreshState>} */
const refresh_states = new WeakMap()
/**
 * @param {ClientContext} c
 * @param {RefreshState} state
 * @param {HttpError} error
 * @param {unknown} reason
 * @returns {void}
 */
function fail_refresh(c, state, error, reason) {
	clearTimeout(state.timer)
	state.failed_generation = state.generation++
	state.refreshing = void 0
	call_hook(
		c.config.on?.unauthorized,
		error,
		reason
	)
}
/**
 * @param {(signal: AbortSignal) => unknown} refresher
 * @returns {RefreshState}
 */
export function get_refresh_state(refresher) {
	let state = refresh_states.get(refresher)
	if (!state) {
		state = {
			controller: void 0,
			failed_generation: -1,
			generation: 0,
			refreshing: void 0,
			time_out: void 0,
			timed_out: void 0,
			timer: void 0,
			unauthorized_generation: -1,
			waiters: 0
		}
		refresh_states.set(refresher, state)
	}
	return state
}
/**
 * @param {ClientContext} c
 * @param {RefreshState} state
 * @param {number} generation
 * @param {HttpError} error
 * @returns {Promise<void>}
 */
async function refresh(c, state, generation, error) {
	if (generation != state.generation) {
		if (generation == state.failed_generation) throw error
		return
	}
	if (!state.refreshing) {
		const controller = new AbortController()
		const timeout = c.config.timeout
		state.controller = controller
		state.timed_out = void 0
		state.waiters = 0
		/** @type {Promise<never>} */
		const timed_out = new Promise(
			(_, reject) => {
				state.time_out = reject
			}
		)
		const refreshing = Promise.resolve(controller.signal)
			.then(c.config.refresh)
			.then(
				() => {
					if (state.generation != generation) return
					clearTimeout(state.timer)
					state.generation++
					state.refreshing = void 0
				},
				(/** @type {unknown} */ reason) => {
					if (state.generation == generation) fail_refresh(c, state, error, reason)
					throw reason
				}
			)
		state.refreshing = Promise.race([ refreshing, timed_out ])
		state.timer = timeout
			? setTimeout(
				() => time_out_refresh(
					c,
					state,
					error,
					new TimeoutError(timeout)
				),
				clamp_delay(timeout)
			)
			: void 0
	}
	try {
		await state.refreshing
	} catch (reason) {
		throw reason instanceof TimeoutError ? reason : error
	}
}
/**
 * @param {ClientContext} c
 * @param {RefreshState} state
 * @param {number} generation
 * @param {HttpError} error
 * @returns {void}
 */
export function reject_refreshed(c, state, generation, error) {
	if (state.unauthorized_generation == generation) return
	state.unauthorized_generation = generation
	call_hook(
		c.config.on?.unauthorized,
		error,
		void 0
	)
}
/**
 * @param {ClientContext} c
 * @param {RefreshState} state
 * @param {HttpError} error
 * @param {Error} timeout_error
 * @returns {void}
 */
function time_out_refresh(c, state, error, timeout_error) {
	if (!state.refreshing) return
	const controller = state.controller
	state.time_out?.(timeout_error)
	fail_refresh(c, state, error, timeout_error)
	controller?.abort(timeout_error)
}
/**
 * @param {ClientContext} c
 * @param {JobSpec} spec
 * @param {RefreshState} state
 * @param {number} generation
 * @param {HttpError} error
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export async function wait_refresh(
	c,
	spec,
	state,
	generation,
	error,
	signal
) {
	const { options, summary } = spec
	const timeout = options.timeout ?? c.config.timeout
	const controller = new AbortController()
	const unlink = link_signal(controller, signal)
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
	const waiting = refresh(c, state, generation, error)
	const joined = state.generation == generation && state.refreshing != null
	if (joined) state.waiters++
	try {
		await race_signal(waiting, controller.signal)
	} catch (reason) {
		const timeout_error = timed_out
			? new TimeoutError(
				/** @type {number} */(timeout)/**/,
				summary
			)
			: void 0
		if (joined && state.generation == generation && state.refreshing) {
			if (timeout_error) state.timed_out = timeout_error
			if (--state.waiters == 0 && state.timed_out) time_out_refresh(c, state, error, state.timed_out)
		}
		if (signal.aborted) throw signal.reason instanceof CancelError
			? signal.reason
			: new CancelError(signal.reason, summary)
		if (timeout_error) throw timeout_error
		throw reason instanceof TimeoutError
			? new TimeoutError(reason.timeout, summary)
			: reason
	} finally {
		clearTimeout(timer)
		unlink()
	}
}
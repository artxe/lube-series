/** @import { DurableExecution, DurableWaiter, DurableWorker } from "../../private.js" */
/** @import { DurableContext } from "../../public.js" */
import { check_options } from "../options.js"
import { clamp_delay, noop, sleep_until } from "../signal.js"
import {
	error_from,
	saved_error,
	store_error,
	timeout_error
} from "./error.js"
import { entry_of, fail, unblock } from "./journal.js"
import { copy, json_problem } from "./json.js"
import { SUSPENDED, lose, refuse } from "./lease.js"
import { inbox_read, persist, watch_inbox } from "./persist.js"
import { resume } from "./run.js"
import { take_event, unclaim, wake_if_sent } from "./state.js"
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {void}
 */
function check_idle(d, execution) {
	if (!execution.blocked.length || execution.flights || execution.suspending) return
	execution.suspending = true
	setTimeout(
		() => {
			execution.suspending = false
			if (!execution.blocked.length || execution.flights || execution.lost || execution.finished) return
			const wakes = execution.blocked.flatMap(
				item => item.wake == null ? [] : [ item.wake ]
			)
			const { saved } = execution
			saved.status = execution.blocked.some(
				item => item.status == "waiting"
			)
				? "waiting"
				: "sleeping"
			unclaim(saved)
			if (wakes.length) saved.wake = Math.min(...wakes)
			wake_if_sent(saved)
			execution.finished = true
			void persist(d, execution).then(
				written => {
					if (!written) {
						lose(
							execution,
							store_error(execution.fault)
						)
						return
					}
					execution.interrupt(SUSPENDED)
					if (saved.status == "running") void execution.gone.then(() => resume(d, execution.key)).catch(noop)
				}
			)
		},
		0
	)
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {DurableContext}
 */
export function context_of(d, execution) {
	const { key } = execution
	const { signal } = execution.controller
	return {
		key,
		signal,
		sleep(name, ms) {
			if (!(Number.isFinite(ms) && ms >= 0)) return Promise.reject(
				TypeError(
					"The ms of sleep() must be a non-negative number of milliseconds"
				)
			)
			const refused = refuse(execution)
			if (refused) return refused
			const entry = entry_of(execution, name, "sleep")
			if (entry.done) return Promise.resolve()
			if (entry.until == null) {
				entry.until = Date.now() + ms
				void persist(d, execution)
			}
			const until = entry.until
			const left = until - Date.now()
			if (left > d.idle_ms) return suspend(d, execution, until, "sleeping")
			execution.flights++
			return sleep_until(until, signal)
				.then(
					() => {
						entry.done = true
						void persist(d, execution)
					}
				)
				.finally(
					() => {
						execution.flights--
						check_idle(d, execution)
					}
				)
		},
		step(name, work) {
			const refused = refuse(execution)
			if (refused) return refused
			const index = execution.cursor
			const entry = entry_of(execution, name, "step")
			if (entry.done) {
				return entry.error
					? fail(
						execution,
						entry,
						error_from(entry.error)
					)
					: Promise.resolve(
						/** @type {never} */(copy(entry.value))/**/
					)
			}
			execution.flights++
			/**
			 * @param {unknown} error
			 * @returns {Promise<never>}
			 */
			function failed(error) {
				if (signal.aborted || execution.lost || execution.finished) throw error
				entry.done = true
				entry.error = saved_error(error)
				void persist(d, execution)
				return fail(execution, entry, error)
			}
			return Promise.resolve()
				.then(
					() => refuse(execution) ?? work(
						{
							key: `${key}:${index + 1}:${name}`,
							signal
						}
					)
				)
				.then(
					value => {
						const problem = json_problem(value)
						if (problem) return failed(
							TypeError(
								`The result of step "${name}" of run "${key}" is not a JSON value: ${problem}`
							)
						)
						entry.done = true
						entry.value = copy(value)
						void persist(d, execution)
						return /** @type {never} */(value)/**/
					},
					failed
				)
				.finally(
					() => {
						execution.flights--
						check_idle(d, execution)
					}
				)
		},
		wait(name, wait_options = {}) {
			try {
				check_options(
					wait_options,
					[ "timeout", "until" ],
					"wait"
				)
				const { timeout, until } = wait_options
				if (!(timeout == null || Number.isFinite(timeout) && timeout >= 0)) throw TypeError(
					"The timeout of wait() must be a non-negative number of milliseconds"
				)
				if (!(until == null || Math.abs(until) <= 8640000000000000)) throw TypeError(
					"The until of wait() must be a time in milliseconds since the epoch"
				)
			} catch (error) {
				return Promise.reject(error)
			}
			const refused = refuse(execution)
			if (refused) return refused
			const entry = entry_of(execution, name, "wait")
			const { timeout } = wait_options
			if (entry.done) {
				return entry.timed_out
					? fail(
						execution,
						entry,
						timeout_error(entry, wait_options)
					)
					: Promise.resolve(
						/** @type {never} */(copy(entry.value))/**/
					)
			}
			const fresh = entry.until == null
			if (fresh) {
				if (timeout != null) entry.until = Date.now() + timeout
				if (wait_options.until != null) entry.until = Math.min(
					entry.until ?? Infinity,
					wait_options.until
				)
			}
			const event = execution.saved.events?.[name]?.[0]
			if (event && !execution.unsaved.has(event) && (entry.until == null || event.at <= entry.until)) {
				take_event(execution.saved, name)
				entry.done = true
				entry.value = event.value
				void persist(d, execution)
				return Promise.resolve(
					/** @type {never} */(copy(event.value))/**/
				)
			}
			if (fresh && entry.until != null) void persist(d, execution)
			const until = entry.until
			return new Promise(
				(resolve, reject) => {
					/** @type {DurableWaiter} */
					const waiter = {
						block: void 0,
						clear: noop,
						entry,
						reject,
						resolve: /** @type {(value: unknown) => void} */(resolve)/**/
					}
					const list = execution.waiters.get(name) ?? []
					if (!list.length) execution.waiters.set(name, list)
					list.push(waiter)
					watch_inbox(d, execution)
					/** @type {ReturnType<typeof setTimeout>} */
					let timer
					/**
					 * @returns {void}
					 */
					function expire() {
						if (execution.finished || execution.lost || !list.includes(waiter)) return
						if (until != null && until <= Date.now()) {
							void inbox_read(d, execution).then(
								read => {
									if (execution.finished || execution.lost) return
									const index = list.indexOf(waiter)
									if (index < 0) return
									if (!read) {
										timer = setTimeout(expire, d.poll_ms)
										return
									}
									time_out(index)
								}
							)
							return
						}
						if (!waiter.block) {
							waiter.block = { status: "waiting", wake: until }
							execution.blocked.push(waiter.block)
							check_idle(d, execution)
						}
						if (until != null) timer = setTimeout(
							expire,
							clamp_delay(until - Date.now())
						)
					}
					/**
					 * @param {number} index
					 * @returns {void}
					 */
					function time_out(index) {
						list.splice(index, 1)
						unblock(execution, waiter)
						entry.done = true
						entry.timed_out = true
						void persist(d, execution)
						const error = timeout_error(entry, wait_options)
						execution.failures.set(
							error,
							{ entry, reached: execution.cursor }
						)
						reject(error)
					}
					if (until != null && until <= Date.now()) expire()
					else {
						timer = setTimeout(
							expire,
							clamp_delay(
								Math.min(
									d.idle_ms,
									until == null ? Infinity : until - Date.now()
								)
							)
						)
					}
					waiter.clear = () => clearTimeout(timer)
				}
			)
		}
	}
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @param {number | undefined} wake
 * @param {"sleeping" | "waiting"} status
 * @returns {Promise<never>}
 */
function suspend(d, execution, wake, status) {
	execution.blocked.push({ status, wake })
	check_idle(d, execution)
	return new Promise(noop)
}
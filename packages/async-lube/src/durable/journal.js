/** @import { DurableExecution, DurableWaiter } from "../../private.js" */
/** @import { JournalEntry } from "../../public.js" */
/**
 * @param {DurableExecution} execution
 * @param {string} name
 * @param {JournalEntry["type"]} type
 * @returns {JournalEntry}
 */
export function entry_of(execution, name, type) {
	const index = execution.cursor++
	const { journal } = execution.saved
	const entry = journal[index]
	if (entry) {
		if (entry.name != name || entry.type != type) throw Error(
			`The run "${execution.key}" changed: step ${index + 1} was "${entry.name}", now "${name}"`
		)
		return entry
	}
	/** @type {JournalEntry} */
	const created = { done: false, name, type }
	journal.push(created)
	return created
}
/**
 * @param {DurableExecution} execution
 * @param {JournalEntry} entry
 * @param {unknown} error
 * @returns {Promise<never>}
 */
export function fail(execution, entry, error) {
	execution.failures.set(
		error,
		{ entry, reached: execution.cursor }
	)
	return Promise.reject(error)
}
/**
 * @param {DurableExecution} execution
 * @param {DurableWaiter} waiter
 * @param {unknown} value
 * @returns {void}
 */
export function give(execution, waiter, value) {
	waiter.clear()
	unblock(execution, waiter)
	waiter.entry.done = true
	waiter.entry.value = value
}
/**
 * @param {DurableExecution} execution
 * @param {unknown} error
 * @returns {void}
 */
export function rewind(execution, error) {
	const seen = new Set()
	let cause = error
	while (!seen.has(cause)) {
		seen.add(cause)
		const failure = execution.failures.get(cause)
		if (failure) {
			if (execution.cursor > failure.reached) return
			const { saved } = execution
			const index = saved.journal.indexOf(failure.entry)
			if (index < 0) return
			for (const later of saved.journal.splice(index).reverse()) {
				if (later.type != "wait" || !later.done || later.timed_out) continue
				const events = saved.events ??= {}
				;(events[later.name] ??= []).unshift({ at: 0, value: later.value })
			}
			return
		}
		if (!(cause instanceof Error)) return
		cause = cause.cause
	}
}
/**
 * @param {DurableExecution} execution
 * @param {string} name
 * @param {number} at
 * @returns {DurableWaiter | undefined}
 */
export function take_waiter(execution, name, at) {
	const list = execution.waiters.get(name)
	if (!list) return
	const index = list.findIndex(
		waiter => waiter.entry.until == null || at <= waiter.entry.until
	)
	return index < 0 ? void 0 : list.splice(index, 1)[0]
}
/**
 * @param {DurableExecution} execution
 * @param {DurableWaiter} waiter
 * @returns {void}
 */
export function unblock(execution, waiter) {
	if (!waiter.block) return
	const index = execution.blocked.indexOf(waiter.block)
	if (index >= 0) execution.blocked.splice(index, 1)
	waiter.block = void 0
}
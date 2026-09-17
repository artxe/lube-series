/** @import { SavedRun } from "../../public.js" */
/**
 * @param {SavedRun} saved
 * @returns {void}
 */
export function absorb(saved) {
	const { inbox } = saved
	if (!inbox) return
	delete saved.inbox
	for (const item of inbox) push_event(
		saved,
		item.name,
		item.at,
		item.value
	)
}
/**
 * When a worker should pick the run up, in milliseconds since the epoch: the end of the lease of a running run, 0 for one
 * that no worker holds, the wake time of a sleeping or waiting run, or undefined when only `run` or `send` moves it on.
 * Keep it in a column of a store of your own, so that `due` is one query on an index.
 * @param {SavedRun} saved
 * @returns {number | undefined}
 */
export function dueAt(saved) {
	if (saved.status == "running") return saved.owner ? saved.lease ?? 0 : 0
	if (saved.status == "sleeping" || saved.status == "waiting") return saved.wake
	return void 0
}
/**
 * @param {SavedRun} saved
 * @param {string} name
 * @param {number} at
 * @param {unknown} value
 * @returns {{ at: number, value: unknown }}
 */
export function push_event(saved, name, at, value) {
	const event = { at, value }
	const events = saved.events ??= {}
	;(events[name] ??= []).push(event)
	return event
}
/**
 * @param {SavedRun} latest
 * @param {SavedRun} tried
 * @returns {boolean}
 */
export function same_state(latest, tried) {
	return latest.owner == tried.owner && latest.lease === tried.lease && latest.status == tried.status && JSON.stringify(latest.journal) == JSON.stringify(tried.journal) && JSON.stringify(latest.events ?? {}) == JSON.stringify(tried.events ?? {})
}
/**
 * @param {SavedRun} saved
 * @returns {SavedRun}
 */
export function snapshot(saved) {
	/** @type {SavedRun} */
	const next = {
		...saved,
		journal: saved.journal.map(
			entry => entry.done ? entry : { ...entry }
		),
		version: saved.version + 1
	}
	if (saved.events) {
		/** @type {NonNullable<SavedRun["events"]>} */
		const events = {}
		for (const [ name, list ] of Object.entries(saved.events)) events[name] = [ ...list ]
		next.events = events
	}
	if (saved.inbox) next.inbox = [ ...saved.inbox ]
	return next
}
/**
 * @param {SavedRun} saved
 * @param {string} name
 * @returns {void}
 */
export function take_event(saved, name) {
	const events = /** @type {NonNullable<SavedRun["events"]>} */(saved.events)/**/
	const list = /** @type {NonNullable<SavedRun["events"]>[string]} */(events[name])/**/
	list.shift()
	if (!list.length) {
		delete events[name]
		if (!Object.keys(events).length) delete saved.events
	}
}
/**
 * @param {SavedRun} saved
 * @returns {void}
 */
export function unclaim(saved) {
	delete saved.lease
	delete saved.owner
	delete saved.wake
}
/**
 * @param {SavedRun} saved
 * @returns {void}
 */
export function wake_if_sent(saved) {
	if ((saved.status == "sleeping" || saved.status == "waiting") && saved.journal.some(
		entry => entry.type == "wait" && !entry.done && saved.events?.[entry.name]?.length
	)) {
		delete saved.wake
		saved.status = "running"
	}
}
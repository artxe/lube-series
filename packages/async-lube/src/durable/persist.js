/** @import { DurableExecution, DurableWorker } from "../../private.js" */
/** @import { SavedRun } from "../../public.js" */
import { CancelError } from "../errors.js"
import { noop, sleep } from "../signal.js"
import { error_of, store_error } from "./error.js"
import { give, take_waiter } from "./journal.js"
import { copy } from "./json.js"
import { expiring, lose } from "./lease.js"
import {
	same_state,
	snapshot,
	take_event,
	wake_if_sent
} from "./state.js"
import { load } from "./store.js"
/**
 * @param {DurableExecution} execution
 * @param {NonNullable<SavedRun["inbox"]>[number]} item
 * @returns {void}
 */
function deliver(execution, item) {
	const { saved } = execution
	const list = (saved.events ??= {})[item.name] ??= []
	const index = list.findIndex(
		event => execution.unsaved.has(event)
	)
	list.splice(
		index < 0 ? list.length : index,
		0,
		{ at: item.at, value: item.value }
	)
	if (execution.finished) wake_if_sent(saved)
}
/**
 * @param {DurableExecution} execution
 * @returns {void}
 */
function drain(execution) {
	const { saved } = execution
	if (!saved.events || execution.finished) return
	for (const name of Object.keys(saved.events)) {
		for (;;) {
			const event = saved.events?.[name]?.[0]
			const waiter = event && !execution.unsaved.has(event) && take_waiter(execution, name, event.at)
			if (!event || !waiter) break
			take_event(saved, name)
			give(execution, waiter, event.value)
			waiter.resolve(copy(event.value))
		}
	}
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {Promise<boolean>}
 */
export async function inbox_read(d, execution) {
	if (execution.writing) await execution.writing
	try {
		const latest = await load(d.store, execution.key)
		if (execution.lost || execution.finished) return false
		return execution.fault === void 0 && (!latest?.inbox?.length || latest.version == execution.saved.version) || await persist(d, execution)
	} catch (error) {
		execution.fault = error
		return false
	}
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {Promise<boolean>}
 */
export function persist(d, execution) {
	if (execution.lost) return Promise.resolve(false)
	if (execution.writing) {
		execution.dirty = true
		return execution.writing
	}
	execution.writing = (async () => {
		try {
			do {
				execution.dirty = false
				const current = execution.saved
				const next = snapshot(current)
				const included = execution.unsaved
				if (included.size) execution.unsaved = new Set()
				const attempt = ++execution.taken
				if (next.owner) next.lease = Date.now() + d.lease_ms
				/** @type {SavedRun | undefined} */
				let latest
				let putting = true
				try {
					if (await d.store.put(
						execution.key,
						next,
						current.version
					)) {
						current.version = next.version
						execution.lease = next.lease
						execution.absorbed = 0
						execution.fault = void 0
						execution.tried = []
						execution.written = attempt
						drain(execution)
						continue
					}
					putting = false
					for (const event of included) execution.unsaved.add(event)
					latest = await load(d.store, execution.key)
				} catch (error) {
					for (const event of included) execution.unsaved.add(event)
					if (putting) execution.tried.push(next)
					execution.fault = error
					if (expiring(d, execution)) lose(execution, store_error(error))
					return false
				}
				if (execution.lost) return false
				const committed = latest && execution.tried.findLast(
					tried => same_state(
						/** @type {SavedRun} */(latest)/**/,
						tried
					)
				)
				if (!latest || latest.owner != d.owner || latest.version <= current.version || !committed && latest.lease !== execution.lease) {
					lose(
						execution,
						latest?.status == "cancelled"
							? error_of(latest)
							: new CancelError("Another worker took the run")
					)
					return false
				}
				if (committed) {
					execution.absorbed = 0
					execution.lease = committed.lease
				}
				execution.tried = []
				current.version = latest.version
				const inbox = latest.inbox ?? []
				for (let index = execution.absorbed; index < inbox.length; index++) deliver(
					execution,
					/** @type {NonNullable<SavedRun["inbox"]>[number]} */(inbox[index])/**/
				)
				execution.absorbed = inbox.length
				execution.dirty = true
			} while (execution.dirty && !execution.lost)
			return !execution.lost
		} finally {
			execution.writing = void 0
		}
	})()
	return execution.writing
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {Promise<boolean>}
 */
export async function save(d, execution) {
	while (!await persist(d, execution)) {
		if (execution.lost) return false
		await sleep(
			d.renew_ms,
			execution.controller.signal
		).catch(noop)
	}
	return true
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {void}
 */
export function watch_inbox(d, execution) {
	execution.inbox_timer ??= setInterval(
		() => {
			if (execution.finished || execution.lost || execution.writing) return
			let waiting = false
			for (const list of execution.waiters.values()) waiting ||= list.length > 0
			if (!waiting) return
			void load(d.store, execution.key).then(
				latest => {
					if (latest?.inbox?.length && latest.version != execution.saved.version) void persist(d, execution)
				},
				noop
			)
		},
		d.poll_ms
	)
}
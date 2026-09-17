/** @import { NodeRecord, RunContext } from "../../private.js" */
import { noop } from "../signal.js"
import { enter } from "./graph.js"
import {
	fail_input,
	get_record,
	settle,
	try_start
} from "./nodes.js"
import {
	active_statuses,
	settled_statuses
} from "./refs.js"
import {
	begin,
	drain,
	publish,
	report,
	schedule
} from "./run.js"
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {{ error: unknown } | undefined} failure
 * @returns {void}
 */
function end_source(c, record, failure) {
	record.source_ended = true
	record.source_error = failure
	if (record.status == "waiting" && c.run_status == "running") {
		clearTimeout(record.timer)
		if (failure) fail_input(c, record, failure.error)
		else settle(
			c,
			record.node.name,
			"skipped",
			void 0
		)
	} else if (failure && settled_statuses.has(record.status)) {
		c.streaming = true
		try {
			begin(c)
		} finally {
			c.streaming = false
		}
		if (c.run_status != "running") return
		enter(c, [ record.node.name ], "*")
		for (const name of c.records.keys()) try_start(c, name)
		drain(c)
		schedule(c)
	} else return
	report(c)
	publish(c)
}
/**
 * @param {RunContext} c
 * @param {string} source
 * @param {string[]} dependents
 * @returns {boolean}
 */
function is_full(c, source, dependents) {
	for (const dependent of dependents) {
		const target = get_record(c, dependent)
		const limit = target.node.options.limit ?? Infinity
		const waiting = target.node.arrive?.[source] == "queue"
			? (target.queued?.get(source)?.length ?? 0) - (active_statuses.has(target.status) ? 1 : 0)
			: target.backlog.length - target.backlog_head
		if (waiting >= limit) return true
	}
	return false
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function start_pumps(c) {
	if (c.pumping || c.run_status != "running") return
	c.pumping = true
	for (const record of c.records.values()) {
		const { dependents, name, source } = record.node
		if (!source) continue
		const pressed = dependents.filter(
			dependent => get_record(c, dependent).node.options.overflow == "wait"
		)
		record.source_ended = false
		record.source_error = void 0
		let stopped = false
		/** @type {AsyncIterator<unknown>} */
		let reader
		try {
			reader = source[Symbol.asyncIterator]()
		} catch (error) {
			end_source(c, record, { error })
			continue
		}
		c.pumps.push(
			() => {
				stopped = true
				try {
					void reader.return?.().then(noop, noop)
				} catch {}
			}
		)
		void (async () => {
			try {
				for (;;) {
					const step = await reader.next()
					if (stopped) return
					if (step.done) {
						end_source(c, record, void 0)
						return
					}
					c.streaming = true
					try {
						c.run.send(name, step.value)
					} finally {
						c.streaming = false
					}
					while (!stopped && is_full(c, name, pressed)) {
						await new Promise(
							resolve => c.room_waiters.push(resolve)
						)
					}
					if (stopped) return
				}
			} catch (error) {
				if (!stopped) end_source(c, record, { error })
			}
		})()
	}
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function stop_pumps(c) {
	c.pumping = false
	for (const stop of c.pumps.splice(0)) stop()
	wake_room(c)
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function wake_room(c) {
	for (const resolve of c.room_waiters.splice(0)) resolve(void 0)
}
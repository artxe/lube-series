/** @import { BacklogEntry, GotoResult, NodeRecord, NodeStatus, RefProbe, ResumePlan, RunContext, RunSnapshot, RunState } from "../../private.js" */
import {
	CancelError,
	FlowError,
	TimeoutError
} from "../errors.js"
import { clamp_delay } from "../signal.js"
import { emit, make_context, run_single } from "./attempts.js"
import {
	abandon,
	enter,
	follow_edge,
	kill_transitions,
	reset
} from "./graph.js"
import { run_each } from "./items.js"
import {
	GOTO,
	SKIP,
	active_statuses,
	describe,
	is_sentinel,
	settled_statuses
} from "./refs.js"
import {
	discard,
	release_all,
	release_quietly,
	release_unused
} from "./resources.js"
import { close_cycle, defer, drain, schedule } from "./run.js"
import { wake_room } from "./streams.js"
import { failed_sub_keys, snapshot_subs } from "./subflows.js"
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 */
function apply_value(c, name, value) {
	if (value === SKIP) {
		settle(c, name, "skipped", void 0)
		return
	}
	if (!/** @type {RefProbe} */(value)/**/?.[GOTO]) {
		settle(c, name, "done", value)
		return
	}
	if (get_record(c, name).abandoned) {
		drop(c, name, c.errors[name])
		return
	}
	/** @type {string[]} */
	const targets = []
	for (const target of /** @type {GotoResult} */(value)/**/[GOTO]) {
		const target_name = c.program.name_of(target)
		if (target_name == null) {
			fail(
				c,
				name,
				Error(
					`Flow node "${name}" went to ${describe(target)}, which is not added`
				)
			)
			return
		}
		targets.push(target_name)
	}
	const record = get_record(c, name)
	clearTimeout(record.timer)
	record.controller = void 0
	record.result = void 0
	set_status(c, record, "skipped")
	delete c.results[name]
	enter(c, targets, name)
	if (c.run_status != "running") return
	if (record.status == "skipped") {
		kill_transitions(c, name)
		for (const dependent of record.node.dependents) try_start(c, dependent)
		if (record.backlog.length > record.backlog_head || record.retrigger) defer(c, () => run_next(c, name))
	}
	drain(c)
	schedule(c)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {unknown[]}
 */
export function args_of(c, record) {
	return record.args ?? values_for(c, record)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {void}
 */
export function clear_record(c, record) {
	const { name, options } = record.node
	if (options.release && record.status == "done" && !record.released) release_quietly(
		record,
		new CancelError(
			`Flow node "${name}" was reset`
		)
	)
	stop_record(
		c,
		record,
		record.status == "running"
			? new CancelError(
				`Flow node "${name}" was reset`
			)
			: void 0
	)
	if (record.status == "done") record.previous = record.result
	delete c.errors[name]
	if (record.node.each) {
		const prefix = name + "."
		for (const key of Object.keys(c.errors)) {
			if (key.startsWith(prefix)) delete c.errors[key]
		}
	}
	record.abandoned = false
	record.args = void 0
	record.backlog = []
	record.backlog_head = 0
	record.dropped = 0
	record.fatal = false
	record.gate = void 0
	record.items = void 0
	record.result = void 0
	record.resume_deadline = void 0
	record.resume_items = void 0
	record.resume_runs = void 0
	record.resume_subs = void 0
	record.retrigger = false
	record.holding = false
	record.retrying = false
	record.runs.clear()
	set_status(c, record, "idle")
	record.sub_runs.clear()
	delete c.results[name]
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} error
 * @returns {void}
 */
function drop(c, name, error) {
	c.errors[name] = error
	settle(c, name, "skipped", void 0)
	for (const dep of get_record(c, name).node.deps) release_unused(c, dep, error)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} error
 * @returns {void}
 */
export function fail(c, name, error) {
	const record = get_record(c, name)
	c.errors[name] = error
	record.fatal = true
	record.result = void 0
	set_status(c, record, "failed")
	delete c.results[name]
	if (record.node.options.overlap == "queue" && record.args) {
		record.backlog = [
			{
				args: record.args,
				resume: true,
				skipped: false
			},
			...record.backlog.slice(record.backlog_head)
		]
		record.backlog_head = 0
	}
	c.run_status = "failed"
	const failure = new FlowError(name, error)
	release_all(c, failure)
	stop_all(
		c,
		"cancelled",
		new CancelError("The flow failed"),
		true
	)
	if (!c.cycle.settled) close_cycle(c, failure, void 0)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {unknown} error
 * @returns {void}
 */
export function fail_input(c, record, error) {
	record.controller = new AbortController()
	set_status(c, record, "running")
	void handle_error(
		c,
		record.node.name,
		error,
		false,
		void 0
	)
}
/**
 * @param {NodeRecord} record
 * @returns {void}
 */
export function forget_runs(record) {
	record.resume_items = void 0
	record.resume_runs = void 0
	record.resume_subs = void 0
	record.runs.clear()
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {NodeRecord}
 */
export function get_record(c, name) {
	const record = c.records.get(name)
	if (!record) throw Error(`Unknown flow node "${name}"`)
	return record
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} error
 * @param {boolean} from_items
 * @param {number | undefined} index
 * @returns {Promise<void>}
 */
async function handle_error(c, name, error, from_items, index) {
	const record = get_record(c, name)
	const token = record.token
	const { fallback, options } = record.node
	if (index != null) c.errors[name + "." + index] = error
	if (options.catch && !from_items) {
		try {
			const value = await options.catch(
				error,
				...args_of(c, record),
				make_context(
					c,
					record,
					record.controller?.signal,
					0,
					void 0,
					record.runs.get("")
				)
			)
			if (token != record.token) return
			c.errors[name] = error
			apply_value(c, name, value)
		} catch (catch_error) {
			if (token != record.token) return
			if (record.abandoned) drop(c, name, catch_error)
			else fail(c, name, catch_error)
		}
	} else if (record.abandoned) drop(c, name, error)
	else if (fallback.length) {
		c.errors[name] = error
		apply_value(c, name, { [GOTO]: fallback })
	} else if (options.optional && !from_items) {
		c.errors[name] = error
		settle(c, name, "failed", void 0)
	} else fail(c, name, error)
}
/**
 * @param {NodeRecord} record
 * @returns {boolean}
 */
export function holds_backlog(record) {
	return record.node.options.overlap == "queue" && record.backlog.length > record.backlog_head
}
/**
 * @param {NodeRecord} record
 * @returns {ResumePlan}
 */
function keep_resume(record) {
	return {
		items: record.resume_items,
		retrying: record.retrying,
		runs: record.runs.size
			? {
				...record.resume_runs,
				...Object.fromEntries(
					[ ...record.runs ].map(
						([ unit, run_state ]) => [ unit, save_run(run_state) ]
					)
				)
			}
			: record.resume_runs,
		subs: record.resume_subs
	}
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {unknown[]} args
 * @returns {boolean}
 */
function launch(c, record, args) {
	const { each, kind, name, options } = record.node
	record.gate = void 0
	try {
		if (options.when && !options.when(...args, { state: c.state })) {
			settle(c, name, "skipped", void 0)
			return false
		}
	} catch (error) {
		if (c.run_status != "running" || record.status != "idle") return false
		record.args = args
		if (kind == "input" || each) {
			fail_input(c, record, error)
			return true
		}
		record.gate = { error }
	}
	if (c.run_status != "running" || record.status != "idle") return false
	record.args = args
	if (kind == "input" && record.buffer) {
		const { value } = record.buffer
		record.buffer = void 0
		settle(c, name, "done", value)
	} else if (kind == "input" && record.source_error) {
		fail_input(
			c,
			record,
			record.source_error.error
		)
	} else if (kind == "input" && record.source_ended) {
		settle(c, name, "skipped", void 0)
	} else if (kind == "input") {
		set_status(c, record, "waiting")
		if (options.timeout) {
			const timeout = options.timeout
			const token = record.token
			const deadline = record.resume_deadline ?? Date.now() + timeout
			record.deadline = deadline
			record.resume_deadline = void 0
			/**
			 * @returns {void}
			 */
			function expire() {
				if (record.status != "waiting" || token != record.token) return
				const left = deadline - Date.now()
				if (left > 0) record.timer = setTimeout(expire, clamp_delay(left))
				else fail_input(
					c,
					record,
					new TimeoutError(timeout)
				)
			}
			record.timer = setTimeout(
				expire,
				clamp_delay(deadline - Date.now())
			)
		}
	} else if (c.running >= c.concurrency) {
		set_status(c, record, "pending")
		c.queue.push(name)
	} else start(c, name)
	return true
}
/**
 * @param {RunContext} c
 * @param {unknown} target
 * @returns {string}
 */
export function name_or_throw(c, target) {
	const name = c.program.name_of(target)
	if (name == null) throw Error(
		`${describe(target)} is not added to the flow`
	)
	return name
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {boolean}
 */
function needs(c, name) {
	const record = get_record(c, name)
	if (!record.activated || record.status != "idle" && !(record.retrigger && active_statuses.has(record.status))) return false
	const { arrive, deps, options } = record.node
	for (const dep of deps) {
		const dep_record = get_record(c, dep)
		if (dep_record.fatal) return false
		if (dep_record.node.options.release && !settled_statuses.has(dep_record.status)) continue
		if (arrive?.[dep] == "queue") {
			if (!record.queued?.get(dep)?.length) return false
			continue
		}
		if (!settled_statuses.has(dep_record.status)) return false
		if (dep_record.status == "skipped" && (options.join ?? "all") == "all") return false
	}
	return !options.release || !record.node.dependents.length || record.node.dependents.some(
		dependent => needs(c, dependent)
	)
}
/**
 * @param {NodeRecord} record
 * @param {ResumePlan} plan
 * @returns {void}
 */
export function plan_resume(record, plan) {
	record.resume_items = plan.items
	record.resume_runs = plan.runs
	record.resume_subs = plan.subs
	record.retrying = plan.retrying
}
/**
 * @param {NodeRecord} record
 * @returns {ResumePlan}
 */
export function plan_retry(record) {
	const items = record.items ?? record.resume_items
	const failed_subs = record.status == "done" ? failed_sub_keys(record) : []
	return {
		items: items?.map(
			(item, index) => item?.failed || failed_subs.includes(String(index)) ? null : item
		),
		retrying: true,
		runs: Object.fromEntries(
			[
				...Object.entries(record.resume_runs ?? {}),
				...record.runs
			].map(
				([ unit, run_state ]) => [
					unit,
					{
						attempt: 1,
						serial: run_state.serial,
						waits: []
					}
				]
			)
		),
		subs: record.sub_runs.size ? snapshot_subs(record) : record.resume_subs
	}
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {void}
 */
export function prepare_restart(c, record) {
	record.fatal = false
	if (record.args && !same_args(c, record)) forget_runs(record)
	else {
		record.resume_items = record.items ?? record.resume_items
		if (record.sub_runs.size) record.resume_subs = snapshot_subs(record)
	}
	set_status(c, record, "idle")
	record.sub_runs.clear()
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {void}
 */
function release(c, record) {
	if (!record.slot) return
	record.slot = false
	c.running--
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {void}
 */
function run_next(c, name) {
	if (c.room_waiters.length) wake_room(c)
	const record = get_record(c, name)
	if (c.run_status != "running" || active_statuses.has(record.status)) return
	const { backlog, backlog_head } = record
	const entry = backlog[backlog_head]
	const retrigger = record.retrigger
	const plan = record.fatal && record.status == "failed"
		? plan_retry(record)
		: entry?.resume
			? keep_resume(record)
			: void 0
	/** @type {Iterable<string>} */
	let touched = [ name ]
	if (entry?.resume) clear_record(c, record)
	else touched = reset(c, name, true, true)
	if (plan) plan_resume(record, plan)
	if (entry) {
		const head = backlog_head + 1
		if (head > 1024 && head * 2 > backlog.length) record.backlog = backlog.slice(head)
		else if (head < backlog.length) {
			record.backlog = backlog
			record.backlog_head = head
		}
		record.retrigger = retrigger
		if (entry.skipped) settle(c, name, "skipped", void 0)
		else launch(c, record, entry.args)
	}
	for (const touched_name of touched) try_start(c, touched_name)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {boolean}
 */
export function same_args(c, record) {
	const { args, backlog, backlog_head } = record
	if (!args) return false
	const { arrive, deps, options } = record.node
	const head = backlog[backlog_head]
	if (options.overlap == "queue" && head?.resume) return head.args === args
	for (const [ index, dep ] of deps.entries()) {
		if (arrive?.[dep] == "queue") {
			if (record.queued?.get(dep)?.[0] !== args[index]) return false
		} else if (!settled_statuses.has(get_record(c, dep).status) || c.results[dep] !== args[index]) return false
	}
	return true
}
/**
 * @param {RunState} run_state
 * @returns {RunSnapshot}
 */
export function save_run(run_state) {
	/** @type {RunSnapshot} */
	const saved = {
		attempt: run_state.attempt,
		serial: run_state.serial,
		waits: [ ...run_state.waits ]
	}
	if (run_state.delay != null) saved.delay = run_state.delay
	return saved
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {NodeStatus} status
 * @returns {void}
 */
export function set_status(c, record, status) {
	if (active_statuses.has(record.status)) c.active_count--
	if (active_statuses.has(status)) c.active_count++
	record.status = status
	c.version++
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {NodeStatus} status
 * @param {unknown} value
 * @param {boolean=} cancelled
 * @returns {void}
 */
export function settle(c, name, status, value, cancelled) {
	if (c.room_waiters.length) defer(c, wake_room.bind(void 0, c))
	if (c.trace && status == "skipped" && !cancelled) emit(
		c,
		{
			attempt: 0,
			index: c.item_index,
			node: name,
			time: Date.now(),
			type: "skip"
		}
	)
	const record = get_record(c, name)
	clearTimeout(record.timer)
	record.controller = void 0
	set_status(c, record, status)
	if (record.node.kind == "input") record.buffer = void 0
	if (status == "done") {
		record.result = value
		c.results[name] = value
	} else {
		record.result = void 0
		delete c.results[name]
	}
	const has_next = record.backlog.length > record.backlog_head || record.retrigger
	const holds = (record.node.options.overlap ?? "restart") == "restart" || record.node.options.overlap == "rerun"
	if (has_next && holds && c.run_status == "running") {
		defer(c, () => run_next(c, name))
		drain(c)
		schedule(c)
		return
	}
	let more = false
	if (record.queued) {
		for (const waiting of record.queued.values()) {
			if (waiting.length > 1) more = true
		}
		record.holding = status == "failed" && !more && !!record.args
		if (!record.holding) {
			for (const waiting of record.queued.values()) waiting.shift()
		}
	}
	if (status == "done") c.streams.get(name)?.send(value)
	if (status == "done" && !record.abandoned) {
		for (const dependent of record.node.queuers) {
			const target = get_record(c, dependent)
			target.queued ??= new Map()
			if (target.holding) {
				target.holding = false
				for (const waiting of target.queued.values()) waiting.shift()
			}
			const waiting = target.queued.get(name) ?? []
			waiting.push(value)
			const in_use = active_statuses.has(target.status) || target.fatal ? 1 : 0
			if (waiting.length - in_use > (target.node.options.limit ?? Infinity)) waiting.splice(in_use, 1)
			target.queued.set(name, waiting)
			if (settled_statuses.has(target.status) && c.run_status == "running") defer(c, () => run_next(c, dependent))
		}
	}
	for (const dependent of record.node.dependents) try_start(c, dependent)
	if (status == "done" && !record.abandoned) follow_edge(c, name, value)
	else kill_transitions(c, name)
	if (c.run_status != "running") return
	if (has_next || more) defer(c, () => run_next(c, name))
	drain(c)
	schedule(c)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function start(c, name) {
	const record = get_record(c, name)
	if (++c.steps > c.max_steps) {
		fail(
			c,
			name,
			Error(
				`The flow exceeded ${c.max_steps} steps`
			)
		)
		return
	}
	const token = ++record.token
	record.controller = new AbortController()
	record.slot = true
	set_status(c, record, "running")
	c.running++
	try {
		const outcome = record.node.each
			? await run_each(c, record, token)
			: await run_single(c, record, token)
		if (token != record.token && outcome.kind == "done" && !is_sentinel(outcome.value)) discard(record, outcome.value)
		if (token != record.token || outcome.kind == "stale") return
		release(c, record)
		if (outcome.kind == "error") {
			drain(c)
			await handle_error(
				c,
				name,
				outcome.value,
				!!outcome.items,
				outcome.index
			)
		} else apply_value(c, name, outcome.value)
	} catch (error) {
		if (token != record.token || c.run_status != "running") return
		release(c, record)
		fail(c, name, error)
	}
}
/**
 * @param {RunContext} c
 * @param {NodeStatus} status
 * @param {unknown} reason
 * @param {boolean=} keep
 * @returns {void}
 */
export function stop_all(c, status, reason, keep) {
	for (const record of c.records.values()) {
		const holds = keep && record.node.options.overlap == "queue"
		if (holds && record.args && active_statuses.has(record.status)) {
			record.backlog = [
				{
					args: record.args,
					resume: true,
					skipped: false
				},
				...record.backlog.slice(record.backlog_head)
			]
			record.backlog_head = 0
		} else if (!holds) {
			if (record.backlog[record.backlog_head]?.resume) forget_runs(record)
			record.backlog = []
			record.backlog_head = 0
		}
		if (!keep) {
			record.holding = false
			record.queued = void 0
		}
		record.retrigger = false
		if (active_statuses.has(record.status)) {
			stop_record(c, record, reason)
			set_status(c, record, status)
		}
	}
	c.queue.length = 0
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {unknown} reason
 * @returns {void}
 */
export function stop_record(c, record, reason) {
	clearTimeout(record.timer)
	record.timer = void 0
	if (record.status == "running") {
		record.token++
		release(c, record)
		record.controller?.abort(reason)
		record.controller = void 0
	} else if (record.status == "pending") {
		const index = c.queue.indexOf(record.node.name)
		if (index >= 0) c.queue.splice(index, 1)
	}
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {void}
 */
export function try_start(c, name) {
	return defer(
		c,
		() => {
			const record = get_record(c, name)
			if (!record.activated || c.run_status != "running") return
			const overlapping = record.retrigger && (active_statuses.has(record.status) || holds_backlog(record))
			if (record.status != "idle" && !overlapping) return
			const { dependents, deps, options } = record.node
			if (options.release && dependents.length && !dependents.some(
				dependent => needs(c, dependent)
			)) return
			const join = options.join ?? "all"
			let done = 0
			let resources = 0
			let settled = 0
			let skipped = 0
			const { arrive } = record.node
			for (const dep of deps) {
				const dep_record = get_record(c, dep)
				if (dep_record.fatal) return
				if (dep_record.status == "idle" && dep_record.node.options.release) {
					resources++
					continue
				}
				if (arrive?.[dep] == "queue") {
					if (record.queued?.get(dep)?.length) {
						done++
						settled++
					}
					continue
				}
				if (dep_record.status == "done") done++
				if (dep_record.status == "skipped") skipped++
				if (settled_statuses.has(dep_record.status)) settled++
			}
			if (resources && !(join == "race" && done)) {
				if (settled + resources < deps.length) return
				if (join != "all" || !skipped) {
					for (const dep of deps) {
						const dep_record = get_record(c, dep)
						if (dep_record.status == "idle" && dep_record.node.options.release) try_start(c, dep)
					}
					return
				}
			} else if (join == "race" ? !done && settled < deps.length : settled < deps.length) return
			const is_skipped = !!deps.length && (join == "all" ? skipped > 0 : !done)
			if (overlapping) {
				record.retrigger = false
				const args = values_for(c, record)
				const overlap = options.overlap ?? "restart"
				if (overlap == "restart") {
					const touched = reset(c, name, true, true)
					if (is_skipped) settle(c, name, "skipped", void 0)
					else launch(c, record, args)
					for (const touched_name of touched) {
						if (touched_name != name) try_start(c, touched_name)
					}
					return
				}
				const entry = { args, skipped: is_skipped }
				if (overlap == "rerun") {
					record.backlog = [ entry ]
					record.backlog_head = 0
				} else {
					record.backlog.push(entry)
					const limit = options.limit ?? Infinity
					const held = record.backlog[record.backlog_head]?.resume ? 1 : 0
					if (record.backlog.length - record.backlog_head - held > limit) {
						record.dropped++
						if (held) record.backlog[record.backlog_head + 1] = /** @type {BacklogEntry} */(record.backlog[record.backlog_head])/**/
						record.backlog_head++
						if (record.backlog_head * 2 > record.backlog.length) {
							record.backlog = record.backlog.slice(record.backlog_head)
							record.backlog_head = 0
						}
					}
				}
				if (!active_statuses.has(record.status)) run_next(c, name)
				return
			}
			if (record.backlog.length > record.backlog_head) {
				run_next(c, name)
				return
			}
			if (is_skipped) {
				settle(c, name, "skipped", void 0)
				return
			}
			if (launch(c, record, values_for(c, record)) && join == "race" && c.run_status == "running") abandon(c, deps, name)
		}
	)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @returns {unknown[]}
 */
function values_for(c, record) {
	const { arrive, deps } = record.node
	if (!arrive) return deps.map(dep => c.results[dep])
	return deps.map(
		dep => arrive[dep] == "queue"
			? record.queued?.get(dep)?.[0]
			: c.results[dep]
	)
}
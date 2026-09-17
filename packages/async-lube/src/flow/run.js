/** @import { BacklogEntry, Cycle, FlowRunner, FlowStatus, InputRef, RawNodeOptions, NodeRecord, NodeRef, SavedNode, NodeStatus, Program, ResumePlan, RunContext, RawRunOptions } from "../../private.js" */
import { CancelError, FlowError } from "../errors.js"
import { random_key } from "../key.js"
import { link_signal, noop } from "../signal.js"
import { channel } from "../stream.js"
import { enter, reset } from "./graph.js"
import {
	clear_record,
	get_record,
	name_or_throw,
	plan_resume,
	plan_retry,
	prepare_restart,
	same_args,
	save_run,
	set_status,
	settle,
	start,
	stop_all,
	try_start
} from "./nodes.js"
import {
	FAILURES,
	INDEX,
	ON_CHANGE,
	RUN_ID,
	STOP,
	active_statuses,
	settled_statuses
} from "./refs.js"
import { release_all } from "./resources.js"
import { start_pumps, stop_pumps } from "./streams.js"
import {
	check_snapshot_names,
	failed_sub_keys,
	find_sub_run,
	flatten_snapshot_errors,
	send_path,
	snapshot_subs
} from "./subflows.js"
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function begin(c) {
	/** @type {Set<string>} */
	const touched = new Set()
	const released = [ ...c.records.values() ].filter(record => record.released)
	for (const record of released) {
		if (record.released?.error === void 0) {
			clear_record(c, record)
			touched.add(record.node.name)
		} else {
			for (const name of reset(c, record.node.name, true)) touched.add(name)
		}
	}
	for (const record of released) record.released = void 0
	for (const name of touched) get_record(c, name).released = void 0
	if (c.cycle.settled) {
		c.cycle = create_cycle()
		if (c.watched || c.streaming && c.observed) c.cycle.promise.catch(noop)
		c.run_status = "running"
		c.steps = 0
		start_pumps(c)
		c.unlink_signal = link_signal(
			c.signal_target,
			c.run_options.signal
		)
		for (const record of c.records.values()) {
			if (record.status == "cancelled") prepare_restart(c, record)
		}
	}
	for (const name of touched) try_start(c, name)
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
function check_complete(c) {
	if (c.active_count || c.run_status != "running" || c.cycle.settled || c.releasing) return
	/** @type {NodeRecord | undefined} */
	let fatal
	for (const record of c.records.values()) {
		if (record.fatal) {
			fatal = record
			break
		}
	}
	const failure = fatal
		? new FlowError(
			fatal.node.name,
			c.errors[fatal.node.name]
		)
		: void 0
	if (failure) release_all(c, failure)
	const holding = [ ...c.records.values() ].filter(
		record => record.node.options.release && record.status == "done" && !record.released
	)
	if (!failure && holding.length) {
		c.releasing = true
		void Promise.allSettled(
			holding.map(
				record => {
					record.released = { error: void 0 }
					const dispose = /** @type {NonNullable<RawNodeOptions["release"]>} */(record.node.options.release)/**/
					return Promise.resolve(record.result)
						.then(
							value => dispose(value, void 0)
						)
				}
			)
		)
			.then(
				outcomes => {
					c.releasing = false
					for (const [ index, outcome ] of outcomes.entries()) {
						const record = /** @type {NodeRecord} */(holding[index])/**/
						if (outcome.status == "fulfilled" || record.released?.error !== void 0 || record.status != "done") continue
						record.released = { error: outcome.reason }
						c.errors[record.node.name] = outcome.reason
						record.fatal = true
						record.result = void 0
						delete c.results[record.node.name]
						set_status(c, record, "failed")
					}
					schedule(c)
				}
			)
		return
	}
	if (failure) {
		c.run_status = "failed"
		close_cycle(c, failure, void 0)
		return
	}
	c.run_status = "done"
	close_cycle(
		c,
		void 0,
		c.program.last == null ? void 0 : c.results[c.program.last]
	)
}
/**
 * @param {RunContext} c
 * @param {unknown} error
 * @param {unknown} value
 * @returns {void}
 */
export function close_cycle(c, error, value) {
	c.cycle.settled = true
	c.unlink_signal()
	c.unlink_signal = noop
	if (error instanceof CancelError) c.cycle.promise.catch(noop)
	if (error) c.cycle.reject(error)
	else c.cycle.resolve(value)
	schedule(c)
}
/**
 * @template T
 * @returns {Cycle<T>}
 */
function create_cycle() {
	const cycle = /** @type {Cycle<T>} */({ settled: false })/**/
	cycle.promise = new Promise(
		(resolve, reject) => {
			cycle.resolve = resolve
			cycle.reject = reject
		}
	)
	return cycle
}
/**
 * @param {RunContext} c
 * @param {() => void} job
 * @returns {void}
 */
export function defer(c, job) {
	c.jobs.push(job)
	if (c.flushing) return
	c.flushing = true
	try {
		for (const queued of c.jobs) queued()
	} finally {
		c.jobs.length = 0
		c.flushing = false
	}
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function drain(c) {
	while (c.running < c.concurrency && c.queue.length) {
		const name = /** @type {string} */(c.queue.shift())/**/
		if (get_record(c, name).status == "pending") start(c, name)
	}
}
/**
 * @param {RunContext} c
 * @returns {Record<string, NodeStatus>}
 */
function get_statuses(c) {
	/** @type {Record<string, NodeStatus>} */
	const statuses = {}
	for (const [ name, record ] of c.records) {
		statuses[name] = record.status == "running" && record.sub_waiting && !record.sub_running && !record.delaying
			? "waiting"
			: record.status
		if (record.status == "done" || record.status == "skipped") continue
		for (const [ key, sub_run ] of record.sub_runs) {
			const prefix = key ? name + "." + key : name
			for (const [ sub_name, status ] of Object.entries(sub_run.nodes)) {
				statuses[prefix + "." + sub_name] = /** @type {NodeStatus} */(status)/**/
			}
		}
	}
	return statuses
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
function notify(c) {
	if (!c.waiters.length && !c.run_options[ON_CHANGE] && !c.subscribers.size) return
	const status = c.run.status
	if (status != "running") {
		for (const resolve of c.waiters.splice(0)) resolve()
	}
	report(c, status)
	publish(c)
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function publish(c) {
	if (!c.subscribers.size || c.notified_version == c.version) return
	c.notified_version = c.version
	for (const listener of [ ...c.subscribers ]) {
		try {
			listener()
		} catch {}
	}
}
/**
 * @param {RunContext} c
 * @param {FlowStatus=} status
 * @returns {void}
 */
export function report(c, status) {
	const on_change = c.run_options[ON_CHANGE]
	if (!on_change) return
	const current = status ?? c.run.status
	if (current == c.reported_status && c.reported_version == c.version) return
	c.reported_status = current
	c.reported_version = c.version
	on_change(current)
}
/**
 * @param {RunContext} c
 * @param {boolean} only_fatal
 * @returns {void}
 */
function retry_failed(c, only_fatal) {
	begin(c)
	if (c.run_status != "running") return
	/** @type {[string, ResumePlan, BacklogEntry[]][]} */
	const plans = []
	for (const [ name, record ] of c.records) {
		if (only_fatal && !record.fatal) continue
		const has_failed_items = !!(record.items ?? record.resume_items)?.some(item => item?.failed)
		if (record.status != "failed" && !(record.status == "done" && (has_failed_items || failed_sub_keys(record).length))) continue
		const plan = plan_retry(record)
		if (record.args && !same_args(c, record)) {
			if (record.status == "failed") plan.items = void 0
			plan.runs = void 0
			plan.subs = void 0
		}
		plans.push(
			[
				name,
				plan,
				record.backlog.slice(record.backlog_head)
			]
		)
	}
	/** @type {Set<string>} */
	const reached = new Set()
	for (const [ name ] of plans) {
		for (const reset_name of reset(c, name, true, true)) {
			if (reset_name != name) reached.add(reset_name)
		}
	}
	for (const [ name, plan, backlog ] of plans) {
		if (reached.has(name)) continue
		const record = get_record(c, name)
		plan_resume(record, plan)
		record.backlog = backlog
	}
	for (const node_name of c.records.keys()) try_start(c, node_name)
	drain(c)
	schedule(c)
}
/**
 * @param {unknown} error
 * @param {number=} depth
 * @returns {unknown}
 */
function save_error(error, depth = 0) {
	if (!(error instanceof Error)) return error
	/** @type {Record<string, unknown>} */
	const saved = {
		...error,
		message: error.message,
		name: error.name
	}
	if (error.cause !== void 0 && depth < 8) saved["cause"] = save_error(error.cause, depth + 1)
	return saved
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
export function schedule(c) {
	if (c.scheduled) return
	c.scheduled = true
	queueMicrotask(
		() => {
			c.scheduled = false
			check_complete(c)
			notify(c)
		}
	)
}
/**
 * @param {Program} program
 * @param {unknown} state
 * @param {RawRunOptions} run_options
 * @param {string=} trace_path
 * @returns {FlowRunner}
 */
export function start_run(
	program,
	state,
	run_options,
	trace_path = ""
) {
	const c = /** @type {RunContext} */(/** @type {unknown} */({}))/**/
	c.program = program
	c.state = state
	c.run_options = run_options
	c.trace_path = trace_path
	const { edges, incoming } = program
	c.edges = edges
	c.incoming = incoming
	if (run_options.id != null && !(typeof run_options.id == "string" && run_options.id)) throw TypeError(
		"The id of a run must be a non-empty string"
	)
	const { snapshot } = run_options
	if (snapshot != null) {
		if (typeof snapshot != "object" || !snapshot.nodes || typeof snapshot.nodes != "object") throw TypeError(
			"Invalid flow snapshot: pass the result of run.snapshot()"
		)
		if (snapshot.version !== 1) throw TypeError(
			`Unknown flow snapshot version ${String(snapshot.version)}: pass the result of run.snapshot()`
		)
		if (run_options.id != null && snapshot.id != null && snapshot.id !== run_options.id) throw TypeError(
			`The id "${run_options.id}" of the run is not the id "${snapshot.id}" of its snapshot`
		)
	}
	const run_id = snapshot?.id ?? run_options.id ?? run_options[RUN_ID] ?? random_key()
	c.run_id = run_id
	c.item_index = run_options[INDEX]
	const trace = run_options.trace && trace_path
		? (
			/** @type {import("../../public.js").TraceEvent} */ event
		) => run_options.trace?.(
			{
				...event,
				node: trace_path + "." + event.node
			}
		)
		: run_options.trace
	c.trace = trace
	const concurrency = program.options.concurrency ?? Infinity
	c.concurrency = concurrency
	/** @type {Record<string, unknown>} */
	const errors = Object.create(null)
	c.errors = errors
	const max_steps = program.options.maxSteps ?? Infinity
	c.max_steps = max_steps
	/** @type {string[]} */
	const queue = []
	c.queue = queue
	/** @type {Map<string, NodeRecord>} */
	const records = new Map()
	c.records = records
	/** @type {Map<string, import("../../public.js").Channel<unknown>>} */
	const streams = new Map()
	c.streams = streams
	/** @type {(() => void)[]} */
	const pumps = []
	c.pumps = pumps
	/** @type {((value: unknown) => void)[]} */
	const room_waiters = []
	c.room_waiters = room_waiters
	c.pumping = false
	/** @type {Record<string, unknown>} */
	const results = Object.create(null)
	c.results = results
	/** @type {Pick<AbortController, "abort">} */
	const signal_target = {
		abort: (/** @type {unknown} */ reason) => run.cancel(reason)
	}
	c.signal_target = signal_target
	c.cycle = create_cycle()
	c.flushing = false
	c.reported_status = "running"
	c.reported_version = -1
	c.version = 0
	c.notified_version = -1
	/** @type {Set<() => void>} */
	const subscribers = new Set()
	c.subscribers = subscribers
	/** @type {Record<string, NodeStatus> | undefined} */
	let nodes_cache
	let nodes_version = -1
	/** @type {Record<string, unknown> | undefined} */
	let results_cache
	let results_version = -1
	/** @type {Record<string, unknown> | undefined} */
	let errors_cache
	let errors_version = -1
	/** @type {(() => void)[]} */
	const waiters = []
	c.waiters = waiters
	/** @type {(() => void)[]} */
	const jobs = []
	c.jobs = jobs
	c.active_count = 0
	c.running = 0
	c.run_status = "running"
	c.observed = false
	c.watched = false
	c.releasing = false
	c.scheduled = false
	c.steps = 0
	c.streaming = false
	c.unlink_signal = noop
	for (const node of program.nodes) {
		records.set(
			node.name,
			{
				abandoned: false,
				activated: !incoming.has(node.name),
				activators: new Set(),
				args: void 0,
				backlog: [],
				backlog_head: 0,
				buffer: void 0,
				controller: void 0,
				deadline: void 0,
				delaying: 0,
				dropped: 0,
				fatal: false,
				gate: void 0,
				holding: false,
				item_list: void 0,
				item_source: void 0,
				items: void 0,
				node,
				previous: void 0,
				queued: void 0,
				released: void 0,
				result: void 0,
				resume_deadline: void 0,
				resume_items: void 0,
				resume_runs: void 0,
				resume_subs: void 0,
				retrigger: false,
				retrying: false,
				runs: new Map(),
				sends: void 0,
				serial: 0,
				slot: false,
				source_ended: false,
				source_error: void 0,
				status: "idle",
				sub_running: 0,
				sub_runs: new Map(),
				sub_waiting: 0,
				timer: void 0,
				token: 0
			}
		)
	}
	let resumes_failure = false
	if (snapshot != null) {
		for (const [ name, data ] of Object.entries(snapshot.nodes)) {
			const record = records.get(name)
			if (!record) throw Error(
				`The snapshot has unknown flow node "${name}"`
			)
			record.abandoned = !!data.abandoned
			record.activated = data.activated
			for (const source of data.activators ?? (data.activated && incoming.has(name) ? [ "*" ] : [])) record.activators.add(source)
			record.backlog = data.backlog ?? []
			record.backlog_head = 0
			record.buffer = data.buffer
			record.previous = data.previous
			if (data.queued) {
				record.queued = new Map(
					Object.entries(data.queued)
						.map(
							([ dep, values ]) => [ dep, [ ...values ] ]
						)
				)
			}
			record.resume_subs = data.subs
			if (data.sends) record.sends = new Map(Object.entries(data.sends))
			record.resume_runs = data.runs
			record.resume_deadline = data.deadline
			record.serial = data.serial ?? 0
			record.fatal = data.status == "failed" && !!data.fatal
			record.holding = data.status == "failed" && !data.fatal && !!data.queued
			if (record.fatal) resumes_failure = true
			set_status(c, record, data.status)
			if (data.status == "done") {
				record.items = data.items
				record.result = data.items ? data.items.map(item => item?.value) : data.result
				results[name] = record.result
			} else record.resume_items = data.items
		}
		Object.assign(errors, snapshot.errors)
		for (const record of records.values()) {
			const { arrive, deps } = record.node
			if (record.backlog.length && deps.some(
				dep => arrive?.[dep] != "queue" && !settled_statuses.has(get_record(c, dep).status)
			)) record.retrigger = true
		}
	}
	/** @type {FlowRunner} */
	const run = {
		cancel(reason) {
			stop_pumps(c)
			for (const source of streams.values()) source.close()
			streams.clear()
			if (c.run_status != "running") return
			const error = new CancelError(
				reason ?? "The flow was cancelled"
			)
			release_all(c, error)
			stop_all(c, "cancelled", error)
			c.run_status = "cancelled"
			if (!c.cycle.settled) close_cycle(c, error, void 0)
		},
		get errors() {
			if (errors_cache && errors_version == c.version) return errors_cache
			/** @type {Record<string, unknown>} */
			const all = { ...errors }
			for (const [ name, record ] of records) {
				/** @type {[string, Record<string, unknown>][]} */
				const subs = record.sub_runs.size
					? [ ...record.sub_runs ].map(
						([ key, sub_run ]) => [ key, sub_run.errors ]
					)
					: Object.entries(record.resume_subs ?? {}).map(
						([ key, sub ]) => [
							key,
							flatten_snapshot_errors(sub)
						]
					)
				for (const [ key, sub_errors ] of subs) {
					for (const [ sub_key, error ] of Object.entries(sub_errors)) all[(key ? name + "." + key : name) + "." + sub_key] = error
				}
			}
			errors_cache = all
			errors_version = c.version
			return all
		},
		[STOP]: stop_pumps.bind(void 0, c),
		[FAILURES]() {
			for (const record of records.values()) {
				if (record.status == "failed" && !record.fatal) return true
				if ((record.items ?? record.resume_items)?.some(item => item?.failed)) return true
				if (failed_sub_keys(record).length) return true
			}
			return false
		},
		catch(on_rejected) {
			c.observed = true
			return c.cycle.promise.catch(on_rejected)
		},
		finally(on_finally) {
			return c.cycle.promise.finally(on_finally)
		},
		get(target) {
			return results[name_or_throw(c, target)]
		},
		idle() {
			watch(c)
			if (run.status != "running") return Promise.resolve()
			return /** @type {Promise<void>} */(new Promise(
				resolve => waiters.push(() => resolve())
			))/**/
		},
		get nodes() {
			if (!nodes_cache || nodes_version != c.version) {
				nodes_cache = get_statuses(c)
				nodes_version = c.version
			}
			return nodes_cache
		},
		pending(target) {
			if (typeof target == "string" && target.includes(".")) {
				const [ sub_run, rest ] = find_sub_run(c, target, "node")
				return sub_run ? sub_run.pending(rest) : 0
			}
			const record = get_record(c, name_or_throw(c, target))
			let queued = active_statuses.has(record.status) ? 1 : 0
			for (const waiting of record.queued?.values() ?? []) queued = Math.max(queued, waiting.length)
			return record.backlog.length - record.backlog_head + queued - (record.holding ? 1 : 0)
		},
		reload(target) {
			if (typeof target == "string" && target.includes(".")) {
				const [ sub_run, rest ] = find_sub_run(c, target, "any")
				sub_run?.reload(rest || void 0)
				return
			}
			const name = target == null ? void 0 : name_or_throw(c, target)
			begin(c)
			if (c.run_status != "running") return
			if (name == null) {
				for (const record of records.values()) {
					clear_record(c, record)
					record.activators.clear()
					record.activated = !incoming.has(record.node.name)
				}
			} else enter(c, [ name ], "*", true)
			for (const node_name of records.keys()) try_start(c, node_name)
			drain(c)
			schedule(c)
		},
		get results() {
			if (!results_cache || results_version != c.version) {
				results_cache = { ...results }
				results_version = c.version
			}
			return results_cache
		},
		retry() {
			retry_failed(c, false)
		},
		send(target, value) {
			if (typeof target == "string" && target.includes(".")) {
				send_path(c, target, value)
				return
			}
			const name = name_or_throw(c, target)
			const record = get_record(c, name)
			if (record.node.kind != "input") throw Error(
				`Flow node "${name}" is not an input`
			)
			if (record.status == "waiting" && c.run_status == "running") {
				settle(c, name, "done", value)
				return
			}
			if (record.abandoned) return
			record.buffer = { value }
			if (settled_statuses.has(record.status) || record.status == "cancelled") {
				begin(c)
				if (c.run_status != "running") return
				enter(c, [ name ], "*")
				for (const node_name of records.keys()) try_start(c, node_name)
				drain(c)
				schedule(c)
			}
		},
		snapshot() {
			if (!run_options[ON_CHANGE]) check_snapshot_names(program, "")
			/** @type {Record<string, SavedNode>} */
			const snapshot_nodes = {}
			/** @type {Set<string>} */
			const held = new Set()
			for (const [ name, record ] of records) {
				if (record.node.options.release && record.status == "done" && !record.released) held.add(name)
			}
			const redone = new Set(held)
			for (const name of redone) {
				for (const dependent of get_record(c, name).node.dependents) {
					if (get_record(c, dependent).status == "done") redone.add(dependent)
				}
			}
			for (const [ name, record ] of records) {
				if (record.node.options.release && record.status == "done") redone.add(name)
			}
			for (const [ name, record ] of records) {
				const { status } = record
				const is_kept = (status == "done" || status == "skipped" || status == "failed") && !redone.has(name)
				/** @type {SavedNode} */
				const data = {
					activated: record.activated,
					status: is_kept ? /** @type {"done" | "failed" | "skipped"} */(status)/**/ : "idle"
				}
				if (record.abandoned) data.abandoned = true
				if (record.activators.size) data.activators = [ ...record.activators ]
				if (record.fatal && status == "failed") data.fatal = true
				if (status == "done") data.result = record.result
				if (record.previous !== void 0) data.previous = record.previous
				if (record.buffer) data.buffer = { value: record.buffer.value }
				if (record.sends?.size) data.sends = Object.fromEntries(record.sends)
				if (status == "waiting" && record.deadline != null) data.deadline = record.deadline
				if (record.serial) data.serial = record.serial
				const is_stale = status == "done"
					? redone.has(name)
					: !(record.node.options.overlap == "queue" && active_statuses.has(status)) && !!record.args && (!same_args(c, record) || record.node.deps.some(dep => redone.has(dep)))
				const is_moved = is_stale || status == "done" && !!(record.runs.size || record.resume_runs || record.sub_runs.size || record.resume_subs) && !!record.args && !same_args(c, record)
				if (!is_moved && (record.runs.size || record.resume_runs)) {
					data.runs = { ...record.resume_runs }
					for (const [ unit, run_state ] of record.runs) data.runs[unit] = save_run(run_state)
				} else if (held.has(name) && same_args(c, record) && !record.node.deps.some(dep => redone.has(dep))) {
					data.runs = {
						"": {
							attempt: 1,
							serial: record.serial,
							waits: []
						}
					}
				}
				for (const [ dep, values ] of record.queued ?? []) {
					if (values.length) (data.queued ??= {})[dep] = [ ...values ]
				}
				const in_flight = record.node.options.overlap == "queue" && active_statuses.has(status) && record.args
				const backlog = in_flight
					? [
						{
							args: in_flight,
							resume: true,
							skipped: false
						},
						...record.backlog.slice(record.backlog_head)
					]
					: record.backlog.slice(record.backlog_head)
				if (backlog.length) data.backlog = backlog.map(
					entry => entry.resume
						? {
							args: [ ...entry.args ],
							resume: true,
							skipped: entry.skipped
						}
						: {
							args: [ ...entry.args ],
							skipped: entry.skipped
						}
				)
				const items = record.items ?? record.resume_items
				const has_failed_items = !!items?.some(item => item?.failed)
				if (!is_stale && (!is_kept || status == "failed" || has_failed_items || failed_sub_keys(record).length)) {
					if (items) data.items = Array.from(
						{ length: items.length },
						(_, index) => items[index] ?? null
					)
					if (!is_moved && record.sub_runs.size) data.subs = snapshot_subs(record)
					else if (!is_moved && record.resume_subs) data.subs = record.resume_subs
				}
				snapshot_nodes[name] = data
			}
			/** @type {Record<string, unknown>} */
			const snapshot_errors = {}
			for (const [ key, error ] of Object.entries(errors)) {
				const dot = key.indexOf(".")
				const data = snapshot_nodes[dot < 0 ? key : key.slice(0, dot)]
				if (!data) continue
				const is_kept = dot < 0 || !data.items || data.fatal
					? data.status != "idle"
					: data.items[Number(key.slice(dot + 1))] != null
				if (is_kept) snapshot_errors[key] = save_error(error)
			}
			return {
				errors: snapshot_errors,
				id: run_id,
				nodes: snapshot_nodes,
				version: 1
			}
		},
		get state() {
			return state
		},
		get status() {
			if (c.run_status != "running") return c.run_status
			let waiting = false
			for (const record of records.values()) {
				if (record.delaying) return "running"
				if (record.status == "running") {
					if (record.sub_running || !record.sub_waiting) return "running"
					waiting = true
				}
				if (record.status == "waiting") waiting = true
			}
			return waiting ? "waiting" : "running"
		},
		stream(target) {
			const name = name_or_throw(c, target)
			let source = streams.get(name)
			if (!source) {
				source = channel()
				streams.set(name, source)
			}
			return source
		},
		subscribe(listener) {
			watch(c)
			subscribers.add(listener)
			return () => {
				subscribers.delete(listener)
			}
		},
		then(on_fulfilled, on_rejected) {
			if (on_rejected) c.observed = true
			return c.cycle.promise.then(on_fulfilled, on_rejected)
		}
	}
	c.run = run
	const { reload, retry, send } = run
	Object.assign(
		run,
		{
			/** @param {NodeRef | string=} target */
			reload: target => {
				try {
					reload(target)
				} finally {
					report(c)
					publish(c)
				}
			},
			retry: () => {
				try {
					retry()
				} finally {
					report(c)
					publish(c)
				}
			},
			/**
			 * @param {InputRef | string} target
			 * @param {unknown} value
			 */
			send: (target, value) => {
				try {
					send(target, value)
				} finally {
					report(c)
					publish(c)
				}
			}
		}
	)
	c.unlink_signal = link_signal(
		signal_target,
		run_options.signal
	)
	if (resumes_failure) retry_failed(c, true)
	for (const name of records.keys()) try_start(c, name)
	start_pumps(c)
	schedule(c)
	return run
}
/**
 * @param {RunContext} c
 * @returns {void}
 */
function watch(c) {
	if (c.watched) return
	c.watched = true
	c.cycle.promise.catch(noop)
}
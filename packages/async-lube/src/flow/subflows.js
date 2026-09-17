/** @import { FlowDefinition, FlowRunner, SavedFlow, FlowStatus, NodeRecord, Program, RunContext } from "../../private.js" */
import { compile } from "./compile.js"
import { get_record, name_or_throw } from "./nodes.js"
import {
	FAILURES,
	INDEX,
	ON_CHANGE,
	RUN_ID,
	STOP,
	active_statuses
} from "./refs.js"
import { report, schedule, start_run } from "./run.js"
/**
 * @param {Program} program
 * @param {string} path
 * @param {string} full
 * @param {"any" | "input" | "node"} need
 * @returns {void}
 */
function check_path(program, path, full, need) {
	const dot = path.indexOf(".")
	const head = dot < 0 ? path : path.slice(0, dot)
	const name = program.name_of(head)
	const node = name == null ? void 0 : program.node_of(name)
	if (!node) throw Error(
		`"${head}" is not added to the flow`
	)
	if (dot < 0) {
		if (need == "input" && node.kind != "input") throw Error(
			`Flow node "${node.name}" is not an input`
		)
		return
	}
	if (node.kind != "flow") throw Error(
		`Flow node "${node.name}" is not a flow, so "${full}" names nothing`
	)
	let rest = path.slice(dot + 1)
	if (node.each) {
		const next = rest.indexOf(".")
		const key = next < 0 ? rest : rest.slice(0, next)
		if (!is_index(key)) throw Error(
			`Flow node "${node.name}" has no item ${key}`
		)
		rest = next < 0 ? "" : rest.slice(next + 1)
	}
	if (!rest) {
		if (need == "any") return
		throw Error(
			`The path "${full}" does not name ${need == "input" ? "an input" : "a node"}`
		)
	}
	check_path(
		compile(
			/** @type {FlowDefinition} */(node.sub)/**/
		),
		rest,
		full,
		need
	)
}
/**
 * @param {Program} program
 * @param {string} path
 * @param {string[]=} problems
 * @returns {void}
 */
export function check_snapshot_names(program, path, problems) {
	for (const node of program.nodes) {
		const name = path + node.name
		if (!node.named) {
			const message = `Flow node "${name}" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option`
			if (!problems) throw Error(message)
			problems.push(message)
		}
		if (node.sub) check_snapshot_names(
			compile(node.sub),
			name + ".",
			problems
		)
	}
}
/**
 * @param {NodeRecord} record
 * @param {FlowStatus} status
 * @param {number} change
 * @returns {void}
 */
function count_sub(record, status, change) {
	if (status == "running") record.sub_running += change
	else if (status == "waiting") record.sub_waiting += change
}
/**
 * @param {NodeRecord} record
 * @returns {string[]}
 */
export function failed_sub_keys(record) {
	if (record.sub_runs.size) return [ ...record.sub_runs ].filter(
		([ , sub_run ]) => sub_run[FAILURES]()
	).map(([ key ]) => key)
	return Object.entries(record.resume_subs ?? {}).filter(
		([ , sub ]) => has_snapshot_failures(sub)
	)
		.map(([ key ]) => key)
}
/**
 * @param {RunContext} c
 * @param {string} path
 * @param {"any" | "node"} need
 * @returns {[FlowRunner | undefined, string]}
 */
export function find_sub_run(c, path, need) {
	const dot = path.indexOf(".")
	const record = get_record(
		c,
		name_or_throw(c, path.slice(0, dot))
	)
	if (record.node.kind != "flow") throw Error(
		`Flow node "${record.node.name}" is not a flow, so "${path}" names nothing`
	)
	let rest = path.slice(dot + 1)
	let key = ""
	if (record.node.each) {
		const next = rest.indexOf(".")
		key = next < 0 ? rest : rest.slice(0, next)
		rest = next < 0 ? "" : rest.slice(next + 1)
	}
	const sub_run = record.status == "running" ? record.sub_runs.get(key) : void 0
	if (sub_run && active_statuses.has(sub_run.status)) return [ sub_run, rest ]
	check_path(c.program, path, path, need)
	const count = record.status == "running" ? record.items?.length : void 0
	if (count != null && Number(key) >= count) throw Error(
		`Flow node "${record.node.name}" has no item ${key}`
	)
	return [ void 0, rest ]
}
/**
 * @param {SavedFlow} snapshot
 * @returns {Record<string, unknown>}
 */
export function flatten_snapshot_errors(snapshot) {
	/** @type {Record<string, unknown>} */
	const all = { ...snapshot.errors }
	for (const [ name, data ] of Object.entries(snapshot.nodes)) {
		for (const [ key, sub ] of Object.entries(data.subs ?? {})) {
			for (const [ sub_key, error ] of Object.entries(flatten_snapshot_errors(sub))) all[(key ? name + "." + key : name) + "." + sub_key] = error
		}
	}
	return all
}
/**
 * @param {SavedFlow} snapshot
 * @returns {boolean}
 */
function has_snapshot_failures(snapshot) {
	return Object.values(snapshot.nodes).some(
		data => data.status == "failed" || !!data.items?.some(item => item?.failed) || Object.values(data.subs ?? {}).some(has_snapshot_failures)
	)
}
/**
 * @param {string} key
 * @returns {boolean}
 */
function is_index(key) {
	return /^(?:0|[1-9]\d*)$/.test(key)
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {string} key
 * @param {unknown} sub_state
 * @param {AbortSignal} signal
 * @param {SavedFlow | undefined} sub_snapshot
 * @param {number} serial
 * @returns {Promise<unknown>}
 */
export async function run_sub(
	c,
	record,
	key,
	sub_state,
	signal,
	sub_snapshot,
	serial
) {
	const index = key ? Number(key) : c.item_index
	/** @type {FlowStatus} */
	let reported = "running"
	/**
	 * @param {FlowStatus} status
	 * @returns {void}
	 */
	function on_change(status) {
		count_sub(record, reported, -1)
		count_sub(record, status, 1)
		reported = status
		c.version++
		report(c)
		schedule(c)
	}
	count_sub(record, reported, 1)
	const sub_run = start_run(
		compile(
			/** @type {FlowDefinition} */(record.node.sub)/**/
		),
		sub_state,
		sub_snapshot
			? {
				[INDEX]: index,
				[ON_CHANGE]: on_change,
				signal,
				snapshot: sub_snapshot,
				trace: c.run_options.trace
			}
			: {
				[INDEX]: index,
				[ON_CHANGE]: on_change,
				[RUN_ID]: `${c.run_id}:${record.node.name}${key ? "#" + key : ""}:${serial}`,
				signal,
				trace: c.run_options.trace
			},
		(c.trace_path ? c.trace_path + "." : "") + record.node.name + (key ? "." + key : "")
	)
	if (record.retrying && sub_snapshot) sub_run.retry()
	record.sub_runs.set(key, sub_run)
	const sends = record.sends?.get(key)
	if (sends) {
		record.sends?.delete(key)
		for (const [ path, value ] of sends) {
			try {
				sub_run.send(path, value)
			} catch {}
		}
	}
	try {
		const value = await sub_run
		if (record.sub_runs.get(key) == sub_run && !sub_run[FAILURES]()) record.sub_runs.delete(key)
		return value
	} finally {
		sub_run[STOP]()
	}
}
/**
 * @param {RunContext} c
 * @param {string} path
 * @param {unknown} value
 * @returns {void}
 */
export function send_path(c, path, value) {
	const dot = path.indexOf(".")
	const record = get_record(
		c,
		name_or_throw(c, path.slice(0, dot))
	)
	const { each, kind, name } = record.node
	let rest = path.slice(dot + 1)
	let key = ""
	if (each) {
		const next = rest.indexOf(".")
		key = next < 0 ? rest : rest.slice(0, next)
		rest = next < 0 ? "" : rest.slice(next + 1)
	}
	const sub_run = kind == "flow" && rest && record.status == "running"
		? record.sub_runs.get(key)
		: void 0
	if (sub_run && active_statuses.has(sub_run.status)) {
		sub_run.send(rest, value)
		return
	}
	check_path(c.program, path, path, "input")
	if (record.abandoned && !active_statuses.has(record.status)) return
	const count = record.status == "running" ? record.items?.length : void 0
	if (count != null && Number(key) >= count) throw Error(
		`Flow node "${name}" has no item ${key}`
	)
	const item = record.items?.[Number(key)]
	const is_kept = record.sub_runs.has(key) || !!record.resume_subs?.[key] || !!item?.failed
	if (!is_kept && (record.status == "done" || record.status == "skipped" || item)) return
	record.sends ??= new Map()
	const sends = record.sends.get(key)
	if (sends) sends.push([ rest, value ])
	else record.sends.set(key, [ [ rest, value ] ])
}
/**
 * @param {NodeRecord} record
 * @returns {Record<string, SavedFlow>}
 */
export function snapshot_subs(record) {
	return Object.fromEntries(
		[ ...record.sub_runs ].map(
			([ key, sub_run ]) => [ key, sub_run.snapshot() ]
		)
	)
}
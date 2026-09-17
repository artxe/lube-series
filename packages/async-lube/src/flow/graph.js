/** @import { RunContext } from "../../private.js" */
import { CancelError } from "../errors.js"
import {
	clear_record,
	fail,
	get_record,
	holds_backlog,
	settle,
	stop_record,
	try_start
} from "./nodes.js"
import {
	active_statuses,
	describe,
	has_own,
	settled_statuses
} from "./refs.js"
import { release_unused } from "./resources.js"
import { defer } from "./run.js"
/**
 * @param {RunContext} c
 * @param {string[]} deps
 * @param {string} race
 * @returns {void}
 */
export function abandon(c, deps, race) {
	/** @type {Set<string>} */
	const region = new Set()
	const stack = deps.filter(
		dep => get_record(c, dep).status != "done"
	)
	while (stack.length) {
		const name = /** @type {string} */(stack.pop())/**/
		if (name == race || region.has(name)) continue
		region.add(name)
		stack.push(
			...get_record(c, name).node.deps,
			...c.program.sources.get(name) ?? []
		)
	}
	if (!region.size) return
	const dead = new Set(region).add(race)
	/** @type {string[]} */
	const needed = []
	for (const name of region) {
		const record = get_record(c, name)
		const { dependents, options } = record.node
		const targets = options.finish && record.status == "running"
			? dependents.filter(
				dependent => (get_record(c, dependent).node.options.join ?? "all") == "all"
			)
			: [
				...dependents,
				...c.program.transitions.get(name) ?? []
			]
		if (targets.some(
			target => !dead.has(target) && may_run(c, target, dead)
		)) needed.push(name)
	}
	for (const name of needed) region.delete(name)
	while (needed.length) {
		const name = /** @type {string} */(needed.pop())/**/
		for (const source of [
			...get_record(c, name).node.deps,
			...c.program.sources.get(name) ?? []
		]) {
			if (region.delete(source)) needed.push(source)
		}
	}
	for (const name of region) {
		const record = get_record(c, name)
		if (settled_statuses.has(record.status)) continue
		record.backlog = []
		record.backlog_head = 0
		record.retrigger = false
		if (record.status == "running" && record.node.options.finish) {
			record.abandoned = true
			record.queued = void 0
			continue
		}
		const is_running = record.status == "running" && !record.node.each && !record.delaying
		stop_record(
			c,
			record,
			new CancelError(
				`Flow node "${name}" lost the race`
			)
		)
		settle(c, name, "skipped", void 0, is_running)
		record.abandoned = true
	}
	for (const name of region) release_unused(c, name, void 0)
}
/**
 * @param {RunContext} c
 * @param {string[]} targets
 * @param {string} source
 * @param {boolean=} force
 * @returns {void}
 */
export function enter(c, targets, source, force) {
	if (c.run_status != "running" || !targets.length) return
	/** @type {Set<string>} */
	const touched = new Set()
	for (const target of targets) {
		for (const name of reset(c, target, true, force)) touched.add(name)
	}
	for (const target of targets) {
		const record = get_record(c, target)
		record.activators.add(source)
		record.activated = true
	}
	for (const target of targets) try_start(c, target)
	for (const name of touched) try_start(c, name)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} result
 * @returns {void}
 */
export function follow_edge(c, name, result) {
	const edge = c.edges.get(name)
	/** @type {string[]} */
	const selected = []
	if (edge) {
		/** @type {unknown} */
		let value
		try {
			value = edge.select(result, { state: c.state })
		} catch (error) {
			fail(c, name, error)
			return
		}
		for (const target of /** @type {unknown[]} */(value == null
			? []
			: Array.isArray(value)
				? value
				: [ value ])/**/) {
			if (edge.map) {
				/** @type {string} */
				let key
				try {
					key = String(target)
				} catch (error) {
					fail(c, name, error)
					return
				}
				if (!has_own.call(edge.map, key)) {
					fail(
						c,
						name,
						Error(
							`The edge from "${name}" selected "${key}", which is not one of its keys`
						)
					)
					return
				}
				selected.push(
					/** @type {string} */(edge.map[key])/**/
				)
				continue
			}
			const target_name = c.program.name_of(target)
			if (target_name == null || !edge.targets.includes(target_name)) {
				fail(
					c,
					name,
					Error(
						`The edge from "${name}" selected ${describe(target)}, which is not one of its targets`
					)
				)
				return
			}
			selected.push(target_name)
		}
	}
	enter(c, selected, name)
	kill_transitions(c, name)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {string} target
 * @param {Set<string>} visited
 * @returns {boolean}
 */
function is_live(c, name, target, visited) {
	const stack = [ name ]
	while (stack.length) {
		const current = /** @type {string} */(stack.pop())/**/
		if (visited.has(current)) continue
		visited.add(current)
		if (c.program.is_downstream(target, current)) continue
		const record = get_record(c, current)
		if (active_statuses.has(record.status)) return true
		if (record.status != "idle") continue
		if (record.activated) return true
		for (const source of c.program.sources.get(current) ?? []) stack.push(source)
	}
	return false
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {string} source
 * @returns {void}
 */
function kill(c, name, source) {
	return defer(
		c,
		() => {
			const record = get_record(c, name)
			if (c.run_status != "running" || record.status != "idle" || record.activated) return
			const visited = new Set([ name, source ])
			for (const other of c.program.sources.get(name) ?? []) {
				if (other != source && is_live(c, other, name, visited)) return
			}
			settle(c, name, "skipped", void 0)
		}
	)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @returns {void}
 */
export function kill_transitions(c, name) {
	for (const target of c.program.transitions.get(name) ?? []) kill(c, target, name)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {Set<string>} dead
 * @returns {boolean}
 */
function may_run(c, name, dead) {
	const record = get_record(c, name)
	if (settled_statuses.has(record.status)) return false
	if (record.status != "idle" || record.activated) return true
	return (c.program.sources.get(name) ?? []).some(
		source => is_live(
			c,
			source,
			name,
			new Set(dead).add(name)
		)
	)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {boolean} is_root
 * @param {boolean=} force
 * @returns {Set<string>}
 */
export function reset(c, name, is_root, force) {
	/** @type {Set<string>} */
	const names = new Set()
	/** @type {{ from: string | undefined, name: string }[]} */
	const stack = [ { from: void 0, name } ]
	while (stack.length) {
		const entry = /** @type {{ from: string | undefined, name: string }} */(stack.pop())/**/
		const node_name = entry.name
		if (names.has(node_name)) continue
		const node_record = get_record(c, node_name)
		const arrive = entry.from == null ? void 0 : node_record.node.arrive?.[entry.from]
		if (arrive == "keep" || arrive == "queue") continue
		if (entry.from != null && node_record.status == "done") {
			const from = get_record(c, entry.from)
			if (node_record.node.options.join == "race"
				? from.status != "done"
				: from.fatal && from.node.options.release) continue
		}
		const overlap = arrive == "restart" ? "restart" : node_record.node.options.overlap ?? "restart"
		const keeps = overlap == "restart"
			? node_record.status == "running"
			: active_statuses.has(node_record.status) || holds_backlog(node_record)
		if (keeps && !(force && node_name == name)) {
			if (overlap != "ignore") node_record.retrigger = true
			continue
		}
		names.add(node_name)
		/** @type {string[]} */
		const next = [
			...get_record(c, node_name).node.dependents
		]
		for (const target of c.program.forward.get(node_name) ?? []) {
			const target_record = get_record(c, target)
			const is_owned = target_record.activators.has(node_name) || target_record.activators.has("*")
			if (is_owned || !target_record.activated && settled_statuses.has(target_record.status)) next.push(target)
		}
		for (let i = next.length; i--;) stack.push(
			{
				from: node_name,
				name: /** @type {string} */(next[i])/**/
			}
		)
	}
	for (const node_name of names) {
		const record = get_record(c, node_name)
		clear_record(c, record)
		if (node_name == name && is_root) continue
		for (const source of record.activators) {
			if (names.has(source)) record.activators.delete(source)
		}
		if ((c.program.sources.get(node_name) ?? []).some(source => names.has(source))) record.activators.delete("*")
		record.activated = !c.incoming.has(node_name) || record.activators.size > 0
	}
	return names
}
/** @import { DefinitionNode, FlowDefinition, NodeRef, Program, ProgramEdge, ProgramNode, RefProbe, Task } from "../../private.js" */
import {
	ARRIVE,
	DEFINITION,
	EACH,
	describe,
	to_array,
	to_ref
} from "./refs.js"
/** @type {WeakMap<FlowDefinition, Program>} */
const programs = new WeakMap()
/**
 * @param {FlowDefinition} definition
 * @returns {Program}
 */
export function compile(definition) {
	const cached = programs.get(definition)
	if (cached) return cached
	const source_nodes = definition.list.slice(0, definition.count)
	/** @type {Map<unknown, string>} */
	const by_ref = new Map(
		source_nodes.map(
			node => [ node.ref, node.name ]
		)
	)
	const by_name = new Set(by_ref.values())
	/**
	 * @param {unknown} target
	 * @returns {string | undefined}
	 */
	function name_of(target) {
		return typeof target == "string"
			? by_name.has(target)
				? target
				: void 0
			: by_ref.get(target)
	}
	/**
	 * @param {unknown} target
	 * @param {string} message
	 * @returns {string}
	 */
	function resolve(target, message) {
		const name = name_of(target)
		if (name == null) throw Error(
			message.replace("%s", describe(target))
		)
		return name
	}
	/**
	 * @param {DefinitionNode} node
	 * @returns {Record<string, "keep" | "queue" | "restart"> | undefined}
	 */
	function to_arrive(node) {
		/** @type {Record<string, "keep" | "queue" | "restart"> | undefined} */
		let arrive
		for (const dep of node.deps) {
			if (!/** @type {RefProbe} */(dep)/**/?.[ARRIVE]) continue
			(arrive ??= Object.create(null))[resolve(
				to_ref(dep),
				`Flow node "${node.name}" depends on %s, which is not added`
			)] = /** @type {{ policy: "keep" | "queue" | "restart" }} */(/** @type {unknown} */(dep))/**/.policy
		}
		return arrive
	}
	/** @type {ProgramNode[]} */
	const nodes = source_nodes.map(
		node => ({
			arrive: to_arrive(node),
			dependents: [],
			deps: node.deps.map(
				dep => resolve(
					to_ref(dep),
					`Flow node "${node.name}" depends on %s, which is not added`
				)
			),
			each: node.each,
			fallback: to_array(node.options.fallback).map(
				target => resolve(
					target,
					`The fallback of flow node "${node.name}" is %s, which is not added`
				)
			),
			kind: node.kind,
			name: node.name,
			named: node.named,
			options: node.options,
			queuers: [],
			run: node.kind == "task"
				? /** @type {Task} */(node.ref[EACH] ?? node.ref)/**/
				: void 0,
			source: node.source,
			sub: node.kind == "flow" ? (node.ref[EACH] ?? node.ref)[DEFINITION] : void 0
		})
	)
	const nodes_by_name = new Map(
		nodes.map(node => [ node.name, node ])
	)
	for (const node of nodes) {
		for (const dep of node.deps) {
			const source = /** @type {ProgramNode} */(nodes_by_name.get(dep))/**/
			source.dependents.push(node.name)
			if (node.arrive?.[dep] == "queue") source.queuers.push(node.name)
		}
	}
	/** @type {Map<string, number>} */
	const marks = new Map()
	/** @type {string[]} */
	const sorted = []
	for (const root of nodes) {
		if (marks.has(root.name)) continue
		marks.set(root.name, 1)
		const path = [ root.name ]
		const cursors = [ 0 ]
		while (path.length) {
			const top = path.length - 1
			const name = /** @type {string} */(path[top])/**/
			const node = /** @type {ProgramNode} */(nodes_by_name.get(name))/**/
			const cursor = /** @type {number} */(cursors[top])/**/
			if (cursor == node.deps.length) {
				marks.set(name, 2)
				sorted.push(name)
				path.pop()
				cursors.pop()
				continue
			}
			cursors[top] = cursor + 1
			const dep = /** @type {string} */(node.deps[cursor])/**/
			const mark = marks.get(dep)
			if (mark == 2) continue
			if (mark == 1) throw Error(
				`Circular dependency: ${[ ...path.slice(path.indexOf(dep)), dep ].join(" -> ")}`
			)
			marks.set(dep, 1)
			path.push(dep)
			cursors.push(0)
		}
	}
	/** @type {Map<string, Set<string>>} */
	const downstream = new Map()
	/**
	 * @param {string} name
	 * @returns {Set<string>}
	 */
	function downstream_of(name) {
		let found = downstream.get(name)
		if (found) return found
		found = new Set()
		const stack = [ name ]
		while (stack.length) {
			const current = /** @type {string} */(stack.pop())/**/
			for (const dependent of /** @type {ProgramNode} */(nodes_by_name.get(current))/**/.dependents) {
				if (found.has(dependent)) continue
				found.add(dependent)
				stack.push(dependent)
			}
		}
		downstream.set(name, found)
		return found
	}
	/** @type {Map<string, ProgramEdge>} */
	const edges = new Map()
	for (const edge of definition.edges) {
		const from = resolve(
			edge.from,
			"The edge from %s cannot start, because it is not added"
		)
		/**
		 * @param {NodeRef} target
		 * @returns {string}
		 */
		function to_name(target) {
			return resolve(
				target,
				`The edge from "${from}" goes to %s, which is not added`
			)
		}
		edges.set(
			from,
			{
				labels: edge.labels.map(
					([ label, target ]) => [ label, to_name(target) ]
				),
				map: edge.map && Object.fromEntries(
					Object.entries(edge.map).map(
						([ key, target ]) => [ key, to_name(target) ]
					)
				),
				select: edge.select,
				targets: edge.targets.map(to_name)
			}
		)
	}
	const order = new Map(
		sorted.map((name, i) => [ name, i ])
	)
	/** @type {Map<string, string[]>} */
	const forward = new Map()
	/** @type {Set<string>} */
	const incoming = new Set()
	/** @type {Map<string, string[]>} */
	const sources = new Map()
	/** @type {Map<string, string[]>} */
	const transitions = new Map()
	for (const node of nodes) {
		const edge_targets = edges.get(node.name)?.targets ?? []
		const targets = [
			...new Set(
				[
					...edge_targets,
					...node.fallback
				]
			)
		]
		/** @type {string[]} */
		const later = []
		for (const target of targets) {
			sources.set(
				target,
				[
					...sources.get(target) ?? [],
					node.name
				]
			)
			const is_later = Number(order.get(node.name)) < Number(order.get(target))
			const is_fallback_only = !edge_targets.includes(target)
			const is_ancestor = target == node.name || downstream_of(target).has(node.name)
			if (is_later || is_fallback_only && !is_ancestor) {
				incoming.add(target)
				later.push(target)
			}
		}
		forward.set(node.name, later)
		transitions.set(node.name, targets)
	}
	/** @type {Program} */
	const program = {
		edges,
		forward,
		incoming,
		is_downstream: (target, name) => downstream_of(target).has(name),
		last: nodes[nodes.length - 1]?.name,
		name_of,
		node_of: name => nodes_by_name.get(name),
		nodes,
		options: definition.options,
		sources,
		transitions
	}
	programs.set(definition, program)
	return program
}
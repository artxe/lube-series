/** @import { DefinitionEdge, DefinitionNode, EdgeSelect, FlowBuilder, FlowDefinition, RawNodeOptions, NodeRef, Program, ProgramNode, RefProbe, RawRunOptions } from "../../private.js" */
import { compile } from "./compile.js"
import {
	DEFINITION,
	EACH,
	INPUT,
	describe,
	is_count,
	is_ref,
	is_retry,
	is_stream,
	to_array,
	to_ref
} from "./refs.js"
import { start_run } from "./run.js"
import { check_snapshot_names } from "./subflows.js"
const input_option_keys = new Set(
	[
		"catch",
		"fallback",
		"join",
		"name",
		"optional",
		"timeout",
		"when"
	]
)
const joins = new Set([ "all", "any", "race" ])
const node_option_keys = new Set(
	[
		"catch",
		"concurrency",
		"fallback",
		"finish",
		"join",
		"limit",
		"name",
		"optional",
		"overflow",
		"overlap",
		"release",
		"retry",
		"timeout",
		"when"
	]
)
const run_option_keys = new Set(
	[ "id", "signal", "snapshot", "trace" ]
)
const overlaps = new Set(
	[
		"ignore",
		"queue",
		"rerun",
		"restart"
	]
)
/**
 * @param {FlowDefinition} definition
 * @returns {FlowBuilder}
 */
export function create_builder(definition) {
	const { count, list, names, refs } = definition
	/**
	 * @param {string} name
	 * @param {number=} except
	 * @returns {boolean}
	 */
	function is_taken(name, except) {
		const index = names.get(name)
		return index != null && index < count && index !== except
	}
	return {
		[DEFINITION]: definition,
		/**
		 * @param {NodeRef} ref
		 * @param {(RawNodeOptions | NodeRef)[]} args
		 */
		add(ref, ...args) {
			const last = args[args.length - 1]
			const has_options = last != null && typeof last == "object" && !Array.isArray(last) && !is_ref(to_ref(last))
			const deps = has_options ? args.slice(0, -1) : args
			/** @type {RawNodeOptions} */
			const options = has_options ? /** @type {RawNodeOptions} */(last)/**/ : {}
			const missing = [
				...new Set(
					deps.map(to_ref)
						.filter(
							dep => (!!/** @type {RefProbe} */(dep)/**/?.[INPUT] || is_stream(dep)) && !((refs.get(dep) ?? count) < count)
						)
				)
			]
			if (missing.length) {
				/** @type {FlowBuilder} */
				let builder = create_builder(definition)
				for (const dep of missing) {
					builder = builder.add(dep)
					const added_definition = builder[DEFINITION]
					const auto_entry = added_definition.list[added_definition.count - 1]
					if (auto_entry) auto_entry.auto = true
				}
				return builder.add(ref, ...args)
			}
			const target = ref?.[EACH] ?? ref
			const kind = target?.[INPUT] || is_stream(target)
				? "input"
				: target?.[DEFINITION]
					? "flow"
					: typeof target == "function"
						? "task"
						: void 0
			if (!kind) throw TypeError(
				"A flow node must be a function, an input, a flow or a stream"
			)
			const base = options.name ?? (is_stream(ref)
				? "stream"
				: kind == "flow"
					? "flow"
					: ref.name || (kind == "task" ? "node" : "input"))
			if (typeof base != "string" || !base || base.includes(".") || base == "__proto__") throw TypeError(
				`Flow node name must be a non-empty string without ".", other than "__proto__": ${String(base)}`
			)
			const added = refs.get(ref)
			const replacing = added != null && added < count && /** @type {DefinitionNode} */(list[added])/**/.auto
				? added
				: void 0
			if (options.name != null && is_taken(base, replacing)) throw Error(
				`Flow node "${base}" is already defined`
			)
			let name = base
			for (let i = 2; is_taken(name, replacing); i++) name = base + "_" + i
			if (added != null && added < count && replacing == null) throw Error(
				`${describe(ref)} is already added as flow node "${/** @type {DefinitionNode} */(list[added])/**/.name}"`
			)
			for (const dep of deps) {
				if (Array.isArray(dep)) throw TypeError(
					`Pass the dependencies of flow node "${name}" as separate arguments, not as an array: add(node, a, b)`
				)
				if (!is_ref(to_ref(dep))) throw TypeError(
					`The dependencies of flow node "${name}" must be functions, inputs, flows or streams`
				)
			}
			const allowed = kind == "input" ? input_option_keys : node_option_keys
			for (const key of Object.keys(options)) {
				if (!allowed.has(key)) throw TypeError(
					`Unknown option "${key}" for ${kind == "input" ? "input" : "flow"} node "${name}"`
				)
			}
			if (options.catch != null && typeof options.catch != "function") throw TypeError(
				`The catch of flow node "${name}" must be a function`
			)
			if (options.release != null && typeof options.release != "function") throw TypeError(
				`The release of flow node "${name}" must be a function`
			)
			if (options.when != null && typeof options.when != "function") throw TypeError(
				`The when of flow node "${name}" must be a function`
			)
			if (options.finish != null && typeof options.finish != "boolean") throw TypeError(
				`The finish of flow node "${name}" must be a boolean`
			)
			if (options.optional != null && typeof options.optional != "boolean") throw TypeError(
				`The optional of flow node "${name}" must be a boolean`
			)
			if (options.catch != null && options.fallback != null) throw TypeError(
				`Flow node "${name}" cannot have both catch and fallback`
			)
			if (options.optional && (options.catch != null || options.fallback != null)) throw TypeError(
				`Flow node "${name}" cannot be optional with catch or fallback, which handle the failure instead`
			)
			if (!to_array(options.fallback).every(is_ref)) throw TypeError(
				`The fallback of flow node "${name}" must be functions, inputs, flows or streams`
			)
			if (to_array(options.fallback).includes(ref)) throw TypeError(
				`The fallback of flow node "${name}" cannot be the node itself, which would fail again`
			)
			if (options.join != null && !joins.has(options.join)) throw TypeError(
				`The join of flow node "${name}" must be "all", "any" or "race"`
			)
			if (options.join != null && !deps.length) throw TypeError(
				`The join of flow node "${name}" needs dependencies to join`
			)
			if (options.concurrency != null && !ref[EACH]) throw TypeError(
				`The concurrency of flow node "${name}" applies only to flow.each(): use flow({ concurrency }) for nodes`
			)
			if (options.concurrency != null && !is_count(options.concurrency)) throw TypeError(
				`The concurrency of flow node "${name}" must be a positive integer or Infinity`
			)
			if (options.retry != null && !is_retry(options.retry)) throw TypeError(
				`The retry of flow node "${name}" must be a count or { count, delay, when }`
			)
			if (options.overlap != null && !overlaps.has(options.overlap)) throw TypeError(
				`The overlap of flow node "${name}" must be "restart", "ignore", "rerun" or "queue"`
			)
			const queues = deps.some(
				dep => /** @type {{ policy?: string }} */(/** @type {unknown} */(dep))/**/?.policy == "queue"
			)
			if (options.limit != null && options.overlap != "queue" && !queues) throw TypeError(
				`The limit of flow node "${name}" applies only to overlap: "queue" or a flow.queue() dependency`
			)
			if (options.limit != null && !is_count(options.limit)) throw TypeError(
				`The limit of flow node "${name}" must be a positive integer or Infinity`
			)
			if (options.overflow != null && options.overflow != "drop" && options.overflow != "wait") throw TypeError(
				`The overflow of flow node "${name}" must be "drop" or "wait"`
			)
			if (options.overflow != null && options.limit == null) throw TypeError(
				`The overflow of flow node "${name}" needs a limit`
			)
			if (options.overflow == "wait" && !deps.some(dep => is_stream(to_ref(dep)))) throw TypeError(
				`The overflow "wait" of flow node "${name}" needs a stream dependency to stop reading`
			)
			if (options.timeout != null && !(typeof options.timeout == "number" && options.timeout > 0)) throw TypeError(
				`The timeout of flow node "${name}" must be a positive number of milliseconds`
			)
			const shared = list.length == count
			const next_list = shared ? list : list.slice(0, count)
			const next_names = shared ? names : /** @type {Map<string, number>} */(new Map())/**/
			const next_refs = shared ? refs : /** @type {Map<NodeRef, number>} */(new Map())/**/
			if (!shared) {
				for (const [ index, node ] of next_list.entries()) {
					next_names.set(node.name, index)
					next_refs.set(node.ref, index)
				}
			}
			/** @type {DefinitionNode} */
			const entry = {
				deps: /** @type {NodeRef[]} */(deps)/**/,
				each: !!ref[EACH],
				kind,
				name,
				named: name == base && (options.name != null || (kind == "input"
					? /** @type {RefProbe} */(ref)/**/?.[INPUT] == "named"
					: kind == "task" && !!ref.name)),
				options,
				ref,
				source: is_stream(ref) ? ref : void 0
			}
			if (replacing != null) {
				const replaced = list.slice(0, count)
				replaced[replacing] = entry
				return create_builder(
					{
						...definition,
						list: replaced,
						names: new Map(
							replaced.map(
								(node, index) => [ node.name, index ]
							)
						),
						refs: new Map(
							replaced.map(
								(node, index) => [ node.ref, index ]
							)
						)
					}
				)
			}
			next_list.push(entry)
			next_names.set(name, count)
			next_refs.set(ref, count)
			return create_builder(
				{
					...definition,
					count: count + 1,
					list: next_list,
					names: next_names,
					refs: next_refs
				}
			)
		},
		/**
		 * @returns {string[]}
		 */
		check() {
			/** @type {Program} */
			let program
			try {
				program = compile(definition)
			} catch (error) {
				return [
					String(
						/** @type {Error} */(error)/**/.message
					)
				]
			}
			/** @type {Set<string>} */
			const reachable = new Set()
			/** @type {string[]} */
			const stack = []
			for (const node of program.nodes) {
				if (program.incoming.has(node.name)) continue
				reachable.add(node.name)
				stack.push(node.name)
			}
			while (stack.length) {
				const name = /** @type {string} */(stack.pop())/**/
				for (const target of program.transitions.get(name) ?? []) {
					if (reachable.has(target)) continue
					reachable.add(target)
					stack.push(target)
				}
			}
			const problems = program.nodes.filter(
				node => !reachable.has(node.name)
			)
				.map(
					node => `Flow node "${node.name}" never starts: it does not run with the flow, and no node that runs goes to it`
				)
			for (const node of program.nodes) {
				if (node.options.join != "race") continue
				for (const dep of node.deps) {
					const stream = find_stream(program, dep)
					if (stream == dep) problems.push(
						`Flow node "${node.name}" races the stream "${dep}", so the race ends with its first value`
					)
					else if (stream != null) problems.push(
						`Flow node "${node.name}" races "${dep}", which runs again for every value of the stream "${stream}", so the race ends with its first value`
					)
				}
			}
			/** @type {Set<string>} */
			const racing = new Set()
			for (const node of program.nodes) {
				if (node.options.join != "race") continue
				/** @type {Set<string>} */
				const seen = new Set()
				const region = [ ...node.deps ]
				while (region.length) {
					const name = /** @type {string} */(region.pop())/**/
					if (name == node.name || seen.has(name)) continue
					seen.add(name)
					racing.add(name)
					region.push(
						.../** @type {ProgramNode} */(program.node_of(name))/**/.deps,
						...program.sources.get(name) ?? []
					)
				}
			}
			for (const node of program.nodes) {
				if (node.options.finish && !racing.has(node.name)) problems.push(
					`Flow node "${node.name}" has finish, but no race can abandon it`
				)
			}
			check_snapshot_names(program, "", problems)
			return problems
		},
		/**
		 * @param {NodeRef} from
		 * @param {NodeRef | NodeRef[] | Record<string, NodeRef>} to
		 * @param {EdgeSelect=} select
		 */
		edge(from, to, select) {
			if (!is_ref(from)) throw TypeError(
				"An edge must start from a function, an input, a flow or a stream"
			)
			if (definition.edges.some(edge => edge.from == from)) throw Error(
				`The edge from ${describe(from)} is already defined`
			)
			/** @type {DefinitionEdge} */
			let edge
			const is_map = !!to && typeof to == "object" && !Array.isArray(to) && !is_ref(to) && Object.values(to).every(is_ref)
			if (typeof select == "function" && is_map) {
				/** @type {Record<string, NodeRef>} */
				const map = to
				edge = {
					from,
					labels: Object.entries(map),
					map,
					select,
					targets: [ ...new Set(Object.values(map)) ]
				}
			} else if (typeof select == "function") {
				if (!Array.isArray(to) || !to.every(is_ref)) throw TypeError(
					`The edge from ${describe(from)} must list its targets, or map keys to them`
				)
				edge = {
					from,
					labels: to.map(target => [ "", target ]),
					map: void 0,
					select,
					targets: [ ...to ]
				}
			} else if (is_ref(to)) edge = {
				from,
				labels: [ [ "", to ] ],
				map: void 0,
				select: () => to,
				targets: [ to ]
			}
			else if (Array.isArray(to) && to.every(is_ref)) {
				edge = {
					from,
					labels: to.map(target => [ "", target ]),
					map: void 0,
					select: () => to,
					targets: [ ...to ]
				}
			} else if (is_map) {
				/** @type {Record<string, NodeRef>} */
				const map = to
				edge = {
					from,
					labels: Object.entries(map),
					map,
					select: result => [ result ],
					targets: [ ...new Set(Object.values(map)) ]
				}
			} else throw TypeError(
				`Invalid edge from ${describe(from)}`
			)
			return create_builder(
				{
					...definition,
					edges: [ ...definition.edges, edge ]
				}
			)
		},
		mermaid() {
			const program = compile(definition)
			const ids = new Map(
				program.nodes.map(
					(node, i) => [ node.name, "n" + i ]
				)
			)
			/**
			 * @param {string} text
			 * @returns {string}
			 */
			function escape(text) {
				return text.replace(/"/g, "#quot;")
			}
			const lines = [ "flowchart TD" ]
			for (const node of program.nodes) {
				const id = ids.get(node.name)
				const { finish, join, overlap } = node.options
				const marks = [
					finish ? "finish" : "",
					join && join != "all" ? "join: " + join : "",
					overlap && overlap != "restart" ? "overlap: " + overlap : ""
				].filter(Boolean)
				const label = escape(
					marks.length ? `${node.name} (${marks.join(", ")})` : node.name
				)
				if (node.each) lines.push(
					`\t${id}@{ shape: procs, label: "${label}" }`
				)
				else if (node.kind == "input") lines.push(`\t${id}[/"${label}"/]`)
				else if (node.kind == "flow") lines.push(`\t${id}[["${label}"]]`)
				else lines.push(`\t${id}["${label}"]`)
			}
			/** @type {[string, string, string][]} */
			const arrows = []
			for (const [ from, edge ] of program.edges) {
				for (const [ label, target ] of edge.labels) arrows.push([ from, label, target ])
			}
			for (const node of program.nodes) {
				for (const target of node.fallback) arrows.push(
					[ node.name, "fallback", target ]
				)
			}
			/** @type {Set<string>} */
			const links = new Set()
			for (const [ from, , target ] of arrows) links.add(from + "\n" + target)
			for (const node of program.nodes) {
				for (const dep of node.deps) {
					const arrive = node.arrive?.[dep]
					if (!links.has(dep + "\n" + node.name)) lines.push(
						arrive
							? `\t${ids.get(dep)} -->|"${arrive}"| ${ids.get(node.name)}`
							: `\t${ids.get(dep)} --> ${ids.get(node.name)}`
					)
				}
			}
			for (const [ from, label, target ] of arrows) {
				const arrow = program.node_of(target)?.deps.includes(from) ? "-->" : "-.->"
				lines.push(
					label
						? `\t${ids.get(from)} ${arrow}|"${escape(label)}"| ${ids.get(target)}`
						: `\t${ids.get(from)} ${arrow} ${ids.get(target)}`
				)
			}
			return lines.join("\n")
		},
		/**
		 * @param {unknown} state
		 * @param {RawRunOptions=} options
		 */
		run(state, options) {
			for (const key of Object.keys(options ?? {})) {
				if (!run_option_keys.has(key)) throw TypeError(`Unknown run option "${key}"`)
			}
			return start_run(
				compile(definition),
				state,
				options ?? {}
			)
		}
	}
}
/**
 * @param {Program} program
 * @param {string} name
 * @returns {string | undefined}
 */
function find_stream(program, name) {
	/** @type {Set<string>} */
	const seen = new Set()
	const stack = [ name ]
	while (stack.length) {
		const current = /** @type {string} */(stack.pop())/**/
		if (seen.has(current)) continue
		seen.add(current)
		const node = program.node_of(current)
		if (node?.source) return current
		if (node) stack.push(...node.deps)
	}
	return void 0
}
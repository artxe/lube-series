/** @import { DraftScope, DraftState, Prototype, SnapshotNode } from "../private.js" */
import { container_kind, sparse_indices } from "./kind.js"
const {
	create,
	defineProperties,
	getOwnPropertyDescriptors,
	getPrototypeOf,
	keys,
	setPrototypeOf
} = Object
const { ownKeys } = Reflect
const array_prototype = Array.prototype
const object_prototype = Object.prototype
const has_own = Object.prototype.hasOwnProperty
const {
	entries: map_entries,
	get: map_read,
	has: map_contains,
	set: map_write
} = Map.prototype
const {
	add: set_add,
	has: set_contains,
	values: set_values
} = Set.prototype
const draft_state = Symbol("draft")
const drafts = { active: 0 }
const inspect_custom = Symbol.for("nodejs.util.inspect.custom")
/**
 * @param {unknown} content
 * @param {DraftState["kind"]} kind
 * @param {unknown[]} found
 * @returns {void}
 */
function collect(content, kind, found) {
	const fields = /** @type {Record<PropertyKey, unknown>} */(content)/**/
	const proxied = state_of(content) !== undefined
	switch (kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(content)/**/
		const indices = sparse_indices(array)
		const length = indices
			? indices.length
			: array.length
		for (let k = 0; k < length; k++) {
			const i = indices
				? /** @type {number} */(indices[k])/**/
				: k
			const child = array[i]
			if (typeof child == "object" && child !== null) found.push(child, i, 0)
		}
		if (getPrototypeOf(array) === array_prototype) return
		for (const key of keys(array)) {
			const child = fields[key]
			if (typeof child == "object" && child !== null && String(Number(key) >>> 0) !== key) found.push(child, key, 0)
		}
		return
	}
	case "Map":
		for (const [ key, child ] of proxied
			? /** @type {Map<unknown, unknown>} */(content)/**/.entries()
			: map_entries.call(
				/** @type {Map<unknown, unknown>} */(content)/**/
			)) {
			if (typeof key == "object" && key !== null) found.push(key, key, 1)
			if (typeof child == "object" && child !== null) found.push(child, key, 0)
		}
		break
	case "Object":
		if (!proxied && getPrototypeOf(fields) === object_prototype) {
			for (const key in fields) {
				const child = fields[key]
				if (typeof child == "object" && child !== null) found.push(child, key, 0)
			}
		} else {
			for (const key of keys(fields)) {
				const child = fields[key]
				if (typeof child == "object" && child !== null) found.push(child, key, 0)
			}
		}
		return
	default:
		for (const child of proxied
			? /** @type {Set<unknown>} */(content)/**/.values()
			: set_values.call(
				/** @type {Set<unknown>} */(content)/**/
			)) {
			if (typeof child == "object" && child !== null) found.push(child, child, 2)
		}
	}
	for (const key of keys(fields)) {
		const child = fields[key]
		if (typeof child == "object" && child !== null) found.push(child, key, 3)
	}
}
/**
 * @param {Prototype} value
 * @returns {boolean}
 */
function contains_draft(value) {
	/** @type {Set<Prototype> | undefined} */
	let visited
	let visits = 0
	/** @type {Prototype[]} */
	const stack = [ value ]
	while (stack.length) {
		const item = /** @type {Prototype} */(stack.pop())/**/
		if (state_of(item)) return true
		if (visited) {
			if (visited.has(item)) continue
			visited.add(item)
		} else if (++visits > 10000) {
			visited = new Set()
			stack.length = 0
			stack.push(value)
			continue
		}
		/** @type {Prototype | null} */
		const proto = getPrototypeOf(item)
		const kind = proto === object_prototype || proto === null
			? "Object"
			: proto === array_prototype
				? "Array"
				: container_kind(item)
		switch (kind) {
		case "Array": {
			const array = /** @type {unknown[]} */(item)/**/
			const indices = sparse_indices(array)
			const length = indices
				? indices.length
				: array.length
			for (let k = 0; k < length; k++) {
				const child = array[indices
					? /** @type {number} */(indices[k])/**/
					: k]
				if (typeof child == "object" && child !== null) stack.push(child)
			}
			break
		}
		case "Map":
			for (const [ key, entry ] of map_entries.call(
				/** @type {Map<unknown, unknown>} */(item)/**/
			)) {
				if (typeof key == "object" && key !== null) stack.push(key)
				if (typeof entry == "object" && entry !== null) stack.push(entry)
			}
			break
		case "Object": {
			const names = keys(item)
			for (let k = 0; k < names.length; k++) {
				const child = /** @type {Record<string, unknown>} */(item)/**/[/** @type {string} */(names[k])/**/]
				if (typeof child == "object" && child !== null) stack.push(child)
			}
			break
		}
		case "Set":
			for (const entry of set_values.call(
				/** @type {Set<unknown>} */(item)/**/
			)) {
				if (typeof entry == "object" && entry !== null) stack.push(entry)
			}
		}
	}
	return false
}
/**
 * @param {Prototype} target
 * @param {Prototype} source
 * @param {(value: unknown) => unknown} resolve
 * @returns {void}
 */
function own_properties(target, source, resolve) {
	const descriptors = getOwnPropertyDescriptors(source)
	for (const key of ownKeys(descriptors)) {
		const descriptor = /** @type {PropertyDescriptor} */(descriptors[/** @type {string} */(key)/**/])/**/
		if ("value" in descriptor) descriptor.value = resolve(descriptor.value)
	}
	defineProperties(target, descriptors)
}
/**
 * @param {unknown[]} stack
 * @param {SnapshotNode} node
 * @returns {void}
 */
function push_children(stack, node) {
	const { base, ctx, kind, source } = node
	if (ctx) {
		/** @type {unknown[]} */
		const found = []
		collect(source, kind, found)
		for (let k = 0; k < found.length; k += 3) stack.push(found[k], node, ctx)
		return
	}
	const fields = /** @type {Record<PropertyKey, unknown>} */(source)/**/
	const original = /** @type {Record<PropertyKey, unknown> | undefined} */(base)/**/
	switch (kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(source)/**/
		const indices = sparse_indices(array)
		const length = indices
			? indices.length
			: array.length
		for (let k = 0; k < length; k++) {
			const i = indices
				? /** @type {number} */(indices[k])/**/
				: k
			const item = array[i]
			if (typeof item == "object" && item !== null && (!original || item !== original[i])) stack.push(item, node, undefined)
		}
		if (getPrototypeOf(array) === array_prototype) return
		break
	}
	case "Map":
		for (const [ key, entry ] of map_entries.call(
			/** @type {Map<unknown, unknown>} */(source)/**/
		)) {
			if (typeof key == "object" && key !== null && !(base && map_contains.call(
				/** @type {Map<unknown, unknown>} */(base)/**/,
				key
			))) stack.push(key, node, undefined)
			if (typeof entry == "object" && entry !== null && !(base && map_read.call(
				/** @type {Map<unknown, unknown>} */(base)/**/,
				key
			) === entry)) stack.push(entry, node, undefined)
		}
		break
	case "Set":
		for (const entry of set_values.call(
			/** @type {Set<unknown>} */(source)/**/
		)) {
			if (typeof entry == "object" && entry !== null && !(base && set_contains.call(
				/** @type {Set<unknown>} */(base)/**/,
				entry
			))) stack.push(entry, node, undefined)
		}
	}
	for (const key of kind == "Array"
		? keys(source)
		: ownKeys(source)) {
		const item = fields[key]
		if (typeof item == "object" && item !== null && (!original || item !== original[key])) stack.push(item, node, undefined)
	}
}
/**
 * @param {unknown[]} values
 * @returns {unknown[]}
 */
function snapshot(values) {
	const trusted = drafts.active <= 1
	/** @type {Map<DraftState, SnapshotNode>} */
	const states = new Map()
	/** @type {Map<unknown, SnapshotNode | null>} */
	const plain = new Map()
	/** @type {SnapshotNode[]} */
	const dirty = []
	/** @type {unknown[]} */
	const stack = []
	/**
	 * @param {Prototype} item
	 * @param {DraftScope | undefined} ctx
	 * @returns {SnapshotNode | undefined}
	 */
	function find(item, ctx) {
		const mapped = ctx?.drafts?.get(item)
		if (mapped) return states.get(mapped)
		const state = state_of(item)
		if (!state) return plain.get(item) ?? undefined
		if (state.scope.graph) return states.get(state)
		const base = source_of(item)
		const inner = state_of(base)
		return (inner?.scope.graph
			? states.get(inner)
			: plain.get(base)) ?? undefined
	}
	/**
	 * @param {Prototype} item
	 * @param {DraftScope | undefined} ctx
	 * @returns {SnapshotNode | undefined}
	 */
	function node_of(item, ctx) {
		const mapped = ctx?.drafts?.get(item)
		if (mapped) return state_node(mapped)
		const state = state_of(item)
		if (!state) return raw_node(item, ctx)
		if (state.scope.graph) return state_node(state)
		const base = /** @type {Prototype} */(source_of(item))/**/
		const inner = state_of(base)
		return inner?.scope.graph
			? state_node(inner)
			: raw_node(base, undefined)
	}
	/**
	 * @param {Prototype} item
	 * @param {DraftScope | undefined} ctx
	 * @returns {SnapshotNode | undefined}
	 */
	function raw_node(item, ctx) {
		let node = plain.get(item)
		if (node === undefined) {
			const state = state_of(item)
			const kind = state
				? state.kind
				: container_kind(item)
			node = kind
				? {
					base: state && trusted
						? state.base
						: undefined,
					ctx,
					kind,
					original: item,
					parents: [],
					seed: state !== undefined,
					seen: false,
					source: /** @type {Prototype} */(state
						? state.copy
						: item)/**/
				}
				: null
			plain.set(item, node)
		}
		return node ?? undefined
	}
	/**
	 * @param {DraftState} state
	 * @returns {SnapshotNode}
	 */
	function state_node(state) {
		let node = states.get(state)
		if (!node) {
			node = {
				base: undefined,
				ctx: state.scope,
				kind: state.kind,
				original: state.base,
				parents: [],
				seed: state.modified,
				seen: false,
				source: /** @type {Prototype} */(state.modified
					? state.copy
					: state.base)/**/
			}
			states.set(state, node)
		}
		return node
	}
	for (const value of values) {
		if (typeof value == "object" && value !== null && contains_draft(value)) stack.push(value, undefined, undefined)
	}
	while (stack.length) {
		const ctx = /** @type {DraftScope | undefined} */(stack.pop())/**/
		const parent = /** @type {SnapshotNode | undefined} */(stack.pop())/**/
		const item = /** @type {Prototype} */(stack.pop())/**/
		const state = state_of(item)
		if (state) {
			if (parent) dirty.push(parent)
			if (trusted && !state.scope.graph && !ctx?.drafts?.get(item)) {
				const base = source_of(item)
				if (base !== item && !state_of(base)) continue
			}
		}
		const node = node_of(item, ctx)
		if (!node) continue
		if (parent) node.parents.push(parent)
		if (ctx && !node.ctx && !node.seed) {
			node.ctx = ctx
			push_children(stack, node)
		}
		if (node.seen) continue
		node.seen = true
		if (node.seed) dirty.push(node)
		push_children(stack, node)
	}
	/** @type {Map<SnapshotNode, Prototype>} */
	const copies = new Map()
	for (let node = dirty.pop(); node; node = dirty.pop()) {
		if (copies.has(node)) continue
		const { kind, source } = node
		const proto = getPrototypeOf(source)
		/** @type {Prototype} */
		const shell = kind == "Array"
			? new Array(
				/** @type {unknown[]} */(source)/**/.length
			)
			: kind == "Map"
				? new Map()
				: kind == "Set"
					? new Set()
					: create(proto)
		if (getPrototypeOf(shell) !== proto) setPrototypeOf(shell, proto)
		copies.set(node, shell)
		for (const parent of node.parents) dirty.push(parent)
	}
	/**
	 * @param {unknown} value
	 * @param {DraftScope | undefined} ctx
	 * @returns {unknown}
	 */
	function current(value, ctx) {
		if (typeof value != "object" || value === null) return value
		const found = find(value, ctx)
		if (found) return copies.get(found) ?? found.original
		return state_of(value)
			? source_of(value)
			: value
	}
	for (const [ node, shell ] of copies) {
		const { ctx, source } = node
		/**
		 * @param {unknown} value
		 * @returns {unknown}
		 */
		function resolve(value) {
			return current(value, ctx)
		}
		const proxied = state_of(source) !== undefined
		switch (node.kind) {
		case "Array": {
			const array = /** @type {unknown[]} */(source)/**/
			const target = /** @type {unknown[]} */(shell)/**/
			const indices = sparse_indices(array)
			if (indices) {
				for (const i of indices) target[i] = resolve(array[i])
			} else {
				for (let i = 0; i < array.length; i++) {
					if (i in array) target[i] = resolve(array[i])
				}
			}
			if (getPrototypeOf(array) !== array_prototype) {
				for (const key of keys(array)) {
					if (!has_own.call(target, key)) target[/** @type {number} */(/** @type {unknown} */(key))/**/] = resolve(
						array[/** @type {number} */(/** @type {unknown} */(key))/**/]
					)
				}
			}
			break
		}
		case "Map":
			for (const [ key, entry ] of proxied
				? /** @type {Map<unknown, unknown>} */(source)/**/.entries()
				: map_entries.call(
					/** @type {Map<unknown, unknown>} */(source)/**/
				)) map_write.call(
				/** @type {Map<unknown, unknown>} */(shell)/**/,
				resolve(key),
				resolve(entry)
			)
			own_properties(shell, source, resolve)
			break
		case "Object":
			own_properties(shell, source, resolve)
			break
		default:
			for (const entry of proxied
				? /** @type {Set<unknown>} */(source)/**/.values()
				: set_values.call(
					/** @type {Set<unknown>} */(source)/**/
				)) set_add.call(
				/** @type {Set<unknown>} */(shell)/**/,
				resolve(entry)
			)
			own_properties(shell, source, resolve)
		}
	}
	return values.map(
		value => current(value, undefined)
	)
}
/**
 * @param {Prototype} value
 * @returns {Prototype}
 */
function source_of(value) {
	let node = value
	for (let state = state_of(node); state && !state.modified && !state.scope.graph; state = state_of(node)) node = state.base
	return node
}
/**
 * @param {unknown} value
 * @returns {DraftState | undefined}
 */
function state_of(value) {
	return typeof value == "object" && value !== null
		? /** @type {{ [draft_state]?: DraftState }} */(value)/**/[draft_state]
		: undefined
}
export {
	collect,
	draft_state,
	drafts,
	inspect_custom,
	snapshot,
	state_of
}
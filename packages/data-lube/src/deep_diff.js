/** @import { Change } from "../public.js" */
/** @import { DiffNode, DiffState } from "../private.js" */
import deep_equal from "./deep_equal.js"
import { drafts, snapshot } from "./draft.js"
import { hash_candidates, hash_groups } from "./hash.js"
import { container_kind, sparse_indices } from "./kind.js"
const { getPrototypeOf, keys } = Object
const property_is_enumerable = Object.prototype.propertyIsEnumerable
const restart = {}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {DiffState} state
 * @returns {void}
 */
function activate(a, b, state) {
	const active = state.active ??= new Map()
	const pairs = active.get(a)
	if (pairs) {
		pairs.add(b)
	} else {
		active.set(a, new Set([ b ]))
	}
}
/**
 * @param {DiffState} state
 * @param {unknown} key
 * @param {"add" | "remove" | "replace"} op
 * @param {unknown} [value]
 * @returns {void}
 */
function child(state, key, op, value) {
	const node = state.node
	if (node) {
		node.items.push(
			{ key, op, self: false, value }
		)
		return
	}
	state.path.push(key)
	push(state, op, value)
	state.path.pop()
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @returns {"Array" | "Map" | "Object" | "Set" | undefined}
 */
function comparable(a, b) {
	const kind = container_kind(a)
	return kind !== undefined && kind === container_kind(b) && getPrototypeOf(a) === getPrototypeOf(b)
		? kind
		: undefined
}
/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {unknown} key
 * @param {DiffState} state
 * @returns {void}
 */
function compare(a, b, key, state) {
	const node = state.node
	if (node) {
		if (typeof a == "object" && a !== null && typeof b == "object" && b !== null) {
			const kind = comparable(a, b)
			if (kind) {
				const target = node_of(a, b, kind, state)
				target.parents.push(node)
				node.items.push({ key, node: target })
			} else if (!deep_equal(a, b)) {
				node.items.push(
					{
						key,
						op: "replace",
						self: false,
						value: b
					}
				)
			}
		} else if (!Number.isNaN(a) || !Number.isNaN(b)) {
			node.items.push(
				{
					key,
					op: "replace",
					self: false,
					value: b
				}
			)
		}
		return
	}
	state.path.push(key)
	if (typeof a == "object" && a !== null && typeof b == "object" && b !== null) {
		diff(a, b, state)
	} else if (!Number.isNaN(a) || !Number.isNaN(b)) {
		push(state, "replace", b)
	}
	state.path.pop()
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {DiffState} state
 * @returns {void}
 */
function diff(a, b, state) {
	const kind = comparable(a, b)
	if (kind === undefined) {
		if (!deep_equal(a, b)) push(state, "replace", b)
		return
	}
	const trail = state.trail
	const depth = trail.length
	for (let i = 0; i < depth && i < 128; i += 2) {
		if (trail[i] === a && trail[i + 1] === b) throw restart
	}
	const deep = depth >= 128
	if (deep && state.active?.get(a)?.has(b) || state.path.length > 200) throw restart
	const done = state.done?.get(a)?.get(b)
	if (done === false) return
	if (done) throw restart
	const count = state.changes.length
	if (deep) {
		activate(a, b, state)
	} else {
		trail.push(a, b)
	}
	expand(a, b, kind, state)
	if (deep) {
		/** @type {Map<WeakKey, Set<WeakKey>>} */(state.active)/**/.get(a)?.delete(b)
	} else {
		trail.length = depth
	}
	if (++state.visits > 100000) {
		const done_pairs = state.done ??= new Map()
		let others = done_pairs.get(a)
		if (!others) {
			others = new Map()
			done_pairs.set(a, others)
		}
		others.set(b, state.changes.length != count)
	}
}
/**
 * @param {WeakKey} before
 * @param {WeakKey} after
 * @param {"Array" | "Map" | "Object" | "Set"} kind
 * @returns {Change[]}
 */
function diff_graph(before, after, kind) {
	/** @type {DiffState} */
	const state = {
		changes: [],
		nodes: [],
		pairs: new Map(),
		path: [],
		trail: [],
		visits: 0
	}
	const root = node_of(before, after, kind, state)
	const nodes = /** @type {DiffNode[]} */(state.nodes)/**/
	for (let i = 0; i < nodes.length; i++) {
		const node = /** @type {DiffNode} */(nodes[i])/**/
		state.node = node
		expand(node.a, node.b, node.kind, state)
	}
	/** @type {DiffNode[]} */
	const changed = []
	for (const node of nodes) {
		if (node.items.some(item => !("node" in item))) {
			node.changed = true
			changed.push(node)
		}
	}
	for (let node = changed.pop(); node; node = changed.pop()) {
		for (const parent of node.parents) {
			if (!parent.changed) {
				parent.changed = true
				changed.push(parent)
			}
		}
	}
	if (!root.changed) return []
	const once = has_cycle(root)
	/** @type {Change[]} */
	const changes = []
	/** @type {unknown[]} */
	const path = []
	/** @type {{ index: number, node: DiffNode }[]} */
	const frames = [ { index: 0, node: root } ]
	root.active = true
	root.done = true
	while (frames.length) {
		const frame = /** @type {{ index: number, node: DiffNode }} */(frames[frames.length - 1])/**/
		const item = frame.node.items[frame.index++]
		if (!item) {
			frame.node.active = false
			frames.pop()
			path.pop()
		} else if ("node" in item) {
			const target = item.node
			if (!target.changed || target.active || once && target.done) continue
			target.active = true
			target.done = true
			path.push(item.key)
			frames.push({ index: 0, node: target })
		} else {
			const full = path.slice()
			if (!item.self) full.push(item.key)
			changes.push(
				item.op == "remove"
					? { op: item.op, path: full }
					: {
						op: item.op,
						path: full,
						value: item.value
					}
			)
		}
	}
	return changes
}
/**
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @param {number[]} sparse
 * @param {number[]} others
 * @param {DiffState} state
 * @returns {void}
 */
function diff_sparse(a, b, sparse, others, state) {
	let i = 0
	let j = 0
	while (i < sparse.length || j < others.length) {
		const x_index = sparse[i] ?? Infinity
		const y_index = others[j] ?? Infinity
		const index = Math.min(x_index, y_index)
		if (x_index == index) i++
		if (y_index == index) j++
		const x = a[index]
		const y = b[index]
		if (x === y) {
			if (x === undefined && (index in a) != (index in b)) child(state, index, "replace", y)
		} else {
			compare(x, y, index, state)
		}
	}
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {"Array" | "Map" | "Object" | "Set"} kind
 * @param {DiffState} state
 * @returns {void}
 */
function expand(a, b, kind, state) {
	switch (kind) {
	case "Array": {
		const sparse = sparse_indices(
			/** @type {unknown[]} */(a)/**/
		)
		const others = sparse_indices(
			/** @type {unknown[]} */(b)/**/
		)
		if (sparse || others) {
			if (sparse && others && /** @type {unknown[]} */(a)/**/.length === /** @type {unknown[]} */(b)/**/.length) {
				diff_sparse(
					/** @type {unknown[]} */(a)/**/,
					/** @type {unknown[]} */(b)/**/,
					sparse,
					others,
					state
				)
			} else {
				push(state, "replace", b)
			}
			break
		}
		const length = Math.min(
			/** @type {unknown[]} */(a)/**/.length,
			/** @type {unknown[]} */(b)/**/.length
		)
		for (let i = 0; i < length; i++) {
			const x = /** @type {unknown[]} */(a)/**/[i]
			const y = /** @type {unknown[]} */(b)/**/[i]
			if (x === y) {
				if (x === undefined && (i in /** @type {unknown[]} */(a)/**/) != (i in /** @type {unknown[]} */(b)/**/)) child(state, i, "replace", y)
			} else {
				compare(x, y, i, state)
			}
		}
		for (let i = length; i < /** @type {unknown[]} */(b)/**/.length; i++) child(
			state,
			i,
			"add",
			/** @type {unknown[]} */(b)/**/[i]
		)
		for (let i = /** @type {unknown[]} */(a)/**/.length - 1; i >= length; i--) child(state, i, "remove")
		break
	}
	case "Map": {
		/** @type {WeakKey[] | undefined} */
		let removed
		for (const [ key, x ] of /** @type {Map<unknown, unknown>} */(a)/**/) {
			if (!/** @type {Map<unknown, unknown>} */(b)/**/.has(key)) {
				if (typeof key == "object" && key !== null) {
					removed ??= []
					removed.push(key)
				} else {
					child(state, key, "remove")
				}
				continue
			}
			const y = /** @type {Map<unknown, unknown>} */(b)/**/.get(key)
			if (x !== y) compare(x, y, key, state)
		}
		/** @type {WeakKey[] | undefined} */
		let added
		for (const [ key, y ] of /** @type {Map<unknown, unknown>} */(b)/**/) {
			if (/** @type {Map<unknown, unknown>} */(a)/**/.has(key)) continue
			if (typeof key == "object" && key !== null) {
				added ??= []
				added.push(key)
			} else {
				child(state, key, "add", y)
			}
		}
		const matched = match(removed, added)
		for (const key of removed ?? []) {
			const other = matched.get(key)
			if (other === undefined) {
				child(state, key, "remove")
				continue
			}
			const x = /** @type {Map<unknown, unknown>} */(a)/**/.get(key)
			const y = /** @type {Map<unknown, unknown>} */(b)/**/.get(other)
			if (x !== y) compare(x, y, key, state)
		}
		for (const key of added ?? []) {
			if (!matched.has(key)) child(
				state,
				key,
				"add",
				/** @type {Map<unknown, unknown>} */(b)/**/.get(key)
			)
		}
		break
	}
	case "Object": {
		const names = keys(a)
		const others = keys(b)
		const length = Math.min(names.length, others.length)
		let i = 0
		for (; i < length; i++) {
			const key = /** @type {string} */(names[i])/**/
			if (key !== others[i]) break
			const x = /** @type {Record<PropertyKey, unknown>} */(a)/**/[key]
			const y = /** @type {Record<PropertyKey, unknown>} */(b)/**/[key]
			if (x !== y) compare(x, y, key, state)
		}
		for (let j = i; j < names.length; j++) {
			const key = /** @type {string} */(names[j])/**/
			if (!property_is_enumerable.call(b, key)) {
				child(state, key, "remove")
				continue
			}
			const x = /** @type {Record<PropertyKey, unknown>} */(a)/**/[key]
			const y = /** @type {Record<PropertyKey, unknown>} */(b)/**/[key]
			if (x !== y) compare(x, y, key, state)
		}
		for (let j = i; j < others.length; j++) {
			const key = /** @type {string} */(others[j])/**/
			if (!property_is_enumerable.call(a, key)) child(
				state,
				key,
				"add",
				/** @type {Record<PropertyKey, unknown>} */(b)/**/[key]
			)
		}
		break
	}
	case "Set": {
		/** @type {WeakKey[] | undefined} */
		let removed
		for (const value of /** @type {Set<unknown>} */(a)/**/) {
			if (/** @type {Set<unknown>} */(b)/**/.has(value)) continue
			if (typeof value == "object" && value !== null) {
				removed ??= []
				removed.push(value)
			} else {
				child(state, value, "remove")
			}
		}
		/** @type {WeakKey[] | undefined} */
		let added
		for (const value of /** @type {Set<unknown>} */(b)/**/) {
			if (/** @type {Set<unknown>} */(a)/**/.has(value)) continue
			if (typeof value == "object" && value !== null) {
				added ??= []
				added.push(value)
			} else {
				child(state, value, "add", value)
			}
		}
		const matched = match(removed, added)
		for (const value of removed ?? []) {
			if (!matched.has(value)) child(state, value, "remove")
		}
		for (const value of added ?? []) {
			if (!matched.has(value)) child(state, value, "add", value)
		}
	}
	}
}
/**
 * @param {DiffNode} root
 * @returns {boolean}
 */
function has_cycle(root) {
	/** @type {Set<DiffNode>} */
	const finished = new Set()
	/** @type {{ index: number, node: DiffNode }[]} */
	const frames = [ { index: 0, node: root } ]
	root.active = true
	let cycle = false
	while (frames.length && !cycle) {
		const frame = /** @type {{ index: number, node: DiffNode }} */(frames[frames.length - 1])/**/
		const item = frame.node.items[frame.index++]
		if (!item) {
			frame.node.active = false
			finished.add(frame.node)
			frames.pop()
		} else if ("node" in item && item.node.changed && !finished.has(item.node)) {
			if (item.node.active) {
				cycle = true
			} else {
				item.node.active = true
				frames.push({ index: 0, node: item.node })
			}
		}
	}
	for (const open of frames) open.node.active = false
	return cycle
}
/**
 * @param {WeakKey[] | undefined} removed
 * @param {WeakKey[] | undefined} added
 * @returns {Map<WeakKey, WeakKey>}
 */
function match(removed, added) {
	/** @type {Map<WeakKey, WeakKey>} */
	const matched = new Map()
	if (!removed || !added) return matched
	const groups = hash_groups(added)
	const used = new Uint8Array(added.length)
	for (const value of removed) {
		const index = hash_candidates(groups, value).find(
			i => !used[i] && deep_equal(value, added[i])
		)
		if (index === undefined) continue
		used[index] = 1
		const other = /** @type {WeakKey} */(added[index])/**/
		matched.set(value, other)
		matched.set(other, value)
	}
	return matched
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {"Array" | "Map" | "Object" | "Set"} kind
 * @param {DiffState} state
 * @returns {DiffNode}
 */
function node_of(a, b, kind, state) {
	const pairs = /** @type {Map<WeakKey, Map<WeakKey, DiffNode>>} */(state.pairs)/**/
	let others = pairs.get(a)
	if (!others) {
		others = new Map()
		pairs.set(a, others)
	}
	let node = others.get(b)
	if (!node) {
		node = {
			a,
			active: false,
			b,
			changed: false,
			done: false,
			items: [],
			kind,
			parents: []
		}
		others.set(b, node)
		const nodes = /** @type {DiffNode[]} */(state.nodes)/**/
		nodes.push(node)
	}
	return node
}
/**
 * @param {DiffState} state
 * @param {"add" | "remove" | "replace"} op
 * @param {unknown} [value]
 * @returns {void}
 */
function push(state, op, value) {
	const node = state.node
	if (node) {
		node.items.push(
			{
				key: undefined,
				op,
				self: true,
				value
			}
		)
		return
	}
	state.changes.push(
		op == "remove"
			? { op, path: state.path.slice() }
			: {
				op,
				path: state.path.slice(),
				value
			}
	)
}
/**
 * List the changes that turn one value into another, in the format `deepPatch` applies.
 * Each change is `{ op: "add" | "remove" | "replace", path, value }` with `path` as an array of
 * object keys, array indexes, Map keys and Set values (for a Set, the last segment is the value).
 * Plain objects, arrays, Map and Set are compared by content; any other value that is not
 * `deepEqual` is replaced as a whole. Values in changes are references, not copies.
 * Array holes are listed as `undefined`; circular data lists each change once and is not meant to be patched.
 * @param {unknown} before
 * @param {unknown} after
 * @returns {Change[]}
 */
export default function(before, after) {
	if (drafts.active) [ before, after ] = snapshot([ before, after ])
	/** @type {DiffState} */
	const state = {
		changes: [],
		path: [],
		trail: [],
		visits: 0
	}
	if (typeof before == "object" && before !== null && typeof after == "object" && after !== null) {
		if (before === after) return state.changes
		try {
			diff(before, after, state)
		} catch (error) {
			if (error !== restart) throw error
			return diff_graph(
				before,
				after,
				/** @type {"Array" | "Map" | "Object" | "Set"} */(comparable(before, after))/**/
			)
		}
	} else if (before !== after && (!Number.isNaN(before) || !Number.isNaN(after))) {
		push(state, "replace", after)
	}
	return state.changes
}
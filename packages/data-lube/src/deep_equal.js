/** @import { BisimGroup, BisimNode, HashGroups, Memo, Prototype } from "../private.js" */
import { drafts, snapshot } from "./draft.js"
import { hash_candidates, hash_groups } from "./hash.js"
import {
	foreign_kind,
	prototype_kind,
	resolve,
	sparse_indices
} from "./kind.js"
const { getPrototypeOf, keys } = Object
const array_prototype = Array.prototype
const has_own = Object.prototype.hasOwnProperty
const object_prototype = Object.prototype
const property_is_enumerable = object_prototype.propertyIsEnumerable
const restart = {}
const taken = {}
/** @extends {Set<WeakKey>} */
class Candidates extends Set {}
/**
 * @param {Memo} memo
 * @param {() => boolean} compare
 * @returns {boolean}
 */
function attempt(memo, compare) {
	const trail = memo.trail ??= []
	const mark = trail.length
	memo.tentative++
	const matched = compare()
	memo.tentative--
	if (!matched) {
		rollback(memo, mark)
	} else if (!memo.tentative) {
		trail.length = mark
	}
	return matched
}
/**
 * @param {BisimGroup} group
 * @param {number} start
 * @returns {boolean}
 */
function augment(group, start) {
	const { chosen, edges, owners, seen } = /** @type {Required<BisimGroup>} */(group)/**/
	const stamp = group.stamp = /** @type {number} */(group.stamp)/**/ + 1
	/** @type {number[]} */
	const stack = [ start ]
	/** @type {number[]} */
	const cursors = [ 0 ]
	while (stack.length) {
		const level = stack.length - 1
		const left = /** @type {number} */(stack[level])/**/
		const options = /** @type {BisimGroup["edges"][number]} */(edges[left])/**/
		let next = -1
		while (/** @type {number} */(cursors[level])/**/ < options.length) {
			const index = /** @type {number} */(cursors[level])/**/
			cursors[level] = index + 1
			const edge = /** @type {BisimGroup["edges"][number][number]} */(options[index])/**/
			if (seen[edge.j] === stamp || !edge.needs.every(need => need.alive)) continue
			seen[edge.j] = stamp
			const owner = /** @type {number} */(owners[edge.j])/**/
			if (owner < 0) {
				for (let k = level; k >= 0; k--) {
					const node = /** @type {number} */(stack[k])/**/
					const picked = /** @type {BisimGroup["edges"][number][number]} */(/** @type {BisimGroup["edges"][number]} */(edges[node])/**/[/** @type {number} */(cursors[k])/**/ - 1])/**/
					owners[picked.j] = node
					chosen[node] = /** @type {number} */(cursors[k])/**/ - 1
				}
				return true
			}
			next = owner
			break
		}
		if (next < 0) {
			stack.pop()
			cursors.pop()
		} else {
			stack.push(next)
			cursors.push(0)
		}
	}
	return false
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @returns {boolean}
 */
function bisimilar(a, b) {
	/** @type {Map<WeakKey, Map<WeakKey, BisimNode>>} */
	const pairs = new Map()
	/** @type {BisimNode[]} */
	const nodes = []
	/** @type {BisimNode[]} */
	const dead = []
	const root = pair_node(a, b, pairs, nodes)
	for (let i = 0; i < nodes.length; i++) {
		const node = /** @type {BisimNode} */(nodes[i])/**/
		if (!expand_pair(node, pairs, nodes)) kill(node, dead)
	}
	for (const node of nodes) {
		if (node.alive && node.owned.some(group => !has_matching(group))) kill(node, dead)
	}
	for (let node = dead.pop(); node; node = dead.pop()) {
		for (const parent of node.parents) kill(parent, dead)
		for (const group of node.groups) {
			if (group.owner.alive && !has_matching(group)) kill(group.owner, dead)
		}
	}
	return root.alive
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Prototype | null} proto
 * @param {Memo} memo
 * @returns {boolean}
 */
function compare_objects(a, b, proto, memo) {
	if (memo.tentative && ++memo.attempts > 20000 + memo.matched * 16) throw restart
	const assumed = memo.assumed
	memo.depth++
	const result = proto === object_prototype
		? equal_keys(a, b, memo)
		: proto === array_prototype && Array.isArray(a) && Array.isArray(b)
			? equal_arrays(a, b, memo)
			: equal_other(a, b, proto, memo)
	memo.depth--
	if (memo.tentative && memo.pairs && memo.assumed === assumed) {
		const known = result
			? memo.proven ??= new Map()
			: memo.unequal ??= new Map()
		const others = known.get(a)
		if (others) {
			others.add(b)
		} else {
			known.set(a, new Set([ b ]))
		}
	}
	return result
}
/**
 * @returns {Memo}
 */
function create_memo() {
	return {
		assumed: 0,
		attempts: 0,
		budget: 100000,
		depth: 0,
		matched: 0,
		tentative: 0
	}
}
/**
 * @param {BisimNode} node
 * @param {WeakKey[]} children
 * @param {Map<WeakKey, Map<WeakKey, BisimNode>>} pairs
 * @param {BisimNode[]} nodes
 * @returns {void}
 */
function depend(node, children, pairs, nodes) {
	for (let i = 0; i < children.length; i += 2) {
		pair_node(
			/** @type {WeakKey} */(children[i])/**/,
			/** @type {WeakKey} */(children[i + 1])/**/,
			pairs,
			nodes
		).parents.push(node)
	}
}
/**
 * @param {Memo} memo
 * @returns {boolean}
 */
function drain(memo) {
	const pending = memo.pending
	if (!pending) return true
	while (pending.length) {
		const b = /** @type {WeakKey} */(pending.pop())/**/
		const a = /** @type {WeakKey} */(pending.pop())/**/
		memo.depth = 0
		if (!compare_objects(a, b, getPrototypeOf(a), memo)) return false
	}
	return true
}
/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal(a, b, memo) {
	return a === b
	|| (
		a && b && typeof a == "object" && typeof b == "object"
			? equal_objects(a, b, memo)
			: Number.isNaN(a) && Number.isNaN(b)
	)
}
/**
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_arrays(a, b, memo) {
	let length = a.length
	if (length !== b.length) return false
	const indices = sparse_indices(a)
	if (indices) {
		const others = sparse_indices(b)
		if (others?.length !== indices.length) return false
		for (let i = 0; i < indices.length; i++) {
			if (indices[i] !== others[i]) return false
		}
		length = indices.length
	}
	let registered = false
	for (let k = 0; k < length; k++) {
		const i = indices
			? /** @type {number} */(indices[k])/**/
			: k
		const x = a[i]
		const y = b[i]
		if (x === y) {
			if (x === undefined && (i in a) != (i in b)) return false
		} else if (typeof x == "object" && typeof y == "object" && x !== null && y !== null) {
			if (!registered) {
				registered = true
				register(a, b, memo)
			}
			if (!equal_objects(x, y, memo)) return false
		} else if (!Number.isNaN(x) || !Number.isNaN(y)) {
			return false
		}
	}
	return true
}
/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
function equal_bytes(a, b) {
	const length = a.length
	if (length !== b.length) return false
	let i = 0
	if (length >= 64 && a.byteOffset % 4 == 0 && b.byteOffset % 4 == 0) {
		const words = length >>> 2
		const a_words = new Uint32Array(a.buffer, a.byteOffset, words)
		const b_words = new Uint32Array(b.buffer, b.byteOffset, words)
		for (; i < words; i++) {
			if (a_words[i] !== b_words[i]) return false
		}
		i = words << 2
	}
	for (; i < length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @returns {boolean}
 */
function equal_drafts(a, b) {
	const [ x, y ] = /** @type {[ WeakKey, WeakKey ]} */(snapshot([ a, b ]))/**/
	return x === y || equal_root(x, y)
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_keys(a, b, memo) {
	const names = keys(a)
	const others = keys(b)
	const length = names.length
	if (length !== others.length) return false
	let registered = false
	for (let i = 0; i < length; i++) {
		const key = /** @type {string} */(names[i])/**/
		if (key !== others[i] && !property_is_enumerable.call(b, key)) return false
		const x = /** @type {Record<PropertyKey, unknown>} */(a)/**/[key]
		const y = /** @type {Record<PropertyKey, unknown>} */(b)/**/[key]
		if (x === y) continue
		if (typeof x == "object" && typeof y == "object" && x !== null && y !== null) {
			if (!registered) {
				registered = true
				register(a, b, memo)
			}
			if (!equal_objects(x, y, memo)) return false
		} else if (!Number.isNaN(x) || !Number.isNaN(y)) {
			return false
		}
	}
	return true
}
/**
 * @param {Map<unknown, unknown>} a
 * @param {Map<unknown, unknown>} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_maps(a, b, memo) {
	if (a.size !== b.size) return false
	/** @type {unknown[] | undefined} */
	let unmatched
	/** @type {Set<unknown> | undefined} */
	let mismatched
	for (const [ key, value ] of a) {
		if (typeof key != "object" || key === null) {
			if (!b.has(key) || !equal(value, b.get(key), memo)) return false
		} else if (!b.has(key)) {
			unmatched ??= []
			unmatched.push(key)
		} else if (a.size == 1) {
			return equal(value, b.get(key), memo)
		} else if (!attempt(
			memo,
			() => equal(value, b.get(key), memo)
		)) {
			unmatched ??= []
			unmatched.push(key)
			mismatched ??= new Set()
			mismatched.add(key)
		}
	}
	if (!unmatched) return true
	/** @type {unknown[]} */
	const others = []
	for (const key of b.keys()) {
		if (!a.has(key) || mismatched?.has(key)) others.push(key)
	}
	return match_all(
		unmatched,
		others,
		(key, other) => equal(key, other, memo) && equal(a.get(key), b.get(other), memo),
		memo
	)
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_objects(a, b, memo) {
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(a)
	if (proto !== getPrototypeOf(b)) return false
	const pairs = memo.pairs
	if (pairs) {
		const collect = memo.collect
		if (collect && memo.depth) {
			collect.push(a, b)
			return true
		}
		if (memo.proven?.get(a)?.has(b)) return true
		const known = pairs.get(a)
		if (known === b || known instanceof Candidates && known.has(b)) {
			memo.assumed++
			return true
		}
		if (memo.unequal?.get(a)?.has(b)) return false
		if (memo.depth > 200) {
			if (memo.tentative) throw restart
			memo.assumed++
			register(a, b, memo)
			memo.pending ??= []
			memo.pending.push(a, b)
			return true
		}
	} else if (--memo.budget < 0 || memo.depth > 64) {
		memo.pairs = new Map()
	}
	return compare_objects(a, b, proto, memo)
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Prototype | null} proto
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_other(a, b, proto, memo) {
	const kind = kind_pair(a, b, proto)
	if (kind === undefined) return false
	switch (kind) {
	case "Array":
		return equal_arrays(
			/** @type {unknown[]} */(a)/**/,
			/** @type {unknown[]} */(b)/**/,
			memo
		)
	case "ArrayBuffer":
	case "SharedArrayBuffer":
		return /** @type {ArrayBufferLike} */(a)/**/.byteLength === /** @type {ArrayBufferLike} */(b)/**/.byteLength
			&& (
				!/** @type {ArrayBufferLike} */(a)/**/.byteLength || equal_bytes(
					new Uint8Array(
						/** @type {ArrayBufferLike} */(a)/**/
					),
					new Uint8Array(
						/** @type {ArrayBufferLike} */(b)/**/
					)
				)
			)
			&& equal_keys(a, b, memo)
	case "BigInt":
		return BigInt.prototype.valueOf.call(a) === BigInt.prototype.valueOf.call(b)
			&& equal_keys(a, b, memo)
	case "Boolean":
		return Boolean.prototype.valueOf.call(a) === Boolean.prototype.valueOf.call(b)
			&& equal_keys(a, b, memo)
	case "DataView":
		return equal_bytes(
			view_bytes(/** @type {DataView} */(a)/**/),
			view_bytes(/** @type {DataView} */(b)/**/)
		)
			&& equal_keys(a, b, memo)
	case "Date":
		return equal(
			Date.prototype.getTime.call(a),
			Date.prototype.getTime.call(b),
			memo
		)
			&& equal_keys(a, b, memo)
	case "DOMException":
	case "Error":
		register(a, b, memo)
		return /** @type {Error} */(a)/**/.name === /** @type {Error} */(b)/**/.name
				&& /** @type {Error} */(a)/**/.message === /** @type {Error} */(b)/**/.message
				&& has_own.call(a, "cause") === has_own.call(b, "cause")
				&& equal(
					/** @type {Error} */(a)/**/.cause,
					/** @type {Error} */(b)/**/.cause,
					memo
				)
				&& equal(
					/** @type {Error & { errors?: unknown }} */(a)/**/.errors,
					/** @type {Error & { errors?: unknown }} */(b)/**/.errors,
					memo
				)
				&& equal_keys(a, b, memo)
	case "FinalizationRegistry":
	case "Promise":
	case "WeakMap":
	case "WeakRef":
	case "WeakSet":
		return false
	case "Map":
		register(a, b, memo)
		return equal_maps(
			/** @type {Map<unknown, unknown>} */(a)/**/,
			/** @type {Map<unknown, unknown>} */(b)/**/,
			memo
		)
			&& equal_keys(a, b, memo)
	case "Number":
		return equal(
			Number.prototype.valueOf.call(a),
			Number.prototype.valueOf.call(b),
			memo
		)
			&& equal_keys(a, b, memo)
	case "RegExp":
		return /** @type {RegExp} */(a)/**/.source === /** @type {RegExp} */(b)/**/.source
				&& /** @type {RegExp} */(a)/**/.flags === /** @type {RegExp} */(b)/**/.flags
				&& /** @type {RegExp} */(a)/**/.lastIndex === /** @type {RegExp} */(b)/**/.lastIndex
				&& equal_keys(a, b, memo)
	case "Set":
		register(a, b, memo)
		return equal_sets(
			/** @type {Set<unknown>} */(a)/**/,
			/** @type {Set<unknown>} */(b)/**/,
			memo
		)
			&& equal_keys(a, b, memo)
	case "String":
		return String.prototype.valueOf.call(a) === String.prototype.valueOf.call(b)
	case "Symbol":
		return Symbol.prototype.valueOf.call(a) === Symbol.prototype.valueOf.call(b)
			&& equal_keys(a, b, memo)
	case "TypedArray":
		return equal_typed_arrays(
			/** @type {ArrayBufferView & ArrayLike<bigint | number>} */(a)/**/,
			/** @type {ArrayBufferView & ArrayLike<bigint | number>} */(b)/**/
		)
	default:
		return equal_keys(a, b, memo)
	}
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @returns {boolean}
 */
function equal_root(a, b) {
	const memo = create_memo()
	try {
		return equal_objects(a, b, memo) && drain(memo)
	} catch (error) {
		if (error !== restart) throw error
		return bisimilar(a, b)
	}
}
/**
 * @param {Set<unknown>} a
 * @param {Set<unknown>} b
 * @param {Memo} memo
 * @returns {boolean}
 */
function equal_sets(a, b, memo) {
	if (a.size !== b.size) return false
	/** @type {unknown[] | undefined} */
	let unmatched
	for (const value of a) {
		if (b.has(value)) continue
		if (!value || typeof value != "object") return false
		unmatched ??= []
		unmatched.push(value)
	}
	if (!unmatched) return true
	/** @type {unknown[]} */
	const others = []
	for (const value of b) {
		if (!a.has(value)) others.push(value)
	}
	return match_all(
		unmatched,
		others,
		(value, other) => equal(value, other, memo),
		memo
	)
}
/**
 * @param {ArrayBufferView & ArrayLike<bigint | number>} a
 * @param {ArrayBufferView & ArrayLike<bigint | number>} b
 * @returns {boolean}
 */
function equal_typed_arrays(a, b) {
	const length = a.length
	if (length !== b.length) return false
	if (
		!length || equal_bytes(
			new Uint8Array(
				a.buffer,
				a.byteOffset,
				a.byteLength
			),
			new Uint8Array(
				b.buffer,
				b.byteOffset,
				b.byteLength
			)
		)
	) return true
	for (let i = 0; i < length; i++) {
		const x = a[i]
		const y = b[i]
		if (x !== y && (!Number.isNaN(x) || !Number.isNaN(y))) return false
	}
	return true
}
/**
 * @param {BisimNode} node
 * @param {Map<WeakKey, Map<WeakKey, BisimNode>>} pairs
 * @param {BisimNode[]} nodes
 * @returns {boolean}
 */
function expand_pair(node, pairs, nodes) {
	const { a, b } = node
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(a)
	if (proto !== getPrototypeOf(b)) return false
	const kind = proto === object_prototype || proto === array_prototype
		? "Object"
		: kind_pair(a, b, proto)
	const memo = create_memo()
	memo.pairs = new Map()
	/** @type {WeakKey[]} */
	const collect = memo.collect = []
	if (kind != "Map" && kind != "Set") {
		if (!compare_objects(a, b, proto, memo)) return false
		depend(node, collect, pairs, nodes)
		return true
	}
	if (/** @type {Set<unknown>} */(a)/**/.size !== /** @type {Set<unknown>} */(b)/**/.size) return false
	memo.depth = 1
	if (!equal_keys(a, b, memo)) return false
	/** @type {[ unknown, unknown ][]} */
	const left = []
	/** @type {[ unknown, unknown ][]} */
	const right = []
	if (kind == "Set") {
		for (const value of /** @type {Set<unknown>} */(a)/**/) {
			if (typeof value == "object" && value !== null) {
				left.push([ value, undefined ])
			} else if (!/** @type {Set<unknown>} */(b)/**/.has(value)) {
				return false
			}
		}
		for (const value of /** @type {Set<unknown>} */(b)/**/) {
			if (typeof value == "object" && value !== null) right.push([ value, undefined ])
		}
	} else {
		for (const [ key, value ] of /** @type {Map<unknown, unknown>} */(a)/**/) {
			if (typeof key == "object" && key !== null) {
				left.push([ key, value ])
			} else if (!/** @type {Map<unknown, unknown>} */(b)/**/.has(key) || !equal(
				value,
				/** @type {Map<unknown, unknown>} */(b)/**/.get(key),
				memo
			)) {
				return false
			}
		}
		for (const [ key, value ] of /** @type {Map<unknown, unknown>} */(b)/**/) {
			if (typeof key == "object" && key !== null) right.push([ key, value ])
		}
	}
	if (left.length !== right.length) return false
	depend(node, collect, pairs, nodes)
	const groups = hash_groups(right.map(entry => entry[0]))
	/** @type {BisimGroup} */
	const group = { edges: [], owner: node }
	node.owned.push(group)
	for (const [ key, value ] of left) {
		/** @type {BisimGroup["edges"][number]} */
		const edges = []
		for (const j of hash_candidates(groups, key)) {
			const [ other, item ] = /** @type {[ unknown, unknown ]} */(right[j])/**/
			/** @type {BisimNode[]} */
			const needs = []
			if (key !== other) {
				needs.push(
					pair_node(
						/** @type {WeakKey} */(key)/**/,
						/** @type {WeakKey} */(other)/**/,
						pairs,
						nodes
					)
				)
			}
			if (value !== item) {
				if (typeof value == "object" && value !== null && typeof item == "object" && item !== null) {
					needs.push(
						pair_node(value, item, pairs, nodes)
					)
				} else if (!Number.isNaN(value) || !Number.isNaN(item)) {
					continue
				}
			}
			for (const need of needs) need.groups.push(group)
			edges.push({ j, needs })
		}
		group.edges.push(edges)
	}
	return true
}
/**
 * @param {BisimGroup} group
 * @returns {boolean}
 */
function has_matching(group) {
	const count = group.edges.length
	if (!group.owners) {
		group.chosen = new Int32Array(count).fill(-1)
		group.owners = new Int32Array(count).fill(-1)
		group.seen = new Uint32Array(count)
		group.stamp = 0
		for (let left = 0; left < count; left++) {
			if (!augment(group, left)) return false
		}
		return true
	}
	const { chosen, edges, owners } = /** @type {Required<BisimGroup>} */(group)/**/
	/** @type {number[]} */
	const broken = []
	for (let left = 0; left < count; left++) {
		const index = /** @type {number} */(chosen[left])/**/
		if (index < 0) continue
		const edge = /** @type {BisimGroup["edges"][number][number]} */(/** @type {BisimGroup["edges"][number]} */(edges[left])/**/[index])/**/
		if (edge.needs.every(need => need.alive)) continue
		owners[edge.j] = -1
		chosen[left] = -1
		broken.push(left)
	}
	return broken.every(left => augment(group, left))
}
/**
 * @param {BisimNode} node
 * @param {BisimNode[]} dead
 * @returns {void}
 */
function kill(node, dead) {
	if (!node.alive) return
	node.alive = false
	dead.push(node)
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Prototype | null} proto
 * @returns {string | undefined}
 */
function kind_pair(a, b, proto) {
	const kind = prototype_kind(proto)
	if (kind === undefined) {
		const foreign = foreign_kind(a)
		return foreign === foreign_kind(b)
			? foreign
			: undefined
	}
	if (kind == "Object") return kind
	const resolved = resolve(a, kind)
	return resolved === resolve(b, kind)
		? resolved
		: undefined
}
/**
 * @param {unknown[]} values
 * @param {unknown[]} others
 * @param {(value: unknown, other: unknown) => boolean} match
 * @param {Memo} memo
 * @returns {boolean}
 */
function match_all(values, others, match, memo) {
	const length = others.length
	if (length == 1) return match(values[0], others[0])
	if (!memo.tentative) memo.matched += length
	const deep = memo.tentative > 0 || memo.depth > 64
	/** @type {HashGroups | undefined} */
	let groups
	/**
	 * @param {unknown} value
	 * @param {number} i
	 * @returns {boolean}
	 */
	function take(value, i) {
		const other = others[i]
		if (other === taken || !attempt(memo, () => match(value, other))) return false
		others[i] = taken
		return true
	}
	for (let k = 0; k < length; k++) {
		const value = values[k]
		const mirror = length - 1 - k
		if (!deep && (take(value, k) || mirror !== k && take(value, mirror))) continue
		groups ??= hash_groups(others.slice())
		const candidates = hash_candidates(groups, value).filter(
			i => others[i] !== taken && (deep || i !== k && i !== mirror)
		)
		if (!candidates.length) return false
		if (candidates.length == 1) {
			const i = /** @type {number} */(candidates[0])/**/
			if (!match(value, others[i])) return false
			others[i] = taken
		} else if (!candidates.some(i => take(value, i))) {
			return false
		}
	}
	return true
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Map<WeakKey, Map<WeakKey, BisimNode>>} pairs
 * @param {BisimNode[]} nodes
 * @returns {BisimNode}
 */
function pair_node(a, b, pairs, nodes) {
	let others = pairs.get(a)
	if (!others) {
		others = new Map()
		pairs.set(a, others)
	}
	let node = others.get(b)
	if (!node) {
		node = {
			a,
			alive: true,
			b,
			groups: [],
			owned: [],
			parents: []
		}
		others.set(b, node)
		nodes.push(node)
	}
	return node
}
/**
 * @param {WeakKey} a
 * @param {WeakKey} b
 * @param {Memo} memo
 * @returns {void}
 */
function register(a, b, memo) {
	const pairs = memo.pairs
	if (!pairs) return
	const known = pairs.get(a)
	if (known === b || known instanceof Candidates && known.has(b)) return
	if (known === undefined) {
		pairs.set(a, b)
	} else if (known instanceof Candidates) {
		known.add(b)
	} else {
		pairs.set(a, new Candidates([ known, b ]))
	}
	if (memo.tentative) memo.trail?.push(a, b, known)
}
/**
 * @param {Memo} memo
 * @param {number} mark
 * @returns {void}
 */
function rollback(memo, mark) {
	const pairs = /** @type {Map<WeakKey, WeakKey>} */(memo.pairs)/**/
	const trail = /** @type {(WeakKey | undefined)[]} */(memo.trail)/**/
	while (trail.length > mark) {
		const known = trail.pop()
		const b = /** @type {WeakKey} */(trail.pop())/**/
		const a = /** @type {WeakKey} */(trail.pop())/**/
		if (known === undefined) {
			pairs.delete(a)
		} else if (known instanceof Candidates) {
			known.delete(b)
		} else {
			pairs.set(a, known)
		}
	}
}
/**
 * @param {DataView} view
 * @returns {Uint8Array}
 */
function view_bytes(view) {
	try {
		return new Uint8Array(
			view.buffer,
			view.byteOffset,
			view.byteLength
		)
	} catch {
		return new Uint8Array(0)
	}
}
/**
 * Verify that a value is deeply equal to another value.
 * Primitives are compared like `===`, except that `NaN` equals `NaN`.
 * Compares own enumerable string keys of objects with the same prototype,
 * arrays (holes differ from `undefined`), Date, RegExp, Map, Set, Error, boxed primitives,
 * ArrayBuffer and its views, with shared and circular references.
 * Object keys of Map and values of Set match an identical or deeply equal counterpart.
 * Functions, Promise and weak collections are compared by identity.
 * A `true` result narrows the second argument to the type of the first, unless its type is already that type.
 */
export default /** @type {import("../public.js").DeepEqual} */(
	/**
	 * @param {unknown} value
	 * @param {unknown} other
	 * @returns {boolean}
	 */
	function(value, other) {
		return value === other
		|| (
			value && other && typeof value == "object" && typeof other == "object"
				? drafts.active
					? equal_drafts(value, other)
					: equal_root(value, other)
				: Number.isNaN(value) && Number.isNaN(other)
		)
	}
)/**/
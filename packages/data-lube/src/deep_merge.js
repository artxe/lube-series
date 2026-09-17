/** @import { MergeState, Prototype } from "../private.js" */
const {
	assign,
	create,
	defineProperty,
	getPrototypeOf,
	keys,
	setPrototypeOf
} = Object
const object_prototype = Object.prototype
const property_is_enumerable = object_prototype.propertyIsEnumerable
const restart = {}
/**
 * @param {Record<PropertyKey, unknown>} a
 * @param {Record<PropertyKey, unknown>} b
 * @param {Record<PropertyKey, unknown>} result
 * @param {number} depth
 * @param {MergeState} state
 * @returns {void}
 */
function fill(a, b, result, depth, state) {
	const pairs = state.pairs
	let registered = false
	const names = keys(b)
	for (let i = 0; i < names.length; i++) {
		const key = /** @type {string} */(names[i])/**/
		const value = result[key]
		if (typeof value != "object" || value === null || !property_is_enumerable.call(a, key)) continue
		const left = a[key]
		if (left === value || !is_plain(left) || !is_plain(value)) continue
		if (pairs && !registered) {
			registered = true
			register(pairs, a, b, result)
		}
		const merged = merge(left, value, depth + 1, state)
		if (key === "__proto__") {
			defineProperty(
				result,
				key,
				{
					configurable: true,
					enumerable: true,
					value: merged,
					writable: true
				}
			)
		} else {
			result[key] = merged
		}
	}
}
/**
 * @param {unknown} value
 * @returns {value is Record<PropertyKey, unknown>}
 */
function is_plain(value) {
	if (typeof value != "object" || value === null) return false
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(value)
	return proto === object_prototype || proto === null || getPrototypeOf(proto) === null
}
/**
 * @param {Record<PropertyKey, unknown>} a
 * @param {Record<PropertyKey, unknown>} b
 * @param {number} depth
 * @param {MergeState} state
 * @returns {Record<PropertyKey, unknown>}
 */
function merge(a, b, depth, state) {
	const pairs = state.pairs
	if (pairs) {
		const known = pairs.get(a)?.get(b)
		if (known) return known
	} else if (depth > 64 || ++state.count > 100000) {
		throw restart
	}
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(a)
	/** @type {Record<PropertyKey, unknown>} */
	const result = proto === object_prototype
		? { ...a, ...b }
		: proto === null
			? assign(create(null), a, b)
			: setPrototypeOf({ ...a, ...b }, proto)
	if (pairs && depth > 200) {
		register(pairs, a, b, result)
		state.pending ??= []
		state.pending.push([ a, b, result ])
	} else {
		fill(a, b, result, depth, state)
	}
	return result
}
/**
 * @param {Map<WeakKey, Map<WeakKey, Record<PropertyKey, unknown>>>} pairs
 * @param {Record<PropertyKey, unknown>} a
 * @param {Record<PropertyKey, unknown>} b
 * @param {Record<PropertyKey, unknown>} result
 * @returns {void}
 */
function register(pairs, a, b, result) {
	const known = pairs.get(a)
	if (known) {
		known.set(b, result)
	} else {
		pairs.set(a, new Map([ [ b, result ] ]))
	}
}
/**
 * Deep merge values from left to right, like a spread that goes into nested plain objects.
 * Plain objects (including null-prototype objects) are merged into new objects;
 * any other value, such as an array, Map, Date or class instance, replaces the value on its left.
 * `undefined` and `null` arguments are skipped, while an `undefined` property still overrides.
 * Symbol keys are assigned like a spread without merging, and circular references keep their shape.
 * Inputs are never changed, and untouched values are shared with the inputs instead of copied.
 * Inside a `deepUpdate` recipe, untouched values of a draft stay drafts, as in a spread, so the result
 * can be assigned to the draft and changed further; `deepCopy` it to keep it after the recipe.
 * When every argument is `undefined` or `null`, the first one is returned.
 * @template {unknown[]} T
 * @param {T} values
 * @returns {import("../public.js").Merge<T>}
 */
export default function(...values) {
	/** @type {unknown} */
	let result = values[0]
	for (let i = 1; i < values.length; i++) {
		const value = values[i]
		if (value === undefined || value === null) continue
		if (result === value || !is_plain(result) || !is_plain(value)) {
			result = value
			continue
		}
		try {
			result = merge(result, value, 0, { count: 0 })
		} catch (error) {
			if (error !== restart) throw error
			/** @type {MergeState} */
			const state = { count: 0, pairs: new Map() }
			result = merge(
				/** @type {Record<PropertyKey, unknown>} */(result)/**/,
				value,
				0,
				state
			)
			const pending = state.pending ?? []
			for (let task = pending.pop(); task; task = pending.pop()) fill(...task, 0, state)
		}
	}
	return /** @type {import("../public.js").Merge<T>} */(result)/**/
}
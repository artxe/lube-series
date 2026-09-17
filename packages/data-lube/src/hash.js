/** @import { HashGroups, Prototype } from "../private.js" */
import { kind_of } from "./kind.js"
const { getPrototypeOf, keys } = Object
const float = new Float64Array(1)
const float_words = new Uint32Array(float.buffer)
const map_entries = Map.prototype.entries
const object_prototype = Object.prototype
const set_values = Set.prototype.values
let every = false
let items_cap = 16
let size_cap = 64
/**
 * @param {unknown} value
 * @returns {number}
 */
function hash(value) {
	return hash_value(value, 64)
}
/**
 * @param {HashGroups} groups
 * @param {unknown} value
 * @returns {number[]}
 */
function hash_candidates(groups, value) {
	const key = hash(value)
	const bucket = groups.weak.get(key)
	if (!bucket || bucket.length <= 8) return bucket ?? []
	let split = groups.strong.get(key)
	if (!split) {
		split = new Map()
		for (const i of bucket) {
			const strong = strong_hash(groups.values[i])
			const group = split.get(strong)
			if (group) {
				group.push(i)
			} else {
				split.set(strong, [ i ])
			}
		}
		groups.strong.set(key, split)
	}
	return split.get(strong_hash(value)) ?? []
}
/**
 * @param {unknown[]} values
 * @returns {HashGroups}
 */
function hash_groups(values) {
	/** @type {Map<number, number[]>} */
	const weak = new Map()
	for (let i = 0; i < values.length; i++) {
		const key = hash(values[i])
		const bucket = weak.get(key)
		if (bucket) {
			bucket.push(i)
		} else {
			weak.set(key, [ i ])
		}
	}
	return { strong: new Map(), values, weak }
}
/**
 * @param {ArrayLike<bigint | number>} items
 * @param {number} length
 * @returns {number}
 */
function hash_items(items, length) {
	let result = length
	for (let i = 0; i < length && i < items_cap; i++) result = Math.imul(result, 31) + hash_value(items[i], 0) | 0
	return result
}
/**
 * @param {WeakKey} value
 * @param {number} budget
 * @returns {number}
 */
function hash_object(value, budget) {
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(value)
	const kind = proto === object_prototype
		? "Object"
		: kind_of(value, proto)
	let result = 7
	switch (kind) {
	case "Array": {
		const length = /** @type {unknown[]} */(value)/**/.length
		const share = Math.floor(
			budget / Math.min(length, items_cap)
		)
		result = length
		for (let i = 0; i < length && i < items_cap; i++) result = Math.imul(result, 31) + hash_value(
			/** @type {unknown[]} */(value)/**/[i],
			share
		) | 0
		return result
	}
	case "ArrayBuffer":
	case "SharedArrayBuffer": {
		const length = /** @type {ArrayBufferLike} */(value)/**/.byteLength
		return length
			? hash_items(
				new Uint8Array(
					/** @type {ArrayBufferLike} */(value)/**/,
					0,
					Math.min(length, items_cap)
				),
				length
			)
			: 0
	}
	case "BigInt":
		return hash_value(
			BigInt.prototype.valueOf.call(value),
			0
		)
	case "Boolean":
		return hash_value(
			Boolean.prototype.valueOf.call(value),
			0
		)
	case "DataView":
		try {
			return /** @type {DataView} */(value)/**/.byteLength
		} catch {
			return 0
		}
	case "Date":
		return hash_value(
			Date.prototype.getTime.call(value),
			0
		)
	case "DOMException":
	case "Error":
		return hash_value(
			/** @type {Error} */(value)/**/.message,
			0
		)
	case "Map": {
		const size = /** @type {Map<unknown, unknown>} */(value)/**/.size
		if (size > size_cap) return size
		const share = Math.floor(budget / (size * 2))
		for (const [ key, item ] of map_entries.call(
			/** @type {Map<unknown, unknown>} */(value)/**/
		)) result = result + mix(
			hash_value(key, share),
			hash_value(item, share)
		) | 0
		return result
	}
	case "Number":
		return hash_value(
			Number.prototype.valueOf.call(value),
			0
		)
	case "Object": {
		const names = keys(value)
		if (names.length > size_cap) return names.length
		const share = Math.floor(budget / names.length)
		for (const key of names) result = result + mix(
			hash_value(key, 0),
			hash_value(
				/** @type {Record<PropertyKey, unknown>} */(value)/**/[key],
				share
			)
		) | 0
		return result
	}
	case "RegExp":
		return hash_value(
			/** @type {RegExp} */(value)/**/.source,
			0
		)
	case "Set": {
		const size = /** @type {Set<unknown>} */(value)/**/.size
		if (size > size_cap) return size
		const share = Math.floor(budget / size)
		for (const item of set_values.call(
			/** @type {Set<unknown>} */(value)/**/
		)) result = result + mix(hash_value(item, share), 0) | 0
		return result
	}
	case "String":
		return hash_value(
			String.prototype.valueOf.call(value),
			0
		)
	case "TypedArray": {
		const items = /** @type {ArrayLike<bigint | number>} */(value)/**/
		return hash_items(items, items.length)
	}
	default:
		return hash_value(kind, 0)
	}
}
/**
 * @param {unknown} value
 * @param {number} budget
 * @returns {number}
 */
function hash_value(value, budget) {
	switch (typeof value) {
	case "bigint":
		return Number(BigInt.asIntN(32, value))
	case "boolean":
		return value ? 1 : 2
	case "number":
		if ((value | 0) === value) return value | 0
		if (Number.isNaN(value)) return 3
		float[0] = value
		return /** @type {number} */(float_words[0])/**/ ^ /** @type {number} */(float_words[1])/**/
	case "object":
		if (value === null) return 4
		return budget > 0
			? hash_object(value, budget - 1)
			: 5
	case "string": {
		const length = value.length
		const step = every
			? 1
			: (length >>> 5) + 1
		let result = length
		for (let i = 0; i < length; i += step) result = Math.imul(result, 31) + value.charCodeAt(i) | 0
		return result
	}
	default:
		return 6
	}
}
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mix(a, b) {
	const result = Math.imul(
		a ^ Math.imul(b, 0x9e3779b1),
		0x85ebca6b
	)
	return result ^ result >>> 13
}
/**
 * @param {unknown} value
 * @returns {number}
 */
function strong_hash(value) {
	const saved = [ every, items_cap, size_cap ]
	every = true
	items_cap = Infinity
	size_cap = Infinity
	try {
		return hash_value(value, 4096)
	} finally {
		every = /** @type {boolean} */(saved[0])/**/
		items_cap = /** @type {number} */(saved[1])/**/
		size_cap = /** @type {number} */(saved[2])/**/
	}
}
export { hash, hash_candidates, hash_groups }
/** @import { Prototype, TypedArrayName } from "../private.js" */
import { drafts, snapshot } from "./draft.js"
import {
	builtin_prototype,
	kind_of,
	sparse_indices,
	typed_array_name
} from "./kind.js"
const {
	create,
	defineProperty,
	getOwnPropertyNames,
	getPrototypeOf,
	keys,
	setPrototypeOf
} = Object
const array_prototype = Array.prototype
const array_slice = array_prototype.slice
const limit = 200
const object_prototype = Object.prototype
const has_own = object_prototype.hasOwnProperty
const property_is_enumerable = object_prototype.propertyIsEnumerable
let depth = 0
let keep = false
/** @type {(() => void)[] | undefined} */
let pending
/**
 * @template T
 * @param {T} clone
 * @param {Prototype | null} proto
 * @returns {T}
 */
function adopt(clone, proto) {
	return getPrototypeOf(clone) === proto
		? clone
		: setPrototypeOf(clone, proto)
}
/**
 * @param {WeakKey} clone
 * @param {WeakKey} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @param {boolean} plain
 * @returns {void}
 */
function assign(clone, value, copies, plain) {
	const names = keys(value)
	for (let i = 0; i < names.length; i++) {
		const key = /** @type {string} */(names[i])/**/
		const item = /** @type {Record<PropertyKey, unknown>} */(value)/**/[key]
		const result = item && typeof item == "object"
			? copy(item, copies)
			: item
		if (
			plain
				? key == "__proto__"
				: key in /** @type {Record<PropertyKey, unknown>} */(clone)/**/
		) {
			defineProperty(
				clone,
				key,
				{
					configurable: true,
					enumerable: true,
					value: result,
					writable: true
				}
			)
		} else {
			/** @type {Record<PropertyKey, unknown>} */(clone)/**/[key] = result
		}
	}
}
/**
 * @param {WeakKey} clone
 * @param {WeakKey} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @param {boolean} plain
 * @returns {void}
 */
function assign_later(clone, value, copies, plain) {
	if (depth > limit) {
		later(
			() => assign(clone, value, copies, plain)
		)
	} else {
		assign(clone, value, copies, plain)
	}
}
/**
 * @param {WeakKey} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @returns {WeakKey}
 */
function copy(value, copies) {
	let clone = copies.get(value)
	if (clone !== undefined) return clone
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(value)
	if (proto === object_prototype) {
		const object = {}
		copies.set(value, object)
		if (++depth > limit) {
			later(
				() => assign(object, value, copies, true)
			)
		} else {
			assign(object, value, copies, true)
		}
		depth--
		return object
	}
	if (proto === array_prototype && Array.isArray(value) && !has_own.call(value, "constructor")) {
		const indices = sparse_indices(value)
		/** @type {unknown[]} */
		const array = indices
			? new Array(value.length)
			: array_slice.call(value)
		copies.set(value, array)
		if (++depth > limit) {
			later(
				() => copy_items(array, value, copies, indices, false)
			)
		} else if (indices) {
			copy_items(array, value, copies, indices, false)
		} else {
			const length = array.length
			for (let i = 0; i < length; i++) {
				const item = value[i]
				if (typeof item == "object" && item !== null) array[i] = copy(item, copies)
			}
		}
		depth--
		return array
	}
	if (keep && !builtin_prototype(proto)) return value
	depth++
	clone = copy_other(value, proto, copies)
	depth--
	return clone
}
/**
 * @param {ArrayBuffer} buffer
 * @returns {ArrayBuffer}
 */
function copy_buffer(buffer) {
	const { detached, maxByteLength, resizable } = buffer
	if (detached) return new ArrayBuffer(0)
	const clone = resizable
		? new ArrayBuffer(
			buffer.byteLength,
			{ maxByteLength }
		)
		: new ArrayBuffer(buffer.byteLength)
	new Uint8Array(clone).set(new Uint8Array(buffer))
	return clone
}
/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function copy_data(value) {
	return run(value, false)
}
/**
 * @param {Error} clone
 * @param {WeakKey} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @returns {void}
 */
function copy_error(clone, value, copies) {
	for (const key of getOwnPropertyNames(value)) {
		const item = /** @type {Record<PropertyKey, unknown>} */(value)/**/[key]
		defineProperty(
			clone,
			key,
			{
				configurable: true,
				enumerable: property_is_enumerable.call(value, key),
				value: item && typeof item == "object"
					? copy(item, copies)
					: item,
				writable: true
			}
		)
	}
}
/**
 * @param {unknown[]} clone
 * @param {unknown[]} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @param {number[] | undefined} indices
 * @param {boolean} holey
 * @returns {void}
 */
function copy_items(clone, value, copies, indices, holey) {
	if (indices) {
		for (const i of indices) {
			const item = value[i]
			clone[i] = item && typeof item == "object"
				? copy(item, copies)
				: item
		}
		return
	}
	const length = value.length
	for (let i = 0; i < length; i++) {
		if (holey && !(i in value)) continue
		const item = value[i]
		if (typeof item == "object" && item !== null) {
			clone[i] = copy(item, copies)
		} else if (holey) {
			clone[i] = item
		}
	}
}
/**
 * @param {Map<unknown, unknown>} clone
 * @param {Map<unknown, unknown>} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @param {Prototype | null} proto
 * @returns {void}
 */
function copy_map(clone, value, copies, proto) {
	for (const [ key, item ] of value) {
		clone.set(
			key && typeof key == "object"
				? copy(key, copies)
				: key,
			item && typeof item == "object"
				? copy(item, copies)
				: item
		)
	}
	assign(
		adopt(clone, proto),
		value,
		copies,
		false
	)
}
/**
 * @param {WeakKey} value
 * @param {Prototype | null} proto
 * @param {Map<WeakKey, WeakKey>} copies
 * @returns {WeakKey}
 */
function copy_other(value, proto, copies) {
	/** @type {ArrayBuffer | ArrayBufferView | Date | Error | Map<unknown, unknown> | Record<PropertyKey, unknown> | RegExp | Set<unknown> | unknown[]} */
	let clone
	const kind = kind_of(value, proto)
	switch (kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(value)/**/
		/** @type {unknown[]} */
		const result = adopt(new Array(array.length), proto)
		copies.set(value, result)
		const indices = sparse_indices(array)
		if (depth > limit) {
			later(
				() => copy_items(result, array, copies, indices, true)
			)
		} else {
			copy_items(result, array, copies, indices, true)
		}
		return result
	}
	case "ArrayBuffer":
		clone = adopt(
			copy_buffer(
				/** @type {ArrayBuffer} */(value)/**/
			),
			proto
		)
		break
	case "BigInt":
		clone = adopt(
			Object(
				BigInt.prototype.valueOf.call(value)
			),
			proto
		)
		break
	case "Boolean":
		clone = adopt(
			Object(
				Boolean.prototype.valueOf.call(value)
			),
			proto
		)
		break
	case "DataView": {
		const view = copy_view(
			/** @type {DataView} */(value)/**/,
			DataView,
			copies
		)
		const known = copies.get(value)
		if (known) return known
		clone = adopt(view, proto)
		break
	}
	case "Date":
		clone = adopt(
			new Date(
				Date.prototype.getTime.call(value)
			),
			proto
		)
		break
	case "DOMException":
	case "Error": {
		const error = adopt(
			kind == "Error"
				? new Error()
				: structuredClone(
					/** @type {DOMException} */(value)/**/
				),
			proto
		)
		delete error.stack
		copies.set(value, error)
		if (depth > limit) {
			later(
				() => copy_error(error, value, copies)
			)
		} else {
			copy_error(error, value, copies)
		}
		return error
	}
	case "FinalizationRegistry":
	case "Promise":
	case "SharedArrayBuffer":
	case "WeakMap":
	case "WeakRef":
	case "WeakSet":
		return value
	case "Map": {
		const map = /** @type {Map<unknown, unknown>} */(value)/**/
		/** @type {Map<unknown, unknown>} */
		const result = new Map()
		copies.set(value, result)
		if (depth > limit) {
			later(
				() => copy_map(result, map, copies, proto)
			)
		} else {
			copy_map(result, map, copies, proto)
		}
		return result
	}
	case "Number":
		clone = adopt(
			Object(
				Number.prototype.valueOf.call(value)
			),
			proto
		)
		break
	case "RegExp":
		clone = adopt(
			new RegExp(
				/** @type {RegExp} */(value)/**/
			),
			proto
		)
		clone.lastIndex = /** @type {RegExp} */(value)/**/.lastIndex
		break
	case "Set": {
		const set = /** @type {Set<unknown>} */(value)/**/
		/** @type {Set<unknown>} */
		const result = new Set()
		copies.set(value, result)
		if (depth > limit) {
			later(
				() => copy_set(result, set, copies, proto)
			)
		} else {
			copy_set(result, set, copies, proto)
		}
		return result
	}
	case "String":
		clone = adopt(
			Object(
				String.prototype.valueOf.call(value)
			),
			proto
		)
		copies.set(value, clone)
		return clone
	case "Symbol":
		clone = adopt(
			Object(
				Symbol.prototype.valueOf.call(value)
			),
			proto
		)
		break
	case "TypedArray": {
		const view = copy_view(
			/** @type {ArrayBufferView} */(value)/**/,
			globalThis[/** @type {TypedArrayName} */(typed_array_name.call(value))/**/],
			copies
		)
		const known = copies.get(value)
		if (known) return known
		clone = adopt(view, proto)
		copies.set(value, clone)
		return clone
	}
	default:
		clone = create(proto)
	}
	copies.set(value, clone)
	assign_later(clone, value, copies, false)
	return clone
}
/**
 * @param {Set<unknown>} clone
 * @param {Set<unknown>} value
 * @param {Map<WeakKey, WeakKey>} copies
 * @param {Prototype | null} proto
 * @returns {void}
 */
function copy_set(clone, value, copies, proto) {
	for (const item of value) {
		clone.add(
			item && typeof item == "object"
				? copy(item, copies)
				: item
		)
	}
	assign(
		adopt(clone, proto),
		value,
		copies,
		false
	)
}
/**
 * @param {ArrayBufferView} value
 * @param {{ BYTES_PER_ELEMENT?: number, new (buffer: ArrayBufferLike, offset?: number, length?: number): ArrayBufferView }} constructor
 * @param {Map<WeakKey, WeakKey>} copies
 * @returns {ArrayBufferView}
 */
function copy_view(value, constructor, copies) {
	/** @type {ArrayBufferLike & { detached?: boolean, growable?: boolean, resizable?: boolean }} */
	const buffer = value.buffer
	const clone = /** @type {ArrayBufferLike} */(copy(buffer, copies))/**/
	if (buffer.detached) return new constructor(clone)
	let offset = 0
	let size = 0
	try {
		offset = value.byteOffset
		size = value.byteLength
	} catch {
		return new constructor(clone, 0, 0)
	}
	const element = constructor.BYTES_PER_ELEMENT || 1
	return (buffer.resizable || buffer.growable) && buffer.byteLength - offset - size < element
		? new constructor(clone, offset)
		: new constructor(clone, offset, size / element)
}
/**
 * @param {() => void} task
 * @returns {void}
 */
function later(task) {
	pending ??= []
	pending.push(task)
}
/**
 * @returns {(() => void) | undefined}
 */
function next_task() {
	return pending?.pop()
}
/**
 * @template T
 * @param {T} value
 * @param {boolean} instances
 * @returns {T}
 */
function run(value, instances) {
	if (!value || typeof value != "object") return value
	const outer_depth = depth
	const outer_keep = keep
	const outer_pending = pending
	depth = 0
	keep = !instances
	pending = undefined
	try {
		const copies = new Map()
		const clone = copy(value, copies)
		for (let task = next_task(); task; task = next_task()) {
			depth = 0
			task()
		}
		return /** @type {T} */(clone)/**/
	} finally {
		depth = outer_depth
		keep = outer_keep
		pending = outer_pending
	}
}
/**
 * Deep copy a value, like `structuredClone` but keeping prototypes and functions.
 * Copies own enumerable string keys of plain objects, class instances and null-prototype objects,
 * arrays (keeping holes), Date, RegExp, Map, Set, Error, boxed primitives,
 * ArrayBuffer and its views (views of one buffer keep sharing their copied buffer).
 * Shared and circular references keep their shape, at any depth.
 * Functions, Promise, SharedArrayBuffer and weak collections are kept by reference.
 * Inside a `deepUpdate` recipe, a draft or a value holding one is copied as the value it currently
 * represents, like immer's `current()`, keeping every class instance in it by reference as the next
 * version does; a value holding no draft is copied as outside a recipe, class instances included.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export default function(value) {
	if (drafts.active) {
		const current = /** @type {T} */(snapshot([ value ])[0])/**/
		if (current !== value) return run(current, false)
	}
	return run(value, true)
}
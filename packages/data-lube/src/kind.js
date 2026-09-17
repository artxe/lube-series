/** @import { Prototype } from "../private.js" */
const {
	getOwnPropertyDescriptor,
	getOwnPropertyNames,
	getPrototypeOf
} = Object
const global = /** @type {typeof globalThis & Partial<Record<string, { prototype: Prototype }>>} */(globalThis)/**/
const object_prototype = Object.prototype
const to_string = object_prototype.toString
const is_error = /** @type {{ isError?: (value: unknown) => boolean }} */(Error)/**/.isError
const token = {}
/**
 * @template R
 * @param {{ prototype: unknown }} constructor
 * @param {PropertyKey} key
 * @returns {(this: unknown) => R}
 */
function getter(constructor, key) {
	return /** @type {{ get: (this: unknown) => R }} */(getOwnPropertyDescriptor(constructor.prototype, key))/**/.get
}
/** @type {(this: unknown) => string | undefined} */
const typed_array_name = getter(
	getPrototypeOf(Uint8Array),
	Symbol.toStringTag
)
const array_buffer_byte_length = getter(ArrayBuffer, "byteLength")
const data_view_buffer = getter(DataView, "buffer")
const dom_exception_code = global.DOMException && getter(global.DOMException, "code")
const map_size = getter(Map, "size")
const regexp_source = getter(RegExp, "source")
const set_size = getter(Set, "size")
const shared_array_buffer_byte_length = global.SharedArrayBuffer && getter(
	global.SharedArrayBuffer,
	"byteLength"
)
const names = new Set(
	[
		"Array",
		"ArrayBuffer",
		"BigInt",
		"Boolean",
		"DOMException",
		"DataView",
		"Date",
		"Error",
		"FinalizationRegistry",
		"Map",
		"Number",
		"Object",
		"Promise",
		"RegExp",
		"Set",
		"SharedArrayBuffer",
		"String",
		"Symbol",
		"WeakMap",
		"WeakRef",
		"WeakSet"
	]
)
/** @type {Map<Prototype, string>} */
const kinds = new Map()
for (const name of names) {
	if (global[name]) kinds.set(global[name].prototype, name)
}
kinds.set(
	getPrototypeOf(Uint8Array.prototype),
	"TypedArray"
)
/** @type {Set<Prototype>} */
const builtins = new Set(kinds.keys())
for (const name of [
	"BigInt64Array",
	"BigUint64Array",
	"Float16Array",
	"Float32Array",
	"Float64Array",
	"Int16Array",
	"Int32Array",
	"Int8Array",
	"Uint16Array",
	"Uint32Array",
	"Uint8Array",
	"Uint8ClampedArray"
]) {
	if (global[name]) builtins.add(global[name].prototype)
}
/**
 * @param {Prototype | null} proto
 * @returns {boolean}
 */
function builtin_prototype(proto) {
	return proto === null || builtins.has(proto) || getPrototypeOf(proto) === null
}
/**
 * @param {unknown} value
 * @returns {"Array" | "Map" | "Object" | "Set" | undefined}
 */
function container_kind(value) {
	if (typeof value != "object" || value === null) return undefined
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(value)
	if (proto === object_prototype || proto === null) return "Object"
	const kind = kind_of(value, proto)
	return kind == "Array" || kind == "Map" || kind == "Set"
		? kind
		: kind == "Object" && getPrototypeOf(proto) === null
			? "Object"
			: undefined
}
/**
 * @param {unknown} value
 * @returns {string}
 */
function foreign_kind(value) {
	if (Array.isArray(value)) return "Array"
	if (typed_array_name.call(value)) return "TypedArray"
	const name = to_string.call(value).slice(8, -1)
	return names.has(name)
		? resolve(value, name)
		: "Object"
}
/**
 * @param {unknown} value
 * @param {Prototype | null} proto
 * @returns {string}
 */
function kind_of(value, proto) {
	const kind = prototype_kind(proto)
	return kind === undefined
		? foreign_kind(value)
		: resolve(value, kind)
}
/**
 * @param {Prototype | null} proto
 * @returns {string | undefined}
 */
function prototype_kind(proto) {
	for (let current = proto; current; current = getPrototypeOf(current)) {
		const kind = kinds.get(current)
		if (kind) return kind
	}
	return undefined
}
/**
 * @param {unknown} value
 * @param {string} kind
 * @returns {string}
 */
function resolve(value, kind) {
	try {
		switch (kind) {
		case "Array":
			return Array.isArray(value)
				? kind
				: "Object"
		case "ArrayBuffer":
			array_buffer_byte_length.call(value)
			break
		case "BigInt":
			BigInt.prototype.valueOf.call(value)
			break
		case "Boolean":
			Boolean.prototype.valueOf.call(value)
			break
		case "DOMException":
			dom_exception_code.call(value)
			break
		case "DataView":
			data_view_buffer.call(value)
			break
		case "Error":
			if (is_error && !is_error(value)) return "Object"
			break
		case "Date":
			Date.prototype.getTime.call(value)
			break
		case "FinalizationRegistry":
			global.FinalizationRegistry.prototype.unregister.call(value, token)
			break
		case "Map":
			map_size.call(value)
			break
		case "Number":
			Number.prototype.valueOf.call(value)
			break
		case "RegExp":
			regexp_source.call(value)
			break
		case "Set":
			set_size.call(value)
			break
		case "SharedArrayBuffer":
			shared_array_buffer_byte_length.call(value)
			break
		case "String":
			String.prototype.valueOf.call(value)
			break
		case "Symbol":
			Symbol.prototype.valueOf.call(value)
			break
		case "TypedArray":
			return typed_array_name.call(value)
				? kind
				: "Object"
		case "WeakMap":
			WeakMap.prototype.has.call(value, token)
			break
		case "WeakRef":
			global.WeakRef.prototype.deref.call(value)
			break
		case "WeakSet":
			WeakSet.prototype.has.call(value, token)
		}
	} catch {
		return "Object"
	}
	return kind
}
/**
 * @param {unknown[]} array
 * @returns {number[] | undefined}
 */
function sparse_indices(array) {
	const length = array.length
	if (length < 4096) return undefined
	let present = 0
	for (let i = 1; i <= 16; i++) {
		if (Math.floor(
			length * (Math.imul(i, 0x9e3779b1) >>> 0) / 0x100000000
		) in array) present++
	}
	if (present == 16) return undefined
	/** @type {number[]} */
	const indices = []
	let sorted = true
	for (const key of getOwnPropertyNames(array)) {
		const index = Number(key)
		if (!(index < length) || String(index) !== key) continue
		if (index < /** @type {number} */(indices[indices.length - 1] ?? -1)/**/) sorted = false
		indices.push(index)
	}
	if (!sorted) indices.sort((x, y) => x - y)
	return indices.length < length / 2
		? indices
		: undefined
}
export {
	builtin_prototype,
	container_kind,
	foreign_kind,
	kind_of,
	map_size,
	prototype_kind,
	resolve,
	set_size,
	sparse_indices,
	typed_array_name
}
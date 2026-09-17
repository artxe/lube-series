/** @import { Change } from "../public.js" */
/** @import { Prototype } from "../private.js" */
import { copy_data } from "./deep_copy.js"
import deep_freeze from "./deep_freeze.js"
import { draft_map_has, is_frozen, update } from "./deep_update.js"
import { state_of } from "./draft.js"
import { container_kind } from "./kind.js"
const {
	defineProperty,
	getOwnPropertyDescriptor,
	getPrototypeOf,
	isFrozen
} = Object
const has_own = Object.prototype.hasOwnProperty
/**
 * @param {unknown} draft
 * @param {readonly Change[]} changes
 * @param {number} index
 * @param {{ values?: [ unknown, unknown ][] }} copied
 * @returns {void}
 */
function apply_change(draft, changes, index, copied) {
	const change = /** @type {Change} */(changes[index])/**/
	const { op, path } = change
	let target = draft
	for (let i = 0; i < path.length - 1; i++) target = read(target, change, index, i)
	const state = state_of(target)
	if (!state) throw not_container(change, index, path.length - 1, true)
	let key = path[path.length - 1]
	let value = op == "remove"
		? undefined
		: change.value
	const new_key = state.kind == "Map" && op == "add" && typeof key == "object" && key !== null && !isFrozen(key) && !draft_map_has(target, key)
	if ((new_key || typeof value == "object" && value !== null && !isFrozen(value)) && is_frozen(target)) {
		const pair = copy_of(changes, index, copied)
		if (new_key) key = pair[0]
		if (typeof value == "object" && value !== null && !isFrozen(value)) value = pair[1]
	}
	switch (state.kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(target)/**/
		if (!Number.isInteger(key) || /** @type {number} */(key)/**/ < 0 || /** @type {number} */(key)/**/ >= (op == "add"
			? array.length + 1
			: array.length)) throw missing(change, index, path.length - 1)
		const at = /** @type {number} */(key)/**/
		if (op == "add") {
			array.splice(at, 0, value)
		} else if (op == "remove") {
			array.splice(at, 1)
		} else {
			array[at] = value
		}
		break
	}
	case "Map": {
		const map = /** @type {Map<unknown, unknown>} */(target)/**/
		if (op != "add" && !draft_map_has(target, key)) throw missing(change, index, path.length - 1)
		if (op == "remove") {
			map.delete(key)
		} else {
			map.set(key, value)
		}
		break
	}
	case "Object":
		if (op != "add" && !has_own.call(
			state.copy ?? state.base,
			/** @type {PropertyKey} */(key)/**/
		)) throw missing(change, index, path.length - 1)
		if (op == "remove") {
			delete /** @type {Record<PropertyKey, unknown>} */(target)/**/[/** @type {PropertyKey} */(key)/**/]
		} else if (op == "add") {
			defineProperty(
				target,
				/** @type {PropertyKey} */(key)/**/,
				{
					configurable: true,
					enumerable: true,
					value,
					writable: true
				}
			)
		} else {
			/** @type {Record<PropertyKey, unknown>} */(target)/**/[/** @type {PropertyKey} */(key)/**/] = value
		}
		break
	case "Set": {
		const set = /** @type {Set<unknown>} */(target)/**/
		if (op != "add" && !set.has(key)) throw missing(change, index, path.length - 1)
		if (op != "add") set.delete(key)
		if (op != "remove") set.add(value)
	}
	}
}
/**
 * @param {unknown} value
 * @param {readonly Change[]} changes
 * @returns {unknown}
 */
function apply_changes(value, changes) {
	/** @type {{ values?: [ unknown, unknown ][] }} */
	const copied = {}
	for (let i = 0; i < changes.length; i++) check(changes[i], i)
	let result = value
	let start = 0
	for (let i = 0; i <= changes.length; i++) {
		const change = changes[i]
		if (change && change.path.length) continue
		if (i > start) {
			const end = i
			result = update(
				result,
				draft => {
					for (let j = start; j < end; j++) apply_change(draft, changes, j, copied)
				},
				true,
				false
			)
		}
		if (change) {
			if (change.op == "remove") throw new RangeError(
				`deepPatch change ${i} removes the root; replace it with undefined instead`
			)
			const next = change.value
			result = typeof next == "object" && next !== null && !isFrozen(next) && container_kind(result) && isFrozen(result)
				? deep_freeze(copy_of(changes, i, copied)[1])
				: next
		}
		start = i + 1
	}
	return result
}
/**
 * @param {unknown} change
 * @param {number} index
 * @returns {asserts change is Change}
 */
function check(change, index) {
	if (typeof change != "object" || change === null) throw new TypeError(
		`deepPatch change ${index} is not an object`
	)
	const { op, path } = /** @type {{ op?: unknown, path?: unknown }} */(change)/**/
	if (op != "add" && op != "remove" && op != "replace") throw new TypeError(
		`deepPatch change ${index} has an unknown op: ${String(op)}`
	)
	if (!Array.isArray(path)) throw new TypeError(
		`deepPatch change ${index} has a path that is not an array`
	)
}
/**
 * @param {readonly Change[]} changes
 * @param {number} index
 * @param {{ values?: [ unknown, unknown ][] }} copied
 * @returns {[ unknown, unknown ]}
 */
function copy_of(changes, index, copied) {
	copied.values ??= copy_data(
		changes.map(
			item => /** @type {[ unknown, unknown ]} */([
				item.path[item.path.length - 1],
				item.op == "remove"
					? undefined
					: item.value
			])/**/
		)
	)
	return /** @type {[ unknown, unknown ]} */(copied.values[index])/**/
}
/**
 * @param {unknown} segment
 * @returns {string}
 */
function describe(segment) {
	switch (typeof segment) {
	case "bigint":
		return `${segment}n`
	case "function":
		return "function"
	case "object":
		break
	case "string":
		return JSON.stringify(
			segment.length > 30
				? segment.slice(0, 29) + "…"
				: segment
		)
	default:
		return String(segment)
	}
	if (segment === null) return "null"
	try {
		if (Array.isArray(segment)) return "[…]"
		/** @type {Prototype | null} */
		const proto = getPrototypeOf(segment)
		if (proto === null || proto === Object.prototype) return "{…}"
		const name = /** @type {unknown} */(getOwnPropertyDescriptor(proto, "constructor")?.value)/**/
		return typeof name == "function" && typeof name.name == "string" && name.name
			? name.name.slice(0, 30)
			: "object"
	} catch {
		return "object"
	}
}
/**
 * @param {Change} change
 * @param {number} position
 * @returns {string}
 */
function label(change, position) {
	const { op, path } = change
	const shown = path.slice(0, 8).map(describe)
	if (path.length > 8) shown.push("…")
	return `deepPatch change ${position} ("${op}" at [${shown.join(", ")}])`
}
/**
 * @param {Change} change
 * @param {number} position
 * @param {number} index
 * @returns {RangeError}
 */
function missing(change, position, index) {
	return new RangeError(
		`${label(change, position)} has a path that does not exist: segment ${index + 1} of ${change.path.length} is missing`
	)
}
/**
 * @param {Change} change
 * @param {number} position
 * @param {number} index
 * @param {boolean} last
 * @returns {TypeError}
 */
function not_container(change, position, index, last) {
	return new TypeError(
		`${label(change, position)} has a path through a value that is not a plain object, array${last
			? ", Map or Set"
			: " or Map"}: ${index
			? `segment ${index} of ${change.path.length}`
			: "the root"}`
	)
}
/**
 * @param {unknown} target
 * @param {Change} change
 * @param {number} position
 * @param {number} index
 * @returns {unknown}
 */
function read(target, change, position, index) {
	const path = change.path
	const state = state_of(target)
	if (!state || state.kind == "Set") throw not_container(change, position, index, false)
	const key = path[index]
	if (state.kind == "Map") {
		if (!draft_map_has(target, key)) throw missing(change, position, index)
		return /** @type {Map<unknown, unknown>} */(target)/**/.get(key)
	}
	if (!has_own.call(
		state.copy ?? state.base,
		/** @type {PropertyKey} */(key)/**/
	)) throw missing(change, position, index)
	return /** @type {Record<PropertyKey, unknown>} */(target)/**/[/** @type {PropertyKey} */(key)/**/]
}
/**
 * Apply changes listed by `deepDiff` and return the next version of `value`, sharing every path the
 * changes do not touch. Each change applies at its own path, as `deepDiff` lists a change under every
 * path of a shared value. Throws a `RangeError` when the path of a change does not exist or a change
 * removes the root, and a `TypeError` when a change is malformed or its path runs through a value that
 * is not a plain object, array, Map or Set. Under a frozen parent, objects from the changes are copied
 * and frozen, while class instances are frozen in place.
 * @example deepPatch(state, deepDiff(state, next)) //=> equal to next
 * @template T
 * @param {T} value
 * @param {readonly Change[]} changes
 * @returns {T}
 */
export default function(value, changes) {
	if (!Array.isArray(changes)) throw new TypeError(
		"deepPatch needs an array of changes"
	)
	return /** @type {T} */(apply_changes(value, changes))/**/
}
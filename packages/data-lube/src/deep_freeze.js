/** @import { Prototype } from "../private.js" */
import { kind_of, sparse_indices } from "./kind.js"
const {
	freeze,
	getOwnPropertyNames: get_own_property_names,
	getOwnPropertySymbols: get_own_property_symbols,
	getPrototypeOf
} = Object
const array_prototype = Array.prototype
const map_entries = Map.prototype.entries
const object_prototype = Object.prototype
const set_values = Set.prototype.values
/**
 * @param {WeakKey} value
 * @param {{ budget: number, frozen?: Set<WeakKey>, pending?: WeakKey[], skip?: (value: WeakKey) => boolean }} state
 * @returns {void}
 */
function freeze_all(value, state) {
	visit(value, 0, state)
	const pending = state.pending
	if (!pending) return
	for (let item = pending.pop(); item; item = pending.pop()) visit(item, 0, state)
}
/**
 * @param {WeakKey[]} values
 * @param {(value: WeakKey) => boolean} skip
 * @returns {void}
 */
export function freeze_except(values, skip) {
	/** @type {{ budget: number, frozen?: Set<WeakKey>, pending?: WeakKey[], skip?: (value: WeakKey) => boolean }} */
	const state = { budget: 100000, skip }
	for (const value of values) {
		if (!state.frozen?.has(value)) freeze_all(value, state)
	}
}
/**
 * @param {WeakKey} value
 * @param {number} depth
 * @param {{ budget: number, frozen?: Set<WeakKey>, pending?: WeakKey[], skip?: (value: WeakKey) => boolean }} state
 * @returns {void}
 */
function visit(value, depth, state) {
	const frozen = state.frozen
	if (frozen) {
		frozen.add(value)
		if (depth > 200) {
			state.pending ??= []
			state.pending.push(value)
			return
		}
	} else if (--state.budget < 0 || depth > 64) {
		state.frozen = new Set([ value ])
	}
	if (ArrayBuffer.isView(value) || state.skip?.(value)) return
	freeze(value)
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(value)
	const kind = proto === object_prototype
		? "Object"
		: proto === array_prototype && Array.isArray(value)
			? "Array"
			: kind_of(value, proto)
	depth++
	if (kind == "Array") {
		const indices = sparse_indices(
			/** @type {unknown[]} */(value)/**/
		)
		const length = indices
			? indices.length
			: /** @type {unknown[]} */(value)/**/.length
		for (let i = 0; i < length; i++) {
			const item = /** @type {unknown[]} */(value)/**/[
				indices
					? /** @type {number} */(indices[i])/**/
					: i
			]
			if (item && typeof item == "object" && !state.frozen?.has(item)) visit(item, depth, state)
		}
		return
	}
	const names = get_own_property_names(value)
	for (let i = 0; i < names.length; i++) {
		const item = /** @type {Record<PropertyKey, unknown>} */(value)/**/[/** @type {string} */(names[i])/**/]
		if (item && typeof item == "object" && !state.frozen?.has(item)) visit(item, depth, state)
	}
	const symbols = get_own_property_symbols(value)
	for (let i = 0; i < symbols.length; i++) {
		const item = /** @type {Record<PropertyKey, unknown>} */(value)/**/[/** @type {symbol} */(symbols[i])/**/]
		if (item && typeof item == "object" && !state.frozen?.has(item)) visit(item, depth, state)
	}
	if (kind == "Map") {
		for (const [ key, item ] of map_entries.call(
			/** @type {Map<unknown, unknown>} */(value)/**/
		)) {
			if (key && typeof key == "object" && !state.frozen?.has(key)) visit(key, depth, state)
			if (item && typeof item == "object" && !state.frozen?.has(item)) visit(item, depth, state)
		}
	} else if (kind == "Set") {
		for (const item of set_values.call(
			/** @type {Set<unknown>} */(value)/**/
		)) {
			if (item && typeof item == "object" && !state.frozen?.has(item)) visit(item, depth, state)
		}
	}
}
/**
 * Deep freeze a value in place and return it.
 * Freezes every object reachable through own properties (including symbol and non-enumerable keys),
 * array items (other properties of arrays are not followed) and the keys and values of Map and Set.
 * Typed arrays and DataView are skipped because their contents cannot be frozen,
 * and Map and Set stay mutable at runtime but are typed as `ReadonlyMap` and `ReadonlySet`.
 * @template T
 * @param {T} value
 * @returns {import("../public.js").DeepReadonly<T>}
 */
export default function(value) {
	if (value && typeof value == "object") freeze_all(value, { budget: 100000 })
	return /** @type {import("../public.js").DeepReadonly<T>} */(value)/**/
}
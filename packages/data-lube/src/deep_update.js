/** @import { Draftable, DraftScope, DraftState, MapDraft, Prototype, SetDraft } from "../private.js" */
import { freeze_except } from "./deep_freeze.js"
import {
	collect,
	draft_state,
	drafts,
	inspect_custom,
	snapshot,
	state_of
} from "./draft.js"
import {
	container_kind,
	map_size,
	set_size,
	sparse_indices
} from "./kind.js"
const {
	assign,
	create,
	defineProperties,
	defineProperty,
	freeze,
	getOwnPropertyDescriptor,
	getOwnPropertyDescriptors,
	getOwnPropertyNames,
	getOwnPropertySymbols,
	getPrototypeOf,
	is,
	isFrozen,
	setPrototypeOf
} = Object
const { get: reflect_get, ownKeys } = Reflect
const array_prototype = Array.prototype
const array_slice = array_prototype.slice
const {
	clear: map_clear,
	delete: map_remove,
	entries: map_entries,
	get: map_read,
	has: map_contains,
	keys: map_keys,
	set: map_write
} = Map.prototype
const {
	add: set_add,
	clear: set_clear,
	delete: set_remove,
	has: set_contains,
	values: set_values
} = Set.prototype
const has_own = Object.prototype.hasOwnProperty
/** @type {WeakMap<WeakKey, boolean>} */
const shapes = new WeakMap()
/** @type {{ result: WeakKey | undefined, result_tree: boolean, value: unknown, value_tree: boolean }} */
const recent = {
	result: undefined,
	result_tree: false,
	value: undefined,
	value_tree: false
}
/**
 * @param {DraftState} state
 * @returns {[ DraftState ]}
 */
function array_target(state) {
	/** @type {[ DraftState ] & { [inspect_custom]?: () => unknown }} */
	const target = [ state ]
	target[inspect_custom] = inspect_draft
	return target
}
/**
 * @param {DraftState} root
 * @param {unknown} result
 * @param {boolean | undefined} tree
 * @param {boolean} record
 * @returns {unknown}
 */
function complete(root, result, tree, record) {
	const scope = root.scope
	try {
		let next
		let shared = false
		const drafted = result === undefined || result === root.proxy
		if (drafted) {
			if (scope.graph && root.modified) shared = link(root)
			next = finalize(root)
		} else if (root.modified) {
			throw new TypeError(
				"deepUpdate recipe must either change its draft or return a new value, not both; give an arrow function that changes the draft a block body in braces, or prefix its expression with void"
			)
		} else {
			next = resolve(result, root.scope)
			if (typeof next == "object" && next !== null && !isFrozen(next) && is_frozen(root.base)) {
				root.scope.frozen ??= []
				root.scope.frozen.push(next)
			}
		}
		const pending = root.scope.pending
		if (pending) {
			for (let task = pending.pop(); task; task = pending.pop()) {
				root.scope.depth = 0
				task()
			}
		}
		if (scope.frozen) {
			const kept = scope.kept
			freeze_except(
				scope.frozen,
				kept
					? value => kept.has(value) || is_draft(value)
					: is_draft
			)
		}
		if (record && drafted && next !== root.base && typeof next == "object" && next !== null) {
			const input = tree ?? (scope.found
				? false
				: undefined)
			const output = scope.graph
				? !shared
				: scope.shared
					? false
					: input
			if (input !== undefined || output !== undefined) remember(root.base, input, next, output)
		}
		return next
	} finally {
		release(root.scope)
	}
}
/**
 * @param {unknown[]} array
 * @param {number[] | undefined} indices
 * @returns {unknown[]}
 */
function copy_items(array, indices) {
	/** @type {unknown[]} */
	const copy = new Array(array.length)
	if (indices) {
		for (const i of indices) copy[i] = array[i]
	} else {
		for (let i = 0; i < array.length; i++) {
			if (i in array) copy[i] = array[i]
		}
	}
	return copy
}
/**
 * @param {Draftable} base
 * @param {DraftState["kind"]} kind
 * @param {DraftState | undefined} parent
 * @param {DraftScope} scope
 * @returns {Draftable}
 */
function create_draft(base, kind, parent, scope) {
	const state = /** @type {DraftState} */({
		base,
		copy: undefined,
		finalized: false,
		kind,
		modified: false,
		nested: (kind == "Map" || kind == "Set") && state_of(base) !== undefined,
		parent,
		proxy: undefined,
		scope,
		[inspect_custom]: inspect_draft
	})/**/
	const { proxy, revoke } = /** @type {{ proxy: Draftable, revoke: () => void }} */(Proxy.revocable(
		kind == "Array"
			? array_target(state)
			: state,
		handlers[kind]
	))/**/
	state.proxy = proxy
	scope.revokes.push(revoke)
	const seen = scope.listed
	if (seen) {
		seen.push(state)
	} else {
		scope.drafts?.set(base, state)
	}
	return proxy
}
/**
 * @param {Record<PropertyKey, unknown>} copy
 * @param {Record<PropertyKey, unknown>} base
 * @param {PropertyKey[]} names
 * @returns {void}
 */
function define_hidden(copy, base, names) {
	for (const key of names) {
		if (!has_own.call(copy, key)) {
			defineProperty(
				copy,
				key,
				{
					configurable: true,
					enumerable: false,
					value: base[key],
					writable: true
				}
			)
		}
	}
}
/**
 * @param {unknown} value
 * @param {DraftState["kind"]} kind
 * @param {DraftState} parent
 * @returns {Draftable}
 */
function draft_for(value, kind, parent) {
	const scope = parent.scope
	let known = scope.drafts?.get(value)
	const seen = scope.listed
	if (seen && (seen.length <= 32 || listed_again(scope, seen, value))) {
		for (let i = 0; i < seen.length; i++) {
			const state = /** @type {DraftState} */(seen[i])/**/
			if (state.base === value) {
				known = state
				break
			}
		}
	}
	if (known && !scope.graph) {
		scope.graph = scope.found = true
		if (seen) index_drafts(scope)
	}
	return known
		? /** @type {Draftable} */(known.proxy)/**/
		: create_draft(
			/** @type {Draftable} */(value)/**/,
			kind,
			parent,
			scope
		)
}
/**
 * @param {unknown} value
 * @returns {DraftState["kind"] | undefined}
 */
function draft_kind(value) {
	return container_kind(value) ?? state_of(value)?.kind
}
/**
 * @param {unknown} draft
 * @param {unknown} key
 * @returns {boolean}
 */
export function draft_map_has(draft, key) {
	return map_has(
		/** @type {DraftState<MapDraft>} */(state_of(draft))/**/,
		key
	)
}
/**
 * @param {DraftState<SetDraft>} state
 * @returns {SetDraft}
 */
function draft_members(state) {
	prepare(state)
	const copy = state.copy
	if (state.members) return copy
	const members = state.members = new Map()
	let drafted = false
	for (const value of set_values.call(copy)) {
		if (typeof value != "object" || value === null || !base_has(state, value)) continue
		if (draft_kind(value)) {
			drafted = true
			break
		}
		keep(state.scope, value)
	}
	if (!drafted) return copy
	const values = [ ...set_values.call(copy) ]
	set_clear.call(copy)
	for (const value of values) {
		const kind = draft_kind(value)
		if (kind && base_has(state, value)) {
			const draft = draft_for(value, kind, state)
			members.set(value, draft)
			set_add.call(copy, draft)
		} else {
			if (typeof value == "object" && value !== null && base_has(state, value)) keep(state.scope, value)
			set_add.call(copy, value)
		}
	}
	return copy
}
/**
 * @template {Draftable} T
 * @param {T} proxy
 * @returns {DraftState<T>}
 */
function draft_of(proxy) {
	return /** @type {DraftState<T>} */(proxy[draft_state])/**/
}
/**
 * @param {DraftState} parent
 * @param {unknown} value
 * @param {unknown} original
 * @returns {void}
 */
function leave(parent, value, original) {
	const state = state_of(value)
	if (state?.scope === parent.scope && state.base === original) state.away = true
}
/** @satisfies {ProxyHandler<DraftState>} */
const draft_traps = {
	defineProperty(state, key, descriptor) {
		if (state.scope.track) {
			const source = state.copy ?? state.base
			if (has_own.call(source, key)) leave(
				state,
				source[key],
				state.base[key]
			)
		}
		prepare(state)
		mark(state)
		defineProperty(state.copy, key, descriptor)
		touch(state, key)
		return true
	},
	deleteProperty(state, key) {
		const source = state.copy ?? state.base
		if (has_own.call(source, key)) {
			if (state.scope.track) leave(
				state,
				source[key],
				state.base[key]
			)
			prepare(state)
			mark(state)
			delete state.copy[key]
		}
		return true
	},
	get(state, key) {
		if (key === draft_state) return state
		const source = state.copy ?? state.base
		if (!has_own.call(source, key)) return reflect_get(source, key, state.proxy)
		const value = source[key]
		if (value !== state.base[key]) return value
		const kind = draft_kind(value)
		if (!kind) {
			if (typeof value == "object" && value !== null) keep(state.scope, value)
			return value
		}
		prepare(state)
		const draft = draft_for(value, kind, state)
		set_own(state.copy, key, draft)
		touch(state, key)
		return draft
	},
	getOwnPropertyDescriptor(state, key) {
		const source = state.copy ?? state.base
		const descriptor = getOwnPropertyDescriptor(source, key)
		return descriptor && {
			configurable: state.kind != "Array" || key != "length",
			enumerable: !!descriptor.enumerable,
			value: source[key],
			writable: true
		}
	},
	getPrototypeOf(state) {
		return getPrototypeOf(state.base)
	},
	has(state, key) {
		return key in (state.copy ?? state.base)
	},
	ownKeys(state) {
		return ownKeys(state.copy ?? state.base)
	},
	preventExtensions() {
		throw new TypeError(
			"deepUpdate drafts cannot be frozen or made non-extensible"
		)
	},
	set(state, key, value) {
		const source = state.copy ?? state.base
		/** @type {DraftState | undefined} */
		let current_state
		if (has_own.call(source, key)) {
			const current = source[key]
			if (is(current, value)) return true
			current_state = state_of(current)
			if (current_state && current_state.scope === state.scope && current_state.base === value) {
				if (state.copy) set_own(state.copy, key, value)
				if (!state.scope.graph) forget(state.scope, value)
				return true
			}
		}
		if (state.scope.track && current_state?.scope === state.scope && current_state.base === state.base[key]) current_state.away = true
		prepare(state)
		mark(state)
		set_own(state.copy, key, value)
		touch(state, key)
		return true
	},
	setPrototypeOf() {
		throw new TypeError(
			"deepUpdate drafts cannot change their prototype"
		)
	}
}
/**
 * @param {DraftState} state
 * @returns {Draftable | undefined}
 */
function finalize(state) {
	if (!state.modified) return state.base
	if (state.finalized) return state.copy
	state.finalized = true
	const { base, copy, kind, scope } = /** @type {DraftState & { copy: Draftable }} */(state)/**/
	scope.depth++
	const states = scope.graph
		? scope.drafts
		: undefined
	switch (kind) {
	case "Array":
	case "Object":
		for (const key of /** @type {Iterable<PropertyKey>} */(state.touched ?? [])/**/) {
			const value = copy[key]
			if (typeof value == "object" && value !== null && (value !== base[key] || states?.get(value)?.modified)) {
				const resolved = finalize_value(value, state, base[key])
				if (resolved !== value) set_own(copy, key, resolved)
			}
		}
		break
	case "Map": {
		/** @type {Map<unknown, unknown> | undefined} */
		let rebuild
		for (const key of state.touched ?? []) {
			if ((typeof key == "string" || typeof key == "symbol") && has_own.call(copy, key)) finalize_key(copy, key, state)
			if (!map_contains.call(copy, key)) continue
			if (typeof key == "object" && key !== null) {
				const known = base_has(state, key)
				if (!known || states?.get(key)?.modified) {
					const resolved = finalize_value(
						key,
						state,
						known
							? key
							: undefined
					)
					if (resolved !== key) {
						rebuild ??= new Map()
						rebuild.set(key, resolved)
					}
				}
			}
			const value = map_read.call(copy, key)
			const original = base_get(state, key)
			if (typeof value == "object" && value !== null && (value !== original || states?.get(value)?.modified)) {
				const resolved = finalize_value(value, state, original)
				if (resolved !== value) map_write.call(copy, key, resolved)
			}
		}
		if (rebuild) {
			const entries = [ ...map_entries.call(copy) ]
			map_clear.call(copy)
			for (const [ key, value ] of entries) {
				map_write.call(
					copy,
					rebuild.has(key)
						? rebuild.get(key)
						: key,
					value
				)
			}
		}
		break
	}
	case "Set": {
		const values = [ ...set_values.call(copy) ]
		set_clear.call(copy)
		for (const value of values) {
			set_add.call(
				copy,
				typeof value == "object" && value !== null && (!base_has(state, value) || states?.get(value)?.modified)
					? finalize_value(value, state, undefined)
					: value
			)
		}
		for (const key of /** @type {Iterable<PropertyKey>} */(state.touched ?? [])/**/) {
			if (has_own.call(copy, key)) finalize_key(copy, key, state)
		}
	}
	}
	scope.depth--
	if (is_frozen(base)) freeze(state.copy)
	return state.copy
}
/**
 * @param {Record<PropertyKey, unknown>} copy
 * @param {PropertyKey} key
 * @param {DraftState} state
 * @returns {void}
 */
function finalize_key(copy, key, state) {
	const value = copy[key]
	const original = state.base[key]
	if (typeof value == "object" && value !== null && (value !== original || state.scope.graph && state.scope.drafts?.get(value)?.modified)) {
		const resolved = finalize_value(value, state, original)
		if (resolved !== value) set_own(copy, key, resolved)
	}
}
/**
 * @param {unknown} value
 * @param {DraftState} state
 * @param {unknown} original
 * @returns {unknown}
 */
function finalize_value(value, state, original) {
	let child = state_of(value)
	if (!child || child.scope !== state.scope) {
		const mapped = state.scope.graph
			? state.scope.drafts?.get(value)
			: undefined
		if (mapped?.modified) {
			child = mapped
		} else if (child) {
			if (state.scope.track) state.scope.shared = true
			return value
		}
	}
	if (child && state.scope.track) {
		if (
			state.kind == "Set"
				? base_has(state, child.base)
				: child.base === original
		) {
			child.away = false
			if (child.placed) state.scope.shared = true
		} else {
			place(child)
		}
	}
	if (child) return finalize_later(child)
	const resolved = resolve(value, state.scope)
	if (typeof resolved == "object" && resolved !== null && is_frozen(state.base)) {
		state.scope.frozen ??= []
		state.scope.frozen.push(resolved)
	}
	return resolved
}
/**
 * @param {DraftScope} scope
 * @returns {void}
 */
function release(scope) {
	drafts.active--
	for (const revoke of scope.revokes) revoke()
}
/** @type {{ Array: ProxyHandler<[ DraftState ]>, Map: ProxyHandler<DraftState>, Object: ProxyHandler<DraftState>, Set: ProxyHandler<DraftState> }} */
const handlers = {
	Array: {
		defineProperty: (target, key, descriptor) => draft_traps.defineProperty(target[0], key, descriptor),
		deleteProperty: (target, key) => draft_traps.deleteProperty(target[0], key),
		get: (target, key) => key === draft_state
			? target[0]
			: draft_traps.get(target[0], key),
		getOwnPropertyDescriptor: (target, key) => draft_traps.getOwnPropertyDescriptor(target[0], key),
		getPrototypeOf: target => draft_traps.getPrototypeOf(target[0]),
		has: (target, key) => draft_traps.has(target[0], key),
		ownKeys: target => draft_traps.ownKeys(target[0]),
		preventExtensions: draft_traps.preventExtensions,
		set: (target, key, value) => draft_traps.set(target[0], key, value),
		setPrototypeOf: draft_traps.setPrototypeOf
	},
	Map: {
		...draft_traps,
		get(state, key) {
			if (key === draft_state) return state
			if (key === "size") return size_of(
				/** @type {DraftState<MapDraft>} */(state)/**/
			)
			return has_own.call(map_methods, key)
				? map_methods[/** @type {keyof typeof map_methods} */(key)/**/]
				: draft_traps.get(state, key)
		}
	},
	Object: draft_traps,
	Set: {
		...draft_traps,
		get(state, key) {
			if (key === draft_state) return state
			if (key === "size") return size_of(
				/** @type {DraftState<SetDraft>} */(state)/**/
			)
			return has_own.call(set_methods, key)
				? set_methods[/** @type {keyof typeof set_methods} */(key)/**/]
				: has_own.call(set_readers, key)
					? set_readers[/** @type {keyof typeof set_readers} */(key)/**/]
					: draft_traps.get(state, key)
		}
	}
}
/**
 * @param {DraftState<MapDraft>} state
 * @param {unknown} key
 * @returns {unknown}
 */
function map_get(state, key) {
	const value = state.copy
		? map_read.call(state.copy, key)
		: base_get(state, key)
	if (value !== base_get(state, key)) return value
	const kind = draft_kind(value)
	if (!kind) {
		if (typeof value == "object" && value !== null) keep(state.scope, value)
		return value
	}
	prepare(state)
	const draft = draft_for(value, kind, state)
	map_write.call(state.copy, key, draft)
	touch(state, key)
	return draft
}
/**
 * @param {DraftState<MapDraft>} state
 * @param {"entries" | "keys" | "values"} mode
 * @returns {Generator<unknown, void>}
 */
function* map_items(state, mode) {
	const cursor = {
		index: 0,
		keys: state.copy
			? map_keys.call(state.copy)
			: state.nested
				? state.base.keys()
				: map_keys.call(state.base)
	}
	if (!state.copy) {
		state.cursors ??= new Set()
		state.cursors.add(cursor)
	}
	try {
		for (let step = cursor.keys.next(); !step.done; step = cursor.keys.next()) {
			cursor.index++
			const key = step.value
			if (typeof key == "object" && key !== null && base_has(state, key)) keep(state.scope, key)
			yield mode == "keys"
				? key
				: mode == "values"
					? map_get(state, key)
					: [ key, map_get(state, key) ]
		}
	} finally {
		state.cursors?.delete(cursor)
	}
}
const map_methods = {
	/**
	 * @this {MapDraft}
	 * @returns {IterableIterator<[ unknown, unknown ]>}
	 */
	[Symbol.iterator]() {
		return this.entries()
	},
	/**
	 * @this {MapDraft}
	 * @returns {void}
	 */
	clear() {
		const state = draft_of(this)
		if (!size_of(state)) return
		prepare(state)
		mark(state)
		map_clear.call(state.copy)
	},
	/**
	 * @this {MapDraft}
	 * @param {unknown} key
	 * @returns {boolean}
	 */
	delete(key) {
		const state = draft_of(this)
		const found = map_key(state, key)
		if (!map_has(state, found)) return false
		if (state.scope.track) leave(
			state,
			state.copy
				? map_read.call(state.copy, found)
				: base_get(state, found),
			base_get(state, found)
		)
		prepare(state)
		mark(state)
		return map_remove.call(state.copy, found)
	},
	/**
	 * @this {MapDraft}
	 * @returns {IterableIterator<[ unknown, unknown ]>}
	 */
	entries() {
		return /** @type {IterableIterator<[ unknown, unknown ]>} */(map_items(draft_of(this), "entries"))/**/
	},
	/**
	 * @this {MapDraft}
	 * @param {(value: unknown, key: unknown, map: MapDraft) => void} callback
	 * @param {unknown} [this_arg]
	 * @returns {void}
	 */
	forEach(callback, this_arg) {
		const state = draft_of(this)
		for (const key of map_items(state, "keys")) callback.call(
			this_arg,
			map_get(state, key),
			key,
			this
		)
	},
	/**
	 * @this {MapDraft}
	 * @param {unknown} key
	 * @returns {unknown}
	 */
	get(key) {
		const state = draft_of(this)
		return map_get(state, map_key(state, key))
	},
	/**
	 * @this {MapDraft}
	 * @param {unknown} key
	 * @returns {boolean}
	 */
	has(key) {
		const state = draft_of(this)
		return map_has(state, map_key(state, key))
	},
	/**
	 * @this {MapDraft}
	 * @returns {IterableIterator<unknown>}
	 */
	keys() {
		return map_items(draft_of(this), "keys")
	},
	/**
	 * @this {MapDraft}
	 * @param {unknown} entry_key
	 * @param {unknown} value
	 * @returns {MapDraft}
	 */
	set(entry_key, value) {
		const state = draft_of(this)
		const key = map_key(state, entry_key)
		const present = map_has(state, key)
		if (present) {
			const current = state.copy
				? map_read.call(state.copy, key)
				: base_get(state, key)
			if (is(current, value)) return this
			const current_state = state_of(current)
			if (current_state && current_state.scope === state.scope && current_state.base === value) {
				if (state.copy) map_write.call(state.copy, key, value)
				if (!state.scope.graph) forget(state.scope, value)
				return this
			}
			if (state.scope.track && current_state?.scope === state.scope && current_state.base === base_get(state, key)) current_state.away = true
		}
		prepare(state)
		mark(state)
		map_write.call(state.copy, key, value)
		touch(state, key)
		return this
	},
	/**
	 * @this {MapDraft}
	 * @returns {IterableIterator<unknown>}
	 */
	values() {
		return map_items(draft_of(this), "values")
	}
}
/**
 * @param {DraftState} state
 * @param {unknown} key
 * @returns {unknown}
 */
function base_get(state, key) {
	return state.nested
		? /** @type {Map<unknown, unknown>} */(state.base)/**/.get(key)
		: map_read.call(
			/** @type {Map<unknown, unknown>} */(state.base)/**/,
			key
		)
}
/**
 * @param {DraftState} state
 * @param {unknown} key
 * @returns {boolean}
 */
function base_has(state, key) {
	const base = /** @type {Map<unknown, unknown> | Set<unknown>} */(state.base)/**/
	return state.nested
		? base.has(key)
		: state.kind == "Map"
			? map_contains.call(
				/** @type {Map<unknown, unknown>} */(base)/**/,
				key
			)
			: set_contains.call(
				/** @type {Set<unknown>} */(base)/**/,
				key
			)
}
/**
 * @param {DraftState} state
 * @returns {Draftable | undefined}
 */
function finalize_later(state) {
	const scope = state.scope
	if (!state.modified || state.finalized || scope.depth <= 200) return finalize(state)
	later(
		scope,
		() => {
			finalize(state)
		}
	)
	return state.copy
}
/**
 * @param {DraftScope} scope
 * @param {unknown} value
 * @returns {void}
 */
function forget(scope, value) {
	const seen = scope.listed ?? []
	for (let i = seen.length - 1; i >= 0; i--) {
		if (/** @type {DraftState} */(seen[i])/**/.base === value) seen.splice(i, 1)
	}
	scope.bases?.delete(value)
}
/**
 * @param {DraftScope} scope
 * @returns {void}
 */
function index_drafts(scope) {
	/** @type {Map<unknown, DraftState>} */
	const map = new Map()
	for (const state of scope.listed ?? []) map.set(state.base, state)
	scope.drafts = map
	scope.bases = scope.listed = undefined
}
/**
 * @this {unknown}
 * @returns {unknown}
 */
function inspect_draft() {
	return snapshot([ this ])[0]
}
/**
 * @param {unknown} value
 * @returns {boolean}
 */
function is_draft(value) {
	return state_of(value) !== undefined
}
/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function is_frozen(value) {
	let current = value
	for (let state = state_of(current); state; state = state_of(current)) current = state.base
	return isFrozen(current)
}
/**
 * @template T
 * @param {DraftScope} scope
 * @param {T} value
 * @returns {T}
 */
function keep(scope, value) {
	if (scope.kept) {
		scope.kept.add(value)
	} else {
		scope.kept = new Set([ value ])
	}
	return value
}
/**
 * @param {DraftScope} scope
 * @param {() => void} task
 * @returns {void}
 */
function later(scope, task) {
	scope.pending ??= []
	scope.pending.push(task)
}
/**
 * @param {DraftState} root
 * @returns {boolean}
 */
function link(root) {
	const scope = root.scope
	const states = /** @type {Map<unknown, DraftState>} */(scope.drafts)/**/
	/** @type {Map<unknown, number>} */
	const index = new Map()
	/** @type {unknown[]} */
	const values = []
	/** @type {(DraftState | undefined)[]} */
	const owners = []
	/** @type {DraftState["kind"][]} */
	const kinds = []
	/** @type {number[]} */
	const incoming = []
	/** @type {number[]} */
	const from = []
	/** @type {number[]} */
	const to = []
	/** @type {unknown[]} */
	const slots = []
	/** @type {number[]} */
	const types = []
	/** @type {unknown[]} */
	const found = []
	let shared = false
	/**
	 * @param {unknown} value
	 * @returns {number}
	 */
	function node_of(value) {
		const own = state_of(value)
		const state = own?.scope === scope
			? own
			: states.get(value)
		const key = state ?? value
		const known = index.get(key)
		if (known !== undefined) return known
		const kind = state
			? state.kind
			: own
				? own.kind
				: container_kind(value)
		if (!kind) return -1
		const at = values.length
		index.set(key, at)
		values.push(value)
		owners.push(state)
		kinds.push(kind)
		incoming.push(0)
		return at
	}
	node_of(root.proxy)
	for (let at = 0; at < values.length; at++) {
		const state = owners[at]
		const base = state?.copy
			? state
			: undefined
		found.length = 0
		collect(
			state
				? state.copy ?? state.base
				: values[at],
			/** @type {DraftState["kind"]} */(kinds[at])/**/,
			found
		)
		for (let k = 0; k < found.length; k += 3) {
			const child = found[k]
			const target = node_of(child)
			if (target < 0) continue
			const type = /** @type {number} */(found[k + 2])/**/
			const slot = found[k + 1]
			from.push(at)
			to.push(target)
			slots.push(slot)
			types.push(
				!base || unchanged(base, child, slot, type)
					? type | 4
					: type
			)
			if (++/** @type {number} */(incoming[target])/**/ > 1 || target == 0) shared = true
		}
	}
	const count = values.length
	const edges = from.length
	const origin = new Uint8Array(count)
	const dirty = new Uint8Array(count)
	const out_start = new Int32Array(count + 1)
	const in_start = new Int32Array(count + 1)
	for (let e = 0; e < edges; e++) {
		const source = /** @type {number} */(from[e])/**/ + 1
		const target = /** @type {number} */(to[e])/**/ + 1
		out_start[source] = /** @type {number} */(out_start[source])/**/ + 1
		in_start[target] = /** @type {number} */(in_start[target])/**/ + 1
	}
	for (let i = 0; i < count; i++) {
		out_start[i + 1] = /** @type {number} */(out_start[i + 1])/**/ + /** @type {number} */(out_start[i])/**/
		in_start[i + 1] = /** @type {number} */(in_start[i + 1])/**/ + /** @type {number} */(in_start[i])/**/
	}
	const out_edges = new Int32Array(edges)
	const in_edges = new Int32Array(edges)
	const out_fill = out_start.slice(0, count)
	const in_fill = in_start.slice(0, count)
	for (let e = 0; e < edges; e++) {
		const source = /** @type {number} */(from[e])/**/
		const target = /** @type {number} */(to[e])/**/
		const out_at = /** @type {number} */(out_fill[source])/**/
		const in_at = /** @type {number} */(in_fill[target])/**/
		out_edges[out_at] = e
		in_edges[in_at] = e
		out_fill[source] = out_at + 1
		in_fill[target] = in_at + 1
	}
	/** @type {number[]} */
	const queue = []
	for (let i = 0; i < count; i++) {
		if (owners[i]) {
			origin[i] = 1
			queue.push(i)
		}
	}
	for (let node = queue.pop(); node !== undefined; node = queue.pop()) {
		for (let k = /** @type {number} */(out_start[node])/**/; k < /** @type {number} */(out_start[node + 1])/**/; k++) {
			const e = /** @type {number} */(out_edges[k])/**/
			const target = /** @type {number} */(to[e])/**/
			if (/** @type {number} */(types[e])/**/ & 4 && !origin[target]) {
				origin[target] = 1
				queue.push(target)
			}
		}
	}
	for (let i = 0; i < count; i++) {
		if (owners[i]?.modified) {
			dirty[i] = 1
			queue.push(i)
		}
	}
	for (let node = queue.pop(); node !== undefined; node = queue.pop()) {
		for (let k = /** @type {number} */(in_start[node])/**/; k < /** @type {number} */(in_start[node + 1])/**/; k++) {
			const parent = /** @type {number} */(from[/** @type {number} */(in_edges[k])/**/])/**/
			if (!dirty[parent] && origin[parent]) {
				dirty[parent] = 1
				queue.push(parent)
			}
		}
	}
	for (let i = 0; i < count; i++) {
		if (!dirty[i]) continue
		const state = owners[i] ??= draft_of(
			create_draft(
				/** @type {Draftable} */(values[i])/**/,
				/** @type {DraftState["kind"]} */(kinds[i])/**/,
				undefined,
				scope
			)
		)
		prepare(state)
		state.modified = true
	}
	for (let e = 0; e < edges; e++) {
		const parent = /** @type {number} */(from[e])/**/
		const type = /** @type {number} */(types[e])/**/ & 3
		if (type == 2 || !dirty[parent] || !dirty[/** @type {number} */(to[e])/**/]) continue
		const slot = slots[e]
		touch(
			/** @type {DraftState} */(owners[parent])/**/,
			kinds[parent] == "Array" && typeof slot == "number"
				? String(slot)
				: slot
		)
	}
	return shared
}
/**
 * @param {DraftScope} scope
 * @param {DraftState[]} seen
 * @param {unknown} value
 * @returns {boolean}
 */
function listed_again(scope, seen, value) {
	let bases = scope.bases
	if (!bases) {
		bases = scope.bases = new Set()
		for (const state of seen) bases.add(state.base)
	}
	const size = bases.size
	bases.add(value)
	return bases.size == size
}
/**
 * @param {DraftState<MapDraft>} state
 * @param {unknown} key
 * @returns {boolean}
 */
function map_has(state, key) {
	return state.copy
		? map_contains.call(state.copy, key)
		: base_has(state, key)
}
/**
 * @param {DraftState<MapDraft>} state
 * @param {unknown} key
 * @returns {unknown}
 */
function map_key(state, key) {
	if (typeof key != "object" || key === null || map_has(state, key)) return key
	const original = original_draft_base(state.scope, key)
	return original !== key && map_has(state, original)
		? original
		: key
}
/**
 * @param {DraftState} state
 * @returns {void}
 */
function mark(state) {
	for (let current = /** @type {DraftState | undefined} */(state)/**/; current && !current.modified; current = current.parent) current.modified = true
}
/**
 * @param {DraftState<SetDraft>} state
 * @param {unknown} value
 * @returns {unknown}
 */
function member_key(state, value) {
	const outer = state_of(state.base)
	if (outer?.kind != "Set") return value
	const key = member_key(outer, value)
	return outer.members?.get(key) ?? key
}
/**
 * @param {DraftScope} scope
 * @param {unknown} value
 * @returns {unknown}
 */
function original_draft_base(scope, value) {
	let current = value
	for (let state = state_of(current); state?.scope === scope; state = state_of(current)) current = state.base
	return current
}
/**
 * @param {DraftState} state
 * @param {unknown} item
 * @returns {unknown}
 */
function original_of(state, item) {
	let value = item
	for (let current = /** @type {DraftState | undefined} */(state)/**/; current?.kind == "Set"; current = state_of(current.base)) {
		for (const [ original, draft ] of current.members ?? []) {
			if (draft === value) {
				value = original
				break
			}
		}
	}
	return value
}
/**
 * @template T
 * @param {T} target
 * @param {unknown} value
 * @returns {T}
 */
function own_properties(target, value) {
	const descriptors = getOwnPropertyDescriptors(value)
	for (const key of ownKeys(descriptors)) {
		const descriptor = /** @type {PropertyDescriptor} */(descriptors[/** @type {string} */(key)/**/])/**/
		descriptor.configurable = true
		if ("value" in descriptor) descriptor.writable = true
	}
	return defineProperties(target, descriptors)
}
/**
 * @param {DraftState} state
 * @returns {void}
 */
function place(state) {
	state.placed = (state.placed ?? 0) + 1
	if (state.placed > 1 || !state.away) state.scope.shared = true
}
/**
 * @param {DraftState} state
 * @returns {asserts state is DraftState & { copy: Draftable }}
 */
function prepare(state) {
	if (state.copy !== undefined) return
	const base = state.base
	/** @type {Prototype | null} */
	const proto = getPrototypeOf(base)
	switch (state.kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(base)/**/
		const indices = sparse_indices(array)
		if (proto === array_prototype && !indices && !has_own.call(array, "constructor")) {
			state.copy = /** @type {typeof state.base} */(array_slice.call(array))/**/
			break
		}
		const copy = copy_items(array, indices)
		state.copy = proto === array_prototype
			? copy
			: assign(
				setPrototypeOf(copy, proto),
				base
			)
		break
	}
	case "Map": {
		const copy = assign(
			new Map(
				state_of(base)
					? /** @type {Map<unknown, unknown>} */(base)/**/
					: map_entries.call(
						/** @type {Map<unknown, unknown>} */(base)/**/
					)
			),
			base
		)
		for (const cursor of state.cursors ?? []) {
			cursor.keys = map_keys.call(copy)
			for (let i = 0; i < cursor.index; i++) cursor.keys.next()
		}
		state.cursors = undefined
		state.copy = copy
		break
	}
	case "Object": {
		/** @type {Record<PropertyKey, unknown>} */
		const copy = proto === null
			? assign(create(null), base)
			: { ...base }
		const names = getOwnPropertyNames(base)
		let count = 0
		for (const key in copy) {
			if (has_own.call(copy, key)) count++
		}
		if (names.length != count) define_hidden(copy, base, names)
		const symbols = getOwnPropertySymbols(base)
		if (symbols.length) define_hidden(copy, base, symbols)
		state.copy = copy
		break
	}
	case "Set":
		state.copy = assign(
			new Set(
				state_of(base)
					? /** @type {Set<unknown>} */(base)/**/
					: set_values.call(
						/** @type {Set<unknown>} */(base)/**/
					)
			),
			base
		)
	}
	if (proto !== null && proto !== getPrototypeOf(state.copy)) setPrototypeOf(state.copy, proto)
}
/**
 * @param {unknown} value
 * @param {DraftScope} scope
 * @param {Set<unknown>} visited
 * @returns {boolean}
 */
function reaches_draft(value, scope, visited) {
	/** @type {Map<unknown, unknown>} */
	const parents = new Map([ [ value, undefined ] ])
	/** @type {unknown[]} */
	const stack = [ value, undefined ]
	while (stack.length) {
		const parent = stack.pop()
		const item = stack.pop()
		if (typeof item != "object" || item === null) continue
		const state = state_of(item)
		const mapped = scope.graph
			? scope.drafts?.get(item)
			: undefined
		const found = mapped
			? mapped.modified
			: state
				? state.scope === scope
				: scope.reaching?.has(item) || (scope.seen?.get(
					/** @type {Draftable} */(item)/**/
				) ?? item) !== item
		if (found) {
			const reaching = scope.reaching ??= new Set()
			for (let node = parent; node !== undefined; node = parents.get(node)) reaching.add(node)
			return true
		}
		if (mapped || state) {
			if (scope.track && state && state.scope !== scope) scope.shared = true
			continue
		}
		if (visited.has(item) || scope.seen?.has(
			/** @type {Draftable} */(item)/**/
		)) {
			if (scope.track) scope.shared = true
			continue
		}
		const kind = container_kind(item)
		if (!kind) continue
		visited.add(item)
		if (item !== value) parents.set(item, parent)
		switch (kind) {
		case "Array": {
			const array = /** @type {unknown[]} */(item)/**/
			const indices = sparse_indices(array)
			if (indices) {
				for (const i of indices) stack.push(array[i], item)
			} else {
				for (let i = 0; i < array.length; i++) stack.push(array[i], item)
			}
			break
		}
		case "Map":
			for (const [ key, entry ] of map_entries.call(
				/** @type {Map<unknown, unknown>} */(item)/**/
			)) stack.push(key, item, entry, item)
			break
		case "Object":
			for (const key of ownKeys(item)) stack.push(
				/** @type {Record<PropertyKey, unknown>} */(item)/**/[key],
				item
			)
			break
		default:
			for (const entry of set_values.call(
				/** @type {Set<unknown>} */(item)/**/
			)) stack.push(entry, item)
		}
	}
	return false
}
/**
 * @template R
 * @param {SetDraft} proxy
 * @param {keyof typeof set_readers} name
 * @param {unknown} other
 * @returns {R}
 */
function read_set(proxy, name, other) {
	const state = draft_of(proxy)
	const copy = draft_members(state)
	/** @type {Map<unknown, unknown>} */
	const back = new Map()
	/** @type {Set<unknown>} */
	const view = new Set()
	for (const item of set_values.call(copy)) {
		const original = original_of(state, item)
		back.set(original, item)
		view.add(original)
	}
	const result = /** @type {Record<keyof typeof set_readers, (this: Set<unknown>, other: unknown) => unknown>} */(/** @type {unknown} */(Set.prototype))/**/[name].call(view, other)
	if (!(result instanceof Set)) return /** @type {R} */(result)/**/
	/** @type {Set<unknown>} */
	const mapped = new Set()
	for (const item of result) {
		mapped.add(
			back.has(item)
				? back.get(item)
				: item
		)
	}
	return /** @type {R} */(mapped)/**/
}
/**
 * @param {unknown} value
 * @param {boolean | undefined} value_tree
 * @param {WeakKey} result
 * @param {boolean | undefined} result_tree
 * @returns {void}
 */
function remember(
	value,
	value_tree,
	result,
	result_tree
) {
	if (recent.result !== undefined && recent.result !== value && (recent.value !== value || !recent.result_tree)) shapes.set(
		recent.result,
		recent.result_tree
	)
	if (value_tree === false) shapes.set(
		/** @type {WeakKey} */(value)/**/,
		false
	)
	recent.result = result_tree === undefined
		? undefined
		: result
	recent.result_tree = !!result_tree
	recent.value = value_tree === undefined
		? undefined
		: value
	recent.value_tree = !!value_tree
}
/**
 * @param {Draftable} target
 * @param {PropertyKey} key
 * @param {unknown} value
 * @returns {void}
 */
function replace_own(target, key, value) {
	if ("value" in /** @type {PropertyDescriptor} */(getOwnPropertyDescriptor(target, key))/**/) defineProperty(target, key, { value })
}
/**
 * @param {unknown} value
 * @param {DraftScope} scope
 * @returns {unknown}
 */
function resolve(value, scope) {
	const mapped = scope.graph
		? scope.drafts?.get(value)
		: undefined
	if (mapped) {
		return keep(
			scope,
			mapped.modified
				? finalize_later(mapped)
				: value
		)
	}
	const state = state_of(value)
	if (state) {
		if (state.scope !== scope) {
			if (scope.track) scope.shared = true
			return value
		}
		if (scope.track) place(state)
		return keep(scope, finalize_later(state))
	}
	const kind = container_kind(value)
	if (!kind) return value
	const seen = scope.seen ??= new Map()
	const known = seen.get(
		/** @type {Draftable} */(value)/**/
	)
	if (known) {
		if (scope.track) scope.shared = true
		return known
	}
	const frozen = isFrozen(value)
	if (frozen && !scope.reaching?.has(value)) {
		/** @type {Set<unknown>} */
		const visited = new Set()
		if (!reaches_draft(value, scope, visited)) {
			for (const item of visited) seen.set(
				/** @type {Draftable} */(item)/**/,
				/** @type {Draftable} */(item)/**/
			)
			return value
		}
	}
	const target = /** @type {Draftable} */(frozen
		? kind == "Array"
			? setPrototypeOf(
				copy_items(
					/** @type {unknown[]} */(value)/**/,
					sparse_indices(
						/** @type {unknown[]} */(value)/**/
					)
				),
				getPrototypeOf(value)
			)
			: own_properties(
				kind == "Map"
					? setPrototypeOf(
						new Map(
							map_entries.call(
								/** @type {Map<unknown, unknown>} */(value)/**/
							)
						),
						getPrototypeOf(value)
					)
					: kind == "Set"
						? setPrototypeOf(
							new Set(
								set_values.call(
									/** @type {Set<unknown>} */(value)/**/
								)
							),
							getPrototypeOf(value)
						)
						: create(getPrototypeOf(value)),
				value
			)
		: value)/**/
	seen.set(
		/** @type {Draftable} */(value)/**/,
		target
	)
	if (scope.depth > 200) {
		later(
			scope,
			() => resolve_items(value, target, kind, scope)
		)
	} else {
		resolve_items(value, target, kind, scope)
	}
	return target
}
/**
 * @param {unknown} value
 * @param {Draftable} target
 * @param {DraftState["kind"]} kind
 * @param {DraftScope} scope
 * @returns {void}
 */
function resolve_items(value, target, kind, scope) {
	scope.depth++
	switch (kind) {
	case "Array": {
		const array = /** @type {unknown[]} */(value)/**/
		const indices = sparse_indices(array)
		const length = indices
			? indices.length
			: array.length
		for (let k = 0; k < length; k++) {
			const i = indices
				? /** @type {number} */(indices[k])/**/
				: k
			const item = array[i]
			if (typeof item == "object" && item !== null) {
				const resolved = resolve(item, scope)
				if (resolved !== item) /** @type {unknown[]} */(target)/**/[i] = resolved
			}
		}
		break
	}
	case "Map": {
		let changed = false
		const entries = [
			...map_entries.call(
				/** @type {Map<unknown, unknown>} */(value)/**/
			)
		].map(
			([ key, item ]) => {
				const next = [
					resolve(key, scope),
					resolve(item, scope)
				]
				if (next[0] !== key || next[1] !== item) changed = true
				return next
			}
		)
		if (changed) {
			const map = /** @type {Map<unknown, unknown>} */(target)/**/
			map_clear.call(map)
			for (const [ key, item ] of entries) map_write.call(map, key, item)
		}
		break
	}
	case "Object":
		for (const key of ownKeys(
			/** @type {Record<PropertyKey, unknown>} */(value)/**/
		)) {
			const item = /** @type {Record<PropertyKey, unknown>} */(value)/**/[key]
			if (typeof item == "object" && item !== null) {
				const resolved = resolve(item, scope)
				if (resolved !== item) replace_own(target, key, resolved)
			}
		}
		break
	case "Set": {
		let changed = false
		const items = [
			...set_values.call(
				/** @type {Set<unknown>} */(value)/**/
			)
		].map(
			item => {
				const next = resolve(item, scope)
				if (next !== item) changed = true
				return next
			}
		)
		if (changed) {
			const set = /** @type {Set<unknown>} */(target)/**/
			set_clear.call(set)
			for (const item of items) set_add.call(set, item)
		}
	}
	}
	scope.depth--
	if (target !== value) freeze(target)
}
/**
 * @param {DraftState<SetDraft>} state
 * @param {unknown} value
 * @returns {boolean}
 */
function set_has(state, value) {
	const copy = state.copy
	if (!copy) return base_has(state, value)
	const key = member_key(state, value)
	if (set_contains.call(copy, key)) return true
	const draft = state.members?.get(key)
	return draft !== undefined && set_contains.call(copy, draft)
}
/**
 * @param {DraftState<SetDraft>} state
 * @param {unknown} value
 * @returns {unknown}
 */
function set_key(state, value) {
	if (typeof value != "object" || value === null || set_has(state, value)) return value
	const original = original_draft_base(state.scope, value)
	return original !== value && set_has(state, original)
		? original
		: value
}
const set_methods = {
	/**
	 * @this {SetDraft}
	 * @returns {IterableIterator<unknown>}
	 */
	[Symbol.iterator]() {
		return this.values()
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} value
	 * @returns {SetDraft}
	 */
	add(value) {
		const state = draft_of(this)
		if (!set_has(state, set_key(state, value))) {
			prepare(state)
			mark(state)
			const members = state.members
			const kind = members && base_has(state, value)
				? draft_kind(value)
				: undefined
			const added = members && kind
				? state.scope.graph
					? draft_for(value, kind, state)
					: create_draft(
						/** @type {Draftable} */(value)/**/,
						kind,
						state,
						state.scope
					)
				: value
			if (members && kind) {
				members.set(value, added)
				state.scope.bases?.add(value)
			}
			set_add.call(state.copy, added)
		}
		return this
	},
	/**
	 * @this {SetDraft}
	 * @returns {void}
	 */
	clear() {
		const state = draft_of(this)
		if (!size_of(state)) return
		prepare(state)
		mark(state)
		set_clear.call(state.copy)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} member
	 * @returns {boolean}
	 */
	delete(member) {
		const state = draft_of(this)
		const value = set_key(state, member)
		if (!set_has(state, value)) return false
		prepare(state)
		mark(state)
		const key = member_key(state, value)
		if (set_remove.call(state.copy, key)) return true
		const drafted = state.members?.get(key)
		if (state.scope.track) leave(state, drafted, key)
		return set_remove.call(state.copy, drafted)
	},
	/**
	 * @this {SetDraft}
	 * @returns {IterableIterator<[ unknown, unknown ]>}
	 */
	* entries() {
		for (const value of this.values()) yield [ value, value ]
	},
	/**
	 * @this {SetDraft}
	 * @param {(value: unknown, key: unknown, set: SetDraft) => void} callback
	 * @param {unknown} [this_arg]
	 * @returns {void}
	 */
	forEach(callback, this_arg) {
		for (const value of this.values()) callback.call(this_arg, value, value, this)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} value
	 * @returns {boolean}
	 */
	has(value) {
		const state = draft_of(this)
		return set_has(state, set_key(state, value))
	},
	/**
	 * @this {SetDraft}
	 * @returns {IterableIterator<unknown>}
	 */
	keys() {
		return this.values()
	},
	/**
	 * @this {SetDraft}
	 * @returns {IterableIterator<unknown>}
	 */
	values() {
		return set_values.call(draft_members(draft_of(this)))
	}
}
/**
 * @param {Record<PropertyKey, unknown>} object
 * @param {PropertyKey} key
 * @param {unknown} value
 * @returns {void}
 */
function set_own(object, key, value) {
	if (key === "__proto__") {
		defineProperty(
			object,
			key,
			{
				configurable: true,
				enumerable: true,
				value,
				writable: true
			}
		)
	} else {
		object[key] = value
	}
}
const set_readers = {
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {Set<unknown>}
	 */
	difference(other) {
		return read_set(this, "difference", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {Set<unknown>}
	 */
	intersection(other) {
		return read_set(this, "intersection", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {boolean}
	 */
	isDisjointFrom(other) {
		return read_set(this, "isDisjointFrom", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {boolean}
	 */
	isSubsetOf(other) {
		return read_set(this, "isSubsetOf", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {boolean}
	 */
	isSupersetOf(other) {
		return read_set(this, "isSupersetOf", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {Set<unknown>}
	 */
	symmetricDifference(other) {
		return read_set(this, "symmetricDifference", other)
	},
	/**
	 * @this {SetDraft}
	 * @param {unknown} other
	 * @returns {Set<unknown>}
	 */
	union(other) {
		return read_set(this, "union", other)
	}
}
/**
 * @param {DraftState} state
 * @returns {number}
 */
function size_of(state) {
	const source = /** @type {Map<unknown, unknown> | Set<unknown>} */(/** @type {unknown} */(state.copy ?? state.base))/**/
	return state.nested && !state.copy
		? source.size
		: /** @type {number} */((state.kind == "Map"
			? map_size
			: set_size).call(source))/**/
}
/**
 * @param {DraftState} state
 * @param {unknown} key
 * @returns {void}
 */
function touch(state, key) {
	if (state.touched) {
		state.touched.add(key)
	} else {
		state.touched = new Set([ key ])
	}
}
/**
 * @param {DraftState} state
 * @param {unknown} child
 * @param {unknown} slot
 * @param {number} type
 * @returns {boolean}
 */
function unchanged(state, child, slot, type) {
	const moved = state_of(child)
	const original = moved?.scope === state.scope
		? moved.base
		: child
	switch (type) {
	case 1:
		return moved === undefined && base_has(state, child)
	case 2:
		return base_has(state, original)
	default:
		if (state.kind == "Map" && type == 0) return base_has(state, slot) && base_get(state, slot) === original
		return has_own.call(
			state.base,
			/** @type {PropertyKey} */(slot)/**/
		) && /** @type {Record<PropertyKey, unknown>} */(state.base)/**/[/** @type {PropertyKey} */(slot)/**/] === original
	}
}
/**
 * @param {unknown} result
 * @returns {unknown}
 */
function undrafted(result) {
	if (result === undefined) throw new TypeError(
		"deepUpdate drafts only plain objects, arrays, Map and Set; a recipe for any other value, such as a class instance, Date or primitive, must return the next value"
	)
	return result
}
/**
 * @param {unknown} value
 * @param {(draft: unknown) => unknown} recipe
 * @param {boolean} paths
 * @param {boolean} graph
 * @returns {unknown}
 */
export function update(value, recipe, paths, graph) {
	const kind = draft_kind(value)
	if (!kind) {
		const result = recipe(value)
		return result instanceof Promise
			? result.then(undrafted)
			: undrafted(result)
	}
	/** @type {DraftScope} */
	const scope = {
		bases: undefined,
		depth: 0,
		revokes: []
	}
	const known = value === recent.result
		? recent.result_tree
		: value === recent.value
			? recent.value_tree
			: shapes.get(
				/** @type {WeakKey} */(value)/**/
			)
	const outer = state_of(value)
	const record = !outer && (!paths || known === true)
	if (graph || !paths && (known === false || outer?.scope.graph)) {
		scope.drafts = new Map()
		scope.graph = true
	} else if (known) {
		scope.track = true
	} else if (!paths) {
		scope.listed = []
		scope.track = !outer
	}
	drafts.active++
	const root = draft_of(
		create_draft(
			/** @type {Draftable} */(value)/**/,
			kind,
			undefined,
			scope
		)
	)
	let result
	try {
		result = recipe(root.proxy)
	} catch (error) {
		release(scope)
		throw error
	}
	return result instanceof Promise
		? result.then(
			next => complete(root, next, known, record),
			error => {
				release(scope)
				throw error
			}
		)
		: complete(root, result, known, record)
}
/**
/**
 * Create the next version of a value by changing a draft of it, like writing plain mutations.
 * Plain objects, arrays, Map and Set are drafted on access; only changed paths are copied
 * and everything else is shared with the original, whose values never change.
 * With `{ graph: true }`, an object reached through several paths has one draft, and a changed object is
 * copied once and replaced wherever a plain object, array, Map or Set holds it, so shared and circular references keep their shape;
 * without it, sharing reached only through paths the recipe never reads may split.
 * Returns the original value itself when nothing changed. When the original was frozen, changed objects
 * stay frozen and new objects added to them are deeply frozen in place, so copy an object you will change later;
 * objects of the original are never frozen, wherever the recipe moves them.
 * The recipe may return a new value instead of changing the draft, or return a Promise. A value that cannot be drafted,
 * such as a class instance, Date or primitive, is passed as it is, and its recipe must return the next value.
 * Apply changes listed by `deepDiff` with `deepPatch`.
 * @example deepUpdate(state, draft => { draft.user.name = "Kim" }) //=> next state
 */
export default /** @type {import("../public.js").DeepUpdate} */(
	/**
	 * @param {unknown} value
	 * @param {unknown} recipe
	 * @param {unknown} [options]
	 * @returns {unknown}
	 */
	function(value, recipe, options) {
		if (typeof recipe != "function") throw new TypeError(
			Array.isArray(recipe)
				? "deepUpdate takes a recipe function; apply changes listed by deepDiff with deepPatch"
				: "deepUpdate needs a recipe function"
		)
		if (options !== undefined) {
			const keys = typeof options == "object" && options !== null
				? Object.keys(options)
				: undefined
			const graph = /** @type {{ graph?: unknown }} */(options)/**/?.graph
			if (!keys || keys.some(key => key != "graph") || graph !== undefined && typeof graph != "boolean") throw new TypeError(
				"deepUpdate options must be an object with an optional boolean graph"
			)
		}
		return update(
			value,
			/** @type {(draft: unknown) => unknown} */(recipe)/**/,
			false,
			/** @type {{ graph?: boolean } | undefined} */(options)/**/?.graph === true
		)
	}
)/**/
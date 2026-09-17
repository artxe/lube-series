import type { Change } from "./public.js"
export type DiffItem =
	| { key: unknown, node: DiffNode }
	| { key: unknown, op: "add" | "remove" | "replace", self: boolean, value: unknown }
export type DiffNode = {
	a: WeakKey
	active: boolean
	b: WeakKey
	changed: boolean
	done: boolean
	items: DiffItem[]
	kind: "Array" | "Map" | "Object" | "Set"
	parents: DiffNode[]
}
export type DiffState = {
	active?: Map<WeakKey, Set<WeakKey>>
	changes: Change[]
	done?: Map<WeakKey, Map<WeakKey, boolean>>
	node?: DiffNode
	nodes?: DiffNode[]
	pairs?: Map<WeakKey, Map<WeakKey, DiffNode>>
	path: unknown[]
	trail: WeakKey[]
	visits: number
}
export type Draftable = Properties | Properties & (Map<unknown, unknown> | Set<unknown> | unknown[])
export type DraftScope = {
	bases?: Set<unknown> | undefined
	depth: number
	drafts?: Map<unknown, DraftState>
	found?: boolean
	frozen?: WeakKey[]
	graph?: boolean
	kept?: Set<unknown>
	listed?: DraftState[] | undefined
	pending?: (() => void)[]
	reaching?: Set<unknown>
	revokes: (() => void)[]
	seen?: Map<Draftable, Draftable>
	shared?: boolean
	track?: boolean
}
export type DraftState<T extends Draftable = Draftable> = Draftable extends T
	? DraftStateOf<"Array", Properties & unknown[]> | DraftStateOf<"Map", MapDraft> | DraftStateOf<"Object", Properties> | DraftStateOf<"Set", SetDraft>
	: T extends MapDraft
		? DraftStateOf<"Map", T>
		: T extends SetDraft
			? DraftStateOf<"Set", T>
			: T extends unknown[]
				? DraftStateOf<"Array", T>
				: DraftStateOf<"Object", T>
type DraftStateOf<K, T> = {
	away?: boolean
	base: T
	copy: T | undefined
	cursors?: Set<{ index: number, keys: Iterator<unknown> }> | undefined
	finalized: boolean
	kind: K
	members?: Map<unknown, unknown>
	modified: boolean
	nested: boolean
	parent: DraftState | undefined
	placed?: number
	proxy: T | undefined
	scope: DraftScope
	touched?: Set<unknown>
}
export type MapDraft = Properties & Map<unknown, unknown>
export type MergeState = {
	count: number
	pairs?: Map<WeakKey, Map<WeakKey, Record<PropertyKey, unknown>>>
	pending?: [ Record<PropertyKey, unknown>, Record<PropertyKey, unknown>, Record<PropertyKey, unknown> ][]
}
export type BisimGroup = {
	chosen?: Int32Array
	edges: { j: number, needs: BisimNode[] }[][]
	owner: BisimNode
	owners?: Int32Array
	seen?: Uint32Array
	stamp?: number
}
export type BisimNode = {
	a: WeakKey
	alive: boolean
	b: WeakKey
	groups: BisimGroup[]
	owned: BisimGroup[]
	parents: BisimNode[]
}
export type HashGroups = {
	strong: Map<number, Map<number, number[]>>
	values: unknown[]
	weak: Map<number, number[]>
}
export type Memo = {
	assumed: number
	attempts: number
	budget: number
	collect?: WeakKey[]
	depth: number
	matched: number
	pairs?: Map<WeakKey, WeakKey>
	pending?: WeakKey[] | undefined
	proven?: Map<WeakKey, Set<WeakKey>>
	tentative: number
	trail?: (WeakKey | undefined)[]
	unequal?: Map<WeakKey, Set<WeakKey>>
}
type Properties = Record<PropertyKey, unknown>
export type Prototype = Exclude<WeakKey, symbol>
export type SetDraft = Properties & Set<unknown>
export type SnapshotNode = {
	base: unknown
	ctx: DraftScope | undefined
	kind: DraftState["kind"]
	original: Prototype
	parents: SnapshotNode[]
	seed: boolean
	seen: boolean
	source: Prototype
}
export type TypedArrayName = "BigInt64Array" | "BigUint64Array" | "Float16Array" | "Float32Array" | "Float64Array" | "Int16Array" | "Int32Array" | "Int8Array" | "Uint16Array" | "Uint32Array" | "Uint8Array" | "Uint8ClampedArray"
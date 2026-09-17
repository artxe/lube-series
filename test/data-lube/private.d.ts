export type Chain = {
	i: number
	next: Chain | { value: number }
	set: Set<number>
}
export type Dept = {
	children: Dept[]
	name: string
	parent: Dept | null
}
export type Kind = "arr" | "date" | "fn" | "map" | "obj" | "part" | "prim" | "set" | "tag"
export type Rand = {
	chance: (p: number) => boolean
	int: (n: number) => number
	pick: <T>(items: readonly T[]) => T
	weighted: <T>(items: readonly (readonly [ T, number ])[]) => T
}
export type GenOptions = {
	cycles: boolean
	freeze: "deep" | "none" | "partial" | "shallow"
	holes: boolean
	shared: boolean
	size: number
}
export type Spec =
	| { at: number, t: "date" }
	| { entries: [ string, Spec ][], t: "obj" }
	| { entries: [ unknown, Spec ][], t: "map" }
	| { items: Spec[], t: "arr" | "set" }
	| { name: string, t: "part" }
	| { path: number, t: "ref" }
	| { t: "prim", v: unknown }
export type Seg = { i: number, t: "a" } | { k: string, t: "o" } | { k: unknown, t: "m" } | { n: number, t: "s" }
export type Val = { path: Seg[], spec: Spec, t: "merge" } | { path: Seg[], t: "ref" } | { refs: Seg[][], spec: Spec, t: "fresh" } | { t: "prim", v: unknown }
export type Op =
	| { args: Val[], kind: "push" | "unshift", path: Seg[] }
	| { i: number, kind: "a-delete" | "splice", path: Seg[] }
	| { i: number, kind: "a-set", path: Seg[], v: Val }
	| { k: string, kind: "o-delete", path: Seg[] }
	| { k: string, kind: "o-set", path: Seg[], v: Val }
	| { k: unknown, kind: "m-delete", path: Seg[] }
	| { k: unknown, kind: "m-set", path: Seg[], v: Val }
	| { kind: "check", mode: "copy" | "diff" | "equal" | "merge", path: Seg[], path2: Seg[] }
	| { kind: "clear" | "pop" | "reverse", path: Seg[] }
	| { kind: "length", n: number, path: Seg[] }
	| { kind: "s-add" | "s-delete", path: Seg[], v: Val }
export type CaseConfig = {
	async: boolean
	chain: boolean
	gen: GenOptions
	graph: boolean
	returns: "draft" | "mutate" | "mutate+return" | "new"
}
export type Failure = { detail: string, kind: string, text: string }
export type Iso = { fail?: string, pairs: Map<unknown, unknown> }
export type RefClone = { clone_to_orig: Map<unknown, unknown>, root: unknown }
export type Side = { fresh: [ unknown, unknown ][], root: unknown }
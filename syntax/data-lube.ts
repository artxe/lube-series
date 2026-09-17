import {
	type Change,
	type DeepEqual,
	type DeepReadonly,
	type DeepUpdate,
	type DeepUpdateOptions,
	type Draft,
	type Merge,
	deepCopy,
	deepDiff,
	deepEqual,
	deepFreeze,
	deepMerge,
	deepPatch,
	deepUpdate
} from "data-lube"
const origin = {
	a: [ 1, 2 ],
	n: null,
	o: { k: "v" },
	s: "string",
	u: void 0
} as const
var copied: typeof origin = deepCopy(origin)
var clone: unknown = JSON.parse(JSON.stringify(copied))
if (deepEqual(origin, clone)) {
	clone.a[0].toFixed()
}
// @ts-expect-error: unknown until deepEqual narrows it
clone.a
var parsed: { a: number[] } = JSON.parse(JSON.stringify(copied))
parsed.a = []
var freezed = deepFreeze(parsed)
deepCopy(freezed)
const frozen = deepFreeze(
	{
		bytes: new Uint8Array(1),
		date: new Date(),
		list: [ { n: 1 } ],
		map: new Map([ [ "k", { v: 1 } ] ]),
		method: (n: number) => n,
		promise: Promise.resolve(1),
		set: new Set([ { v: 1 } ]),
		tuple: [ 1, "a" ] as [number, string]
	}
)
frozen.bytes[0] = 1
frozen.date.getTime()
frozen.list[0]?.n.toFixed()
frozen.map.get("k")?.v.toFixed()
frozen.method(1)
frozen.promise.then(n => n.toFixed())
frozen.tuple[1].toUpperCase()
for (const item of frozen.set) item.v.toFixed()
// @ts-expect-error: read-only property
frozen.list[0].n = 2
// @ts-expect-error: read-only array
frozen.list.push({ n: 2 })
// @ts-expect-error: read-only map
frozen.map.set("k", { v: 2 })
// @ts-expect-error: read-only property
frozen.map.get("k")!.v = 2
// @ts-expect-error: read-only set
frozen.set.add({ v: 2 })
// @ts-expect-error: read-only tuple
frozen.tuple[0] = 2
const readonly: DeepReadonly<{ nested: { list: number[] } }> = deepFreeze({ nested: { list: [ 1 ] } })
// @ts-expect-error: read-only array
readonly.nested.list.push(2)
const mutable: { nested: { list: number[] } } = deepCopy({ nested: { list: [ 1 ] } })
mutable.nested.list.push(2)
const defaults = {
	retry: { count: 1, delay: 100 },
	tags: [ "a" ],
	url: ""
}
const merged = deepMerge(
	defaults,
	{ retry: { count: 3 } },
	undefined
)
merged.retry.count.toFixed()
merged.retry.delay.toFixed()
merged.tags.map(tag => tag.toUpperCase())
merged.url.trim()
// @ts-expect-error: unknown key
merged.missing
const overrides: { retry?: { delay: number }, url: number } = { url: 1 }
const overridden = deepMerge(defaults, overrides)
overridden.retry.count.toFixed()
overridden.url.toFixed()
const cleared: { retry?: { delay: number } | undefined } = { retry: undefined }
const reset = deepMerge(defaults, cleared)
// @ts-expect-error: an undefined property overrides
reset.retry.count.toFixed()
reset.retry?.count.toFixed()
const state = deepFreeze(
	{
		list: [ { done: false, id: 1 } ],
		map: new Map([ [ "a", { value: 1 } ] ]),
		set: new Set([ 1 ])
	}
)
const next: typeof state = deepUpdate(
	state,
	draft => {
		draft.list.push({ done: true, id: 2 })
		draft.list[0]!.done = true
		draft.map.get("a")!.value = 2
		draft.set.add(2)
	}
)
const later: Promise<typeof state> = deepUpdate(
	state,
	async draft => {
		draft.list.length = 0
	}
)
deepUpdate(1, value => value + 1).toFixed()
deepUpdate(
	state,
	draft => ({ ...draft, list: [] })
)
deepUpdate(
	state,
	draft => {
		// @ts-expect-error: wrong item type
		draft.list.push("x")
	}
)
const changes: Change[] = deepDiff(state, next)
const patched: typeof state = deepPatch(state, changes)
patched.list.length
deepPatch(1, [] as readonly Change[]).toFixed()
// @ts-expect-error: changes are a list
deepPatch(state, {})
// @ts-expect-error: changes apply with deepPatch
deepUpdate(state, changes)
later.then(value => value.list)
const update: DeepUpdate = deepUpdate
update(state, () => {}).list
// @ts-expect-error: a recipe is a function
update(state, {})
const draft: Draft<DeepReadonly<{ items: number[] }>> = { items: [ 1 ] }
draft.items.push(2)
const symbol = Symbol("symbol")
const spread_symbol = deepMerge(
	{ [symbol]: { a: 1 } },
	{ [symbol]: { b: 1 } }
)
spread_symbol[symbol].b.toFixed()
// @ts-expect-error: symbol keys are not merged
spread_symbol[symbol].a
type Equal<X, Y> = (<G>() => G extends X ? 1 : 2) extends (<G>() => G extends Y ? 1 : 2)
	? true
	: false
class Point {
	x = 0
	move(dx: number, dy: number): Point {
		this.x += dx + dy
		return this
	}
}
type Box = { label: string }
const kept: [
	Equal<DeepReadonly<(point: Point, scale: number) => Box>, (point: Point, scale: number) => Box>,
	Equal<DeepReadonly<Promise<Point>>, Promise<Point>>,
	Equal<DeepReadonly<WeakMap<Point, Box>>, WeakMap<Point, Box>>,
	Equal<DeepReadonly<WeakSet<Point>>, WeakSet<Point>>,
	Equal<Draft<(point: Point, scale: number) => Box>, (point: Point, scale: number) => Box>,
	Equal<Draft<Promise<Point>>, Promise<Point>>,
	Equal<Draft<WeakMap<Point, Box>>, WeakMap<Point, Box>>,
	Equal<Draft<WeakSet<Point>>, WeakSet<Point>>
] = [
	true,
	true,
	true,
	true,
	true,
	true,
	true,
	true
]
const mapped: [
	Equal<DeepReadonly<Map<string, Box>>, ReadonlyMap<string, { readonly label: string }>>,
	Equal<DeepReadonly<Set<Box>>, ReadonlySet<{ readonly label: string }>>,
	Equal<DeepReadonly<Point>, { readonly move: (dx: number, dy: number) => Point, readonly x: number }>,
	Equal<Draft<ReadonlyMap<string, Readonly<Box>>>, Map<string, Box>>,
	Equal<Draft<ReadonlySet<Readonly<Box>>>, Set<Box>>,
	Equal<Draft<Readonly<Point>>, { move: (dx: number, dy: number) => Point, x: number }>
] = [ true, true, true, true, true, true ]
const opaque: [
	Equal<DeepReadonly<unknown>, unknown>,
	Equal<Draft<unknown>, unknown>,
	Equal<DeepReadonly<Record<string, unknown>>, { readonly [key: string]: unknown }>
] = [ true, true, true ]
const shapes = deepFreeze(
	{
		cache: new WeakMap<Point, Box>(),
		load: Promise.resolve(new Point()),
		lookup: new Map([ [ "p", { label: "p" } ] ]),
		origin: new Point(),
		scale: (point: Point, by: number) => point.x * by,
		seen: new WeakSet<Point>()
	}
)
shapes.cache.set(new Point(), { label: "a" })
shapes.load.then(point => point.move(1, 1))
shapes.scale(new Point(), 2).toFixed()
shapes.seen.add(new Point())
// @ts-expect-error: read-only property
shapes.origin.x = 1
// @ts-expect-error: read-only map
shapes.lookup.set("q", { label: "q" })
// @ts-expect-error: read-only property
shapes.lookup.get("p")!.label = "q"
deepUpdate(
	shapes,
	editable => {
		editable.cache.set(new Point(), { label: "b" })
		editable.lookup.set("q", { label: "q" })
		editable.origin.x = 2
		editable.seen.add(new Point())
	}
)
const replaced = deepMerge(
	{
		at: new Point(),
		cache: new WeakMap<Point, number>(),
		load: Promise.resolve(1),
		run: (n: number) => n
	},
	{
		cache: new WeakMap<Point, string>(),
		load: Promise.resolve("a"),
		run: (text: string, count: number) => text.repeat(count)
	}
)
replaced.at.move(1, 1)
replaced.cache.get(new Point())?.toUpperCase()
replaced.load.then(text => text.toUpperCase())
replaced.run("a", 2).toUpperCase()
// @ts-expect-error: functions are replaced, not merged
replaced.run(1)
kept.length
mapped.length
opaque.length
type Id = string & { readonly brand: "Id" }
const branded = deepMerge(
	{ id: { a: 1 } },
	{ id: "x" as Id }
)
const branded_id: Id = branded.id
// @ts-expect-error: a branded string replaces the object, as at runtime
branded.id.a
const unbranded = deepMerge(
	{ id: "x" as Id },
	{ id: { a: 1 } }
)
unbranded.id.a.toFixed()
branded_id.length
class Member {
	#role = "owner"
	name = "kim"
	get role() {
		return this.#role
	}
}
function payslip(member: Member): string {
	return member.role
}
deepUpdate(
	{ list: [ 1 ], owner: new Member() },
	team => {
		team.list.push(2)
		payslip(team.owner)
		team.owner = new Member()
	}
)
const instances: [
	Equal<DeepReadonly<Member>, Member>,
	Equal<DeepReadonly<{ owner: Member }>, { readonly owner: Member }>,
	Equal<Draft<Member>, Member>,
	Equal<Draft<{ owner: Member }>, { owner: Member }>,
	Equal<Draft<DeepReadonly<{ owner: Member }>>, { owner: Member }>
] = [ true, true, true, true, true ]
instances.length
type Roster = { owner: Member, team: Member[] }
declare const roster_draft: Draft<Roster>
const roster_state: Roster = roster_draft
roster_state.team.length
const roster = deepFreeze(
	{
		owner: new Member(),
		team: [ new Member() ]
	}
)
const roster_owner: Member = roster.owner
roster_owner.role.toUpperCase()
deepUpdate(
	roster,
	edit => {
		payslip(edit.owner)
		payslip(edit.team[0]!)
		edit.owner.role.toUpperCase()
		edit.owner = new Member()
		edit.team.push(new Member())
		const whole: Roster = edit
		whole.team.length
	}
)
const roster_copy = deepCopy(roster) as Draft<typeof roster>
roster_copy.team.push(new Member())
payslip(roster_copy.owner)
const skipped: typeof state = deepUpdate(
	state,
	todo => {
		if (todo.list.length) return undefined
		todo.list.push({ done: true, id: 3 })
	}
)
skipped.list
const edited = deepCopy(state) as Draft<typeof state>
edited.list.push({ done: true, id: 3 })
edited.map.set("b", { value: 2 })
type Policy = { cap: number, version: number }
const policy: Policy = { cap: 1, version: 1 }
deepUpdate(
	policy,
	policy_draft => {
		if (!deepEqual(policy, policy_draft)) policy_draft.version++
		if (deepEqual(policy_draft, policy)) policy.cap.toFixed()
		else policy.cap.toFixed()
	}
)
const policy_input: unknown = JSON.parse("{}")
if (deepEqual(policy, policy_input)) {
	policy_input.cap.toFixed()
} else {
	// @ts-expect-error: unknown unless deepEqual returned true
	policy_input.cap.toFixed()
}
const either: number | string = JSON.parse("1")
if (deepEqual("a", either)) {
	either.toUpperCase()
} else {
	// @ts-expect-error: a string that is not equal may still be another string
	either.toFixed()
}
const equal: DeepEqual = deepEqual
equal(policy, policy).valueOf()
type Leave = { annual: number, carry_over?: number }
const base_leave: Leave = { annual: 15 }
const over_leave: Leave = { annual: 18, carry_over: 2 }
const merged_leave: Leave = deepMerge(base_leave, over_leave)
merged_leave.annual.toFixed()
const optional: [
	Equal<Merge<[ { a?: number }, { b?: string } ]>, { a?: number, b?: string }>,
	Equal<Merge<[ { a: number }, { a?: number } ]>, { a: number }>,
	Equal<Merge<[ { a?: number }, { a: number } ]>, { a: number }>,
	Equal<Merge<[ Leave, Leave ]>, { annual: number, carry_over?: number }>
] = [ true, true, true, true ]
optional.length
const graph_options: DeepUpdateOptions = { graph: true }
const graph_next: typeof state = deepUpdate(
	state,
	graph_draft => {
		graph_draft.list.push({ done: true, id: 9 })
	},
	graph_options
)
const graph_later: Promise<typeof state> = deepUpdate(
	state,
	async graph_draft => {
		graph_draft.list.length = 0
	},
	{ graph: true }
)
// @ts-expect-error: unknown option
deepUpdate(state, () => {}, { graf: true })
// @ts-expect-error: deepPatch takes no options
deepPatch(state, changes, { graph: true })
graph_next.list.length
graph_later.then(value => value.list)
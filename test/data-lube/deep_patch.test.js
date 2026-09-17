import { deepDiff, deepFreeze, deepPatch } from "data-lube"
import { assert, describe, it } from "vitest"
describe(
	"deep_patch",
	() => {
		it(
			"applied changes",
			() => {
				const base = {
					list: [ 1, 2 ],
					map: new Map([ [ "a", { value: 1 } ] ]),
					object: { a: 1, b: 2 },
					set: new Set([ 1 ])
				}
				const next = deepPatch(
					base,
					[
						{
							op: "remove",
							path: [ "object", "a" ]
						},
						{
							op: "replace",
							path: [ "map", "a", "value" ],
							value: 2
						},
						{
							op: "remove",
							path: [ "list", 0 ]
						},
						{
							op: "add",
							path: [ "set", 2 ],
							value: 2
						},
						{ op: "remove", path: [ "set", 1 ] }
					]
				)
				assert.deepEqual(
					/** @type {{ a?: number, b: number }} */(next.object)/**/,
					{ b: 2 }
				)
				assert.equal(next.map.get("a")?.value, 2)
				assert.deepEqual(next.list, [ 2 ])
				assert.deepEqual([ ...next.set ], [ 2 ])
				assert.throws(
					() => deepPatch(
						base,
						[ { op: "remove", path: [] } ]
					),
					RangeError
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: /** @type {never} */("move")/**/,
								path: [ "list", 0 ],
								value: 1
							}
						]
					),
					TypeError
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "add",
								path: [ "set", 1, "x" ],
								value: 1
							}
						]
					),
					TypeError
				)
				assert.throws(
					() => deepPatch(
						{ date: new Date() },
						[
							{
								op: "add",
								path: [ "date", "x" ],
								value: 1
							}
						]
					),
					TypeError
				)
				assert.deepEqual(base.object, { a: 1, b: 2 })
			}
		)
		it(
			"applied changes to missing paths",
			() => {
				const base = {
					list: [ "a", "b" ],
					map: new Map([ [ "a", { value: 1 } ] ]),
					object: /** @type {Record<string, unknown>} */({ a: 1, nested: { b: 2 } })/**/,
					set: new Set([ 1 ])
				}
				/** @type {import("data-lube").Change[][]} */
				const missing = [
					[
						{
							op: "remove",
							path: [ "object", "zzz" ]
						}
					],
					[
						{
							op: "replace",
							path: [ "object", "zzz" ],
							value: 1
						}
					],
					[
						{
							op: "replace",
							path: [ "object", "x", "y" ],
							value: 1
						}
					],
					[
						{
							op: "add",
							path: [ "object", "x", "y" ],
							value: 1
						}
					],
					[
						{
							op: "remove",
							path: [ "list", 2 ]
						}
					],
					[
						{
							op: "replace",
							path: [ "list", 2 ],
							value: "c"
						}
					],
					[
						{
							op: "add",
							path: [ "list", 3 ],
							value: "c"
						}
					],
					[
						{
							op: "add",
							path: [ "list", -1 ],
							value: "c"
						}
					],
					[
						{
							op: "replace",
							path: [ "list", "1" ],
							value: "c"
						}
					],
					[
						{
							op: "replace",
							path: [ "list", 0.5 ],
							value: "c"
						}
					],
					[
						{
							op: "replace",
							path: [ "list", 5, "x" ],
							value: "c"
						}
					],
					[
						{
							op: "remove",
							path: [ "map", "b" ]
						}
					],
					[
						{
							op: "replace",
							path: [ "map", "b" ],
							value: 1
						}
					],
					[
						{
							op: "replace",
							path: [ "map", "b", "value" ],
							value: 1
						}
					],
					[
						{ op: "remove", path: [ "set", 2 ] }
					],
					[
						{
							op: "add",
							path: [ "missing", "x" ],
							value: 1
						}
					],
					[
						{
							op: "add",
							path: [ "object", "toString", "x" ],
							value: 1
						}
					]
				]
				for (const changes of missing) {
					assert.throws(
						() => deepPatch(base, changes),
						RangeError,
						/path/
					)
				}
				const added = deepPatch(
					base,
					[
						{
							op: "add",
							path: [ "list", 2 ],
							value: "c"
						},
						{
							op: "add",
							path: [ "map", "b" ],
							value: { value: 2 }
						},
						{
							op: "add",
							path: [ "object", "a" ],
							value: 3
						}
					]
				)
				assert.deepEqual(added.list, [ "a", "b", "c" ])
				assert.equal(added.map.get("b")?.value, 2)
				assert.equal(added.object["a"], 3)
				const key = { room: 1 }
				const wire = /** @type {import("data-lube").Change[]} */(JSON.parse(
					JSON.stringify(
						deepDiff(
							new Map([ [ key, "a" ] ]),
							new Map([ [ { room: 1 }, "b" ] ])
						)
					)
				))/**/
				assert.throws(
					() => deepPatch(new Map([ [ key, "a" ] ]), wire),
					RangeError
				)
				const members = new Set([ { id: 1 } ])
				const removed = /** @type {import("data-lube").Change[]} */(JSON.parse(
					JSON.stringify(deepDiff(members, new Set()))
				))/**/
				assert.throws(
					() => deepPatch(members, removed),
					RangeError
				)
			}
		)
		it(
			"applied changes under a frozen parent",
			() => {
				const client = deepFreeze(
					/** @type {{ list: { hosts?: string[], id: number }[] }} */({ list: [ { id: 1 } ] })/**/
				)
				const server = {
					list: [
						{ id: 1 },
						{ hosts: [ "m1" ], id: 2 }
					]
				}
				const next = deepPatch(client, deepDiff(client, server))
				assert.deepEqual(next, server)
				assert.isTrue(Object.isFrozen(next.list[1]))
				assert.isTrue(
					Object.isFrozen(next.list[1]?.hosts)
				)
				assert.isFalse(
					Object.isFrozen(server.list[1])
				)
				assert.isFalse(
					Object.isFrozen(server.list[1]?.hosts)
				)
				server.list[1]?.hosts?.push("m2")
				const shared = { id: 3 }
				const kept = deepFreeze({ id: 4 })
				const pair = deepPatch(
					deepFreeze(
						/** @type {{ a?: { id: number }, b?: { id: number }, c?: { id: number } }} */({})/**/
					),
					[
						{
							op: "add",
							path: [ "a" ],
							value: shared
						},
						{
							op: "add",
							path: [ "b" ],
							value: shared
						},
						{
							op: "add",
							path: [ "c" ],
							value: kept
						}
					]
				)
				assert.equal(pair.a, pair.b)
				assert.notEqual(pair.a, shared)
				assert.isTrue(Object.isFrozen(pair.a))
				assert.isFalse(Object.isFrozen(shared))
				assert.equal(pair.c, kept)
				const room = { id: 6 }
				const keyed = deepPatch(
					deepFreeze(
						{
							map: /** @type {Map<{ id: number }, number>} */(new Map())/**/
						}
					),
					[
						{
							op: "add",
							path: [ "map", room ],
							value: 1
						}
					]
				)
				const [ key ] = keyed.map.keys()
				assert.deepEqual(key, room)
				assert.isTrue(Object.isFrozen(key))
				assert.isFalse(Object.isFrozen(room))
				const loose = { id: 5 }
				const open = deepPatch(
					{
						list: /** @type {{ id: number }[]} */([])/**/
					},
					[
						{
							op: "add",
							path: [ "list", 0 ],
							value: loose
						}
					]
				)
				assert.equal(open.list[0], loose)
				assert.isFalse(Object.isFrozen(loose))
			}
		)
		it(
			"applied class instances under a frozen parent",
			() => {
				class Member {
					#role = "owner"
					name = "kim"
					get role() {
						return this.#role
					}
				}
				class Registry extends Map {
					#size = 1
					get count() {
						return this.#size
					}
				}
				const before = deepFreeze(
					/** @type {{ at?: Date, bytes?: Uint8Array, list: { member: Member }[], owner: Member | null, registry?: Registry }} */({ list: [], owner: null })/**/
				)
				const inner = new Member()
				const after = {
					at: new Date(1),
					bytes: new Uint8Array([ 1 ]),
					list: [ { member: inner } ],
					owner: new Member(),
					registry: new Registry([ [ "a", { id: 1 } ] ])
				}
				const next = deepPatch(before, deepDiff(before, after))
				assert.equal(next.owner, after.owner)
				assert.equal(next.owner?.role, "owner")
				assert.isTrue(Object.isFrozen(next.owner))
				assert.notEqual(next.list[0], after.list[0])
				assert.isFalse(Object.isFrozen(after.list[0]))
				assert.equal(next.list[0]?.member, inner)
				assert.equal(
					next.list[0]?.member.role,
					"owner"
				)
				assert.isTrue(Object.isFrozen(inner))
				assert.equal(next.registry, after.registry)
				assert.equal(
					/** @type {Registry | undefined} */(/** @type {unknown} */(next.registry))/**/?.count,
					1
				)
				assert.isTrue(
					Object.isFrozen(next.registry?.get("a"))
				)
				assert.notEqual(next.at, after.at)
				assert.equal(next.at?.getTime(), 1)
				assert.notEqual(next.bytes, after.bytes)
				assert.deepEqual(next.bytes, after.bytes)
				const keyed = deepPatch(
					deepFreeze(
						{
							map: /** @type {Map<Member, number>} */(new Map())/**/
						}
					),
					[
						{
							op: "add",
							path: [ "map", inner ],
							value: 1
						}
					]
				)
				assert.equal(
					[ ...keyed.map.keys() ][0],
					inner
				)
			}
		)
		it(
			"applied root replacements",
			() => {
				const shared = { id: 1 }
				const after = { list: [ 2 ], shared }
				const before = deepFreeze(
					/** @type {unknown} */([ 1 ])/**/
				)
				const next = /** @type {typeof after} */(deepPatch(before, deepDiff(before, after)))/**/
				assert.deepEqual(next, after)
				assert.notEqual(next, after)
				assert.isTrue(Object.isFrozen(next))
				assert.isTrue(Object.isFrozen(next.list))
				assert.isFalse(Object.isFrozen(after))
				assert.isFalse(Object.isFrozen(after.list))
				const pair = /** @type {{ other?: { id: number }, shared: { id: number } }} */(deepPatch(
					before,
					[
						{
							op: "replace",
							path: [],
							value: { shared }
						},
						{
							op: "add",
							path: [ "other" ],
							value: shared
						}
					]
				))/**/
				assert.equal(pair.other, pair.shared)
				assert.notEqual(pair.shared, shared)
				assert.isTrue(Object.isFrozen(pair.other))
				assert.isFalse(Object.isFrozen(shared))
				class Member {
					#role = "owner"
					get role() {
						return this.#role
					}
				}
				const member = new Member()
				const kept = /** @type {Member} */(deepPatch(
					before,
					[
						{
							op: "replace",
							path: [],
							value: member
						}
					]
				))/**/
				assert.equal(kept, member)
				assert.equal(kept.role, "owner")
				assert.isTrue(Object.isFrozen(member))
				const open = { list: [ 1 ] }
				assert.equal(
					deepPatch(
						/** @type {unknown} */([ 1 ])/**/,
						[
							{
								op: "replace",
								path: [],
								value: open
							}
						]
					),
					open
				)
				assert.isFalse(Object.isFrozen(open))
				assert.equal(
					deepPatch(
						/** @type {unknown} */(deepFreeze(new Date(0)))/**/,
						[
							{
								op: "replace",
								path: [],
								value: open
							}
						]
					),
					open
				)
				assert.isFalse(Object.isFrozen(open))
				assert.throws(
					() => deepPatch(
						before,
						[ { op: "remove", path: [] } ]
					),
					RangeError
				)
			}
		)
		it(
			"malformed changes name the change",
			() => {
				const base = {
					list: [ 1 ],
					m: new Map([ [ "v", 1 ] ])
				}
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "replace",
								path: [ "list", 0 ],
								value: 2
							},
							/** @type {never} */({
								op: "replace",
								path: "m.v",
								value: 2
							})/**/
						]
					),
					TypeError,
					"deepPatch change 1 has a path that is not an array"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "replace",
								path: [ "list", 0 ],
								value: 2
							},
							/** @type {never} */({ op: "move", path: [ "list", 0 ] })/**/
						]
					),
					TypeError,
					"deepPatch change 1 has an unknown op: move"
				)
				assert.throws(
					() => deepPatch(
						base,
						[ /** @type {never} */(null)/**/ ]
					),
					TypeError,
					"deepPatch change 0 is not an object"
				)
				assert.throws(
					() => deepPatch(
						base,
						/** @type {never} */("list")/**/
					),
					TypeError,
					"deepPatch needs an array of changes"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "add",
								path: [ "list", 1 ],
								value: 2
							},
							{ op: "remove", path: [] }
						]
					),
					RangeError,
					"deepPatch change 1 removes the root; replace it with undefined instead"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "add",
								path: [ "list", 0, "x" ],
								value: 2
							}
						]
					),
					TypeError,
					"deepPatch change 0 (\"add\" at [\"list\", 0, \"x\"]) has a path through a value that is not a plain object, array, Map or Set: segment 2 of 3"
				)
				assert.throws(
					() => deepPatch(
						new Date(0),
						[
							{ op: "add", path: [ "x" ], value: 1 }
						]
					),
					TypeError,
					"deepPatch change 0 (\"add\" at [\"x\"]) has a path through a value that is not a plain object, array, Map or Set: the root"
				)
				assert.throws(
					() => deepPatch(
						{ set: new Set([ 1 ]) },
						[
							{
								op: "replace",
								path: [ "set", 1, "x" ],
								value: 2
							}
						]
					),
					TypeError,
					"deepPatch change 0 (\"replace\" at [\"set\", 1, \"x\"]) has a path through a value that is not a plain object, array or Map: segment 1 of 3"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{ op: "remove", path: [ null ] }
						]
					),
					RangeError,
					"deepPatch change 0 (\"remove\" at [null]) has a path that does not exist: segment 1 of 1 is missing"
				)
				assert.deepEqual(base.list, [ 1 ])
			}
		)
		it(
			"missing paths name the change",
			() => {
				const base = {
					items: [ { qty: 1 } ],
					map: new Map([ [ "a", 1 ] ])
				}
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "replace",
								path: [ "items", 0, "qty" ],
								value: 2
							},
							{
								op: "add",
								path: [ "map", "b" ],
								value: 2
							},
							{
								op: "replace",
								path: [ "items", 5, "qty" ],
								value: 3
							}
						]
					),
					RangeError,
					"deepPatch change 2 (\"replace\" at [\"items\", 5, \"qty\"]) has a path that does not exist: segment 2 of 3 is missing"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "remove",
								path: [
									"map",
									{ id: 1 },
									new Map(),
									[ 1 ],
									Symbol("s"),
									10n,
									"x".repeat(50),
									() => 1,
									null
								]
							}
						]
					),
					RangeError,
					`deepPatch change 0 ("remove" at ["map", {…}, Map, […], Symbol(s), 10n, "${"x".repeat(29)}…", function, …]) has a path that does not exist: segment 2 of 9 is missing`
				)
				const { proxy, revoke } = Proxy.revocable({}, {})
				revoke()
				assert.throws(
					() => deepPatch(
						base,
						[
							{
								op: "remove",
								path: [ "map", proxy, Object.create({}) ]
							}
						]
					),
					RangeError,
					"deepPatch change 0 (\"remove\" at [\"map\", object, object]) has a path that does not exist: segment 2 of 3 is missing"
				)
				assert.throws(
					() => deepPatch(
						base,
						[
							{ op: "remove", path: [ "zzz" ] }
						]
					),
					RangeError,
					"deepPatch change 0 (\"remove\" at [\"zzz\"]) has a path that does not exist: segment 1 of 1 is missing"
				)
			}
		)
	}
)
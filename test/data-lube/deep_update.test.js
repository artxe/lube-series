/** @import { Dept } from "./private.js" */
import {
	deepCopy,
	deepDiff,
	deepEqual,
	deepFreeze,
	deepMerge,
	deepPatch,
	deepUpdate
} from "data-lube"
import { inspect, types } from "node:util"
import { assert, describe, it } from "vitest"
describe(
	"deep_update",
	() => {
		/**
		 * @returns {{
		 *   copy?: ReturnType<typeof create>["user"],
		 *   inner?: { user?: ReturnType<typeof create>["user"] },
		 *   list: [ { done: boolean, id: number }, ...{ done: boolean, id: number }[] ],
		 *   map: Map<string, { seen?: boolean, value: number }>,
		 *   missing?: number,
		 *   set: Set<{ done?: boolean, id: number }>,
		 *   user: { address: { city: string }, hidden?: number, missing?: number, name: string | undefined, self?: ReturnType<typeof create>["user"], tags?: string[] },
		 *   wrapper?: { list?: ({ city: string } | ReturnType<typeof create>["user"])[], map?: Map<{ city: string }, { done: boolean, id: number }[]>, self?: ReturnType<typeof create>["wrapper"], set?: Set<ReturnType<typeof create>["user"]>, user?: ReturnType<typeof create>["user"] }
		 * }}
		 */
		function create() {
			return {
				list: [
					{ done: false, id: 1 },
					{ done: false, id: 2 }
				],
				map: new Map(
					[
						[ "a", { value: 1 } ],
						[ "b", { value: 2 } ]
					]
				),
				set: new Set([ { id: 1 }, { id: 2 } ]),
				user: {
					address: { city: "Seoul" },
					name: "Kim"
				}
			}
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function has_proxy(value) {
			const seen = new Set()
			/**
			 * @param {unknown} item
			 * @returns {boolean}
			 */
			function visit(item) {
				if (!item || typeof item != "object" || seen.has(item)) return false
				if (types.isProxy(item)) return true
				seen.add(item)
				const children = item instanceof Map
					? [ ...item.keys(), ...item.values() ]
					: item instanceof Set
						? [ ...item ]
						: Object.values(item)
				return children.some(visit)
			}
			return visit(value)
		}
		it(
			"__proto__ key",
			() => {
				const next = deepUpdate(
					/** @type {{ nested: { __proto__?: { polluted: number }, polluted?: number } }} */({ nested: {} })/**/,
					draft => {
						draft.nested.__proto__ = { polluted: 1 }
					}
				)
				assert.equal(
					Object.getPrototypeOf(next.nested),
					Object.prototype
				)
				assert.deepEqual(
					Object.keys(next.nested),
					[ "__proto__" ]
				)
				assert.isUndefined(next.nested.polluted)
			}
		)
		it(
			"added objects are frozen in place without freezing the original",
			() => {
				class Node {
					/** @type {unknown} */
					owner
				}
				const node = new Node()
				const key = { k: 1 }
				const member = new Node()
				const state = Object.freeze(
					{
						list: Object.freeze(
							/** @type {unknown[]} */([])/**/
						),
						map: new Map([ [ key, 1 ] ]),
						node,
						other: { n: 1 },
						set: new Set([ member ])
					}
				)
				node.owner = state
				const next = deepUpdate(
					state,
					draft => {
						draft.list.push(
							{
								node: draft.node,
								other: draft.other
							}
						)
						for (const item of draft.map.keys()) draft.list.push(item)
						for (const item of draft.set) draft.list.push({ item })
					}
				)
				assert.isTrue(Object.isFrozen(next.list[0]))
				assert.isTrue(Object.isFrozen(next.list[2]))
				assert.equal(next.list[1], key)
				assert.isFalse(Object.isFrozen(node))
				assert.isFalse(Object.isFrozen(state.other))
				assert.isFalse(Object.isFrozen(key))
				assert.isFalse(Object.isFrozen(member))
				assert.isFalse(Object.isFrozen(state.map))
				/** @type {Record<string, unknown>} */
				const loose = state
				const root = deepUpdate(
					loose,
					draft => /** @type {Record<string, unknown>} */(draft["other"])/**/
				)
				assert.equal(root, state.other)
				assert.isFalse(Object.isFrozen(state.other))
				const wrapped = deepUpdate(
					loose,
					draft => ({
						node: draft["node"],
						other: draft["other"]
					})
				)
				assert.isTrue(Object.isFrozen(wrapped))
				assert.isFalse(Object.isFrozen(node))
				assert.isFalse(Object.isFrozen(state.other))
			}
		)
		it(
			"arrays",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						draft.list.push({ done: false, id: 3 })
						draft.list[0].done = true
						draft.list.reverse()
					}
				)
				assert.deepEqual(
					next.list.map(item => item.id),
					[ 3, 2, 1 ]
				)
				assert.isTrue(
					/** @type {{ done: boolean, id: number }} */(next.list[2])/**/.done
				)
				assert.equal(next.list[1], base.list[1])
				assert.isTrue(Array.isArray(next.list))
				assert.deepEqual(base, create())
				const spliced = deepUpdate(
					base,
					draft => {
						draft.list.splice(0, 1)
						draft.list[0].done = true
						draft.list.length = 1
					}
				)
				assert.deepEqual(
					spliced.list,
					[ { done: true, id: 2 } ]
				)
				const filtered = deepUpdate(
					base,
					draft => {
						draft.list = /** @type {[ { done: boolean, id: number }, ...{ done: boolean, id: number }[] ]} */(draft.list.filter(item => item.id == 2))/**/
					}
				)
				assert.equal(filtered.list[0], base.list[1])
				assert.isFalse(has_proxy(filtered))
				const looped = deepUpdate(
					base,
					draft => {
						for (const item of draft.list) item.done = true
					}
				)
				assert.isTrue(
					looped.list.every(item => item.done)
				)
			}
		)
		it(
			"async recipe",
			async () => {
				const base = create()
				const next = await deepUpdate(
					base,
					async draft => {
						await Promise.resolve()
						draft.user.name = "Lee"
					}
				)
				assert.equal(next.user.name, "Lee")
				assert.equal(base.user.name, "Kim")
				assert.equal(
					await deepUpdate(1, async value => value + 1),
					2
				)
				let rejected = false
				await deepUpdate(1, async () => {}).catch(
					error => {
						rejected = error instanceof TypeError
					}
				)
				assert.isTrue(rejected)
				/** @type {ReturnType<typeof create>["user"]} */
				let leaked
				/** @type {unknown} */
				let caught
				try {
					await deepUpdate(
						base,
						async draft => {
							leaked = draft.user
							throw new RangeError("stop")
						}
					)
				} catch (error) {
					caught = error
				}
				assert.instanceOf(caught, RangeError)
				assert.throws(() => leaked.name, TypeError)
			}
		)
		it(
			"draft traps",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						Object.defineProperty(
							draft.user,
							"hidden",
							{
								configurable: true,
								enumerable: false,
								value: 1,
								writable: true
							}
						)
						delete draft.user.missing
						assert.isFalse(
							Object.getOwnPropertyDescriptor(draft.list, "length")?.configurable
						)
						assert.deepEqual(
							Object.keys(draft.list),
							[ "0", "1" ]
						)
						assert.equal(
							Object.getPrototypeOf(draft.list),
							Array.prototype
						)
						assert.throws(
							() => Object.freeze(draft.user),
							TypeError
						)
						assert.throws(
							() => Object.setPrototypeOf(draft.user, null),
							TypeError
						)
					}
				)
				assert.equal(
					Object.getOwnPropertyDescriptor(next.user, "hidden")?.value,
					1
				)
				assert.equal(
					deepUpdate(
						base,
						draft => {
							void draft.user.address.city
							draft.user = base.user
							delete draft.missing
						}
					),
					base
				)
				const bare = Object.assign(
					Object.create(null),
					{ child: { value: 1 } }
				)
				const bare_next = deepUpdate(
					bare,
					draft => {
						draft.child.value = 2
					}
				)
				assert.isNull(
					Object.getPrototypeOf(bare_next)
				)
				assert.equal(bare_next.child.value, 2)
			}
		)
		it(
			"drafts assigned elsewhere",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						draft.copy = draft.user
						draft.wrapper = { list: [ draft.user.address ] }
						draft.user.address.city = "Busan"
					}
				)
				assert.equal(next.copy, next.user)
				assert.equal(
					/** @type {{ list: { city: string }[] }} */(next.wrapper)/**/.list[0],
					next.user.address
				)
				assert.equal(next.user.address.city, "Busan")
				assert.isFalse(has_proxy(next))
				assert.equal(base.user.address.city, "Seoul")
			}
		)
		it(
			"drafts copied by deepCopy keep class instances",
			() => {
				class Payroll {
					#salary = 100
					get salary() {
						return this.#salary
					}
				}
				const payroll = new Payroll()
				const state = {
					at: new Date(0),
					list: [ 1 ],
					payroll
				}
				deepUpdate(
					state,
					draft => {
						draft.list.push(2)
						const copy = deepCopy(draft)
						assert.equal(copy.payroll, payroll)
						assert.equal(copy.payroll.salary, 100)
						assert.notEqual(copy.list, state.list)
						assert.deepEqual(copy.list, [ 1, 2 ])
						assert.notEqual(copy.at, state.at)
						const plain = deepCopy(state)
						assert.notEqual(plain.payroll, payroll)
						assert.instanceOf(plain.payroll, Payroll)
					}
				)
			}
		)
		it(
			"drafts moved under a frozen parent keep their frozen state",
			() => {
				const inner = { id: 1 }
				const map = new Map([ [ "u", { id: 2 } ] ])
				/** @type {Readonly<{ inner: { id: number }, list: readonly { id: number }[], map: Map<string, { id: number }> }>} */
				const base = Object.freeze(
					{
						inner,
						list: Object.freeze([]),
						map
					}
				)
				const next = deepUpdate(
					base,
					draft => {
						draft.list.push(draft.inner)
						draft.list.push(
							/** @type {{ id: number }} */(draft.map.get("u"))/**/
						)
					}
				)
				assert.equal(next.list[0], inner)
				assert.isFalse(Object.isFrozen(inner))
				assert.isFalse(Object.isFrozen(map.get("u")))
				assert.isTrue(Object.isFrozen(next.list))
				/** @type {readonly { note?: string }[]} */
				const rows = Object.freeze(
					[ { note: "a" }, { note: "b" } ]
				)
				const unshifted = deepUpdate(
					rows,
					draft => {
						delete /** @type {{ note?: string }} */(draft[0])/**/.note
						draft.unshift({})
					}
				)
				assert.isTrue(Object.isFrozen(unshifted[0]))
				assert.deepEqual(unshifted[1], {})
				assert.isFalse(Object.isFrozen(unshifted[1]))
				assert.equal(unshifted[2], rows[1])
				const reversed = deepUpdate(
					rows,
					draft => {
						delete /** @type {{ note?: string }} */(draft[0])/**/.note
						draft.reverse()
					}
				)
				assert.equal(reversed[0], rows[1])
				assert.isFalse(Object.isFrozen(reversed[1]))
				const spliced = deepUpdate(
					rows,
					draft => {
						delete /** @type {{ note?: string }} */(draft[1])/**/.note
						draft.splice(0, 1)
					}
				)
				assert.deepEqual(spliced, [ {} ])
				assert.isFalse(Object.isFrozen(spliced[0]))
				assert.isFalse(Object.isFrozen(rows[0]))
				assert.isFalse(Object.isFrozen(rows[1]))
			}
		)
		it(
			"drafts read by the other functions",
			() => {
				const state = {
					line: {
						options: new Set([ "hot" ]),
						qty: 1
					},
					list: [ { id: 1 } ],
					prices: new Map([ [ "hot", 0 ] ])
				}
				const expected = {
					line: {
						options: new Set([ "hot", "iced" ]),
						qty: 2
					},
					list: [ { id: 1 }, { id: 2 } ],
					prices: new Map(
						[ [ "hot", 0 ], [ "iced", 1 ] ]
					)
				}
				/** @type {unknown} */
				let snapshot
				const next = deepUpdate(
					state,
					draft => {
						assert.isTrue(
							deepEqual(draft.line, state.line)
						)
						assert.isTrue(deepEqual(draft, state))
						assert.isTrue(
							deepEqual(
								new Set([ "hot" ]),
								draft.line.options
							)
						)
						assert.isTrue(
							deepEqual(
								draft.prices,
								new Map([ [ "hot", 0 ] ])
							)
						)
						assert.equal(
							deepCopy(draft.prices).get("hot"),
							0
						)
						assert.isTrue(
							deepCopy(draft.line.options).has("hot")
						)
						assert.deepEqual(deepDiff(state, draft), [])
						draft.line.qty = 2
						draft.line.options.add("iced")
						draft.prices.set("iced", 1)
						draft.list.push({ id: 2 })
						assert.isTrue(deepEqual(draft, expected))
						assert.isTrue(deepEqual(expected, draft))
						assert.isTrue(
							deepEqual(
								draft.line.options,
								draft.line.options
							)
						)
						assert.isTrue(
							deepEqual(
								{ nested: [ draft.prices ] },
								{ nested: [ expected.prices ] }
							)
						)
						assert.isFalse(deepEqual(draft, state))
						snapshot = deepCopy(draft)
						assert.isFalse(has_proxy(snapshot))
						assert.isTrue(deepEqual(snapshot, expected))
						const holder = deepCopy({ at: [ draft.line ] })
						assert.isFalse(has_proxy(holder))
						assert.equal(holder.at[0]?.qty, 2)
						const changes = deepDiff(state, draft)
						assert.deepEqual(
							changes,
							deepDiff(state, expected)
						)
						assert.isFalse(has_proxy(changes))
						assert.isTrue(
							deepEqual(
								deepPatch(state, changes),
								expected
							)
						)
						const merged = deepMerge(draft, { line: { qty: 3 } })
						assert.isFalse(has_proxy(deepCopy(merged)))
						assert.equal(merged.line.qty, 3)
						assert.isTrue(
							merged.line.options.has("iced")
						)
						assert.throws(
							() => deepFreeze(draft.line),
							TypeError
						)
						draft.line.qty = 4
						assert.equal(merged.line.qty, 3)
						assert.equal(
							/** @type {typeof expected} */(snapshot)/**/.line.qty,
							2
						)
						draft.line.qty = 2
					}
				)
				assert.isTrue(deepEqual(next, expected))
				assert.isFalse(has_proxy(next))
				assert.isTrue(deepEqual(snapshot, expected))
				assert.isTrue(
					Object.isFrozen(state) === false
				)
				assert.equal(state.line.qty, 1)
				assert.isFalse(state.line.options.has("iced"))
			}
		)
		it(
			"drafts read by the other functions in nested updates and cycles",
			() => {
				/** @type {{ map: Map<string, { n: number }>, self?: unknown, set: Set<{ n: number }> }} */
				const state = {
					map: new Map([ [ "a", { n: 1 } ] ]),
					set: new Set([ { n: 1 } ])
				}
				state.self = state
				const frozen = deepFreeze(deepCopy(state))
				deepUpdate(
					frozen,
					outer => {
						outer.map.set("b", { n: 2 })
						deepUpdate(
							outer,
							inner => {
								inner.map.set("c", { n: 3 })
								for (const member of inner.set) member.n = 5
								const copy = deepCopy(inner)
								assert.isFalse(has_proxy(copy))
								assert.deepEqual(
									[ ...copy.map.keys() ],
									[ "a", "b", "c" ]
								)
								assert.equal([ ...copy.set ][0]?.n, 5)
								assert.equal(copy.self, copy)
								assert.isFalse(deepEqual(inner, outer))
								assert.isTrue(
									deepEqual(outer, deepCopy(outer))
								)
								assert.deepEqual(
									deepDiff(outer, inner),
									deepDiff(deepCopy(outer), deepCopy(inner))
								)
								assert.isFalse(
									has_proxy(deepDiff(outer, inner))
								)
							},
							{ graph: true }
						)
					}
				)
			}
		)
		it(
			"drafts read by the other functions inside new values",
			() => {
				/** @type {{ holder?: unknown, line: { qty: number }, map: Map<string, unknown>, set: Set<unknown> }} */
				const state = {
					line: { qty: 1 },
					map: new Map(),
					set: new Set()
				}
				deepUpdate(
					state,
					draft => {
						draft.line.qty = 2
						const list = new Array(2)
						list[1] = draft.line
						draft.holder = {
							list,
							get total() {
								return 1
							}
						}
						draft.map.set("a", { line: draft.line })
						draft.set.add({ line: draft.line })
						const copy = deepCopy(draft)
						assert.isFalse(has_proxy(copy))
						const holey = new Array(2)
						holey[1] = { qty: 2 }
						assert.isTrue(
							deepEqual(
								copy,
								{
									holder: { list: holey, total: 1 },
									line: { qty: 2 },
									map: new Map(
										[ [ "a", { line: { qty: 2 } } ] ]
									),
									set: new Set([ { line: { qty: 2 } } ])
								}
							)
						)
						assert.isFalse(
							has_proxy(deepDiff(state, draft))
						)
					}
				)
			}
		)
		it(
			"drafts read by the other functions keep sparse arrays and subclasses",
			() => {
				class List extends Array {}
				const sparse = /** @type {unknown[]} */([])/**/
				sparse[9000] = { n: 1 }
				const list = new List()
				list.push({ n: 1 })
				Object.assign(list, { label: "a" })
				deepUpdate(
					{ list, sparse },
					draft => {
						const item = /** @type {{ n: number }} */(draft.sparse[9000])/**/
						item.n = 2
						const first = /** @type {{ n: number }} */(draft.list[0])/**/
						first.n = 2
						const copy = deepCopy(draft)
						assert.isFalse(has_proxy(copy))
						assert.equal(copy.sparse.length, 9001)
						assert.isFalse(0 in copy.sparse)
						assert.deepEqual(copy.sparse[9000], { n: 2 })
						assert.instanceOf(copy.list, List)
						assert.include(
							inspect(draft.list),
							"label: 'a'"
						)
						assert.deepEqual({ ...copy.list[0] }, { n: 2 })
						assert.isTrue(deepEqual(draft, copy))
					}
				)
			}
		)
		it(
			"drafts show their current value in the console",
			() => {
				deepUpdate(
					{
						list: [ 1 ],
						map: new Map([ [ "a", 1 ] ]),
						object: { a: 1 },
						set: new Set([ 1 ])
					},
					draft => {
						draft.list.push(2)
						draft.map.set("b", 2)
						draft.object.a = 2
						draft.set.add(2)
						assert.equal(
							inspect(draft.list),
							inspect([ 1, 2 ])
						)
						assert.equal(
							inspect(draft.map),
							inspect(
								new Map([ [ "a", 1 ], [ "b", 2 ] ])
							)
						)
						assert.equal(
							inspect(draft.object),
							inspect({ a: 2 })
						)
						assert.equal(
							inspect(draft.set),
							inspect(new Set([ 1, 2 ]))
						)
						assert.equal(
							inspect(draft),
							inspect(
								{
									list: [ 1, 2 ],
									map: new Map([ [ "a", 1 ], [ "b", 2 ] ]),
									object: { a: 2 },
									set: new Set([ 1, 2 ])
								}
							)
						)
					}
				)
			}
		)
		it(
			"fields of map and set subclasses",
			() => {
				/** @extends {Map<string, { value: number }>} */
				class Registry extends Map {
					meta = /** @type {{ count: number, owner?: { id: number } }} */({ count: 0 })/**/
					get first() {
						return this.get("a")
					}
				}
				/** @extends {Set<number>} */
				class Tags extends Set {
					meta = { count: 0 }
				}
				const base = {
					map: new Registry([ [ "a", { value: 1 } ] ]),
					set: new Tags([ 1 ]),
					user: { id: 1 }
				}
				const next = deepUpdate(
					base,
					draft => {
						const map = /** @type {Registry} */(draft.map)/**/
						const set = /** @type {Tags} */(draft.set)/**/
						map.meta.count = 1
						set.meta.count = 2
						const first = map.first
						if (first) first.value = 2
					}
				)
				assert.equal(base.map.meta.count, 0)
				assert.equal(base.map.first?.value, 1)
				assert.equal(base.set.meta.count, 0)
				assert.equal(next.map.meta.count, 1)
				assert.equal(next.set.meta.count, 2)
				assert.instanceOf(next.map, Registry)
				assert.instanceOf(next.set, Tags)
				assert.deepEqual(
					[ ...next.map ],
					[ [ "a", { value: 2 } ] ]
				)
				assert.deepEqual([ ...next.set ], [ 1 ])
				const owned = deepUpdate(
					base,
					draft => {
						const map = /** @type {Registry} */(draft.map)/**/
						map.meta = { count: 2, owner: draft.user }
						draft.user.id = 2
					}
				)
				assert.equal(owned.map.meta.owner, owned.user)
				assert.equal(owned.user.id, 2)
				assert.isFalse(has_proxy(owned.map.meta))
				assert.equal(
					deepUpdate(
						base,
						draft => {
							const map = /** @type {Registry} */(draft.map)/**/
							const set = /** @type {Tags} */(draft.set)/**/
							void map.meta.count
							void set.meta
						}
					),
					base
				)
			}
		)
		it(
			"frozen base",
			() => {
				const cyclic = deepUpdate(
					deepFreeze(
						/** @type {{ user: { address: { city: string }, self?: { owner: { address: { city: string } } } } }} */({
							user: { address: { city: "Seoul" } }
						})/**/
					),
					draft => {
						draft.user.self = { owner: draft.user }
						draft.user.address.city = "Busan"
					}
				)
				assert.equal(
					/** @type {{ owner: { address: { city: string } } }} */(cyclic.user.self)/**/.owner,
					cyclic.user
				)
				assert.equal(
					cyclic.user.address.city,
					"Busan"
				)
				assert.isTrue(
					Object.isFrozen(cyclic.user.self)
				)
				assert.isFalse(has_proxy(cyclic))
				const keyed = deepUpdate(
					deepFreeze(
						/** @type {{ map: Map<{ owner: { id: number } }, number>, user: { id: number } }} */({ map: new Map(), user: { id: 1 } })/**/
					),
					draft => {
						draft.map.set({ owner: draft.user }, 1)
						draft.user.id = 2
					}
				)
				const [ key ] = keyed.map.keys()
				assert.equal(
					/** @type {{ owner: { id: number } }} */(key)/**/.owner,
					keyed.user
				)
				assert.isTrue(Object.isFrozen(key))
				assert.isFalse(has_proxy(keyed))
				const base = deepFreeze(create())
				const next = deepUpdate(
					base,
					draft => {
						draft.user.name = "Lee"
						draft.list.push({ done: true, id: 3 })
					}
				)
				assert.equal(next.user.name, "Lee")
				assert.isTrue(Object.isFrozen(next))
				assert.isTrue(Object.isFrozen(next.user))
				assert.isTrue(Object.isFrozen(next.list))
				assert.isTrue(Object.isFrozen(next.list[2]))
				assert.equal(next.map, base.map)
				const held = { note: { text: "held" } }
				const inner = { id: 1 }
				const shallow = Object.freeze(
					{
						inner,
						list: Object.freeze(
							/** @type {{ note?: { text: string }, ref?: { id: number } }[]} */([])/**/
						)
					}
				)
				const added = deepUpdate(
					shallow,
					draft => {
						draft.list.push(held, { ref: draft.inner })
					}
				)
				assert.equal(added.list[0], held)
				assert.isTrue(Object.isFrozen(held.note))
				assert.isTrue(Object.isFrozen(added.list[1]))
				assert.isFalse(Object.isFrozen(inner))
				const loose = { note: { text: "loose" } }
				deepUpdate(
					{
						list: [ { note: { text: "seed" } } ]
					},
					draft => {
						draft.list.push(loose)
					}
				)
				assert.isFalse(Object.isFrozen(loose))
			}
		)
		it(
			"frozen base replaced by the recipe result",
			() => {
				const base = deepFreeze(
					{ list: [ 1 ], other: { a: 1 } }
				)
				const spread = deepUpdate(
					base,
					draft => ({ ...draft, list: [ 2 ] })
				)
				assert.deepEqual(spread.list, [ 2 ])
				assert.equal(spread.other, base.other)
				assert.isTrue(Object.isFrozen(spread))
				assert.isTrue(Object.isFrozen(spread.list))
				const fresh = deepUpdate(
					base,
					() => ({ list: [ 3 ], other: { a: 2 } })
				)
				assert.isTrue(Object.isFrozen(fresh))
				assert.isTrue(Object.isFrozen(fresh.other))
				const loose = deepUpdate(
					{ list: [ 1 ] },
					() => ({ list: [ 2 ] })
				)
				assert.isFalse(Object.isFrozen(loose))
				assert.isFalse(Object.isFrozen(loose.list))
			}
		)
		it(
			"frozen new values keep their properties",
			() => {
				const base = { a: { x: 1 } }
				const next = deepUpdate(
					/** @type {{ a: { x: number }, b?: Record<string, unknown>, m?: Map<number, unknown> & { extra?: number }, o?: { p?: unknown } }} */(base)/**/,
					draft => {
						/** @type {Record<string, unknown>} */
						const frozen = { ref: draft.a }
						Object.defineProperty(frozen, "hidden", { value: 42 })
						Object.defineProperty(
							frozen,
							"draft",
							{ value: draft.a }
						)
						Object.defineProperty(
							frozen,
							"getter",
							{ enumerable: true, get: () => 1 }
						)
						draft.b = Object.freeze(frozen)
						/** @type {Map<number, unknown> & { extra?: number }} */
						const map = new Map([ [ 1, draft.a ] ])
						map.extra = 7
						draft.m = Object.freeze(map)
						/** @type {{ p?: unknown }} */
						const readonly = {}
						Object.defineProperty(
							readonly,
							"p",
							{
								configurable: true,
								enumerable: true,
								value: draft.a,
								writable: false
							}
						)
						draft.o = readonly
					}
				)
				const b = /** @type {{ draft?: unknown, hidden?: unknown }} */(next.b)/**/
				assert.equal(b.hidden, 42)
				assert.equal(b.draft, base.a)
				assert.isFalse(
					Object.getOwnPropertyDescriptor(b, "draft")?.enumerable
				)
				assert.isFunction(
					Object.getOwnPropertyDescriptor(b, "getter")?.get
				)
				assert.isTrue(Object.isFrozen(b))
				assert.equal(next.m?.extra, 7)
				assert.equal(next.m?.get(1), base.a)
				assert.equal(next.o?.p, base.a)
				const key = { mutable: 1 }
				const frozen_map = Object.freeze(
					new Map(
						/** @type {[ unknown, unknown ][]} */([ [ key, 1 ], [ "v", { x: 1 } ] ])/**/
					)/**/
				)
				deepUpdate(
					frozen_map,
					draft => {
						draft.set(
							Object.freeze({ v: draft.get("v") }),
							2
						)
					}
				)
				assert.isFalse(Object.isFrozen(key))
			}
		)
		it(
			"frozen new values with cycles and drafts",
			() => {
				/** @type {{ u: { n: number }, w?: { self?: unknown, user: { n: number }, x?: { back: unknown } } }} */
				const base = { u: { n: 1 } }
				const next = deepUpdate(
					base,
					draft => {
						/** @type {{ self?: unknown, user: { n: number }, x?: { back: unknown } }} */
						const w = { self: undefined, user: draft.u }
						w.self = w
						w.x = Object.freeze({ back: w })
						draft.w = Object.freeze(w)
					}
				)
				const w = /** @type {{ self: unknown, user: { n: number }, x: { back: unknown } }} */(next.w)/**/
				assert.isTrue(Object.isFrozen(w))
				assert.equal(w.self, w)
				assert.equal(w.x.back, w)
				assert.equal(w.user, base.u)
				assert.isFalse(has_proxy(next))
				const inner = Object.freeze([ 1 ])
				const clean = Object.freeze(
					{
						at: new Date(0),
						list: inner,
						twin: inner
					}
				)
				const kept = deepUpdate(
					base,
					draft => {
						draft.w = /** @type {never} */(clean)/**/
					}
				)
				assert.equal(
					kept.w,
					/** @type {unknown} */(clean)/**/
				)
				const shared = { at: new Date(0) }
				const mixed = deepUpdate(
					/** @type {{ list?: unknown[], u: { n: number } }} */(base)/**/,
					draft => {
						draft.list = [
							shared,
							Object.freeze(
								{
									at: new Date(0),
									clean_map: Object.freeze(new Map([ [ 1, { n: 1 } ] ])),
									clean_set: Object.freeze(new Set([ { n: 1 } ])),
									map: Object.freeze(
										new Map(
											/** @type {[ unknown, unknown ][]} */([
												[ { k: 1 }, 1 ],
												[ "u", draft.u ]
											])/**/
										)/**/
									),
									set: Object.freeze(new Set([ shared, draft.u ])),
									shared
								}
							)
						]
					}
				)
				const frozen = /** @type {{ map: Map<unknown, unknown>, set: Set<unknown>, shared: unknown }} */(mixed.list?.[1])/**/
				assert.equal(frozen.shared, shared)
				assert.equal(frozen.map.get("u"), base.u)
				assert.isTrue(frozen.set.has(base.u))
				assert.isTrue(frozen.set.has(shared))
				assert.isFalse(has_proxy(mixed))
			}
		)
		it(
			"graph option",
			async () => {
				const a = { id: "a" }
				const index = { byId: { a }, list: [ a ] }
				const next = await deepUpdate(
					index,
					async draft => {
						await Promise.resolve()
						draft.byId.a.id = "A"
					},
					{ graph: true }
				)
				assert.equal(next.list[0], next.byId.a)
				assert.equal(
					deepUpdate(index, () => {}, { graph: true }),
					index
				)
				assert.equal(
					deepUpdate(
						1,
						value => value + 1,
						{ graph: true }
					),
					2
				)
				for (const options of [
					null,
					1,
					"graph",
					{ graph: 1 },
					{ grahp: true }
				]) {
					assert.throws(
						() => deepUpdate(
							index,
							() => {},
							/** @type {never} */(options)/**/
						),
						TypeError,
						"deepUpdate options"
					)
				}
				assert.throws(
					() => deepUpdate(
						index,
						/** @type {never} */([])/**/,
						{ graph: true }
					),
					TypeError,
					"deepUpdate takes a recipe function; apply changes listed by deepDiff with deepPatch"
				)
				assert.throws(
					() => deepUpdate(
						index,
						/** @type {never} */([
							{
								op: "remove",
								path: [ "list", 0 ]
							}
						])/**/
					),
					TypeError,
					"deepUpdate takes a recipe function; apply changes listed by deepDiff with deepPatch"
				)
				assert.throws(
					() => deepUpdate(
						index,
						/** @type {never} */("list")/**/
					),
					TypeError,
					"deepUpdate needs a recipe function"
				)
			}
		)
		it(
			"hidden symbol keys and restored map values",
			() => {
				const symbol = Symbol("s")
				/** @type {{ a: number, [symbol]?: number }} */
				const base = { a: 1 }
				Object.defineProperty(
					base,
					symbol,
					{
						configurable: true,
						enumerable: false,
						value: 7,
						writable: true
					}
				)
				const next = deepUpdate(
					base,
					draft => {
						draft.a = 2
						assert.equal(draft[symbol], 7)
					}
				)
				assert.equal(next[symbol], 7)
				assert.isFalse(
					Object.prototype.propertyIsEnumerable.call(next, symbol)
				)
				const map = {
					m: new Map([ [ "a", { v: 1 } ] ])
				}
				assert.equal(
					deepUpdate(
						map,
						draft => {
							draft.m.get("a")
							draft.m.set(
								"a",
								/** @type {{ v: number }} */(map.m.get("a"))/**/
							)
						}
					),
					map
				)
			}
		)
		it(
			"map and set methods",
			() => {
				class Registry extends Map {}
				class Tags extends Set {}
				const member = { id: 1 }
				const base = {
					map: new Registry(
						/** @type {[ string, { value: number } | number ][]} */([
							[ "a", { value: 1 } ],
							[ "b", 2 ]
						])/**/
					),
					set: new Tags(
						/** @type {({ done?: boolean, id: number } | number)[]} */([ member, 2 ])/**/
					)
				}
				const next = deepUpdate(
					base,
					draft => {
						const map = draft.map
						assert.isFalse(map.delete("missing"))
						assert.deepEqual([ ...map.keys() ], [ "a", "b" ])
						assert.deepEqual(
							[ ...map.values() ].map(value => typeof value),
							[ "object", "number" ]
						)
						/** @type {string[]} */
						const seen = []
						map.forEach(
							(_value, key) => seen.push(key)
						)
						assert.deepEqual(seen, [ "a", "b" ])
						for (const [ key, value ] of map.entries()) {
							if (key == "a") value.value = 5
						}
						const set = draft.set
						assert.isTrue(set.has(member))
						assert.isFalse(set.delete(3))
						assert.lengthOf([ ...set.keys() ], 2)
						set.forEach(
							value => {
								if (typeof value == "object") value.done = true
							}
						)
						assert.deepEqual(
							[ ...set.entries() ][1],
							[ 2, 2 ]
						)
						assert.isTrue(set.delete(member))
						assert.equal(set.size, 1)
					}
				)
				assert.instanceOf(next.map, Registry)
				assert.instanceOf(next.set, Tags)
				class Labeled extends Map {
					label = "users"
				}
				class Items extends Array {
					label = "items"
				}
				const subclassed = deepUpdate(
					{
						items: Items.from([ 1 ]),
						map: new Labeled()
					},
					draft => {
						draft.map.set("a", 1)
						draft.items.push(2)
					}
				)
				assert.equal(subclassed.map.label, "users")
				assert.instanceOf(subclassed.items, Items)
				assert.equal(subclassed.items.label, "items")
				assert.deepEqual(
					[ ...subclassed.items ],
					[ 1, 2 ]
				)
				assert.equal(next.map.get("a").value, 5)
				assert.deepEqual([ ...next.set ], [ 2 ])
				assert.isUndefined(
					/** @type {{ done?: boolean, id: number }} */(member)/**/.done
				)
				const cleared = deepUpdate(
					base,
					draft => {
						draft.map.clear()
						draft.set.clear()
						draft.map.clear()
					}
				)
				assert.equal(cleared.map.size, 0)
				assert.equal(cleared.set.size, 0)
				const keyed = deepUpdate(
					/** @type {{ map: Map<{ id: number }, number>, user: { id: number } }} */({ map: new Map(), user: { id: 1 } })/**/,
					draft => {
						draft.map.set(draft.user, 1)
						draft.user.id = 2
					}
				)
				assert.equal(
					[ ...keyed.map.keys() ][0],
					keyed.user
				)
				assert.isFalse(has_proxy(keyed))
			}
		)
		it(
			"map and set methods find drafts of members",
			() => {
				const member = { x: 1 }
				const base = {
					map: new Map([ [ member, "v" ] ]),
					member,
					set: new Set([ member ])
				}
				deepUpdate(
					base,
					draft => {
						assert.isTrue(draft.set.has(draft.member))
						assert.isTrue(draft.map.has(draft.member))
						assert.equal(draft.map.get(draft.member), "v")
						for (const value of draft.set) value.x = 2
						assert.isTrue(draft.set.has(draft.member))
						assert.isTrue(draft.set.has(member))
					}
				)
				const removed = deepUpdate(
					base,
					draft => {
						assert.isTrue(draft.set.delete(draft.member))
						assert.isTrue(draft.map.delete(draft.member))
					}
				)
				assert.equal(removed.set.size, 0)
				assert.equal(removed.map.size, 0)
				const same = deepUpdate(
					base,
					draft => {
						draft.set.add(draft.member)
						draft.map.set(draft.member, "v")
					}
				)
				assert.equal(same, base)
				const replaced = deepUpdate(
					base,
					draft => {
						draft.map.set(draft.member, "w")
					}
				)
				assert.deepEqual(
					[ ...replaced.map ],
					[ [ member, "w" ] ]
				)
			}
		)
		it(
			"map iteration sees changes made while iterating",
			() => {
				/**
				 * @param {(draft: Map<string, number>, seen: string[]) => void} recipe
				 * @returns {string[]}
				 */
				function run(recipe) {
					/** @type {string[]} */
					const seen = []
					deepUpdate(
						new Map([ [ "a", 1 ], [ "b", 2 ] ]),
						draft => {
							recipe(draft, seen)
						}
					)
					return seen
				}
				assert.deepEqual(
					run(
						(draft, seen) => {
							for (const [ key, value ] of draft) {
								seen.push(`${key}:${value}`)
								draft.delete("b")
							}
						}
					),
					[ "a:1" ]
				)
				assert.deepEqual(
					run(
						(draft, seen) => {
							for (const key of draft.keys()) {
								seen.push(key)
								draft.delete("b")
							}
						}
					),
					[ "a" ]
				)
				assert.deepEqual(
					run(
						(draft, seen) => {
							for (const value of draft.values()) {
								seen.push(String(value))
								if (value == 1) draft.set("c", 3)
							}
						}
					),
					[ "1", "2", "3" ]
				)
				assert.deepEqual(
					run(
						(draft, seen) => {
							draft.forEach(
								(_value, key) => {
									seen.push(key)
									draft.delete("b")
								}
							)
						}
					),
					[ "a" ]
				)
				/**
				 * @param {Map<string, { n: number }>} map
				 * @returns {string[]}
				 */
				function shuffle(map) {
					/** @type {string[]} */
					const seen = []
					for (const [ key, value ] of map) {
						seen.push(key)
						value.n++
						if (key == "a") {
							map.delete("b")
							map.set("b", { n: 0 })
							map.delete("c")
							map.set("d", { n: 0 })
						}
					}
					return seen
				}
				const objects = new Map(
					[
						[ "a", { n: 0 } ],
						[ "b", { n: 0 } ],
						[ "c", { n: 0 } ]
					]
				)
				/** @type {string[]} */
				let drafted = []
				const shuffled = deepUpdate(
					objects,
					draft => {
						drafted = shuffle(draft)
					}
				)
				const native = new Map(
					[ ...objects ].map(
						([ key, value ]) => [ key, { ...value } ]
					)
				)
				assert.deepEqual(drafted, shuffle(native))
				assert.deepEqual(shuffled, native)
				const base = new Map([ [ "a", 1 ] ])
				assert.equal(
					deepUpdate(
						base,
						draft => {
							for (const _entry of draft);
						}
					),
					base
				)
			}
		)
		it(
			"maps",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						/** @type {{ seen?: boolean, value: number }} */(draft.map.get("a"))/**/.value = 10
						draft.map.set("c", { value: 3 })
						draft.map.delete("b")
						for (const [ , item ] of draft.map) item.seen = true
					}
				)
				assert.instanceOf(next.map, Map)
				assert.deepEqual(
					[ ...next.map ],
					[
						[ "a", { seen: true, value: 10 } ],
						[ "c", { seen: true, value: 3 } ]
					]
				)
				assert.equal(
					/** @type {{ seen?: boolean, value: number }} */(base.map.get("a"))/**/.value,
					1
				)
				assert.equal(base.map.size, 2)
				assert.isFalse(has_proxy(next))
				const unchanged = deepUpdate(
					base,
					draft => {
						draft.map.get("a")
						draft.map.set(
							"a",
							/** @type {{ seen?: boolean, value: number }} */(draft.map.get("a"))/**/
						)
						assert.equal(draft.map.size, 2)
						assert.isTrue(draft.map.has("b"))
					}
				)
				assert.equal(unchanged, base)
			}
		)
		it(
			"merged drafts stay drafts",
			() => {
				/**
				 * @returns {{ cfg: { alerts: { channels: string[], quiet: { from: string } }, sensors: Record<string, { max: number }> } }}
				 */
				function create_state() {
					return {
						cfg: {
							alerts: {
								channels: [ "email" ],
								quiet: { from: "22" }
							},
							sensors: { t: { max: 80 } }
						}
					}
				}
				for (const graph of [ false, true ]) {
					for (const state of [
						create_state(),
						deepFreeze(create_state())
					]) {
						const next = deepUpdate(
							state,
							draft => {
								draft.cfg = deepMerge(
									draft.cfg,
									{
										alerts: { channels: [ "slack" ] }
									}
								)
								draft.cfg.alerts.quiet.from = "23"
								assert.isTrue(
									types.isProxy(draft.cfg.sensors)
								)
							},
							{ graph }
						)
						assert.equal(next.cfg.alerts.quiet.from, "23")
						assert.equal(
							state.cfg.alerts.quiet.from,
							"22"
						)
						assert.deepEqual(
							next.cfg.alerts.channels,
							[ "slack" ]
						)
						assert.deepEqual(
							state.cfg.alerts.channels,
							[ "email" ]
						)
						assert.equal(
							next.cfg.sensors,
							state.cfg.sensors
						)
						assert.isFalse(has_proxy(next))
						assert.equal(
							Object.isFrozen(next.cfg.alerts.quiet),
							Object.isFrozen(state)
						)
					}
				}
				/** @type {{ a: { b?: unknown, n: number } }} */
				const cyclic = { a: { n: 1 } }
				const next = deepUpdate(
					cyclic,
					draft => {
						draft.a.b = draft.a
						draft.a.b = deepMerge(draft.a, { n: 2 })
					},
					{ graph: true }
				)
				assert.equal(
					/** @type {{ b: unknown }} */(next.a.b)/**/.b,
					next.a
				)
			}
		)
		it(
			"nested updates",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						draft.user.name = "Lee"
						const inner = deepUpdate(
							/** @type {{ user?: ReturnType<typeof create>["user"] }} */({})/**/,
							value => {
								value.user = draft.user
							}
						)
						draft.user.address.city = "Busan"
						draft.inner = inner
					}
				)
				assert.equal(
					/** @type {{ user: ReturnType<typeof create>["user"] }} */(next.inner)/**/.user,
					next.user
				)
				assert.equal(next.user.address.city, "Busan")
				assert.isFalse(has_proxy(next))
				const replaced = deepUpdate(
					base,
					draft => deepUpdate(
						draft,
						value => {
							value.user = base.user
						}
					)
				)
				assert.equal(replaced.user, base.user)
				assert.isFalse(has_proxy(replaced))
			}
		)
		it(
			"nested updates of frozen values holding outer drafts",
			() => {
				const base = {
					inner: /** @type {unknown} */(undefined)/**/,
					user: { n: 1 }
				}
				const next = deepUpdate(
					base,
					draft => {
						draft.inner = deepUpdate(
							Object.freeze(
								{
									list: Object.freeze(
										/** @type {unknown[]} */([])/**/
									)
								}
							),
							inner => {
								inner.list.push(draft.user)
								inner.list.push({ user: draft.user })
							}
						)
					}
				)
				const inner = /** @type {{ list: [ { n: number }, { user: { n: number } } ] }} */(next.inner)/**/
				assert.equal(inner.list[0], base.user)
				assert.equal(inner.list[1].user, base.user)
				assert.isFalse(has_proxy(next))
			}
		)
		it(
			"nested updates of outer map and set drafts",
			() => {
				/** @type {{ a: { n: number }, inner?: unknown, m: Map<string, { n: number }>, s: Set<number> }} */
				const base = {
					a: { n: 1 },
					m: new Map([ [ "k", { n: 1 } ] ]),
					s: new Set([ 1 ])
				}
				const next = deepUpdate(
					base,
					draft => {
						draft.inner = deepUpdate(
							draft,
							inner => {
								inner.m.set("x", inner.a)
								inner.s.add(2)
								const item = /** @type {{ n: number }} */(inner.m.get("k"))/**/
								item.n = 5
							}
						)
					}
				)
				const inner = /** @type {typeof base} */(next.inner)/**/
				assert.equal(next.m.size, 1)
				assert.equal(next.s.size, 1)
				assert.equal(inner.m.get("x"), base.a)
				assert.equal(inner.m.get("k")?.n, 5)
				assert.isTrue(inner.s.has(2))
				assert.equal(base.m.get("k")?.n, 1)
				assert.isFalse(has_proxy(next))
			}
		)
		it(
			"nested updates of set drafts and frozen drafts",
			() => {
				const member = { v: 1 }
				/** @type {boolean | undefined} */
				let removed
				const next = deepUpdate(
					{
						s: new Set(
							/** @type {unknown[]} */([ member, 2 ])/**/
						)
					},
					draft => {
						draft.s = deepUpdate(
							draft.s,
							inner => {
								removed = inner.delete(member)
								assert.isFalse(inner.has(member))
							}
						)
					}
				)
				assert.isTrue(removed)
				assert.deepEqual([ ...next.s ], [ 2 ])
				const frozen = { a: deepFreeze({ b: { x: 1 } }) }
				const updated = deepUpdate(
					frozen,
					draft => {
						draft.a = deepUpdate(
							draft.a,
							inner => {
								inner.b.x = 2
							}
						)
					}
				)
				assert.equal(updated.a.b.x, 2)
				assert.isTrue(Object.isFrozen(updated.a))
				assert.isTrue(Object.isFrozen(updated.a.b))
			}
		)
		it(
			"new values containing drafts",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						/** @type {{ list: ReturnType<typeof create>["user"][], map: Map<{ city: string }, { done: boolean, id: number }[]>, self?: typeof wrapper, set: Set<ReturnType<typeof create>["user"]> }} */
						const wrapper = {
							list: [ draft.user ],
							map: new Map(
								[
									[ draft.user.address, draft.list ]
								]
							),
							set: new Set([ draft.user ])
						}
						wrapper.self = wrapper
						draft.wrapper = wrapper
						draft.user.name = "Lee"
					}
				)
				assert.isFalse(has_proxy(next))
				assert.equal(
					/** @type {{ list: ReturnType<typeof create>["user"][] }} */(next.wrapper)/**/.list[0],
					next.user
				)
				assert.equal(
					[
						.../** @type {{ set: Set<ReturnType<typeof create>["user"]> }} */(next.wrapper)/**/.set
					][0],
					next.user
				)
				assert.equal(
					[
						.../** @type {{ map: Map<{ city: string }, { done: boolean, id: number }[]> }} */(next.wrapper)/**/.map.values()
					][0],
					base.list
				)
				assert.equal(
					/** @type {{ self?: ReturnType<typeof create>["wrapper"] }} */(next.wrapper)/**/.self,
					next.wrapper
				)
			}
		)
		it(
			"no changes",
			() => {
				const base = create()
				assert.equal(
					deepUpdate(
						base,
						draft => {
							draft.user.name = "Kim"
							void draft.list[0].done
							for (const item of draft.set) void item.id
						}
					),
					base
				)
			}
		)
		it(
			"non-draftable values",
			() => {
				assert.equal(
					deepUpdate(1, value => value + 1),
					2
				)
				assert.deepEqual(
					deepUpdate(
						/** @type {never} */(undefined)/**/,
						() => ({ a: 1 })
					),
					{ a: 1 }
				)
				const date = new Date(1)
				const next = deepUpdate(
					{ date },
					draft => {
						assert.equal(draft.date, date)
						draft.date = new Date(2)
					}
				)
				assert.equal(next.date.getTime(), 2)
				assert.equal(date.getTime(), 1)
				class Counter {
					count = 0
				}
				const counter = new Counter()
				for (const value of [ counter, date, 1, null, undefined ]) {
					assert.throws(
						() => deepUpdate(
							value,
							/** @type {never} */(() => {})/**/
						),
						TypeError,
						"deepUpdate drafts only plain objects, arrays, Map and Set; a recipe for any other value, such as a class instance, Date or primitive, must return the next value"
					)
				}
				assert.throws(
					() => deepUpdate(
						counter,
						item => {
							item.count++
						}
					),
					TypeError
				)
				assert.equal(
					deepUpdate(counter, item => item),
					counter
				)
				assert.equal(
					deepUpdate(
						{ counter },
						draft => {
							draft.counter = new Counter()
						}
					).counter.count,
					0
				)
			}
		)
		it(
			"objects",
			() => {
				const hidden = Object.defineProperty(
					{ visible: 1 },
					"hidden",
					{ value: 1, writable: true }
				)
				const kept = deepUpdate(
					/** @type {{ hidden: { hidden?: number, visible: number } }} */({ hidden })/**/,
					draft => {
						draft.hidden.visible = 2
						assert.equal(draft.hidden.hidden, 1)
					}
				)
				assert.equal(kept.hidden.hidden, 1)
				assert.isFalse(
					Object.getOwnPropertyDescriptor(kept.hidden, "hidden")?.enumerable
				)
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						draft.user.name = undefined
						draft.user.name = "Lee"
						delete /** @type {{ address?: { city: string } }} */(draft.user)/**/.address
						draft.user.tags = [ "a" ]
						assert.isFalse("address" in draft.user)
						assert.deepEqual(
							Object.keys(draft.user),
							[ "name", "tags" ]
						)
						assert.deepEqual(
							{ ...draft.user },
							{ name: "Lee", tags: [ "a" ] }
						)
					}
				)
				assert.deepEqual(
					/** @type {{ address?: { city: string }, name: string | undefined, tags?: string[] }} */(next.user)/**/,
					{ name: "Lee", tags: [ "a" ] }
				)
				assert.equal(next.list, base.list)
				assert.equal(next.map, base.map)
				assert.equal(next.set, base.set)
				assert.deepEqual(base, create())
			}
		)
		it(
			"one draft per object reached through several paths",
			() => {
				for (const frozen of [ false, true ]) {
					/** @type {Dept} */
					const root = {
						children: [],
						name: "HQ",
						parent: null
					}
					/** @type {Dept} */
					const eng = {
						children: [],
						name: "Eng",
						parent: root
					}
					/** @type {Dept} */
					const ops = {
						children: [],
						name: "Ops",
						parent: root
					}
					/** @type {Dept} */
					const web = {
						children: [],
						name: "Web",
						parent: eng
					}
					root.children.push(eng, ops)
					eng.children.push(web)
					const plain = {
						byId: new Map(
							[
								[ "eng", eng ],
								[ "hq", root ],
								[ "ops", ops ],
								[ "web", web ]
							]
						),
						leads: new Set([ eng ]),
						meta: { title: "org" },
						owners: new Map([ [ eng, "kim" ] ]),
						root
					}
					const state = frozen
						? /** @type {typeof plain} */(deepFreeze(plain))/**/
						: plain
					const next = deepUpdate(
						state,
						draft => {
							const node = /** @type {Dept} */(draft.byId.get("web"))/**/
							const target = /** @type {Dept} */(draft.byId.get("ops"))/**/
							const old = /** @type {Dept} */(node.parent)/**/
							assert.equal(old, draft.byId.get("eng"))
							assert.equal(old, draft.root.children[0])
							assert.equal(
								draft.root.children[0]?.parent,
								draft.root
							)
							assert.equal(draft.byId.get("hq"), draft.root)
							assert.isTrue(draft.leads.has(old))
							assert.equal([ ...draft.leads ][0], old)
							assert.equal(draft.owners.get(old), "kim")
							assert.isTrue(draft.owners.has(old))
							assert.equal(
								[ ...draft.owners.keys() ][0],
								eng
							)
							assert.equal(old.children.indexOf(node), 0)
							assert.isTrue(old.children.includes(node))
							old.children.splice(old.children.indexOf(node), 1)
							target.children.push(node)
							node.parent = target
							assert.equal(
								draft.root.children[1]?.children[0],
								node
							)
						}
					)
					const next_root = /** @type {Dept} */(next.byId.get("hq"))/**/
					const next_eng = /** @type {Dept} */(next.byId.get("eng"))/**/
					const next_ops = /** @type {Dept} */(next.byId.get("ops"))/**/
					const next_web = /** @type {Dept} */(next.byId.get("web"))/**/
					assert.equal(next.root, next_root)
					assert.equal(next_root.children.length, 2)
					assert.equal(next_root.children[0], next_eng)
					assert.equal(next_root.children[1], next_ops)
					assert.equal(next_eng.children.length, 0)
					assert.equal(next_ops.children.length, 1)
					assert.equal(next_ops.children[0], next_web)
					assert.equal(next_eng.parent, next_root)
					assert.equal(next_ops.parent, next_root)
					assert.equal(next_web.parent, next_ops)
					assert.equal(next.leads.size, 1)
					assert.isTrue(next.leads.has(next_eng))
					assert.equal(next.owners.get(next_eng), "kim")
					assert.equal(next.owners.size, 1)
					assert.equal(next.meta, state.meta)
					assert.notEqual(next_root, root)
					assert.equal(root.children[0], eng)
					assert.deepEqual(eng.children, [ web ])
					assert.equal(web.parent, eng)
					assert.isFalse(has_proxy(next))
					assert.equal(
						Object.isFrozen(next_web),
						frozen
					)
					assert.equal(
						Object.isFrozen(next_root.children),
						frozen
					)
					assert.equal(
						Object.isFrozen(next.owners),
						frozen
					)
				}
			}
		)
		it(
			"overridden collection methods and polluted prototypes",
			() => {
				class Counting extends Map {
					writes = 0
					/**
					 * @override
					 * @param {unknown} key
					 * @param {unknown} value
					 * @returns {this}
					 */
					set(key, value) {
						this.writes++
						return super.set(key, value)
					}
				}
				const map = new Counting([ [ "a", { v: 1 } ] ])
				map.writes = 0
				const next = deepUpdate(
					{ map },
					draft => {
						const item = /** @type {{ v: number }} */(draft.map.get("a"))/**/
						item.v = 2
					}
				)
				assert.equal(next.map.writes, 0)
				assert.equal(
					/** @type {{ v: number }} */(next.map.get("a"))/**/.v,
					2
				)
				const hidden = { a: 1 }
				Object.defineProperty(
					hidden,
					"h",
					{
						configurable: true,
						value: 5,
						writable: true
					}
				)
				const proto = /** @type {{ polluted?: number }} */(Object.prototype)/**/
				proto.polluted = 1
				try {
					const kept = deepUpdate(
						{ o: hidden },
						draft => {
							draft.o.a = 2
						}
					)
					assert.isTrue(
						Object.prototype.hasOwnProperty.call(kept.o, "h")
					)
				} finally {
					delete proto.polluted
				}
			}
		)
		it(
			"recipe result",
			() => {
				const base = create()
				const replaced = deepUpdate(
					/** @type {unknown} */(base)/**/,
					() => ({ other: true })
				)
				assert.deepEqual(replaced, { other: true })
				assert.equal(
					deepUpdate(base, draft => draft),
					base
				)
				const spread = deepUpdate(
					base,
					draft => ({
						...draft,
						user: /** @type {never} */(null)/**/
					})
				)
				assert.equal(spread.list, base.list)
				assert.isNull(spread.user)
				assert.isFalse(has_proxy(spread))
				assert.throws(
					() => deepUpdate(
						base,
						draft => {
							draft.user.name = "Lee"
							return /** @type {never} */({ other: true })/**/
						}
					),
					TypeError
				)
				assert.throws(
					() => deepUpdate(
						base,
						draft => /** @type {never} */(draft.list.push({ done: true, id: 3 }))/**/
					),
					TypeError,
					/braces|void/
				)
			}
		)
		it(
			"revoked drafts",
			() => {
				/** @type {ReturnType<typeof create>["user"]} */
				let leaked
				deepUpdate(
					create(),
					draft => {
						leaked = draft.user
					}
				)
				assert.throws(() => leaked.name, TypeError)
				assert.throws(
					() => deepUpdate(
						create(),
						() => {
							throw new RangeError("stop")
						}
					),
					RangeError
				)
			}
		)
		it(
			"set members added back after iterating",
			() => {
				const member = { id: 1 }
				const base = new Set([ member, 2 ])
				const deleted = deepUpdate(
					base,
					draft => {
						draft.delete(member)
						void [ ...draft ]
						draft.add(member)
						for (const value of draft) {
							if (typeof value == "object") value.id = 2
						}
					}
				)
				const cleared = deepUpdate(
					base,
					draft => {
						void [ ...draft ]
						draft.clear()
						draft.add(member)
						assert.isTrue(draft.has(member))
						for (const value of draft) {
							if (typeof value == "object") value.id = 3
						}
					}
				)
				const replaced = deepUpdate(
					base,
					draft => {
						const [ value ] = draft
						if (typeof value == "object") value.id = 4
						draft.delete(member)
						draft.add(member)
						for (const item of draft) {
							if (typeof item == "object") assert.equal(item.id, 1)
						}
					}
				)
				assert.equal(member.id, 1)
				assert.deepEqual([ ...deleted ], [ 2, { id: 2 } ])
				assert.deepEqual([ ...cleared ], [ { id: 3 } ])
				assert.deepEqual([ ...replaced ], [ 2, member ])
				assert.isFalse(
					has_proxy([ deleted, cleared, replaced ])
				)
			}
		)
		it(
			"set readers and collection subclasses",
			() => {
				const member = { n: 0 }
				const set = new Set([ member ])
				const read = deepUpdate(
					set,
					draft => {
						assert.isTrue(draft.isSubsetOf(set))
						assert.isTrue(draft.isSupersetOf(set))
						assert.isFalse(draft.isDisjointFrom(set))
						assert.equal(draft.intersection(set).size, 1)
						assert.equal(draft.difference(set).size, 0)
						for (const item of draft) item.n = 1
						assert.equal(draft.union(set).size, 1)
						assert.equal(
							draft.symmetricDifference(set).size,
							0
						)
					}
				)
				assert.equal([ ...read ][0]?.n, 1)
				class Sized extends Map {
					#reads = 0
					/**
					 * @override
					 * @returns {number}
					 */
					get size() {
						this.#reads++
						return super.size
					}
				}
				deepUpdate(
					new Sized([ [ "a", 1 ] ]),
					draft => {
						draft.set("b", 2)
						assert.equal(draft.size, 2)
						draft.clear()
					}
				)
				class Hiding extends Map {
					/**
					 * @override
					 * @returns {MapIterator<[ unknown, unknown ]>}
					 */
					* [Symbol.iterator]() {
						for (const entry of super.entries()) {
							if (entry[0] !== "secret") yield entry
						}
					}
				}
				const hidden = deepUpdate(
					/** @type {{ a: { n: number }, x?: unknown }} */({ a: { n: 1 } })/**/,
					draft => {
						draft.x = Object.freeze(
							new Hiding([ [ "secret", draft.a ] ])
						)
					}
				)
				assert.equal(
					Map.prototype.get.call(
						/** @type {Map<unknown, unknown>} */(hidden.x)/**/,
						"secret"
					),
					hidden.a
				)
				class Defensive extends Map {
					/**
					 * @override
					 * @param {unknown} key
					 * @returns {unknown}
					 */
					get(key) {
						const value = super.get(key)
						return value && typeof value == "object"
							? { ...value }
							: value
					}
				}
				const original = new Defensive([ [ "a", { n: 0 } ] ])
				const next = deepUpdate(
					original,
					draft => {
						draft.set("z", 1)
						const item = /** @type {{ n: number }} */(draft.get("a"))/**/
						item.n = 1
					}
				)
				assert.deepEqual(
					Map.prototype.get.call(original, "a"),
					{ n: 0 }
				)
				assert.deepEqual(
					Map.prototype.get.call(next, "a"),
					{ n: 1 }
				)
			}
		)
		it(
			"sets",
			() => {
				const base = create()
				const next = deepUpdate(
					base,
					draft => {
						for (const item of draft.set) {
							if (item.id == 1) item.done = true
						}
						draft.set.add({ id: 3 })
						const [ , second ] = draft.set
						assert.isTrue(
							draft.set.has(
								/** @type {{ done?: boolean, id: number }} */(second)/**/
							)
						)
						draft.set.delete(
							/** @type {{ done?: boolean, id: number }} */(second)/**/
						)
					}
				)
				assert.deepEqual(
					[ ...next.set ],
					[ { done: true, id: 1 }, { id: 3 } ]
				)
				assert.equal(base.set.size, 2)
				assert.isFalse(has_proxy(next))
				const [ first, second ] = base.set
				const added_first = deepUpdate(
					base,
					draft => {
						draft.set.add({ id: 3 })
						assert.isTrue(
							draft.set.has(
								/** @type {{ done?: boolean, id: number }} */(first)/**/
							)
						)
						assert.equal(draft.set.size, 3)
						for (const item of draft.set) {
							if (item.id == 1) item.done = true
						}
						assert.isTrue(
							draft.set.has(
								/** @type {{ done?: boolean, id: number }} */(first)/**/
							)
						)
						assert.isTrue(
							draft.set.delete(
								/** @type {{ done?: boolean, id: number }} */(second)/**/
							)
						)
						assert.isFalse(
							draft.set.has(
								/** @type {{ done?: boolean, id: number }} */(second)/**/
							)
						)
						draft.set.add(
							/** @type {{ done?: boolean, id: number }} */(second)/**/
						)
					}
				)
				assert.deepEqual(
					[ ...added_first.set ],
					[
						{ done: true, id: 1 },
						{ id: 3 },
						{ id: 2 }
					]
				)
				assert.equal(
					[ ...added_first.set ][2],
					second
				)
				assert.isFalse(has_proxy(added_first))
				const unioned = deepUpdate(
					{ set: new Set([ { id: 1 } ]) },
					draft => {
						for (const item of draft.set.union(new Set())) /** @type {{ id: number, seen?: boolean }} */(item)/**/.seen = true
					}
				)
				assert.deepEqual(
					[ ...unioned.set ],
					[ { id: 1, seen: true } ]
				)
				const owned = deepUpdate(
					{ set: new Set([ { id: 1 } ]) },
					draft => {
						for (const item of draft.set) /** @type {{ id: number, owner?: Set<{ id: number }> }} */(item)/**/.owner = draft.set
					}
				)
				assert.equal(
					/** @type {{ id: number, owner?: Set<{ id: number }> }} */([ ...owned.set ][0])/**/.owner,
					owned.set
				)
				assert.isFalse(has_proxy(owned))
				const frozen_member = deepUpdate(
					create(),
					draft => {
						draft.wrapper = Object.freeze({ user: draft.user })
						draft.user.name = "Lee"
					}
				)
				assert.equal(
					/** @type {{ user: ReturnType<typeof create>["user"] }} */(frozen_member.wrapper)/**/.user,
					frozen_member.user
				)
				assert.isTrue(
					Object.isFrozen(frozen_member.wrapper)
				)
				assert.isFalse(has_proxy(frozen_member))
				deepUpdate(
					{ set: new Set([ 1, 2 ]) },
					draft => {
						const set = draft.set
						assert.deepEqual(
							[ ...set.union(new Set([ 3 ])) ],
							[ 1, 2, 3 ]
						)
						assert.isTrue(
							set.isSupersetOf(new Set([ 1 ]))
						)
						assert.isTrue(
							set.isSubsetOf(new Set([ 1, 2, 3 ]))
						)
						assert.isTrue(
							set.isDisjointFrom(new Set([ 3 ]))
						)
						assert.deepEqual(
							[
								...set.difference(new Set([ 1 ]))
							],
							[ 2 ]
						)
						assert.deepEqual(
							[
								...set.intersection(new Set([ 1 ]))
							],
							[ 1 ]
						)
						assert.deepEqual(
							[
								...set.symmetricDifference(new Set([ 1, 3 ]))
							],
							[ 2, 3 ]
						)
					}
				)
			}
		)
		it(
			"shared and circular values found while the recipe runs",
			() => {
				/**
				 * @returns {{ byId: { a: { id: string } }, list: { id: string }[], other: { id: string }[] }}
				 */
				function build() {
					const a = { id: "a" }
					return {
						byId: { a },
						list: [ a ],
						other: [ a ]
					}
				}
				const index = build()
				const read = deepUpdate(
					index,
					draft => {
						assert.equal(draft.list[0], draft.byId.a)
						draft.byId.a.id = "A"
					}
				)
				assert.equal(read.byId.a.id, "A")
				assert.equal(read.list[0], read.byId.a)
				assert.equal(read.other[0], read.byId.a)
				const again_index = deepUpdate(
					index,
					draft => {
						draft.byId.a.id = "C"
					}
				)
				assert.equal(
					again_index.list[0],
					again_index.byId.a
				)
				const fresh = build()
				const unread = deepUpdate(
					fresh,
					draft => {
						draft.byId.a.id = "A"
					}
				)
				assert.equal(unread.byId.a.id, "A")
				assert.equal(unread.list[0], fresh.byId.a)
				assert.equal(unread.other[0], fresh.byId.a)
				const again = deepUpdate(
					read,
					draft => {
						draft.byId.a.id = "B"
					}
				)
				assert.equal(again.list[0], again.byId.a)
				assert.equal(again.other[0]?.id, "B")
				const other = build()
				const forced = deepUpdate(
					other,
					draft => {
						draft.byId.a.id = "A"
					},
					{ graph: false }
				)
				assert.equal(forced.list[0], other.byId.a)
				for (const count of [ 1, 31, 32, 33, 100, 3000 ]) {
					const items = Array.from(
						{ length: count },
						(_, id) => ({ id, name: `n${id}`, price: id })
					)
					const catalog = deepFreeze(
						{
							all: items,
							featured: [ items[0] ]
						}
					)
					const priced = deepUpdate(
						catalog,
						draft => {
							for (const item of draft.all) item.price++
							const featured = /** @type {{ name: string }} */(draft.featured[0])/**/
							featured.name = "featured"
							assert.equal(featured, draft.all[0])
						}
					)
					assert.equal(
						priced.featured[0],
						priced.all[0]
					)
					assert.deepEqual(
						priced.all[0],
						{ id: 0, name: "featured", price: 1 }
					)
					assert.equal(
						priced.all[count - 1]?.price,
						count
					)
					const fresh_items = deepCopy(items)
					const restored = deepUpdate(
						{
							all: fresh_items,
							featured: [ fresh_items[0] ]
						},
						draft => {
							for (const item of draft.all) item.price++
							draft.all[0] = /** @type {typeof items[0]} */(fresh_items[0])/**/
							const featured = /** @type {{ name: string }} */(draft.featured[0])/**/
							featured.name = "featured"
						}
					)
					const member = { n: 0 }
					const readded = deepUpdate(
						{
							items: deepCopy(items),
							other: { member },
							set: new Set([ member ])
						},
						draft => {
							for (const item of draft.items) item.price++
							draft.set.clear()
							draft.set.add(member)
							draft.other.member.n = 5
							assert.equal(
								[ ...draft.set ][0],
								draft.other.member
							)
						}
					)
					assert.isTrue(
						readded.set.has(readded.other.member)
					)
					assert.equal(readded.other.member.n, 5)
					assert.equal(restored.all[0], fresh_items[0])
					assert.deepEqual(
						restored.featured[0],
						{ id: 0, name: "featured", price: 0 }
					)
				}
			}
		)
		it(
			"shared and circular values in async and nested recipes and snapshots",
			async () => {
				/** @type {Dept} */
				const root = {
					children: [],
					name: "HQ",
					parent: null
				}
				/** @type {Dept} */
				const eng = {
					children: [],
					name: "Eng",
					parent: root
				}
				root.children.push(eng)
				const state = deepFreeze(
					{
						byId: new Map(
							[ [ "eng", eng ], [ "hq", root ] ]
						),
						root
					}
				)
				const later = await deepUpdate(
					state,
					async draft => {
						await Promise.resolve()
						const dept = /** @type {Dept} */(draft.byId.get("eng"))/**/
						dept.name = "E"
						await Promise.resolve()
						assert.equal(draft.root.children[0], dept)
					}
				)
				assert.equal(
					later.root.children[0],
					later.byId.get("eng")
				)
				assert.equal(
					later.root.children[0]?.name,
					"E"
				)
				assert.equal(
					later.root.children[0]?.parent,
					later.root
				)
				const nested = deepUpdate(
					state,
					outer => {
						const inner = deepUpdate(
							outer.root,
							value => {
								const child = /** @type {Dept} */(value.children[0])/**/
								child.name = "E2"
								assert.equal(child.parent, value)
							}
						)
						assert.equal(inner.children[0]?.parent, inner)
						assert.equal(inner.children[0]?.name, "E2")
						assert.equal(
							outer.root.children[0]?.name,
							"Eng"
						)
						outer.root = inner
					}
				)
				assert.equal(
					nested.root.children[0]?.name,
					"E2"
				)
				assert.equal(
					nested.root.children[0]?.parent,
					nested.root
				)
				class Payroll {
					#salary = 100
					get salary() {
						return this.#salary
					}
				}
				const payroll = new Payroll()
				const expected = deepCopy({ root })
				const expected_eng = /** @type {Dept} */(expected.root.children[0])/**/
				expected_eng.name = "E3"
				deepUpdate(
					{ ...state, payroll },
					draft => {
						const dept = /** @type {Dept} */(draft.byId.get("eng"))/**/
						dept.name = "E3"
						const copy = deepCopy(draft)
						assert.isFalse(has_proxy(copy))
						assert.equal(
							copy.root.children[0],
							copy.byId.get("eng")
						)
						assert.equal(
							copy.root.children[0]?.name,
							"E3"
						)
						assert.equal(
							copy.root.children[0]?.parent,
							copy.root
						)
						assert.equal(copy.payroll, payroll)
						assert.equal(copy.payroll.salary, 100)
						assert.isFalse(Object.isFrozen(copy.root))
						assert.isTrue(
							deepEqual({ root: draft.root }, expected)
						)
						assert.isTrue(
							deepEqual(expected, { root: draft.root })
						)
						assert.isFalse(
							deepEqual(state.root, draft.root)
						)
						assert.isTrue(deepEqual(state.root, root))
						assert.deepEqual(
							deepDiff(state.root, draft.root),
							[
								{
									op: "replace",
									path: [ "children", 0, "name" ],
									value: "E3"
								}
							]
						)
						const merged = deepMerge(
							{ extra: 1 },
							{ root: draft.root }
						)
						assert.equal(merged.root, draft.root)
						assert.isFalse(has_proxy(deepCopy(merged)))
						assert.equal(
							merged.root.children[0]?.name,
							"E3"
						)
						assert.equal(
							merged.root.children[0]?.parent,
							merged.root
						)
					},
					{ graph: true }
				)
			}
		)
		it(
			"shared and circular values keep their shape",
			() => {
				/** @type {Dept} */
				const root = {
					children: [],
					name: "HQ",
					parent: null
				}
				/** @type {Dept} */
				const eng = {
					children: [],
					name: "Eng",
					parent: root
				}
				root.children.push(eng)
				const renamed = deepUpdate(
					{ root },
					draft => {
						const parent = /** @type {Dept} */(draft.root.children[0]?.parent)/**/
						parent.name = "Headquarters"
					}
				)
				assert.equal(
					renamed.root.name,
					"Headquarters"
				)
				assert.equal(
					renamed.root.children[0]?.parent,
					renamed.root
				)
				assert.equal(root.name, "HQ")
				assert.equal(
					deepUpdate(
						{ root },
						draft => {
							draft.root.name = "HQ"
							assert.equal(
								draft.root.children[0]?.parent,
								draft.root
							)
						}
					).root,
					root
				)
				const a = { id: "a", tags: [ "x" ] }
				const b = { id: "b" }
				const index = {
					byId: { a, b },
					list: [ a, b ],
					pair: [ a ],
					rest: { b }
				}
				const split = deepUpdate(
					index,
					draft => {
						draft.byId.a.id = "A"
					}
				)
				assert.equal(split.byId.a.id, "A")
				assert.equal(split.list[0], a)
				const next = deepUpdate(
					index,
					draft => {
						draft.byId.a.id = "A"
					},
					{ graph: true }
				)
				assert.equal(next.byId.a.id, "A")
				assert.equal(next.list[0], next.byId.a)
				assert.equal(next.pair[0], next.byId.a)
				assert.equal(next.byId.a.tags, a.tags)
				assert.equal(next.byId.b, b)
				assert.equal(next.list[1], b)
				assert.equal(next.rest, index.rest)
				assert.equal(a.id, "a")
				const key = { k: 1 }
				const members = {
					key,
					map: new Map([ [ key, key ] ]),
					set: new Set([ key ])
				}
				const keyed = deepUpdate(
					members,
					draft => {
						draft.key.k = 2
					},
					{ graph: true }
				)
				assert.equal(keyed.key.k, 2)
				assert.equal(
					keyed.map.get(keyed.key),
					keyed.key
				)
				assert.equal(keyed.map.size, 1)
				assert.isTrue(keyed.set.has(keyed.key))
				assert.equal(keyed.set.size, 1)
				assert.isTrue(members.map.has(key))
				class Watch {
					/** @param {{ k: number }} product */
					constructor(product) {
						this.product = product
					}
				}
				const watch = new Watch(key)
				const watched = deepUpdate(
					{
						key,
						nested: { deep: [ { key } ] },
						watch
					},
					draft => {
						draft.key.k = 3
					},
					{ graph: true }
				)
				assert.equal(
					watched.nested.deep[0]?.key,
					watched.key
				)
				assert.equal(watched.watch, watch)
				assert.equal(watched.watch.product, key)
				assert.equal(key.k, 1)
				/** @type {{ a: { n: number }, list: { n: number }[] }} */
				const tree = { a: { n: 1 }, list: [] }
				const aliased = deepUpdate(
					tree,
					draft => {
						draft.list.push(draft.a)
					}
				)
				assert.equal(aliased.list[0], aliased.a)
				const changed = deepUpdate(
					aliased,
					draft => {
						draft.a.n = 2
					}
				)
				assert.equal(changed.list[0], changed.a)
				assert.equal(changed.a.n, 2)
				const moved = deepUpdate(
					changed,
					draft => {
						draft.list.splice(0, 1)
					}
				)
				assert.deepEqual(moved.list, [])
				assert.equal(moved.a, changed.a)
				/** @type {{ x?: { f: number } }[]} */
				const pair = [ {}, {} ]
				const fresh = { f: 1 }
				const placed = deepUpdate(
					pair,
					draft => {
						const [ first, second ] = /** @type {[ { x?: { f: number } }, { x?: { f: number } } ]} */(draft)/**/
						first.x = fresh
						second.x = fresh
					}
				)
				const refreshed = deepUpdate(
					placed,
					draft => {
						const placed_value = /** @type {{ f: number }} */(draft[0]?.x)/**/
						placed_value.f = 2
					}
				)
				assert.equal(refreshed[0]?.x, refreshed[1]?.x)
				assert.equal(refreshed[1]?.x?.f, 2)
				assert.equal(fresh.f, 1)
				const holder = {
					c: /** @type {{ one: { v: number }, two: { v: number } } | undefined} */(undefined)/**/
				}
				const inner = deepFreeze({ v: 1 })
				const with_frozen = deepUpdate(
					holder,
					draft => {
						draft.c = deepFreeze({ one: inner, two: inner })
					}
				)
				const thawed = deepUpdate(
					with_frozen,
					draft => {
						const c = /** @type {{ one: { v: number }, two: { v: number } }} */(draft.c)/**/
						c.one.v = 2
					}
				)
				assert.equal(thawed.c?.two, thawed.c?.one)
				assert.equal(thawed.c?.two?.v, 2)
				assert.equal(inner.v, 1)
				const self = /** @type {{ n: number, self?: unknown }} */({ n: 1 })/**/
				self.self = self
				const cycled = deepUpdate(
					self,
					draft => {
						draft.n = 2
					},
					{ graph: true }
				)
				assert.equal(cycled.self, cycled)
				assert.equal(self.self, self)
				const frozen = deepFreeze({ root })
				const thawed_root = deepUpdate(
					frozen,
					draft => {
						const child = /** @type {Dept} */(draft.root.children[0])/**/
						child.name = "Engineering"
					},
					{ graph: true }
				)
				const again = deepUpdate(
					thawed_root,
					draft => {
						const child = /** @type {Dept} */(draft.root.children[0])/**/
						child.name = "Eng"
					}
				)
				assert.equal(
					again.root.children[0]?.parent,
					again.root
				)
				assert.equal(
					thawed_root.root.children[0]?.parent,
					thawed_root.root
				)
				assert.equal(
					thawed_root.root.children[0]?.name,
					"Engineering"
				)
				assert.isTrue(
					Object.isFrozen(thawed_root.root)
				)
				assert.isTrue(
					Object.isFrozen(thawed_root.root.children[0])
				)
			}
		)
		it(
			"shared and circular values reached from new values and nested snapshots",
			() => {
				const shared = { n: 1 }
				const other = { m: 1 }
				/** @type {{ a: { n: number }, b: { n: number }, c: { m: number }, d: { m: number }, x?: { keep: unknown, ref: unknown }, y?: { keep: unknown, ref: unknown } }} */
				const state = {
					a: shared,
					b: shared,
					c: other,
					d: other
				}
				const next = deepUpdate(
					state,
					draft => {
						draft.a.n = 2
						assert.equal(draft.c.m, 1)
						draft.x = { keep: state.c, ref: state.a }
						draft.y = Object.freeze(
							{ keep: state.c, ref: state.a }
						)
						assert.deepEqual(
							deepDiff(1, draft.a),
							[
								{
									op: "replace",
									path: [],
									value: { n: 2 }
								}
							]
						)
					},
					{ graph: true }
				)
				assert.equal(next.x?.ref, next.a)
				assert.equal(next.x?.keep, other)
				assert.equal(next.y?.ref, next.a)
				assert.equal(next.y?.keep, other)
				assert.equal(next.b, next.a)
				assert.isTrue(Object.isFrozen(next.y))
				const item = { n: 1 }
				const nested = {
					m: new Map([ [ "k", item ] ]),
					s: new Set([ item ]),
					x: item
				}
				deepUpdate(
					nested,
					outer => {
						deepUpdate(
							outer,
							inner => {
								assert.equal(inner.m.size, 1)
								assert.equal(inner.s.size, 1)
								inner.x.n = 2
								const copy = deepCopy(inner)
								assert.equal(copy.m.get("k"), copy.x)
								assert.isTrue(copy.s.has(copy.x))
								assert.equal(copy.x.n, 2)
							},
							{ graph: true }
						)
					}
				)
				const plain = {
					list: /** @type {unknown[]} */([])/**/
				}
				deepUpdate(
					{ a: { n: 1 } },
					outer => {
						const inner = deepUpdate(
							plain,
							value => {
								value.list.push(
									Object.freeze({ ref: outer.a })
								)
								value.list.push({ ref: outer.a })
							}
						)
						assert.equal(
							/** @type {{ ref: unknown }} */(inner.list[0])/**/.ref,
							outer.a
						)
						assert.equal(
							/** @type {{ ref: unknown }} */(inner.list[1])/**/.ref,
							outer.a
						)
					}
				)
			}
		)
		it(
			"sharing added by a recipe is kept by later updates",
			() => {
				/**
				 * @returns {{ a: { n: number }, b?: unknown, list: unknown[], map: Map<string, unknown>, set: Set<unknown>, w?: unknown }}
				 */
				function base() {
					return {
						a: { n: 1 },
						list: [ { n: 0 } ],
						map: new Map(),
						set: new Set()
					}
				}
				/**
				 * @param {ReturnType<typeof base>} value
				 * @returns {ReturnType<typeof base>}
				 */
				function bump(value) {
					return deepUpdate(
						value,
						draft => {
							draft.a.n++
						}
					)
				}
				const in_map = bump(
					deepUpdate(
						base(),
						draft => {
							draft.map.set("a", draft.a)
						}
					)
				)
				assert.equal(in_map.map.get("a"), in_map.a)
				assert.equal(in_map.a.n, 2)
				const in_set = bump(
					deepUpdate(
						base(),
						draft => {
							draft.set.add(draft.a)
						}
					)
				)
				assert.isTrue(in_set.set.has(in_set.a))
				const in_new = bump(
					deepUpdate(
						base(),
						draft => {
							draft.w = { ref: draft.a }
						}
					)
				)
				assert.equal(
					/** @type {{ ref: unknown }} */(in_new.w)/**/.ref,
					in_new.a
				)
				const returned = bump(
					deepUpdate(
						base(),
						draft => {
							const a = draft.a
							draft.a = { n: 5 }
							draft.a = a
							draft.b = a
						}
					)
				)
				assert.equal(returned.b, returned.a)
				assert.equal(returned.a.n, 2)
				const moved = bump(
					deepUpdate(
						base(),
						draft => {
							const a = draft.a
							draft.a = { n: 7 }
							draft.b = a
						}
					)
				)
				assert.equal(
					/** @type {{ n: number }} */(moved.b)/**/.n,
					1
				)
				assert.equal(moved.a.n, 8)
				const pushed = deepUpdate(
					deepUpdate(
						base(),
						draft => {
							draft.list.push(draft.list[0])
						}
					),
					draft => {
						/** @type {{ n: number }} */(draft.list[1])/**/.n = 3
					}
				)
				assert.equal(pushed.list[0], pushed.list[1])
				const shifted = deepUpdate(
					deepUpdate(
						{
							list: [ { n: 0 }, { n: 1 }, { n: 2 } ]
						},
						draft => {
							const [ first ] = draft.list.splice(0, 1)
							draft.list.push(
								/** @type {{ n: number }} */(first)/**/
							)
						}
					),
					draft => {
						/** @type {{ n: number }} */(draft.list[2])/**/.n = 9
					}
				)
				assert.deepEqual(
					shifted.list,
					[ { n: 1 }, { n: 2 }, { n: 9 } ]
				)
				const cleared = deepUpdate(
					deepUpdate(
						base(),
						draft => {
							const [ first ] = draft.list
							draft.list.length = 0
							draft.b = first
						}
					),
					draft => {
						/** @type {{ n: number }} */(draft.b)/**/.n = 4
					}
				)
				assert.equal(
					/** @type {{ n: number }} */(cleared.b)/**/.n,
					4
				)
				assert.deepEqual(cleared.list, [])
				const defined = deepUpdate(
					deepUpdate(
						base(),
						draft => {
							const [ first ] = draft.list
							Object.defineProperty(
								draft.list,
								0,
								{
									configurable: true,
									enumerable: true,
									value: { n: 6 },
									writable: true
								}
							)
							draft.b = first
						}
					),
					draft => {
						/** @type {{ n: number }} */(draft.b)/**/.n = 5
					}
				)
				assert.equal(
					/** @type {{ n: number }} */(defined.b)/**/.n,
					5
				)
				assert.deepEqual(defined.list, [ { n: 6 } ])
			}
		)
		it(
			"snapshots keep sharing between new values and drafts",
			() => {
				/** @type {Dept} */
				const tree = {
					children: [],
					name: "root",
					parent: null
				}
				deepUpdate(
					tree,
					draft => {
						/** @type {Dept} */
						const child = {
							children: [],
							name: "child",
							parent: draft
						}
						draft.children.push(child)
						const copy = deepCopy(child)
						assert.equal(copy.parent?.children[0], copy)
						const wrapped = deepCopy({ child, root: draft })
						assert.equal(
							wrapped.root.children[0],
							wrapped.child
						)
						assert.equal(
							wrapped.child.parent,
							wrapped.root
						)
						assert.isTrue(deepEqual(child, copy))
					},
					{ graph: true }
				)
				for (const graph of [ false, true ]) {
					deepUpdate(
						/** @type {{ head: { done?: boolean, next?: unknown } }} */({ head: {} })/**/,
						draft => {
							const head = draft.head
							const tail = { done: true, next: head }
							head.next = tail
							assert.deepEqual(
								deepDiff(tail, head),
								[
									{ op: "remove", path: [ "done" ] },
									{
										op: "add",
										path: [ "next", "done" ],
										value: true
									}
								]
							)
						},
						{ graph }
					)
				}
			}
		)
		it(
			"structural sharing and cycles",
			() => {
				const base = create()
				base.user.self = base.user
				const next = deepUpdate(
					base,
					draft => {
						draft.user.address.city = "Busan"
					},
					{ graph: true }
				)
				assert.notEqual(next, base)
				assert.notEqual(next.user, base.user)
				assert.equal(next.list, base.list)
				assert.equal(next.user.self, next.user)
				assert.equal(base.user.self, base.user)
				assert.equal(base.user.address.city, "Seoul")
				assert.isTrue(
					deepEqual(deepCopy(base), base)
				)
			}
		)
	}
)
/** @import { Chain } from "./private.js" */
import {
	deepCopy,
	deepDiff,
	deepEqual,
	deepFreeze,
	deepMerge,
	deepPatch,
	deepUpdate
} from "data-lube"
import { runInNewContext } from "node:vm"
import { assert, describe, it } from "vitest"
describe(
	"limits",
	() => {
		/**
		 * @param {number} value
		 * @returns {Chain}
		 */
		function chain(value) {
			/** @type {Chain | { value: number }} */
			let node = { value }
			for (let i = 0; i < 20000; i++) node = { i, next: node, set: new Set([ i ]) }
			return /** @type {Chain} */(node)/**/
		}
		/**
		 * @param {Chain} node
		 * @returns {unknown}
		 */
		function last(node) {
			/** @type {Chain | { value: number }} */
			let current = node
			while ("next" in current) current = current.next
			return current
		}
		it(
			"circular diffs list each change once",
			() => {
				/**
				 * @param {string} title
				 * @returns {unknown}
				 */
				function grid(title) {
					/** @type {{ cells: unknown[], title: string }} */
					const doc = { cells: [], title }
					/** @type {{ doc: unknown, down?: unknown, right?: unknown, x: number, y: number }[][]} */
					const rows = []
					for (let y = 0; y < 20; y++) {
						/** @type {{ doc: unknown, down?: unknown, right?: unknown, x: number, y: number }[]} */
						const row = []
						for (let x = 0; x < 20; x++) {
							const cell = { doc, x, y }
							row.push(cell)
							doc.cells.push(cell)
						}
						rows.push(row)
					}
					for (let y = 0; y < 20; y++) {
						for (let x = 0; x < 20; x++) {
							const cell = /** @type {{ down?: unknown, right?: unknown }} */(rows[y]?.[x])/**/
							cell.right = rows[y]?.[x + 1] ?? null
							cell.down = rows[y + 1]?.[x] ?? null
						}
					}
					return doc
				}
				assert.deepEqual(
					deepDiff(grid("a"), grid("b")),
					[
						{
							op: "replace",
							path: [ "title" ],
							value: "b"
						}
					]
				)
				/**
				 * @param {number} value
				 * @param {number} size
				 * @returns {unknown}
				 */
				function looped(value, size) {
					/** @type {{ c?: unknown, v: number }} */
					const inner = { v: value }
					const outer = { x: inner }
					inner.c = outer
					return {
						big: Array.from({ length: size }, () => ({})),
						p: inner,
						q: outer
					}
				}
				assert.deepEqual(
					deepDiff(looped(1, 10), looped(2, 10)).map(change => change.path),
					deepDiff(
						looped(1, 100001),
						looped(2, 100001)
					).map(change => change.path)
				)
			}
		)
		it(
			"deep chains of every container",
			() => {
				class Box {
					/**
					 * @param {unknown} inner
					 */
					constructor(inner) {
						this.inner = inner
					}
				}
				const foreign = /** @type {(value: unknown) => unknown[]} */(runInNewContext("value => [ value, 1 ]"))/**/
				/** @type {((value: unknown) => unknown)[]} */
				const wrappers = [
					value => new Map([ [ "k", value ] ]),
					value => new Set([ value ]),
					value => Object.assign(new Error("e"), { inner: value }),
					value => new Box(value),
					foreign,
					value => Object.assign(new Date(0), { inner: value }),
					value => ({ inner: value })
				]
				/**
				 * @param {number} leaf
				 * @returns {unknown}
				 */
				function build(leaf) {
					/** @type {unknown} */
					let value = { leaf }
					for (let i = 0; i < 3000; i++) value = /** @type {(value: unknown) => unknown} */(wrappers[i % wrappers.length])/**/(value)
					return value
				}
				const a = build(1)
				const copy = deepCopy(a)
				assert.notEqual(copy, a)
				assert.isTrue(deepEqual(copy, a))
				assert.isTrue(deepEqual(a, build(1)))
				assert.isFalse(deepEqual(a, build(2)))
				assert.isTrue(
					deepEqual(
						deepPatch(a, deepDiff(a, build(2))),
						build(2)
					)
				)
				deepFreeze(a)
				assert.isTrue(Object.isFrozen(a))
			}
		)
		it(
			"deep collections that need matching",
			() => {
				/**
				 * @param {number} leaf
				 * @returns {unknown}
				 */
				function maps(leaf) {
					/** @type {unknown} */
					let value = leaf
					for (let i = 0; i < 5000; i++) value = new Map(
						[
							[ { k: i }, value ],
							[ { k: -1 }, 0 ]
						]
					)
					return value
				}
				/**
				 * @param {number} leaf
				 * @returns {unknown}
				 */
				function sets(leaf) {
					/** @type {unknown} */
					let value = leaf
					for (let i = 0; i < 5000; i++) value = new Set([ { n: value }, { v: i } ])
					return value
				}
				assert.isTrue(deepEqual(sets(1), sets(1)))
				assert.isFalse(deepEqual(sets(1), sets(2)))
				assert.isTrue(deepEqual(maps(1), maps(1)))
				assert.isFalse(deepEqual(maps(1), maps(2)))
				/** @type {unknown[]} */
				const spread = []
				spread.length = 2 ** 26
				for (let i = 0; i < 5; i++) spread[2 ** 22 * i] = { i }
				const start = performance.now()
				assert.isTrue(
					deepEqual(deepCopy(spread), spread)
				)
				assert.isBelow(performance.now() - start, 1000)
			}
		)
		it(
			"deep collections whose members collide",
			() => {
				/**
				 * @param {number} depth
				 * @returns {unknown}
				 */
				function keyed(depth) {
					/** @type {unknown} */
					let value = 0
					for (let i = 0; i < depth; i++) value = new Map([ [ {}, value ], [ {}, 0 ] ])
					return value
				}
				assert.isTrue(
					deepEqual(keyed(3000), keyed(3000))
				)
				/**
				 * @param {number} depth
				 * @param {boolean} reverse
				 * @returns {unknown}
				 */
				function ladder(depth, reverse) {
					/** @type {unknown} */
					let value = 0
					for (let i = 0; i < depth; i++) {
						/** @type {[ unknown, unknown ][]} */
						const entries = [
							[ {}, [ value, 1 ] ],
							[ {}, [ value, 2 ] ]
						]
						value = new Map(
							reverse
								? entries.reverse()
								: entries
						)
					}
					return value
				}
				const start = performance.now()
				assert.isTrue(
					deepEqual(
						ladder(40, false),
						ladder(40, true)
					)
				)
				assert.isBelow(performance.now() - start, 1000)
				/**
				 * @param {number} length
				 * @param {unknown} value
				 * @returns {unknown[]}
				 */
				function hidden(length, value) {
					/** @type {unknown[]} */
					const array = new Array(length)
					Object.defineProperty(
						array,
						3,
						{
							configurable: true,
							enumerable: false,
							value,
							writable: true
						}
					)
					return array
				}
				assert.isFalse(
					deepEqual(hidden(5000, 1), hidden(5000, 2))
				)
				const frozen = hidden(5000, {})
				deepFreeze(frozen)
				assert.isTrue(Object.isFrozen(frozen[3]))
				assert.isTrue(
					3 in deepCopy(hidden(5000, { x: 1 }))
				)
			}
		)
		it(
			"deep collections whose members collide, with differences at the bottom",
			() => {
				/**
				 * @param {unknown} leaf
				 * @returns {unknown}
				 */
				function wrap(leaf) {
					/** @type {unknown} */
					let value = leaf
					for (let i = 0; i < 400; i++) value = new Map([ [ {}, value ], [ {}, 0 ] ])
					return value
				}
				/** @type {[ () => unknown, () => unknown, boolean ][]} */
				const cases = [
					[
						() => new Set([ 1, { a: 1 } ]),
						() => new Set([ { a: 1 }, 1 ]),
						true
					],
					[
						() => new Set([ 1 ]),
						() => new Set([ 2 ]),
						false
					],
					[
						() => new Set([ {} ]),
						() => new Set([ 1 ]),
						false
					],
					[
						() => new Set([ 1, 2 ]),
						() => new Set([ 1 ]),
						false
					],
					[
						() => new Set([ { a: 1 } ]),
						() => new Set([ { a: 2 } ]),
						false
					],
					[
						() => new Map([ [ 1, { a: 1 } ] ]),
						() => new Map([ [ 1, { a: 1 } ] ]),
						true
					],
					[
						() => new Map([ [ 1, { a: 1 } ] ]),
						() => new Map([ [ 2, { a: 1 } ] ]),
						false
					],
					[
						() => new Map([ [ 1, 1 ] ]),
						() => new Map([ [ 1, 2 ] ]),
						false
					],
					[
						() => new Map([ [ {}, 1 ] ]),
						() => new Map([ [ {}, 2 ] ]),
						false
					],
					[
						() => new Map([ [ {}, {} ] ]),
						() => new Map([ [ {}, 1 ] ]),
						false
					],
					[
						() => new Map([ [ { k: 1 }, NaN ] ]),
						() => new Map([ [ { k: 1 }, NaN ] ]),
						true
					],
					[
						() => Object.assign(new Set(), { t: 1 }),
						() => Object.assign(new Set(), { t: 2 }),
						false
					],
					[
						() => Object.create(null),
						() => ({}),
						false
					],
					[
						() => ({ a: 1 }),
						() => ({ a: 2 }),
						false
					],
					[
						() => new Date(1),
						() => new Date(1),
						true
					]
				]
				for (const [ left, right, expected ] of cases) {
					assert.equal(
						deepEqual(wrap(left()), wrap(right())),
						expected,
						String(left)
					)
				}
			}
		)
		it(
			"deep nesting",
			() => {
				const a = chain(1)
				const b = chain(2)
				assert.isFalse(deepEqual(a, b))
				assert.isTrue(deepEqual(a, chain(1)))
				const copy = deepCopy(a)
				assert.notEqual(last(copy), last(a))
				assert.isTrue(deepEqual(copy, a))
				const changes = deepDiff(a, b)
				assert.lengthOf(changes, 1)
				assert.lengthOf(
					/** @type {{ path: unknown[] }} */(changes[0])/**/.path,
					20001
				)
				assert.isTrue(
					deepEqual(deepPatch(a, changes), b)
				)
				assert.deepEqual(
					last(deepMerge(a, b)),
					{ value: 2 }
				)
				const updated = deepUpdate(
					a,
					draft => {
						/** @type {Chain | { value: number }} */
						let node = draft
						while ("next" in node) node = node.next
						node.value = 3
					}
				)
				assert.deepEqual(last(updated), { value: 3 })
				assert.deepEqual(last(a), { value: 1 })
				const added = deepUpdate(
					/** @type {{ chain?: Chain, user: { n: number } }} */({ user: { n: 1 } })/**/,
					draft => {
						const fresh = chain(4)
						const tail = /** @type {{ user?: unknown }} */(last(fresh))/**/
						tail.user = draft.user
						draft.chain = fresh
					}
				)
				assert.equal(
					/** @type {{ user?: unknown }} */(last(
						/** @type {Chain} */(added.chain)/**/
					))/**/.user,
					added.user
				)
				deepFreeze(a)
				assert.isTrue(Object.isFrozen(last(a)))
				const frozen = deepUpdate(
					a,
					draft => {
						draft.i = -1
					}
				)
				assert.isTrue(Object.isFrozen(frozen))
			}
		)
		it(
			"deep nesting with cycles and collections",
			() => {
				/**
				 * @returns {Chain}
				 */
				function ring() {
					const node = chain(1)
					const tail = /** @type {{ next?: unknown }} */(last(node))/**/
					tail.next = node
					return node
				}
				assert.isTrue(deepEqual(ring(), ring()))
				assert.lengthOf(deepDiff(ring(), ring()), 0)
				const copy = deepCopy(ring())
				/** @type {{ next: unknown }} */
				let node = copy
				for (let i = 0; i <= 20000; i++) node = /** @type {{ next: unknown }} */(node.next)/**/
				assert.equal(node, copy)
				/** @type {unknown} */
				let sets = 1
				/** @type {unknown} */
				let others = 1
				/** @type {unknown} */
				let maps = 1
				/** @type {unknown} */
				let map_others = 1
				for (let i = 0; i < 20000; i++) {
					sets = new Set([ [ sets ] ])
					others = new Set([ [ others ] ])
					maps = new Map([ [ { i }, maps ] ])
					map_others = new Map([ [ { i }, map_others ] ])
				}
				assert.isTrue(deepEqual(sets, others))
				assert.isTrue(deepEqual(maps, map_others))
				assert.isTrue(
					deepEqual(deepCopy(sets), sets)
				)
				assert.lengthOf(deepDiff(maps, map_others), 0)
			}
		)
		it(
			"deep shared and circular diffs",
			() => {
				/**
				 * @returns {unknown}
				 */
				function ladder() {
					/** @type {unknown} */
					let value = { leaf: 1 }
					for (let i = 0; i < 30; i++) value = { l: value, r: value }
					for (let i = 0; i < 190; i++) value = { c: value }
					return value
				}
				assert.lengthOf(deepDiff(ladder(), ladder()), 0)
				/**
				 * @param {number} value
				 * @returns {unknown}
				 */
				function linked(value) {
					/** @type {{ i: number, next?: unknown, prev?: unknown }} */
					const head = { i: 0 }
					let current = head
					for (let i = 1; i < 500; i++) {
						/** @type {{ i: number, next?: unknown, prev?: unknown }} */
						const node = {
							i: i == 3
								? value
								: i,
							prev: current
						}
						current.next = node
						current = node
					}
					return head
				}
				assert.deepEqual(
					deepDiff(linked(1), linked(2)),
					[
						{
							op: "replace",
							path: [ "next", "next", "next", "i" ],
							value: 2
						}
					]
				)
				const frozen = deepUpdate(
					/** @type {{ a: { x: number }, b?: unknown }} */({ a: { x: 1 } })/**/,
					draft => {
						/** @type {unknown} */
						let value = Object.freeze({ ref: draft.a })
						for (let i = 0; i < 20000; i++) value = Object.freeze({ c: value })
						draft.b = value
					}
				)
				/** @type {{ c?: unknown, ref?: unknown }} */
				let node = /** @type {{ c?: unknown }} */(frozen.b)/**/
				while (node.c) node = /** @type {{ c?: unknown, ref?: unknown }} */(node.c)/**/
				assert.equal(node.ref, frozen.a)
			}
		)
		it(
			"deep shared and circular updates",
			() => {
				/** @type {{ i: number, next?: unknown, prev?: unknown }} */
				const head = { i: 0 }
				let tail = head
				for (let i = 1; i < 20000; i++) {
					/** @type {{ i: number, next?: unknown, prev?: unknown }} */
					const node = { i, prev: tail }
					tail.next = node
					tail = node
				}
				const state = deepFreeze({ head, tail })
				const next = deepUpdate(
					state,
					draft => {
						draft.tail.i = -1
						const copy = deepCopy(draft)
						/** @type {{ next?: unknown }} */
						let node = copy.head
						while (node.next) node = /** @type {{ next?: unknown }} */(node.next)/**/
						assert.equal(node, copy.tail)
					},
					{ graph: true }
				)
				/** @type {{ i: number, next?: unknown, prev?: unknown }} */
				let node = next.head
				let count = 1
				while (node.next) {
					const following = /** @type {{ i: number, next?: unknown, prev?: unknown }} */(node.next)/**/
					assert.equal(following.prev, node)
					node = following
					count++
				}
				assert.equal(count, 20000)
				assert.equal(node, next.tail)
				assert.equal(node.i, -1)
				assert.equal(tail.i, 19999)
				assert.isTrue(Object.isFrozen(next.head))
				const ring = chain(1)
				const end = /** @type {{ next?: unknown }} */(last(ring))/**/
				end.next = ring
				const turned = deepUpdate(
					{ ring },
					draft => {
						const second = /** @type {Chain} */(draft.ring.next)/**/
						second.i = -5
					},
					{ graph: true }
				)
				/** @type {{ i?: number, next: unknown }} */
				let current = turned.ring
				for (let i = 0; i <= 20000; i++) current = /** @type {{ next: unknown }} */(current.next)/**/
				assert.equal(current, turned.ring)
				assert.equal(
					/** @type {Chain} */(turned.ring.next)/**/.i,
					-5
				)
				assert.equal(
					/** @type {Chain} */(ring.next)/**/.i,
					19998
				)
			}
		)
		it(
			"deep shared values",
			() => {
				/**
				 * @param {number} v
				 * @returns {unknown}
				 */
				function build(v) {
					const shared = { v }
					return {
						left: nest(shared, 300),
						right: nest(shared, 300),
						tail: nest(
							{
								mid: v,
								rest: nest({ v, w: v }, 300)
							},
							250
						)
					}
				}
				/**
				 * @param {unknown} leaf
				 * @param {number} depth
				 * @returns {unknown}
				 */
				function nest(leaf, depth) {
					/** @type {unknown} */
					let value = leaf
					for (let i = 0; i < depth; i++) value = { next: value }
					return value
				}
				const before = build(1)
				const after = build(2)
				const changes = deepDiff(before, after)
				assert.lengthOf(changes, 5)
				assert.isTrue(
					deepEqual(
						deepPatch(before, changes),
						after
					)
				)
			}
		)
		it(
			"large dense and sparse arrays",
			() => {
				const dense = Array.from(
					{ length: 5000 },
					(_, i) => ({ i })
				)
				const copy = deepCopy(dense)
				assert.isTrue(deepEqual(copy, dense))
				const item = /** @type {{ i: number }} */(copy[4999])/**/
				item.i = -1
				assert.deepEqual(
					deepDiff(dense, copy),
					[
						{
							op: "replace",
							path: [ 4999, "i" ],
							value: -1
						}
					]
				)
				deepFreeze(copy)
				assert.isTrue(Object.isFrozen(copy[4999]))
				/** @type {unknown[] & { tag?: number }} */
				const tagged = []
				tagged[10000] = { x: 1 }
				tagged.tag = 1
				assert.deepEqual(
					Object.keys(deepCopy(tagged)),
					[ "10000" ]
				)
				/** @type {unknown[]} */
				const more = []
				more[10000] = { x: 1 }
				more[5] = 1
				assert.isFalse(deepEqual(tagged, more))
				/** @type {unknown[]} */
				const holes = []
				holes[10000] = 1
				holes[3] = undefined
				/** @type {unknown[]} */
				const filled = []
				filled[10000] = 1
				assert.deepEqual(
					deepDiff(holes, filled),
					[
						{
							op: "replace",
							path: [ 3 ],
							value: undefined
						}
					]
				)
				assert.deepEqual(
					deepDiff(holes, dense),
					[
						{
							op: "replace",
							path: [],
							value: dense
						}
					]
				)
				const foreign = /** @type {unknown[]} */(runInNewContext(
					"const list = []; list[10000] = 1; list[2] = 'a'; list"
				))/**/
				const foreign_copy = deepCopy(foreign)
				assert.equal(foreign_copy[2], "a")
				assert.isFalse(3 in foreign_copy)
				const frozen = /** @type {unknown[]} */([])/**/
				const user = { n: 1 }
				const updated = deepUpdate(
					{
						list: /** @type {unknown} */(undefined)/**/,
						user
					},
					draft => {
						frozen[10000] = draft.user
						draft.list = Object.freeze(frozen)
					}
				)
				assert.equal(
					/** @type {unknown[]} */(updated.list)/**/[10000],
					user
				)
			}
		)
		it(
			"sparse arrays",
			() => {
				/** @type {unknown[]} */
				const a = []
				a[1e8] = { x: 1 }
				a[7] = 1
				/** @type {unknown[]} */
				const b = []
				b[1e8] = { x: 2 }
				b[7] = 1
				const start = performance.now()
				const copy = deepCopy(a)
				assert.lengthOf(copy, 1e8 + 1)
				assert.isFalse(6 in copy)
				assert.deepEqual(copy[1e8], { x: 1 })
				assert.notEqual(copy[1e8], a[1e8])
				assert.isTrue(deepEqual(a, copy))
				assert.isFalse(deepEqual(a, b))
				/** @type {unknown[]} */
				const moved = []
				moved[1e8] = { x: 1 }
				moved[8] = 1
				assert.isFalse(deepEqual(a, moved))
				const changes = deepDiff(a, b)
				assert.deepEqual(
					changes,
					[
						{
							op: "replace",
							path: [ 1e8, "x" ],
							value: 2
						}
					]
				)
				assert.isTrue(
					deepEqual(deepPatch(a, changes), b)
				)
				/** @type {unknown[]} */
				const longer = []
				longer[2e8] = 1
				assert.isTrue(
					deepEqual(
						deepPatch(a, deepDiff(a, longer)),
						longer
					)
				)
				const updated = deepUpdate(
					{ list: a },
					draft => {
						draft.list[5] = 5
					}
				)
				assert.equal(updated.list[5], 5)
				assert.isFalse(4 in updated.list)
				assert.equal(updated.list[1e8], a[1e8])
				/** @type {unknown[]} */
				const front = []
				front[0] = { y: 1 }
				front[1e8] = { y: 2 }
				deepFreeze(front)
				assert.isTrue(Object.isFrozen(front[0]))
				assert.isTrue(Object.isFrozen(front[1e8]))
				deepFreeze(a)
				assert.isTrue(Object.isFrozen(a[1e8]))
				const kept = deepUpdate(
					{ list: a },
					draft => {
						draft.list[1] = { y: 1 }
					}
				)
				assert.isTrue(Object.isFrozen(kept.list))
				assert.isBelow(performance.now() - start, 2000)
			}
		)
		it(
			"wide and shared inputs stay fast",
			() => {
				const start = performance.now()
				/**
				 * @param {number} value
				 * @returns {unknown}
				 */
				function ladder(value) {
					/** @type {unknown} */
					let node = { v: value }
					for (let i = 0; i < 26; i++) node = { l: node, r: node }
					/** @type {{ ladder: unknown, self?: unknown }} */
					const root = { ladder: node }
					root.self = root
					return root
				}
				assert.lengthOf(
					deepDiff(ladder(1), ladder(2)),
					1
				)
				/**
				 * @param {number} id
				 * @returns {Record<string, number>}
				 */
				function row(id) {
					/** @type {Record<string, number>} */
					const item = { id }
					for (let i = 0; i < 65; i++) item[`f${i}`] = 0
					return item
				}
				const left = new Set(
					Array.from(
						{ length: 3000 },
						(_, i) => row(i)
					)
				)
				const right = new Set(
					Array.from(
						{ length: 3000 },
						(_, i) => row(i + 3000)
					)
				)
				assert.lengthOf(
					deepDiff({ s: left }, { s: right }),
					6000
				)
				const shuffled = new Set(
					Array.from(
						{ length: 3000 },
						(_, i) => row(i * 7 % 3000)
					)
				)
				assert.isTrue(deepEqual(left, shuffled))
				/** @type {unknown} */
				let deep = { end: 1 }
				for (let i = 0; i < 250; i++) deep = { next: deep }
				const items = Array.from(
					{ length: 20000 },
					(_, i) => ({ i })
				)
				assert.isTrue(
					deepEqual(
						new Set([ deep, ...items ]),
						deepCopy(new Set([ deep, ...items ]))
					)
				)
				/**
				 * @param {number} depth
				 * @param {number} leaf
				 * @returns {unknown}
				 */
				function rings(depth, leaf) {
					/** @type {{ back?: unknown }} */
					const root = {}
					/** @type {unknown} */
					let value = leaf
					for (let i = 0; i < depth; i++) value = new Set(
						[
							{ back: root, y: value },
							{ back: root, y: value }
						]
					)
					root.back = value
					return root
				}
				assert.isFalse(
					deepEqual(rings(40, 1), rings(40, 2))
				)
				assert.isBelow(performance.now() - start, 5000)
			}
		)
	}
)
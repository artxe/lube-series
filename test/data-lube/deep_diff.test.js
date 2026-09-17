import {
	deepCopy,
	deepDiff,
	deepEqual,
	deepPatch,
	deepUpdate
} from "data-lube"
import { assert, describe, it } from "vitest"
describe(
	"deep_diff",
	() => {
		/**
		 * @param {unknown} before
		 * @param {unknown} after
		 * @returns {void}
		 */
		function round_trip(before, after) {
			const snapshot = deepCopy(before)
			const changes = deepDiff(before, after)
			assert.isTrue(
				deepEqual(
					deepPatch(before, changes),
					after
				)
			)
			assert.isTrue(deepEqual(before, snapshot))
		}
		it(
			"arrays",
			() => {
				assert.deepEqual(
					deepDiff([ 1, 2, 3 ], [ 1, 5 ]),
					[
						{
							op: "replace",
							path: [ 1 ],
							value: 5
						},
						{ op: "remove", path: [ 2 ] }
					]
				)
				assert.deepEqual(
					deepDiff([ 1 ], [ 1, 2, 3 ]),
					[
						{ op: "add", path: [ 1 ], value: 2 },
						{ op: "add", path: [ 2 ], value: 3 }
					]
				)
				assert.deepEqual(
					deepDiff([ 1, , 3 ], [ 1, undefined, 3 ]),
					[
						{
							op: "replace",
							path: [ 1 ],
							value: undefined
						}
					]
				)
				round_trip([ 1, 2, 3, 4 ], [ 9 ])
				round_trip(
					[ { a: 1 }, [ 1 ] ],
					[ { a: 2 }, [ 1, 2 ], 3 ]
				)
			}
		)
		it(
			"circular and deep references",
			() => {
				/** @type {{ self?: typeof before, value: number }} */
				const before = { value: 1 }
				before.self = before
				/** @type {{ self?: typeof after, value: number }} */
				const after = { value: 2 }
				after.self = after
				assert.deepEqual(
					deepDiff(before, after),
					[
						{
							op: "replace",
							path: [ "value" ],
							value: 2
						}
					]
				)
				/**
				 * @param {number} value
				 * @returns {{ node: ReturnType<typeof deep> } | { value: number }}
				 */
				function deep(value) {
					/** @type {ReturnType<typeof deep>} */
					let node = { value }
					for (let i = 0; i < 100; i++) node = { node }
					return node
				}
				assert.lengthOf(deepDiff(deep(1), deep(2)), 1)
				round_trip(deep(1), deep(2))
			}
		)
		it(
			"maps and sets",
			() => {
				const key = { id: 1 }
				assert.deepEqual(
					deepDiff(
						new Map(
							/** @type {[ string, { value: number } | number ][]} */([
								[ "a", { value: 1 } ],
								[ "b", 1 ]
							])/**/
						),
						new Map(
							/** @type {[ string, { value: number } | number ][]} */([
								[ "a", { value: 2 } ],
								[ "c", 1 ]
							])/**/
						)
					),
					[
						{
							op: "replace",
							path: [ "a", "value" ],
							value: 2
						},
						{ op: "remove", path: [ "b" ] },
						{ op: "add", path: [ "c" ], value: 1 }
					]
				)
				assert.deepEqual(
					deepDiff(
						new Set([ 1, key ]),
						new Set([ key, 2 ])
					),
					[
						{ op: "remove", path: [ 1 ] },
						{ op: "add", path: [ 2 ], value: 2 }
					]
				)
				assert.deepEqual(
					deepDiff(
						new Map(
							[ [ { id: 1 }, { value: 1 } ] ]
						),
						new Map(
							[ [ { id: 1 }, { value: 2 } ] ]
						)
					).map(change => change.op),
					[ "replace" ]
				)
				assert.deepEqual(
					deepDiff(
						new Set([ { id: 1 } ]),
						new Set([ { id: 1 } ])
					),
					[]
				)
				let reads = 0
				/**
				 * @param {number} id
				 * @returns {{ readonly id: number }}
				 */
				function counted(id) {
					return {
						get id() {
							reads++
							return id
						}
					}
				}
				const count = 3000
				assert.deepEqual(
					deepDiff(
						new Set(
							Array.from(
								{ length: count },
								(_, i) => counted(i)
							)
						),
						new Set(
							Array.from(
								{ length: count },
								(_, i) => counted(count - 1 - i)
							)
						)
					),
					[]
				)
				assert.isBelow(reads, count * 30)
				const shared = { value: 1 }
				const removed_key = { id: 2 }
				const added_key = { id: 3 }
				assert.deepEqual(
					deepDiff(
						new Map(
							/** @type {[ { id: number }, { value: number } | number ][]} */([
								[ { id: 1 }, shared ],
								[ removed_key, 1 ]
							])/**/
						),
						new Map(
							/** @type {[ { id: number }, { value: number } | number ][]} */([
								[ { id: 1 }, shared ],
								[ added_key, 1 ]
							])/**/
						)
					),
					[
						{
							op: "remove",
							path: [ removed_key ]
						},
						{
							op: "add",
							path: [ added_key ],
							value: 1
						}
					]
				)
				assert.deepEqual(
					deepDiff(
						new Set([ removed_key ]),
						new Set([ added_key ])
					),
					[
						{
							op: "remove",
							path: [ removed_key ]
						},
						{
							op: "add",
							path: [ added_key ],
							value: added_key
						}
					]
				)
				round_trip(
					{
						map: new Map(
							/** @type {[ { id: number } | string, { list: number[] } | number ][]} */([
								[ key, { list: [ 1 ] } ],
								[ "x", 1 ]
							])/**/
						),
						set: new Set([ 1, 2 ])
					},
					{
						map: new Map(
							/** @type {[ { id: number } | string, { list: number[] } | number ][]} */([
								[ key, { list: [ 1, 2 ] } ],
								[ "y", 2 ]
							])/**/
						),
						set: new Set([ 2, 3 ])
					}
				)
			}
		)
		it(
			"no changes",
			() => {
				const value = {
					date: new Date(1),
					list: [ 1, NaN ],
					map: new Map([ [ 1, { a: 1 } ] ]),
					nested: { zero: 0 }
				}
				assert.deepEqual(deepDiff(value, value), [])
				assert.deepEqual(
					deepDiff(value, deepCopy(value)),
					[]
				)
				assert.deepEqual(
					deepDiff({ zero: 0 }, { zero: -0 }),
					[]
				)
			}
		)
		it(
			"objects",
			() => {
				assert.deepEqual(
					deepDiff(
						{
							a: { b: 1, c: 2 },
							d: 1,
							e: undefined
						},
						{
							a: { b: 2, c: 2 },
							e: undefined,
							f: 1
						}
					),
					[
						{
							op: "replace",
							path: [ "a", "b" ],
							value: 2
						},
						{ op: "remove", path: [ "d" ] },
						{ op: "add", path: [ "f" ], value: 1 }
					]
				)
				assert.deepEqual(
					deepDiff({ a: undefined }, {}),
					[
						{ op: "remove", path: [ "a" ] }
					]
				)
				round_trip(
					{
						a: { b: [ 1, { c: 1 } ] },
						keep: { x: 1 }
					},
					{
						a: { b: [ 1, { c: 2, d: 3 } ] },
						keep: { x: 1 },
						n: null
					}
				)
				round_trip(
					JSON.parse("{\"__proto__\":{\"a\":1}}"),
					JSON.parse("{\"__proto__\":{\"a\":2}}")
				)
				round_trip(
					Object.defineProperty(
						{},
						"x",
						{ value: 1, writable: true }
					),
					{ x: 1 }
				)
			}
		)
		it(
			"replaced values",
			() => {
				assert.deepEqual(
					deepDiff(1, 2),
					[
						{ op: "replace", path: [], value: 2 }
					]
				)
				assert.equal(deepPatch(1, deepDiff(1, 2)), 2)
				assert.deepEqual(deepDiff(NaN, NaN), [])
				const date = new Date(2)
				assert.deepEqual(
					deepDiff({ date: new Date(1) }, { date }),
					[
						{
							op: "replace",
							path: [ "date" ],
							value: date
						}
					]
				)
				class Point {
					x = 1
				}
				const point = new Point()
				point.x = 2
				assert.deepEqual(
					deepDiff(
						{ point: new Point() },
						{ point }
					),
					[
						{
							op: "replace",
							path: [ "point" ],
							value: point
						}
					]
				)
				assert.deepEqual(
					deepDiff({ a: [ 1 ] }, { a: { 0: 1 } }),
					[
						{
							op: "replace",
							path: [ "a" ],
							value: { 0: 1 }
						}
					]
				)
				round_trip({ a: [ 1 ] }, { a: new Map() })
			}
		)
		it(
			"shared references",
			() => {
				/**
				 * @param {number} leaf
				 * @returns {{ left: ReturnType<typeof create>, right: ReturnType<typeof create> } | { leaf: number }}
				 */
				function create(leaf) {
					/** @type {ReturnType<typeof create>} */
					let node = { leaf }
					for (let i = 0; i < 40; i++) node = { left: node, right: node }
					return node
				}
				assert.deepEqual(
					deepDiff(create(1), create(1)),
					[]
				)
				const a = { value: 1 }
				const b = { value: 1 }
				assert.lengthOf(
					deepDiff(
						{ x: a, y: a },
						{ x: b, y: { value: 2 } }
					),
					1
				)
			}
		)
		it(
			"update changes",
			() => {
				const base = {
					list: [ { id: 1 } ],
					map: new Map([ [ "a", 1 ] ]),
					user: { name: "Kim" }
				}
				const next = deepUpdate(
					base,
					draft => {
						draft.user.name = "Lee"
						draft.list.push({ id: 2 })
						draft.map.set("b", 2)
					}
				)
				const changes = deepDiff(base, next)
				assert.deepEqual(
					changes,
					[
						{
							op: "add",
							path: [ "list", 1 ],
							value: { id: 2 }
						},
						{
							op: "add",
							path: [ "map", "b" ],
							value: 2
						},
						{
							op: "replace",
							path: [ "user", "name" ],
							value: "Lee"
						}
					]
				)
				const applied = deepPatch(base, changes)
				assert.isTrue(deepEqual(applied, next))
				assert.equal(applied.list[0], base.list[0])
				assert.deepEqual(deepDiff(next, base).length, 3)
			}
		)
	}
)
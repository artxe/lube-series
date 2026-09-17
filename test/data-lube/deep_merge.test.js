import { deepMerge } from "data-lube"
import { runInNewContext } from "node:vm"
import { assert, describe, it } from "vitest"
describe(
	"deep_merge",
	() => {
		it(
			"__proto__ key",
			() => {
				const merged = deepMerge(
					JSON.parse("{\"__proto__\":{\"a\":1}}"),
					JSON.parse("{\"__proto__\":{\"b\":2}}")
				)
				assert.equal(
					Object.getPrototypeOf(merged),
					Object.prototype
				)
				assert.deepEqual(
					Object.keys(merged),
					[ "__proto__" ]
				)
				assert.deepEqual(
					{ ...merged.__proto__ },
					{ a: 1, b: 2 }
				)
				assert.isUndefined(
					/** @type {{ a?: number }} */({})/**/.a
				)
			}
		)
		it(
			"circular reference",
			() => {
				/** @type {{ self?: typeof a, value: { a: number } }} */
				const a = { value: { a: 1 } }
				a.self = a
				/** @type {{ self?: typeof b, value: { b: number } }} */
				const b = { value: { b: 1 } }
				b.self = b
				const merged = deepMerge(a, b)
				assert.equal(merged.self, merged)
				assert.deepEqual(merged.value, { a: 1, b: 1 })
				/**
				 * @param {string} name
				 * @returns {{ a?: number, b?: number, next: ReturnType<typeof chain> }}
				 */
				function chain(name) {
					/** @type {{ a?: number, b?: number, next?: typeof top }} */
					const top = { [name]: 1 }
					let node = top
					for (let i = 0; i < 100; i++) node = node.next = { [name]: i }
					node.next = top
					return /** @type {ReturnType<typeof chain>} */(top)/**/
				}
				const deep = deepMerge(chain("a"), chain("b"))
				let node = deep
				for (let i = 0; i < 101; i++) node = node.next
				assert.equal(node, deep)
				assert.equal(deep.next.next.b, 1)
				assert.equal(deep.next.next.a, 1)
				/** @type {{ child?: typeof left, left?: number }} */
				let left = {}
				/** @type {{ child?: typeof right, right?: number }} */
				let right = {}
				for (let i = 0; i < 100; i++) {
					left = { child: left, left: i }
					right = { child: right, right: i }
				}
				/**
				 * @param {string} name
				 * @returns {{ a?: number, b?: number, left?: ReturnType<typeof diamond>, right?: ReturnType<typeof diamond> }}
				 */
				function diamond(name) {
					/** @type {ReturnType<typeof diamond>} */
					let tip = { [name]: 1 }
					for (let i = 0; i < 40; i++) tip = { left: tip, right: tip }
					return tip
				}
				let merged_diamond = /** @type {ReturnType<typeof diamond>} */(deepMerge(diamond("a"), diamond("b")))/**/
				for (let i = 0; i < 40; i++) merged_diamond = /** @type {ReturnType<typeof diamond>} */(merged_diamond.right)/**/
				assert.deepEqual(merged_diamond, { a: 1, b: 1 })
				const long = deepMerge(left, right)
				assert.equal(
					/** @type {{ child: { left: number, right: number } }} */(long)/**/.child.left,
					98
				)
				assert.equal(
					/** @type {{ child: { left: number, right: number } }} */(long)/**/.child.right,
					98
				)
			}
		)
		it(
			"merge",
			() => {
				const left = {
					keep: { value: 1 },
					nested: { a: 1, deep: { x: 1 } },
					replaced: { value: 1 }
				}
				const right = {
					added: { value: 2 },
					nested: { b: 2, deep: { y: 2 } },
					replaced: null
				}
				const merged = deepMerge(left, right)
				assert.deepEqual(
					merged,
					{
						added: { value: 2 },
						keep: { value: 1 },
						nested: { a: 1, b: 2, deep: { x: 1, y: 2 } },
						replaced: null
					}
				)
				assert.equal(merged.keep, left.keep)
				assert.equal(merged.added, right.added)
				assert.notEqual(merged.nested, left.nested)
				assert.deepEqual(
					left.nested,
					{ a: 1, deep: { x: 1 } }
				)
				assert.deepEqual(
					right.nested,
					{ b: 2, deep: { y: 2 } }
				)
				assert.deepEqual(
					Object.keys(
						// eslint-disable-next-line lube/ascii-order
						deepMerge({ a: 1, b: 1 }, { c: 1, a: 2 })
					),
					Object.keys(
						{
							...{ a: 1, b: 1 },
							// eslint-disable-next-line lube/ascii-order
							...{ c: 1, a: 2 }
						}
					)
				)
				const shared = { value: 1 }
				assert.equal(
					deepMerge({ shared }, { shared }).shared,
					shared
				)
			}
		)
		it(
			"non-plain values",
			() => {
				const list = [ 2 ]
				const map = new Map([ [ 1, 2 ] ])
				class Point {
					x = 1
				}
				const point = new Point()
				const merged = deepMerge(
					{
						date: { value: 1 },
						list: [ 1, 3 ],
						map: new Map([ [ 3, 4 ] ]),
						point: { y: 1 },
						value: 1
					},
					{
						date: new Date(1),
						list,
						map,
						point,
						value: undefined
					}
				)
				assert.equal(merged.list, list)
				assert.equal(merged.map, map)
				assert.equal(merged.point, point)
				assert.instanceOf(merged.date, Date)
				assert.isTrue("value" in merged)
				assert.isUndefined(merged.value)
				assert.equal(deepMerge({ a: 1 }, list), list)
				assert.equal(deepMerge(1, map), map)
				assert.deepEqual(deepMerge([ 1 ], [ 2 ]), [ 2 ])
			}
		)
		it(
			"null prototype and other realm",
			() => {
				const left = Object.assign(
					Object.create(null),
					{ a: { x: 1 } }
				)
				const right = Object.assign(
					Object.create(null),
					{ a: { y: 1 } }
				)
				const merged = deepMerge(left, right)
				assert.isNull(Object.getPrototypeOf(merged))
				assert.deepEqual({ ...merged.a }, { x: 1, y: 1 })
				const foreign = runInNewContext("({ a: { y: 1 } })")
				assert.deepEqual(
					deepMerge({ a: { x: 1 } }, foreign),
					{ a: { x: 1, y: 1 } }
				)
				const methods = Object.assign(
					Object.create(null),
					{ hello: () => "hi" }
				)
				const inherited = /** @type {{ hello: () => string }} */(/** @type {unknown} */(deepMerge(
					Object.assign(Object.create(methods), { x: 1 }),
					{ y: 1 }
				)))/**/
				assert.equal(
					Object.getPrototypeOf(inherited),
					methods
				)
				assert.equal(inherited.hello(), "hi")
				assert.deepEqual({ ...inherited }, { x: 1, y: 1 })
			}
		)
		it(
			"symbol keys like spread",
			() => {
				const key = Symbol("key")
				const merged = deepMerge(
					{ [key]: { a: 1 } },
					{ [key]: { b: 1 } }
				)
				assert.deepEqual(merged[key], { b: 1 })
			}
		)
		it(
			"throwing getters",
			() => {
				assert.throws(
					() => deepMerge(
						{ a: { b: 1 } },
						{
							a: {
								get b() {
									throw new RangeError("stop")
								}
							}
						}
					),
					RangeError
				)
			}
		)
		it(
			"variadic",
			() => {
				const base = { a: { x: 1 } }
				assert.equal(deepMerge(base), base)
				assert.equal(
					deepMerge(base, undefined, null),
					base
				)
				assert.isUndefined(deepMerge())
				assert.deepEqual(
					deepMerge(
						base,
						{ a: { y: 1 } },
						null,
						{ a: { z: 1 }, b: 1 }
					),
					{ a: { x: 1, y: 1, z: 1 }, b: 1 }
				)
				assert.deepEqual(base, { a: { x: 1 } })
			}
		)
	}
)
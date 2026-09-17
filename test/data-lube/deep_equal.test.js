import dimensions from "./dimensions.js"
import { deepCopy, deepEqual } from "data-lube"
import { runInNewContext } from "node:vm"
import { assert, describe, it } from "vitest"
describe(
	"deep_equal",
	() => {
		it(
			"binary data",
			() => {
				assert.isFalse(
					deepEqual(
						new ArrayBuffer(1),
						new ArrayBuffer(2)
					)
				)
				assert.isFalse(
					deepEqual(
						new Uint8Array([ 1 ]).buffer,
						new Uint8Array([ 2 ]).buffer
					)
				)
				assert.isTrue(
					deepEqual(
						new Uint8Array([ 1, 2 ]).buffer,
						new Uint8Array([ 1, 2 ]).buffer
					)
				)
				assert.isTrue(
					deepEqual(
						new Uint8Array([ 0, 1, 2 ]).subarray(1),
						new Uint8Array([ 1, 2 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Uint8Array([ 1 ]),
						new Int8Array([ 1 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Uint16Array([ 1, 2 ]),
						new Uint16Array([ 1 ])
					)
				)
				assert.isTrue(
					deepEqual(
						new Float64Array([ NaN, 0 ]),
						new Float64Array([ -NaN, -0 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Float32Array([ NaN ]),
						new Float32Array([ 0 ])
					)
				)
				assert.isTrue(
					deepEqual(
						new BigInt64Array([ 1n ]),
						new BigInt64Array([ 1n ])
					)
				)
				const bytes = new Uint8Array(100003).map((_, i) => i)
				const other = bytes.slice()
				assert.isTrue(deepEqual(bytes, other))
				other[100002] = 0
				assert.isFalse(deepEqual(bytes, other))
				const detached = new Uint8Array(1)
				structuredClone(
					detached.buffer,
					{ transfer: [ detached.buffer ] }
				)
				assert.isTrue(
					deepEqual(detached, new Uint8Array(0))
				)
				other[100002] = 2
				other[0] = 1
				assert.isFalse(deepEqual(bytes, other))
				assert.isFalse(
					deepEqual(
						new DataView(new ArrayBuffer(1)),
						new DataView(new Uint8Array([ 1 ]).buffer)
					)
				)
				assert.isFalse(
					deepEqual(
						new DataView(new ArrayBuffer(1)),
						new DataView(new ArrayBuffer(2))
					)
				)
				assert.isTrue(
					deepEqual(
						new DataView(
							new Uint8Array([ 9, 1, 2 ]).buffer,
							1
						),
						new DataView(
							new Uint8Array([ 1, 2 ]).buffer
						)
					)
				)
				const moved = new ArrayBuffer(2)
				const view = new DataView(moved)
				structuredClone(moved, { transfer: [ moved ] })
				assert.isTrue(
					deepEqual(
						view,
						new DataView(new ArrayBuffer(0))
					)
				)
				assert.isFalse(
					deepEqual(
						view,
						new DataView(new ArrayBuffer(1))
					)
				)
				assert.isTrue(
					deepEqual(view, deepCopy(view))
				)
				const shrunk = new ArrayBuffer(4, { maxByteLength: 8 })
				const outside = new DataView(shrunk, 2, 2)
				shrunk.resize(1)
				assert.isTrue(
					deepEqual(
						new DataView(new ArrayBuffer(0)),
						outside
					)
				)
			}
		)
		it(
			"boxed primitives",
			() => {
				assert.isTrue(
					deepEqual(new Number(1), new Number(1))
				)
				assert.isFalse(
					deepEqual(new Number(1), new Number(2))
				)
				assert.isTrue(
					deepEqual(new Number(NaN), new Number(NaN))
				)
				assert.isFalse(
					deepEqual(
						new Boolean(true),
						new Boolean(false)
					)
				)
				assert.isFalse(
					deepEqual(new String("a"), new String("b"))
				)
				assert.isFalse(
					deepEqual(Object(1n), Object(2n))
				)
				assert.isFalse(
					deepEqual(
						Object(Symbol.iterator),
						Object(Symbol.asyncIterator)
					)
				)
				assert.isFalse(deepEqual(new Number(1), 1))
			}
		)
		it(
			"circular reference",
			() => {
				/**
				 * @returns {{ self?: ReturnType<typeof create>, value: number }}
				 */
				function create() {
					/** @type {ReturnType<typeof create>} */
					const object = { value: 1 }
					object.self = object
					return object
				}
				const a = create()
				const b = create()
				assert.isTrue(deepEqual(a, b))
				b.value = 2
				assert.isFalse(deepEqual(a, b))
				/** @type {{ next?: typeof loop }} */
				const loop = {}
				loop.next = loop
				/** @type {{ next?: typeof first }} */
				const first = {}
				/** @type {{ next?: typeof first }} */
				const second = { next: first }
				first.next = second
				assert.isTrue(deepEqual(loop, first))
				/**
				 * @param {number} value
				 * @returns {Map<{ map: ReturnType<typeof create_map> }, number>}
				 */
				function create_map(value) {
					/** @type {ReturnType<typeof create_map>} */
					const map = new Map()
					map.set({ map }, value)
					return map
				}
				/**
				 * @param {number} value
				 * @returns {Set<{ set: ReturnType<typeof create_set>, value: number }>}
				 */
				function create_set(value) {
					/** @type {ReturnType<typeof create_set>} */
					const set = new Set()
					set.add({ set, value })
					return set
				}
				assert.isTrue(
					deepEqual(create_map(1), create_map(1))
				)
				assert.isFalse(
					deepEqual(create_map(1), create_map(2))
				)
				assert.isTrue(
					deepEqual(create_set(1), create_set(1))
				)
				assert.isFalse(
					deepEqual(create_set(1), create_set(2))
				)
			}
		)
		it(
			"errors",
			() => {
				assert.isTrue(
					deepEqual(
						new DOMException("a", "AbortError"),
						new DOMException("a", "AbortError")
					)
				)
				assert.isFalse(
					deepEqual(
						new DOMException("a", "AbortError"),
						new DOMException("b", "AbortError")
					)
				)
				assert.isFalse(
					deepEqual(
						new DOMException("a", "AbortError"),
						new DOMException("a", "TimeoutError")
					)
				)
				assert.isTrue(
					deepEqual(new Error("a"), new Error("a"))
				)
				assert.isFalse(
					deepEqual(new Error("a"), new Error("b"))
				)
				assert.isFalse(
					deepEqual(
						new Error("a"),
						new TypeError("a")
					)
				)
				assert.isFalse(
					deepEqual(
						new Error("a", { cause: 1 }),
						new Error("a", { cause: 2 })
					)
				)
				assert.isFalse(
					deepEqual(
						Object.assign(new Error("a"), { code: 1 }),
						Object.assign(new Error("a"), { code: 2 })
					)
				)
				assert.isFalse(
					deepEqual(
						new Error("a"),
						new Error("a", { cause: undefined })
					)
				)
				assert.isFalse(
					deepEqual(
						new AggregateError([ 1 ], "a"),
						new AggregateError([ 2 ], "a")
					)
				)
			}
		)
		it(
			"literals",
			() => {
				assert.isTrue(deepEqual(undefined, void 0))
				assert.isTrue(deepEqual(null, null))
				assert.isTrue(deepEqual(true, true))
				assert.isTrue(deepEqual(123, 123))
				assert.isTrue(deepEqual(NaN, NaN))
				assert.isTrue(deepEqual(0, -0))
				assert.isTrue(deepEqual("abc", "abc"))
				assert.isFalse(deepEqual(null, undefined))
				assert.isFalse(deepEqual(true, false))
				assert.isFalse(deepEqual(123, 456))
				assert.isFalse(deepEqual(NaN, 0))
				assert.isFalse(deepEqual("abc", "xyz"))
				assert.isFalse(deepEqual("123", 123))
			}
		)
		it(
			"maps and sets",
			() => {
				let reads = 0
				/**
				 * @param {number} id
				 * @returns {{ user: { readonly id: number } }}
				 */
				function counted(id) {
					return {
						user: {
							get id() {
								reads++
								return id
							}
						}
					}
				}
				const count = 2000
				assert.isTrue(
					deepEqual(
						new Set(
							Array.from(
								{ length: count },
								(_, i) => counted(i)
							)
						),
						new Set(
							Array.from(
								{ length: count },
								(_, i) => counted(i * 7919 % count)
							)
						)
					)
				)
				assert.isBelow(reads, count * 30)
				/**
				 * @param {number} index
				 * @returns {{ deep: { deeper: { deepest: number } } }}
				 */
				function collide(index) {
					return {
						deep: { deeper: { deepest: index } }
					}
				}
				/**
				 * @param {number} index
				 * @returns {{ bigint: bigint, date: Date, flag: boolean, float: number, list: (number | string)[], map: Map<number, { index: number }>, nan: number, none: null, regexp: RegExp, set: Set<number>, symbol: symbol, wide: Record<string, number>, wide_map: Map<number, number>, wide_set: Set<number> }}
				 */
				function variety(index) {
					return {
						bigint: BigInt(index),
						date: new Date(index),
						flag: index % 2 == 0,
						float: index + 0.5,
						list: [ index, "text".repeat(index % 40) ],
						map: new Map([ [ index, { index } ] ]),
						nan: NaN,
						none: null,
						regexp: /a/,
						set: new Set([ index ]),
						symbol: Symbol.iterator,
						wide: Object.fromEntries(
							Array.from(
								{ length: 70 },
								(_, key) => [ `k${key}`, key ]
							)
						),
						wide_map: new Map(
							Array.from(
								{ length: 70 },
								(_, key) => [ key, key ]
							)
						),
						wide_set: new Set(
							Array.from({ length: 70 }, (_, key) => key)
						)
					}
				}
				const size = 30
				for (const make of [ collide, variety ]) {
					assert.isTrue(
						deepEqual(
							new Set(
								Array.from(
									{ length: size },
									(_, i) => make(i)
								)
							),
							new Set(
								Array.from(
									{ length: size },
									(_, i) => make(i * 7 % size)
								)
							)
						)
					)
					assert.isFalse(
						deepEqual(
							new Set(
								Array.from(
									{ length: size },
									(_, i) => make(i)
								)
							),
							new Set(
								Array.from(
									{ length: size },
									(_, i) => make(i * 7 % size + 1)
								)
							)
						)
					)
				}
				const k1 = { k: 1 }
				const k2 = { k: 1 }
				const k3 = { k: 1 }
				assert.isTrue(
					deepEqual(
						new Map([ [ k1, 1 ], [ k2, 2 ] ]),
						new Map([ [ k1, 2 ], [ k3, 1 ] ])
					)
				)
				/**
				 * @param {unknown} value
				 * @returns {unknown}
				 */
				function deep(value) {
					for (let i = 0; i < 100; i++) value = [ value ]
					return value
				}
				const first = { child: { value: 1 } }
				const second = { child: { value: 2 } }
				assert.isFalse(
					deepEqual(
						deep(
							[
								new Map(
									[ [ k1, first ], [ k2, second ] ]
								),
								first
							]
						),
						deep(
							[
								new Map(
									[
										[ k1, deepCopy(second) ],
										[ k3, deepCopy(first) ]
									]
								),
								deepCopy(second)
							]
						)
					)
				)
				assert.isTrue(
					deepEqual(
						new Set([ { a: 1 }, { b: 2 } ]),
						new Set([ { b: 2 }, { a: 1 } ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Set([ { a: 1 }, { a: 1 } ]),
						new Set([ { a: 1 }, { a: 2 } ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Set([ { a: 1 }, 1 ]),
						new Set([ { a: 1 }, 2 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Set([ { a: 1 } ]),
						new Set([ 1 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Set([ {}, {} ]),
						new Set([ {}, { a: 1 } ])
					)
				)
				assert.isTrue(
					deepEqual(
						new Map(
							[
								[ { id: 1 }, [ 1 ] ],
								[ { id: 2 }, [ 2 ] ]
							]
						),
						new Map(
							[
								[ { id: 2 }, [ 2 ] ],
								[ { id: 1 }, [ 1 ] ]
							]
						)
					)
				)
				assert.isFalse(
					deepEqual(
						new Map([ [ { id: 1 }, [ 1 ] ] ]),
						new Map([ [ { id: 1 }, [ 2 ] ] ])
					)
				)
				assert.isTrue(
					deepEqual(
						new Map([ [ NaN, 1 ] ]),
						new Map([ [ NaN, 1 ] ])
					)
				)
				/**
				 * @param {unknown} value
				 * @param {number} depth
				 * @returns {unknown}
				 */
				function nest(value, depth) {
					for (let i = 0; i < depth; i++) value = [ value ]
					return value
				}
				const one = { child: { value: 1 } }
				const two = { child: { value: 2 } }
				const items = Array.from(
					{ length: 60 },
					(_, id) => ({ group: id % 3, id })
				)
				const reordered = [ ...items ].sort(
					(x, y) => x.group - y.group || y.id - x.id
				)
				assert.isTrue(
					deepEqual(
						new Set(deepCopy(items)),
						new Set(deepCopy(reordered))
					)
				)
				assert.isTrue(
					deepEqual(
						new Map(
							deepCopy(items).map(item => [ item, item.id ])
						),
						new Map(
							deepCopy(reordered).map(item => [ item, item.id ])
						)
					)
				)
				assert.isFalse(
					deepEqual(
						new Map(
							deepCopy(items).map(item => [ item, item.id ])
						),
						new Map(
							deepCopy(reordered).map(item => [ item, item.group ])
						)
					)
				)
				assert.isFalse(
					deepEqual(
						new Set(deepCopy(items)),
						new Set(
							[
								...deepCopy(reordered).slice(1),
								{ group: 0, id: -1 }
							]
						)
					)
				)
				assert.isTrue(
					deepEqual(
						new Set(
							[
								{ a: 1, b: 2 },
								{ a: 2, b: 1 },
								{ a: 3, b: 0 }
							]
						),
						new Set(
							JSON.parse(
								"[{\"b\":0,\"a\":3},{\"b\":2,\"a\":1},{\"b\":1,\"a\":2}]"
							)
						)
					)
				)
				for (const prefix of [ [ one ], [ one, one ] ]) {
					assert.isFalse(
						deepEqual(
							nest(
								[
									...prefix,
									new Set(
										[ { inner: one }, { inner: two } ]
									),
									one
								],
								100
							),
							nest(
								[
									...prefix.map(item => deepCopy(item)),
									new Set(
										[
											{ inner: deepCopy(two) },
											{ inner: deepCopy(one) }
										]
									),
									deepCopy(two)
								],
								100
							)
						)
					)
				}
				assert.isTrue(
					deepEqual(
						new Set(
							[
								[ 1, "a" ],
								[ 2, "b" ],
								[ 3, "c" ],
								[ 4, "d" ]
							]
						),
						new Set(
							[
								[ 3, "c" ],
								[ 1, "a" ],
								[ 4, "d" ],
								[ 2, "b" ]
							]
						)
					)
				)
				const key = { key: 1 }
				assert.isTrue(
					deepEqual(
						new Map(
							/** @type {[ { id: number } | { key: number }, number ][]} */([ [ key, 1 ], [ { id: 1 }, 2 ] ])/**/
						),
						new Map(
							/** @type {[ { id: number } | { key: number }, number ][]} */([ [ key, 1 ], [ { id: 1 }, 2 ] ])/**/
						)
					)
				)
				assert.isFalse(
					deepEqual(new Map([ [ 1, 1 ] ]), new Map())
				)
				assert.isTrue(
					deepEqual(
						new Set([ key, { id: 1 } ]),
						new Set([ key, { id: 1 } ])
					)
				)
				assert.isFalse(
					deepEqual(new Set([ 1 ]), new Set())
				)
				for (const depth of [ 0, 100 ]) {
					assert.isFalse(
						deepEqual(
							nest(
								[
									new Set(
										[ { inner: one }, { inner: two } ]
									),
									one
								],
								depth
							),
							nest(
								[
									new Set(
										[ { inner: two }, { inner: one } ]
									),
									two
								],
								depth
							)
						)
					)
				}
			}
		)
		it(
			"matches that rely on assumed pairs",
			() => {
				const second = new Set()
				const y = { s: second, tag: "Y" }
				const x = { s: second, tag: "X" }
				second.add({ p: y }).add({ p: x })
				const first = new Set()
				const a = { s: first, tag: "X" }
				first.add({ p: a }).add({ p: y })
				assert.isTrue(deepEqual(a, x))
				assert.isTrue(
					deepEqual(
						[
							new Set([ a, { s: second, tag: "Y" } ])
						],
						[ new Set([ y, x ]) ]
					)
				)
			}
		)
		it(
			"members whose hashes collide shallowly",
			() => {
				let reads = 0
				/**
				 * @param {number} id
				 * @returns {{ tags: { readonly id: number }[] }}
				 */
				function member(id) {
					return {
						tags: [
							{
								get id() {
									reads++
									return id
								}
							}
						]
					}
				}
				const count = 2000
				const ids = Array.from({ length: count }, (_, i) => i)
				const shuffled = ids.map(i => i * 7919 % count)
				assert.isTrue(
					deepEqual(
						new Set(ids.map(member)),
						new Set(shuffled.map(member))
					)
				)
				assert.isBelow(reads, count * 20)
				reads = 0
				assert.isTrue(
					deepEqual(
						new Set(
							ids.map(
								i => new Uint8Array([ i & 255, i >> 8 ])
							)
						),
						new Set(
							shuffled.map(
								i => new Uint8Array([ i & 255, i >> 8 ])
							)
						)
					)
				)
				/**
				 * @param {number} tag
				 * @returns {unknown[]}
				 */
				function built_ins(tag) {
					const shrunk = new ArrayBuffer(4, { maxByteLength: 8 })
					const outside = new DataView(shrunk, 2, 2)
					shrunk.resize(1)
					return [
						outside,
						[ { a: tag } ],
						[ { a: tag } ],
						new ArrayBuffer(tag),
						new ArrayBuffer(0),
						new DataView(new ArrayBuffer(tag)),
						new Date(tag),
						new Error(`${tag}`),
						new Map([ [ { k: tag }, { v: tag } ] ]),
						new Set([ { v: tag } ]),
						new Uint8Array([ tag ]),
						Object(BigInt(tag)),
						Object(`${tag}`),
						Object(tag % 2 == 0),
						Object(tag),
						Object(Symbol.iterator),
						Object.assign(Object.create(null), { tag }),
						RegExp(`${tag}`),
						{
							big: new Map(
								Array.from(
									{ length: 65 },
									(_, i) => [ i, tag ]
								)
							)
						},
						{
							big: new Set(
								Array.from(
									{ length: 65 },
									(_, i) => i + tag
								)
							)
						},
						{
							wide: Object.fromEntries(
								Array.from(
									{ length: 65 },
									(_, i) => [ `k${i}`, tag ]
								)
							)
						}
					]
				}
				for (const tag of [ 1, 2 ]) {
					assert.isTrue(
						deepEqual(
							new Set(built_ins(tag)),
							new Set(built_ins(tag).reverse())
						)
					)
				}
				assert.isFalse(
					deepEqual(
						new Set(built_ins(1)),
						new Set(built_ins(2).reverse())
					)
				)
			}
		)
		it(
			"nested members that differ deep inside",
			() => {
				let reads = 0
				/**
				 * @param {number} depth
				 * @param {number} leaf
				 * @param {(value: unknown) => unknown} wrap
				 * @returns {unknown}
				 */
				function nest(depth, leaf, wrap) {
					/** @type {unknown} */
					let value = {
						get leaf() {
							reads++
							return leaf
						}
					}
					for (let i = 0; i < depth; i++) value = wrap(value)
					return value
				}
				for (const wrap of [
					(/** @type {unknown} */ value) => new Set([ [ value ] ]),
					(/** @type {unknown} */ value) => new Map([ [ { a: value }, 1 ] ]),
					(/** @type {unknown} */ value) => new Set([ { a: value }, { b: value } ])
				]) {
					reads = 0
					assert.isFalse(
						deepEqual(
							nest(16, 1, wrap),
							nest(16, 2, wrap)
						)
					)
					assert.isBelow(reads, 1000)
				}
			}
		)
		it(
			"objects",
			() => {
				assert.isTrue(deepEqual({}, {}))
				assert.isTrue(deepEqual([], []))
				assert.isTrue(
					deepEqual(
						dimensions,
						JSON.parse(JSON.stringify(dimensions))
					)
				)
				assert.isFalse(
					deepEqual({ a: void 0 }, { b: 1 })
				)
				assert.isFalse(
					deepEqual({ a: 1 }, { b: void 0 })
				)
				assert.isFalse(
					deepEqual({ a: 1 }, { a: 1, b: 1 })
				)
				assert.isFalse(
					deepEqual("abc", [ "a", "b", "c" ])
				)
				assert.isFalse(deepEqual({}, null))
				assert.isFalse(deepEqual({}, []))
				assert.isFalse(deepEqual({ length: 0 }, []))
				assert.isFalse(
					deepEqual(
						{ k: 1 },
						Object.defineProperty({ j: 2 }, "k", { value: 1 })
					)
				)
				assert.isFalse(
					deepEqual(
						Object.defineProperty({ j: 2 }, "k", { value: 1 }),
						{ k: 1 }
					)
				)
				assert.isFalse(
					deepEqual(
						Object.assign(
							Object.create(Array.prototype),
							{ key: 1 }
						),
						Object.assign(
							Object.create(Array.prototype),
							{ key: 2 }
						)
					)
				)
				class Tagged extends Map {
					/** @override */
					get [Symbol.toStringTag]() {
						return "Tagged"
					}
				}
				assert.isFalse(
					deepEqual(
						new Tagged([ [ 1, 1 ] ]),
						new Tagged([ [ 2, 2 ] ])
					)
				)
				assert.isTrue(
					deepEqual(
						Object.create(Date.prototype),
						Object.create(Date.prototype)
					)
				)
				assert.isFalse(
					deepEqual(
						Object.assign(
							Object.create(Map.prototype),
							{ value: 1 }
						),
						Object.assign(
							Object.create(Map.prototype),
							{ value: 2 }
						)
					)
				)
				class Fake {
					/**
					 * @param {number} value
					 */
					constructor(value) {
						this.value = value
					}
					get [Symbol.toStringTag]() {
						return "Date"
					}
				}
				assert.isTrue(
					deepEqual(new Fake(1), new Fake(1))
				)
				assert.isFalse(
					deepEqual(new Fake(1), new Fake(2))
				)
				assert.isFalse(
					deepEqual(
						Object.assign(
							Object.create(null),
							{
								[Symbol.toStringTag]: "Map",
								value: 1
							}
						),
						Object.assign(
							Object.create(null),
							{
								[Symbol.toStringTag]: "Map",
								value: 2
							}
						)
					)
				)
				assert.isFalse(deepEqual([ 1 ], [ 1, 2 ]))
				assert.isTrue(deepEqual([ NaN ], [ NaN ]))
				assert.isTrue(
					deepEqual({ a: NaN }, { a: NaN })
				)
				class List extends Array {}
				assert.isTrue(
					deepEqual(
						List.of({ a: 1 }, { a: 2 }),
						List.of({ a: 1 }, { a: 2 })
					)
				)
				assert.isFalse(deepEqual(List.of(1), [ 1 ]))
				assert.isFalse(
					deepEqual(
						Object.setPrototypeOf(new Date(0), null),
						Object.create(null)
					)
				)
				assert.isFalse(
					deepEqual([ 1, , 3 ], [ 1, void 0, 3 ])
				)
				assert.isTrue(
					deepEqual([ 1, , 3 ], [ 1, , 3 ])
				)
				assert.isFalse(
					deepEqual(
						{
							toString: Object.prototype.toString
						},
						{ value: 1 }
					)
				)
				assert.isFalse(
					deepEqual(
						JSON.parse("{\"__proto__\":{\"a\":1}}"),
						JSON.parse("{\"__proto__\":{\"a\":2}}")
					)
				)
				assert.isFalse(
					deepEqual(Object.create(null), {})
				)
				class Point {
					x = 1
				}
				assert.isTrue(
					deepEqual(new Point(), new Point())
				)
				assert.isFalse(
					deepEqual(new Point(), { x: 1 })
				)
				const changed = JSON.parse(JSON.stringify(dimensions))
				changed[0].dimensions[3].lang.ko["ko-KR"] = 1
				assert.isFalse(deepEqual(dimensions, changed))
			}
		)
		it(
			"objects that only claim a tag",
			() => {
				/**
				 * @returns {Record<PropertyKey, unknown>}
				 */
				function tagged() {
					return Object.assign(
						Object.create(null),
						{
							a: 1,
							[Symbol.toStringTag]: "Error"
						}
					)
				}
				assert.isTrue(deepEqual(tagged(), tagged()))
				assert.notInstanceOf(deepCopy(tagged()), Error)
			}
		)
		it(
			"other realm",
			() => {
				const [ a, b, c ] = runInNewContext(
					"[ 1, 1, 2 ].map(value => ({ date: new Date(value), map: new Map([ [ value, { value } ] ]), set: new Set([ { value } ]) }))"
				)
				assert.isTrue(deepEqual(a, b))
				assert.isFalse(deepEqual(a, c))
				assert.isFalse(deepEqual(a.map, c.map))
				assert.isFalse(deepEqual(a.set, c.set))
				assert.isFalse(deepEqual(a.date, c.date))
				assert.isTrue(deepEqual(a, deepCopy(a)))
				const [
					list,
					array_like,
					bytes,
					same_bytes,
					error,
					other_error
				] = runInNewContext(
					"[ [], Object.create(Array.prototype), new Uint8Array([ 1 ]), new Uint8Array([ 1 ]), new Error(\"a\"), new Error(\"b\") ]"
				)
				assert.isFalse(deepEqual(list, array_like))
				assert.isTrue(deepEqual(bytes, same_bytes))
				assert.isFalse(deepEqual(error, other_error))
				assert.isFalse(
					deepEqual(
						[],
						Object.create(Array.prototype)
					)
				)
			}
		)
		it(
			"own keys of built-ins",
			() => {
				class Cache extends Map {
					hits = 0
				}
				const hit = new Cache()
				hit.hits = 5
				assert.isFalse(deepEqual(new Cache(), hit))
				assert.isTrue(
					deepEqual(new Cache(), new Cache())
				)
				/**
				 * @template {WeakKey} T
				 * @param {T} value
				 * @param {unknown} tag
				 * @returns {T}
				 */
				function tagged(value, tag) {
					return Object.assign(value, { tag })
				}
				for (const create of [
					() => new Date(0),
					() => /a/,
					() => new Set([ 1 ]),
					() => new ArrayBuffer(1),
					() => new DataView(new ArrayBuffer(1)),
					() => Object(1),
					() => Object(true),
					() => Object(1n),
					() => Object(Symbol.iterator)
				]) {
					assert.isFalse(
						deepEqual(
							tagged(create(), 1),
							tagged(create(), 2)
						)
					)
					assert.isTrue(
						deepEqual(
							tagged(create(), { a: 1 }),
							tagged(create(), { a: 1 })
						)
					)
				}
			}
		)
		it(
			"shared references",
			() => {
				/**
				 * @returns {{ left: ReturnType<typeof create>, right: ReturnType<typeof create> } | { leaf: boolean }}
				 */
				function create() {
					/** @type {ReturnType<typeof create>} */
					let node = { leaf: true }
					for (let i = 0; i < 64; i++) node = { left: node, right: node }
					return node
				}
				const a = create()
				assert.isTrue(deepEqual(a, create()))
				assert.isTrue(deepEqual(a, deepCopy(a)))
				/**
				 * @param {unknown} value
				 * @returns {unknown}
				 */
				function nest(value) {
					for (let i = 0; i < 100; i++) value = [ value ]
					return value
				}
				const shared = { child: { value: 1 } }
				assert.isTrue(
					deepEqual(
						nest(
							[ shared, shared, shared, shared ]
						),
						nest(
							[
								deepCopy(shared),
								deepCopy(shared),
								deepCopy(shared),
								shared
							]
						)
					)
				)
				assert.isFalse(
					deepEqual(
						nest([ shared, shared, shared ]),
						nest(
							[
								deepCopy(shared),
								deepCopy(shared),
								{ child: { value: 2 } }
							]
						)
					)
				)
			}
		)
		it(
			"special objects",
			() => {
				assert.isTrue(
					deepEqual(new Date(1), new Date(1))
				)
				assert.isFalse(
					deepEqual(new Date(1), new Date(2))
				)
				assert.isTrue(
					deepEqual(new Date(NaN), new Date(NaN))
				)
				assert.isFalse(deepEqual(new Date(1), {}))
				assert.isTrue(deepEqual(/a/g, /a/g))
				assert.isFalse(deepEqual(/a/g, /a/i))
				const regexp = /a/g
				regexp.lastIndex = 1
				assert.isFalse(deepEqual(regexp, /a/g))
				assert.isTrue(
					deepEqual(
						new Map([ [ 1, { a: 1 } ] ]),
						new Map([ [ 1, { a: 1 } ] ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Map([ [ 1, { a: 1 } ] ]),
						new Map([ [ 1, { a: 2 } ] ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Map([ [ 1, 1 ] ]),
						new Map([ [ 2, 1 ] ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Map([ [ 1, void 0 ] ]),
						new Map([ [ 2, void 0 ] ])
					)
				)
				assert.isTrue(
					deepEqual(
						new Set([ 1, 2 ]),
						new Set([ 2, 1 ])
					)
				)
				assert.isFalse(
					deepEqual(
						new Set([ 1, 2 ]),
						new Set([ 1, 3 ])
					)
				)
			}
		)
		it(
			"uninspectable objects",
			() => {
				const weak_map = new WeakMap()
				assert.isTrue(deepEqual(weak_map, weak_map))
				assert.isFalse(
					deepEqual(new WeakMap(), new WeakMap())
				)
				assert.isFalse(
					deepEqual(new WeakSet(), new WeakSet())
				)
				assert.isFalse(
					deepEqual(
						Promise.resolve(),
						Promise.resolve()
					)
				)
			}
		)
	}
)
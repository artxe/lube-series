import dimensions from "./dimensions.js"
import { deepCopy } from "data-lube"
import { Buffer } from "node:buffer"
import { runInNewContext } from "node:vm"
import { assert, describe, it, vi } from "vitest"
describe(
	"deep_copy",
	() => {
		it(
			"__proto__ key",
			() => {
				const origin = JSON.parse(
					"{\"__proto__\":{\"polluted\":1}}"
				)
				const clone = deepCopy(origin)
				assert.equal(
					Object.getPrototypeOf(clone),
					Object.prototype
				)
				assert.deepEqual(
					Object.keys(clone),
					[ "__proto__" ]
				)
				assert.isUndefined(clone.polluted)
				assert.notEqual(
					clone.__proto__,
					origin.__proto__
				)
			}
		)
		it(
			"binary data",
			() => {
				const buffer = new ArrayBuffer(4)
				const bytes = new Uint8Array(buffer, 1, 2)
				const node_buffer = Buffer.from("ab")
				const resizable = new ArrayBuffer(2, { maxByteLength: 8 })
				const shared = new SharedArrayBuffer(1)
				const clone = deepCopy(
					{
						buffer,
						bytes,
						floats: new Float64Array([ 0.5 ]),
						node_buffer,
						resizable,
						shared,
						view: new DataView(buffer, 2)
					}
				)
				assert.notEqual(clone.buffer, buffer)
				assert.equal(clone.buffer.byteLength, 4)
				assert.equal(clone.bytes.buffer, clone.buffer)
				assert.equal(clone.view.buffer, clone.buffer)
				assert.equal(clone.bytes.byteOffset, 1)
				assert.equal(clone.bytes.length, 2)
				clone.bytes[0] = 1
				assert.equal(bytes[0], 0)
				assert.equal(clone.view.getUint8(0), 0)
				clone.bytes[1] = 7
				assert.equal(clone.view.getUint8(0), 7)
				assert.equal(clone.floats[0], 0.5)
				assert.isTrue(
					Buffer.isBuffer(clone.node_buffer)
				)
				assert.equal(
					clone.node_buffer.toString(),
					"ab"
				)
				clone.node_buffer[0] = 0
				assert.equal(node_buffer.toString(), "ab")
				assert.isTrue(clone.resizable.resizable)
				assert.equal(clone.resizable.maxByteLength, 8)
				assert.equal(clone.shared, shared)
			}
		)
		it(
			"boxed primitives",
			() => {
				const clone = deepCopy(
					[
						Object(1n),
						Object(Symbol.iterator),
						new Boolean(false),
						new Number(1),
						new String("ab")
					]
				)
				assert.equal(clone[0].valueOf(), 1n)
				assert.equal(
					clone[1].valueOf(),
					Symbol.iterator
				)
				assert.isFalse(clone[2].valueOf())
				assert.equal(clone[3].valueOf(), 1)
				assert.equal(clone[4].valueOf(), "ab")
			}
		)
		it(
			"buffers that hold their views",
			() => {
				/** @type {ArrayBuffer & { view?: unknown }} */
				const buffer = new ArrayBuffer(4)
				const bytes = new Uint8Array(buffer)
				buffer.view = bytes
				const clone = deepCopy(bytes)
				assert.equal(
					/** @type {ArrayBuffer & { view?: unknown }} */(clone.buffer)/**/.view,
					clone
				)
				/** @type {ArrayBuffer & { view?: unknown }} */
				const other = new ArrayBuffer(4)
				const view = new DataView(other)
				other.view = view
				const view_clone = deepCopy(view)
				assert.equal(
					/** @type {ArrayBuffer & { view?: unknown }} */(view_clone.buffer)/**/.view,
					view_clone
				)
			}
		)
		it(
			"circular reference",
			() => {
				/** @type {{ items: (typeof origin)[], self?: typeof origin }} */
				const origin = { items: [] }
				origin.self = origin
				origin.items.push(origin)
				const clone = deepCopy(origin)
				assert.notEqual(clone, origin)
				assert.equal(clone.self, clone)
				assert.equal(clone.items[0], clone)
			}
		)
		it(
			"class instance",
			() => {
				class Point {
					/**
					 * @param {number} x
					 */
					constructor(x) {
						this.x = x
					}
					get double() {
						return this.x * 2
					}
				}
				const clone = deepCopy(new Point(2))
				assert.instanceOf(clone, Point)
				assert.equal(clone.double, 4)
				class Guarded {
					/** @type {number[]} */
					calls = []
					/**
					 * @param {number} value
					 */
					set locked(value) {
						this.calls.push(value)
					}
				}
				const guarded = new Guarded()
				Object.defineProperty(
					guarded,
					"locked",
					{
						configurable: true,
						enumerable: true,
						value: { value: 1 },
						writable: true
					}
				)
				const guarded_clone = deepCopy(guarded)
				assert.deepEqual(guarded_clone.calls, [])
				assert.deepEqual(
					Object.getOwnPropertyDescriptor(guarded_clone, "locked")?.value,
					{ value: 1 }
				)
				assert.notEqual(
					guarded_clone.locked,
					guarded.locked
				)
				const bare = Object.create(null)
				bare.child = { value: 1 }
				const bare_clone = deepCopy(bare)
				assert.isNull(
					Object.getPrototypeOf(bare_clone)
				)
				assert.notEqual(bare_clone.child, bare.child)
				assert.deepEqual(bare_clone.child, bare.child)
			}
		)
		it(
			"clone",
			() => {
				const clone = deepCopy(dimensions)
				assert.deepStrictEqual(clone, dimensions)
				assert.notEqual(clone, dimensions)
				assert.notEqual(clone[0], dimensions[0])
				assert.notEqual(
					clone[0]?.dimensions,
					dimensions[0]?.dimensions
				)
				assert.notEqual(
					clone[0]?.dimensions[3],
					dimensions[0]?.dimensions[3]
				)
			}
		)
		it(
			"copies primitives of arrays nested past the depth limit",
			() => {
				/** @type {unknown[]} */
				let origin = [ "bottom" ]
				for (let i = 0; i < 300; i++) {
					origin = [ origin, i ]
				}
				const clone = deepCopy(origin)
				let copied = clone
				let original = origin
				for (let i = 299; i >= 0; i--) {
					assert.notEqual(copied, original)
					assert.equal(copied[1], i)
					copied = /** @type {unknown[]} */(copied[0])/**/
					original = /** @type {unknown[]} */(original[0])/**/
				}
				assert.deepEqual(copied, [ "bottom" ])
			}
		)
		it(
			"detached and length-tracking views",
			() => {
				const resizable = new ArrayBuffer(4, { maxByteLength: 8 })
				const clone = deepCopy(
					{
						offset: new Uint16Array(resizable, 2),
						resizable,
						tracking: new Uint8Array(resizable),
						view: new DataView(resizable, 1)
					}
				)
				clone.resizable.resize(8)
				assert.equal(clone.tracking.length, 8)
				assert.equal(clone.offset.length, 3)
				assert.equal(clone.view.byteLength, 7)
				assert.equal(
					clone.tracking.buffer,
					clone.resizable
				)
				const growable = new SharedArrayBuffer(4, { maxByteLength: 8 })
				const shared = deepCopy(
					{ view: new Uint8Array(growable) }
				)
				assert.equal(shared.view.buffer, growable)
				growable.grow(8)
				assert.equal(shared.view.length, 8)
				const detached = new Uint8Array(4)
				const buffer = detached.buffer
				const view = new DataView(buffer, 1)
				structuredClone(buffer, { transfer: [ buffer ] })
				const copied = deepCopy({ buffer, detached, view })
				assert.equal(copied.buffer.byteLength, 0)
				assert.equal(copied.detached.length, 0)
				assert.equal(copied.view.byteLength, 0)
				assert.equal(
					copied.detached.buffer,
					copied.buffer
				)
				const shrunk = new ArrayBuffer(4, { maxByteLength: 8 })
				const outside = new DataView(shrunk, 2, 2)
				shrunk.resize(1)
				assert.equal(deepCopy(outside).byteLength, 0)
			}
		)
		it(
			"errors",
			() => {
				const aborted = new DOMException("stop", "AbortError")
				const aborted_clone = deepCopy(aborted)
				assert.notEqual(aborted_clone, aborted)
				assert.isTrue(
					aborted_clone instanceof DOMException
				)
				assert.equal(aborted_clone.code, 20)
				assert.equal(aborted_clone.message, "stop")
				assert.equal(aborted_clone.name, "AbortError")
				const cause = { code: 1 }
				const error = Object.assign(
					new TypeError("boom", { cause }),
					{ detail: [ 1 ] }
				)
				const clone = deepCopy(error)
				assert.isTrue(clone instanceof TypeError)
				assert.equal(
					Object.prototype.toString.call(clone),
					"[object Error]"
				)
				assert.equal(clone.message, "boom")
				assert.equal(clone.stack, error.stack)
				assert.notEqual(clone.cause, cause)
				assert.deepEqual(clone.cause, cause)
				assert.notEqual(clone.detail, error.detail)
				assert.deepEqual(Object.keys(clone), [ "detail" ])
			}
		)
		it(
			"finalization registries keep their reference",
			() => {
				const registry = new FinalizationRegistry(() => {})
				const clone = deepCopy({ registry })
				assert.equal(clone.registry, registry)
			}
		)
		it(
			"half-empty array keeps its holes",
			() => {
				/** @type {({ index: number } | undefined)[]} */
				const origin = new Array(4096)
				for (let i = 1; i < origin.length; i += 2) {
					origin[i] = { index: i }
				}
				const clone = deepCopy(origin)
				assert.equal(clone.length, 4096)
				assert.equal(Object.keys(clone).length, 2048)
				for (let i = 0; i < clone.length; i++) {
					assert.equal(i in clone, i % 2 == 1)
				}
				assert.deepEqual(clone[4095], { index: 4095 })
				assert.notEqual(clone[4095], origin[4095])
			}
		)
		it(
			"methods and constructors that data overrides",
			() => {
				let constructed = 0
				class Named extends ArrayBuffer {
					/**
					 * @param {string} name
					 * @param {number} size
					 */
					constructor(name, size) {
						super(size)
						constructed++
						this.name = name
					}
				}
				const named = new Named("x", 4)
				new Uint8Array(named)[0] = 7
				const clone = deepCopy(named)
				assert.equal(constructed, 1)
				assert.instanceOf(clone, Named)
				assert.equal(clone.name, "x")
				assert.equal(new Uint8Array(clone)[0], 7)
				assert.deepEqual(
					deepCopy(
						Object.assign([ 1, { a: 1 } ], { slice: null })
					),
					[ 1, { a: 1 } ]
				)
				const constructor = Object.assign([ 1, , 3 ], { constructor: 5 })
				const copied = deepCopy(constructor)
				assert.deepEqual(copied, [ 1, , 3 ])
				assert.isFalse(1 in copied)
			}
		)
		it(
			"objects whose tag no built-in has",
			() => {
				/** @type {Record<string, unknown>} */
				const args = runInNewContext(
					"(function () { return arguments })(1, { a: 2 })"
				)
				const args_clone = deepCopy(args)
				assert.equal(
					Object.getPrototypeOf(args_clone),
					Object.getPrototypeOf(args)
				)
				assert.equal(args_clone["0"], 1)
				assert.deepEqual(args_clone["1"], { a: 2 })
				assert.notEqual(args_clone["1"], args["1"])
				/** @type {Record<PropertyKey, unknown>} */
				const tagged = Object.assign(
					Object.create(null),
					{ value: { b: 3 } }
				)
				tagged[Symbol.toStringTag] = "Custom"
				const tagged_clone = deepCopy(tagged)
				assert.isNull(
					Object.getPrototypeOf(tagged_clone)
				)
				assert.deepEqual(tagged_clone["value"], { b: 3 })
				assert.notEqual(
					tagged_clone["value"],
					tagged["value"]
				)
			}
		)
		it(
			"other realm",
			() => {
				const origin = runInNewContext(
					"({ date: new Date(5), list: [ 1 ], map: new Map([ [ 1, 2 ] ]) })"
				)
				const clone = deepCopy(origin)
				assert.equal(clone.date.getTime(), 5)
				assert.equal(clone.map.get(1), 2)
				assert.isTrue(Array.isArray(clone.list))
				assert.notEqual(clone.list, origin.list)
			}
		)
		it(
			"primitives",
			() => {
				function fn() {}
				for (const value of [
					null,
					void 0,
					0,
					1,
					"",
					"a",
					true,
					fn,
					Symbol.iterator
				]) {
					assert.equal(deepCopy(value), value)
				}
			}
		)
		it(
			"shared reference",
			() => {
				const child = { value: 1 }
				const clone = deepCopy(
					{
						list: [ child ],
						map: new Map([ [ child, child ] ]),
						object: child,
						set: new Set([ child ])
					}
				)
				assert.notEqual(clone.object, child)
				assert.equal(clone.list[0], clone.object)
				assert.isTrue(clone.set.has(clone.object))
				assert.equal(
					clone.map.get(clone.object),
					clone.object
				)
			}
		)
		it(
			"slotless built-in prototypes",
			() => {
				const date_like = Object.assign(
					Object.create(Date.prototype),
					{ value: { at: 1 } }
				)
				const map_like = Object.assign(
					Object.create(Map.prototype),
					{ value: 1 }
				)
				const clone = deepCopy({ date_like, map_like })
				assert.equal(
					Object.getPrototypeOf(clone.date_like),
					Date.prototype
				)
				assert.deepEqual(clone.date_like.value, { at: 1 })
				assert.notEqual(
					clone.date_like.value,
					date_like.value
				)
				assert.equal(
					Object.getPrototypeOf(clone.map_like),
					Map.prototype
				)
				assert.equal(clone.map_like.value, 1)
			}
		)
		it(
			"slotless typed array prototype",
			() => {
				/** @type {Uint8Array & { value: { a: number } }} */
				const origin = Object.assign(
					Object.create(Uint8Array.prototype),
					{ value: { a: 1 } }
				)
				const clone = deepCopy(origin)
				assert.equal(
					Object.getPrototypeOf(clone),
					Uint8Array.prototype
				)
				assert.deepEqual(clone.value, { a: 1 })
				assert.notEqual(clone.value, origin.value)
			}
		)
		it(
			"sparse array proxy that lists its keys in any order",
			() => {
				/** @type {unknown[]} */
				const array = new Array(5000)
				array[10] = { a: 1 }
				array[4000] = 2
				const origin = new Proxy(
					array,
					{
						ownKeys: target => Reflect.ownKeys(target).reverse()
					}
				)
				const clone = deepCopy(origin)
				assert.isTrue(Array.isArray(clone))
				assert.equal(clone.length, 5000)
				assert.deepEqual(
					Object.keys(clone),
					[ "10", "4000" ]
				)
				assert.deepEqual(clone[10], { a: 1 })
				assert.notEqual(clone[10], array[10])
				assert.equal(clone[4000], 2)
			}
		)
		it(
			"special objects",
			() => {
				const date = new Date(123)
				const map = new Map([ [ "a", { b: 1 } ] ])
				const regexp = /a/g
				regexp.lastIndex = 1
				const set = new Set([ 1, 2 ])
				const sparse = [ 1, , 3 ]
				const typed = new Uint8Array([ 1, 2 ])
				const view = new DataView(
					new Uint8Array([ 1, 2, 3 ]).buffer,
					1,
					2
				)
				const clone = deepCopy(
					{
						date,
						map,
						regexp,
						set,
						sparse,
						typed,
						view
					}
				)
				assert.notEqual(clone.date, date)
				assert.equal(clone.date.getTime(), 123)
				assert.notEqual(clone.map, map)
				assert.deepStrictEqual(clone.map, map)
				assert.notEqual(clone.map.get("a"), map.get("a"))
				assert.notEqual(clone.regexp, regexp)
				assert.equal(String(clone.regexp), "/a/g")
				assert.equal(clone.regexp.lastIndex, 1)
				assert.notEqual(clone.set, set)
				assert.deepStrictEqual(clone.set, set)
				assert.isFalse(1 in clone.sparse)
				assert.equal(clone.sparse.length, 3)
				assert.notEqual(clone.typed, typed)
				assert.deepStrictEqual(clone.typed, typed)
				assert.notEqual(clone.view.buffer, view.buffer)
				assert.equal(clone.view.getUint8(0), 2)
				assert.equal(clone.view.byteLength, 2)
			}
		)
		it(
			"subclasses",
			() => {
				class List extends Array {}
				class Moment extends Date {}
				class Registry extends Map {}
				const list = new List(3)
				list[0] = 1
				list[2] = { value: 1 }
				const clone = deepCopy(
					{
						list,
						moment: new Moment(1),
						registry: new Registry([ [ 1, 2 ] ])
					}
				)
				assert.instanceOf(clone.list, List)
				assert.isTrue(Array.isArray(clone.list))
				assert.isFalse(1 in clone.list)
				assert.notEqual(clone.list[2], list[2])
				assert.instanceOf(clone.moment, Moment)
				assert.equal(clone.moment.getTime(), 1)
				assert.instanceOf(clone.registry, Registry)
				assert.equal(clone.registry.get(1), 2)
				class Labeled extends Map {
					label = { name: "users" }
				}
				class Tags extends Set {
					count = 1
				}
				const labeled = new Labeled([ [ 1, { value: 1 } ] ])
				const stamped = Object.assign(new Date(1), { zone: "KST" })
				const owned = deepCopy(
					{
						labeled,
						regexp: Object.assign(/a/g, { tag: { value: 1 } }),
						stamped,
						tags: new Tags([ 1 ])
					}
				)
				assert.deepEqual(
					owned.labeled.label,
					{ name: "users" }
				)
				assert.notEqual(
					owned.labeled.label,
					labeled.label
				)
				assert.notEqual(
					owned.labeled.get(1),
					labeled.get(1)
				)
				assert.deepEqual(
					owned.labeled.get(1),
					{ value: 1 }
				)
				assert.equal(owned.tags.count, 1)
				assert.isTrue(owned.tags.has(1))
				assert.equal(owned.stamped.zone, "KST")
				assert.equal(owned.stamped.getTime(), 1)
				assert.deepEqual(owned.regexp.tag, { value: 1 })
				assert.equal(String(owned.regexp), "/a/g")
				class Tagged extends Map {
					/** @override */
					get [Symbol.toStringTag]() {
						return "Tagged"
					}
				}
				class Fake {
					value = { value: 1 }
					get [Symbol.toStringTag]() {
						return "Map"
					}
				}
				const array_like = Object.assign(
					Object.create(Array.prototype),
					{ key: { value: 1 } }
				)
				const others = deepCopy(
					{
						array_like,
						fake: new Fake(),
						tagged: new Tagged([ [ 1, 2 ] ])
					}
				)
				assert.equal(others.tagged.get(1), 2)
				assert.instanceOf(others.fake, Fake)
				assert.deepEqual(others.fake.value, { value: 1 })
				assert.equal(
					Object.getPrototypeOf(others.array_like),
					Array.prototype
				)
				assert.deepEqual(
					others.array_like.key,
					{ value: 1 }
				)
				assert.notEqual(
					others.array_like.key,
					array_like.key
				)
			}
		)
		it(
			"uncopyable objects",
			() => {
				const origin = {
					promise: Promise.resolve(),
					weak_map: new WeakMap(),
					weak_ref: new WeakRef({}),
					weak_set: new WeakSet()
				}
				const clone = deepCopy(origin)
				assert.notEqual(clone, origin)
				assert.equal(clone.promise, origin.promise)
				assert.equal(clone.weak_map, origin.weak_map)
				assert.equal(clone.weak_ref, origin.weak_ref)
				assert.equal(clone.weak_set, origin.weak_set)
			}
		)
		it(
			"works where SharedArrayBuffer and Float16Array are missing",
			async () => {
				vi.stubGlobal("SharedArrayBuffer", undefined)
				vi.stubGlobal("Float16Array", undefined)
				vi.resetModules()
				try {
					const fresh = await import("data-lube")
					const origin = {
						bytes: new Uint8Array([ 1, 2 ]),
						list: [ { a: 1 } ]
					}
					const clone = fresh.deepCopy(origin)
					assert.notEqual(clone.bytes, origin.bytes)
					assert.notEqual(clone.list[0], origin.list[0])
					assert.isTrue(fresh.deepEqual(clone, origin))
				} finally {
					vi.unstubAllGlobals()
				}
			}
		)
	}
)
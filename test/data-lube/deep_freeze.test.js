import dimensions from "./dimensions.js"
import { deepCopy, deepFreeze } from "data-lube"
import { runInNewContext } from "node:vm"
import { assert, describe, it } from "vitest"
describe(
	"deep_freeze",
	() => {
		/**
		 * @param {unknown} obj
		 * @returns {boolean}
		 */
		function is_deep_frozen(obj) {
			if (!Object.isFrozen(obj)) return false
			for (const key in /** @type {Readonly<Record<string, unknown>>} */(obj)/**/) {
				const o = /** @type {Readonly<Record<string, unknown>>} */(obj)/**/[key]
				if (o && typeof o == "object" && !ArrayBuffer.isView(o) && !is_deep_frozen(o)) return false
			}
			return true
		}
		it(
			"circular reference",
			() => {
				/** @type {{ child: { parent?: typeof origin } }} */
				const origin = { child: {} }
				origin.child.parent = origin
				assert.equal(deepFreeze(origin), origin)
				assert.isTrue(Object.isFrozen(origin))
				assert.isTrue(Object.isFrozen(origin.child))
				/** @type {Map<typeof item, Map<typeof item, unknown>>} */
				const map = new Map()
				/** @type {{ map: typeof map, set?: typeof set }} */
				const item = { map }
				map.set(item, map)
				/** @type {Set<typeof item | Set<unknown>>} */
				const set = new Set([ item ])
				item.set = set
				set.add(set)
				deepFreeze(
					{ [Symbol.iterator]: item, item, map }
				)
				assert.isTrue(Object.isFrozen(item))
				assert.isTrue(Object.isFrozen(map))
				assert.isTrue(Object.isFrozen(set))
			}
		)
		it(
			"deep freeze",
			() => {
				const frozen = deepFreeze(deepCopy(dimensions))
				assert.isTrue(is_deep_frozen(frozen))
				assert.throws(
					() => {
						// @ts-expect-error: read-only property
						frozen[0].dimensions[0].runtime.common.client = 2
					},
					TypeError
				)
			}
		)
		it(
			"maps and sets",
			() => {
				const key = { key: 1 }
				const value = { value: 1 }
				const item = { item: 1 }
				const origin = {
					map: new Map([ [ key, value ] ]),
					set: new Set([ item ])
				}
				deepFreeze(origin)
				assert.isTrue(Object.isFrozen(origin.map))
				assert.isTrue(Object.isFrozen(key))
				assert.isTrue(Object.isFrozen(value))
				assert.isTrue(Object.isFrozen(item))
				class Tagged extends Set {
					/** @override */
					get [Symbol.toStringTag]() {
						return "Tagged"
					}
				}
				class Fake {
					value = { value: 1 }
					get [Symbol.toStringTag]() {
						return "Set"
					}
				}
				const tagged_item = { item: 1 }
				const fake = new Fake()
				deepFreeze(
					{
						fake,
						tagged: new Tagged([ tagged_item ])
					}
				)
				assert.isTrue(Object.isFrozen(tagged_item))
				assert.isTrue(Object.isFrozen(fake.value))
				const foreign = runInNewContext("({ key: {}, value: {} })")
				deepFreeze(
					runInNewContext(
						"(entry => new Map([ [ entry.key, entry.value ] ]))"
					)(foreign)
				)
				assert.isTrue(Object.isFrozen(foreign.key))
				assert.isTrue(Object.isFrozen(foreign.value))
			}
		)
		it(
			"primitives",
			() => {
				for (const value of [ null, void 0, 0, "a", true ]) {
					assert.equal(deepFreeze(value), value)
				}
			}
		)
		it(
			"shallow frozen object",
			() => {
				const origin = Object.freeze({ child: { value: 1 } })
				deepFreeze(origin)
				assert.isTrue(Object.isFrozen(origin.child))
			}
		)
		it(
			"shared and deep references",
			() => {
				/** @type {{ leaf?: Record<string, never>, left?: typeof tree, right?: typeof tree }} */
				let tree = { leaf: {} }
				for (let i = 0; i < 40; i++) tree = { left: tree, right: tree }
				deepFreeze(tree)
				assert.isTrue(
					Object.isFrozen(
						/** @type {{ left: { right: { leaf: Record<string, never> } } }} */(tree)/**/.left.right.leaf
					)
				)
				/** @type {{ next?: typeof chain }} */
				const bottom = {}
				/** @type {{ [Symbol.iterator]?: typeof chain, next?: typeof chain }} */
				let chain = bottom
				for (let i = 0; i < 100; i++) chain = { [Symbol.iterator]: chain }
				bottom.next = chain
				deepFreeze(chain)
				assert.isTrue(Object.isFrozen(bottom))
			}
		)
		it(
			"symbol and non-enumerable keys",
			() => {
				const hidden = { value: 1 }
				const symbol = { value: 1 }
				const origin = { [Symbol.iterator]: symbol }
				Object.defineProperty(
					origin,
					"hidden",
					{ value: hidden }
				)
				deepFreeze(origin)
				assert.isTrue(Object.isFrozen(hidden))
				assert.isTrue(Object.isFrozen(symbol))
			}
		)
		it(
			"typed array",
			() => {
				const origin = {
					bytes: new Uint8Array([ 1 ]),
					list: [ 1 ]
				}
				assert.doesNotThrow(() => deepFreeze(origin))
				assert.isTrue(Object.isFrozen(origin.list))
				assert.isFalse(Object.isFrozen(origin.bytes))
			}
		)
	}
)
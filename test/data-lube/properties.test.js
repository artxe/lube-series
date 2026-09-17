import {
	deepCopy,
	deepDiff,
	deepEqual,
	deepFreeze,
	deepMerge,
	deepPatch,
	deepUpdate
} from "data-lube"
import { types } from "node:util"
import { assert, describe, it } from "vitest"
describe(
	"properties",
	() => {
		/**
		 * @param {number} seed
		 * @returns {() => number}
		 */
		function create_random(seed) {
			return () => {
				seed = seed + 0x6d2b79f5 | 0
				let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
				value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
				return ((value ^ value >>> 14) >>> 0) / 4294967296
			}
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function has_frozen(value) {
			return has_object(value, Object.isFrozen)
		}
		/**
		 * @param {unknown} value
		 * @param {(item: WeakKey) => boolean} test
		 * @returns {boolean}
		 */
		function has_object(value, test) {
			const seen = new Set()
			/**
			 * @param {unknown} item
			 * @returns {boolean}
			 */
			function visit(item) {
				if (!item || typeof item != "object" || seen.has(item)) return false
				if (test(item)) return true
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
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function has_proxy(value) {
			return has_object(value, types.isProxy)
		}
		class Member {
			#secret = 1
			/**
			 * @param {Record<string, unknown>} fields
			 */
			constructor(fields) {
				Object.assign(this, fields)
			}
			get secret() {
				return this.#secret
			}
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function container(value) {
			return value instanceof Map || value instanceof Set || Array.isArray(value) || !!value && typeof value == "object" && Object.getPrototypeOf(value) === Object.prototype
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function cyclic(value) {
			/** @type {Set<unknown>} */
			const active = new Set()
			/** @type {Set<unknown>} */
			const done = new Set()
			/**
			 * @param {unknown} item
			 * @returns {boolean}
			 */
			function visit(item) {
				if (!container(item) || done.has(item)) return false
				if (active.has(item)) return true
				active.add(item)
				const found = members_of(item).some(visit)
				active.delete(item)
				done.add(item)
				return found
			}
			return visit(value)
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function has_broken_member(value) {
			return has_object(
				value,
				item => {
					if (!(item instanceof Member)) return false
					try {
						return item.secret != 1
					} catch {
						return true
					}
				}
			)
		}
		/**
		 * @param {() => number} random
		 * @param {number} depth
		 * @param {boolean} [instances]
		 * @returns {boolean | Date | Map<string | { id: number }, unknown> | number | unknown[] | { [key: string]: ReturnType<typeof make> } | Set<number | { id: number, value: ReturnType<typeof make> }> | string | null | undefined}
		 */
		function make(random, depth, instances = false) {
			const pick = Math.floor(
				random() * (depth > 3 ? 5 : 10)
			)
			const size = Math.floor(random() * 4)
			switch (pick) {
			case 0:
				return Math.floor(random() * 5)
			case 1:
				return [ "a", "b", "", null, undefined, NaN, true ][Math.floor(random() * 7)]
			case 2:
				return random() < 0.5
					? new Date(Math.floor(random() * 3))
					: -0
			case 3:
			case 4:
				return `s${Math.floor(random() * 3)}`
			case 5:
			case 6: {
				const fields = Object.fromEntries(
					Array.from(
						{ length: size },
						(_, i) => [
							`k${i}`,
							make(random, depth + 1, instances)
						]
					)
				)
				return instances && random() < 0.3
					? /** @type {Record<string, ReturnType<typeof make>>} */(/** @type {unknown} */(new Member(fields)))/**/
					: fields
			}
			case 7:
				return Array.from(
					{ length: size },
					() => make(random, depth + 1, instances)
				)
			case 8:
				return new Map(
					Array.from(
						{ length: size },
						(_, i) => [
							random() < 0.3
								? { id: i }
								: `m${i}`,
							make(random, depth + 1, instances)
						]
					)
				)
			default:
				return new Set(
					Array.from(
						{ length: size },
						(_, i) => random() < 0.5
							? i
							: {
								id: i,
								value: make(random, depth + 2, instances)
							}
					)
				)
			}
		}
		/**
		 * @param {() => number} random
		 * @returns {{ root: ReturnType<typeof make> }}
		 */
		function make_graph(random) {
			const size = 2 + Math.floor(random() * 6)
			/** @type {(Record<string, unknown> | unknown[] | Map<unknown, unknown> | Set<unknown>)[]} */
			const pool = []
			for (let i = 0; i < size; i++) {
				const kind = Math.floor(random() * 4)
				pool.push(
					kind == 0
						? {}
						: kind == 1
							? []
							: kind == 2
								? new Map()
								: new Set()
				)
			}
			/**
			 * @returns {(typeof pool)[number] | undefined}
			 */
			function node() {
				return pool[Math.floor(random() * size)]
			}
			/**
			 * @returns {unknown}
			 */
			function value() {
				return random() < 0.5
					? node()
					: make(random, 4)
			}
			for (const item of pool) {
				const count = Math.floor(random() * 4)
				for (let i = 0; i < count; i++) {
					if (Array.isArray(item)) {
						item.push(value())
					} else if (item instanceof Map) {
						item.set(
							random() < 0.3
								? node()
								: `m${i}`,
							value()
						)
					} else if (item instanceof Set) {
						item.add(
							random() < 0.5
								? i
								: node()
						)
					} else {
						item[`k${i}`] = value()
					}
				}
			}
			return /** @type {{ root: ReturnType<typeof make> }} */({ root: pool[0] })/**/
		}
		/**
		 * @param {unknown} value
		 * @returns {unknown[]}
		 */
		function members_of(value) {
			return value instanceof Map
				? [
					...value.keys(),
					...value.values()
				]
				: value instanceof Set || Array.isArray(value)
					? [ ...value ]
					: Object.values(
						/** @type {object} */(value)/**/
					)
		}
		/**
		 * @param {ReturnType<typeof make>} target
		 * @param {() => number} random
		 * @param {number} depth
		 * @param {unknown} root
		 * @returns {void}
		 */
		function mutate(target, random, depth, root) {
			if (depth > 12) return
			const choice = random()
			if (Array.isArray(target)) {
				const index = Math.floor(random() * (target.length + 1))
				if (choice < 0.2 && target.length) {
					target.splice(index, 1)
				} else if (choice < 0.4) {
					target.push(make(random, depth))
				} else if (choice < 0.5 && target.length > 1) {
					target.reverse()
				} else if (choice < 0.55) {
					target[index] = make(random, depth)
				} else if (choice < 0.6) {
					target[index] = reach(root, random)
				} else if (index < target.length && target[index] && typeof target[index] == "object") {
					mutate(
						/** @type {ReturnType<typeof make>} */(target[index])/**/,
						random,
						depth + 1,
						root
					)
				}
			} else if (target instanceof Map) {
				const keys = [ ...target.keys() ]
				const key = keys[Math.floor(random() * keys.length)]
				if (choice < 0.2 && keys.length) {
					target.delete(
						/** @type {NonNullable<typeof key>} */(key)/**/
					)
				} else if (choice < 0.35) {
					target.set(
						`n${Math.floor(random() * 4)}`,
						make(random, depth)
					)
				} else if (choice < 0.4) {
					target.set(
						`n${Math.floor(random() * 4)}`,
						reach(root, random)
					)
				} else if (choice < 0.5) {
					target.clear()
				} else if (choice < 0.6) {
					let steps = 0
					for (const [ item, value ] of target) {
						if (++steps > 12) break
						const action = random()
						if (action < 0.3) {
							target.delete(item)
						} else if (action < 0.5) {
							target.set(
								`n${Math.floor(random() * 4)}`,
								make(random, depth)
							)
						} else if (value && typeof value == "object") {
							mutate(
								/** @type {ReturnType<typeof make>} */(value)/**/,
								random,
								depth + 1,
								root
							)
						}
					}
				} else if (keys.length) {
					const value = target.get(
						/** @type {NonNullable<typeof key>} */(key)/**/
					)
					if (value && typeof value == "object") {
						mutate(
							/** @type {ReturnType<typeof make>} */(value)/**/,
							random,
							depth + 1,
							root
						)
					} else {
						target.set(
							/** @type {NonNullable<typeof key>} */(key)/**/,
							make(random, depth)
						)
					}
				}
			} else if (target instanceof Set) {
				const values = [ ...target ]
				const value = values[Math.floor(random() * values.length)]
				if (choice < 0.3 && values.length) {
					target.delete(
						/** @type {NonNullable<typeof value>} */(value)/**/
					)
				} else if (choice < 0.5) {
					target.add(Math.floor(random() * 6))
				} else if (choice < 0.6) {
					target.clear()
					for (const item of values.reverse()) target.add(item)
				} else if (value && typeof value == "object") {
					value.value = make(random, depth + 1)
				}
			} else if (target && typeof target == "object" && !(target instanceof Date)) {
				const keys = Object.keys(target)
				const key = keys[Math.floor(random() * keys.length)]
				if (choice < 0.2 && key !== undefined) {
					delete target[key]
				} else if (choice < 0.4) {
					target[`n${Math.floor(random() * 4)}`] = make(random, depth)
				} else if (choice < 0.45) {
					target[`n${Math.floor(random() * 4)}`] = reach(root, random)
				} else if (choice < 0.55 && keys.length > 1) {
					target[`n${Math.floor(random() * 4)}`] = target[/** @type {string} */(key)/**/]
				} else if (key !== undefined) {
					const value = target[key]
					if (value && typeof value == "object") {
						mutate(value, random, depth + 1, root)
					} else {
						target[key] = make(random, depth)
					}
				}
			}
		}
		/**
		 * @param {unknown} root
		 * @param {() => number} random
		 * @returns {ReturnType<typeof make>}
		 */
		function reach(root, random) {
			let node = root
			for (let steps = Math.floor(random() * 4); steps > 0; steps--) {
				const found = (node instanceof Map
					? [ ...node.values() ]
					: members_of(node)).filter(container)
				if (!found.length) break
				node = found[Math.floor(random() * found.length)]
			}
			return /** @type {ReturnType<typeof make>} */(node)/**/
		}
		/**
		 * @param {unknown} a
		 * @param {unknown} b
		 * @returns {boolean}
		 */
		function same_shape(a, b) {
			/** @type {Map<unknown, unknown>} */
			const forward = new Map()
			/** @type {Map<unknown, unknown>} */
			const backward = new Map()
			/** @type {unknown[]} */
			const stack = [ a, b ]
			while (stack.length) {
				const y = stack.pop()
				const x = stack.pop()
				const object = !!x && typeof x == "object"
				if (object !== (!!y && typeof y == "object")) return false
				if (!object) continue
				if (forward.has(x) || backward.has(y)) {
					if (forward.get(x) !== y || backward.get(y) !== x) return false
					continue
				}
				forward.set(x, y)
				backward.set(y, x)
				if (!container(x)) continue
				if (!container(y) || Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false
				if (x instanceof Map || x instanceof Set || Array.isArray(x)) {
					const left = members_of(x)
					const right = members_of(y)
					if (left.length != right.length) return false
					for (let i = 0; i < left.length; i++) stack.push(left[i], right[i])
				} else {
					const keys = Object.keys(/** @type {object} */(x)/**/).sort()
					if (keys.join() != Object.keys(/** @type {object} */(y)/**/).sort()
						.join()) return false
					for (const key of keys) stack.push(
						/** @type {Record<string, unknown>} */(x)/**/[key],
						/** @type {Record<string, unknown>} */(y)/**/[key]
					)
				}
			}
			return true
		}
		it(
			"diff round trip",
			() => {
				for (let seed = 0; seed < 400; seed++) {
					const random = create_random(seed)
					const before = { root: make(random, 0) }
					const after = { root: make(random, 0) }
					const snapshot = deepCopy(before)
					const changes = deepDiff(before, after)
					assert.isTrue(
						deepEqual(
							deepPatch(before, changes),
							after
						),
						`seed ${seed}`
					)
					assert.isTrue(
						deepEqual(before, snapshot),
						`seed ${seed}`
					)
					assert.deepEqual(
						deepDiff(after, deepCopy(after)),
						[],
						`seed ${seed}`
					)
					const frozen = deepFreeze(deepCopy(before))
					assert.isTrue(
						deepEqual(
							deepPatch(frozen, deepDiff(frozen, after)),
							after
						),
						`seed ${seed}`
					)
					assert.isFalse(
						has_frozen(after),
						`seed ${seed}`
					)
					const source = make(random, 0)
					const target = make(random, 0, true)
					const frozen_source = deepFreeze(deepCopy(source))
					const applied = deepPatch(
						frozen_source,
						deepDiff(frozen_source, target)
					)
					assert.isTrue(
						deepEqual(applied, target),
						`seed ${seed}`
					)
					assert.isFalse(
						has_broken_member(applied),
						`seed ${seed}`
					)
					const shared = new Set()
					has_object(
						target,
						item => {
							if (item instanceof Member) has_object(
								item,
								inner => {
									shared.add(inner)
									return false
								}
							)
							return false
						}
					)
					assert.isFalse(
						has_object(
							target,
							item => Object.isFrozen(item) && !shared.has(item)
						),
						`seed ${seed}`
					)
					if (applied && typeof applied == "object" && frozen_source && typeof frozen_source == "object" && !(frozen_source instanceof Date)) {
						assert.isFalse(
							has_object(
								applied,
								item => !Object.isFrozen(item) && !ArrayBuffer.isView(item)
							),
							`seed ${seed}`
						)
					}
				}
			}
		)
		it(
			"merge matches nested spread",
			() => {
				/**
				 * @param {Readonly<Record<string, unknown>>} a
				 * @param {Readonly<Record<string, unknown>>} b
				 * @returns {unknown}
				 */
				function reference(a, b) {
					function plain(/** @type {unknown} */ value) {
						return value && typeof value == "object" && Object.getPrototypeOf(value) === Object.prototype
					}
					if (!plain(a) || !plain(b)) return b
					/** @type {Record<string, unknown>} */
					const result = { ...a, ...b }
					for (const key of Object.keys(b)) {
						if (Object.prototype.hasOwnProperty.call(a, key) && plain(a[key]) && plain(b[key]) && a[key] !== b[key]) result[key] = reference(
							/** @type {Readonly<Record<string, unknown>>} */(a[key])/**/,
							/** @type {Readonly<Record<string, unknown>>} */(b[key])/**/
						)
					}
					return result
				}
				for (let seed = 0; seed < 400; seed++) {
					const random = create_random(seed)
					const a = { root: make(random, 0) }
					const b = { root: make(random, 0) }
					const snapshot = deepCopy([ a, b ])
					assert.isTrue(
						deepEqual(deepMerge(a, b), reference(a, b)),
						`seed ${seed}`
					)
					assert.isTrue(
						deepEqual([ a, b ], snapshot),
						`seed ${seed}`
					)
				}
			}
		)
		it(
			"update matches mutation of a copy",
			() => {
				for (let seed = 0; seed < 600; seed++) {
					const base = {
						root: make(create_random(seed), 0)
					}
					const snapshot = deepCopy(base)
					const expected = deepCopy(base)
					const steps = 1 + seed % 5
					const reference_random = create_random(seed * 7919)
					for (let i = 0; i < steps; i++) mutate(
						expected,
						reference_random,
						0,
						expected
					)
					const loops = cyclic(expected)
					const draft_random = create_random(seed * 7919)
					const next = deepUpdate(
						base,
						draft => {
							for (let i = 0; i < steps; i++) mutate(draft, draft_random, 0, draft)
							assert.isTrue(
								deepEqual(draft, expected),
								`seed ${seed}`
							)
							const current = deepCopy(draft)
							assert.isFalse(
								has_proxy(current),
								`seed ${seed}`
							)
							assert.isTrue(
								deepEqual(expected, current),
								`seed ${seed}`
							)
							assert.isTrue(
								same_shape(current, expected),
								`seed ${seed}`
							)
							assert.deepEqual(
								deepDiff(expected, draft),
								[],
								`seed ${seed}`
							)
							const changes = deepDiff(base, draft)
							assert.isFalse(
								has_proxy(changes),
								`seed ${seed}`
							)
							if (!loops) {
								assert.isTrue(
									deepEqual(
										deepPatch(base, changes),
										expected
									),
									`seed ${seed}`
								)
							}
							const merged = deepMerge({ root: 0 }, draft)
							assert.isTrue(
								deepEqual(
									merged,
									deepMerge({ root: 0 }, expected)
								),
								`seed ${seed}`
							)
							assert.isFalse(
								has_proxy(deepCopy(merged)),
								`seed ${seed}`
							)
						}
					)
					assert.isTrue(
						deepEqual(next, expected),
						`seed ${seed}`
					)
					assert.isTrue(
						same_shape(next, expected),
						`seed ${seed}`
					)
					assert.isTrue(
						deepEqual(base, snapshot),
						`seed ${seed}`
					)
					assert.isFalse(has_proxy(next), `seed ${seed}`)
					if (!loops) {
						assert.isTrue(
							deepEqual(
								deepPatch(base, deepDiff(base, next)),
								next
							),
							`seed ${seed}`
						)
					}
					const again = deepCopy(expected)
					const again_reference = create_random(seed * 104729)
					mutate(again, again_reference, 0, again)
					const again_random = create_random(seed * 104729)
					const chained = deepUpdate(
						next,
						draft => {
							mutate(draft, again_random, 0, draft)
						}
					)
					assert.isTrue(
						deepEqual(chained, again),
						`seed ${seed}`
					)
					assert.isTrue(
						same_shape(chained, again),
						`seed ${seed}`
					)
				}
			}
		)
		it(
			"update of shared and circular values matches mutation of a copy",
			async () => {
				for (let seed = 0; seed < 300; seed++) {
					const base = make_graph(create_random(seed))
					const frozen = seed % 3 == 0
					const input = frozen
						? /** @type {typeof base} */(deepFreeze(deepCopy(base)))/**/
						: base
					const snapshot = deepCopy(input)
					let expected = deepCopy(input)
					/** @type {unknown} */
					let next = input
					for (let round = 0; round < 3; round++) {
						const steps = 1 + (seed + round) % 4
						const reference_random = create_random(seed * 7919 + round)
						for (let i = 0; i < steps; i++) mutate(
							expected,
							reference_random,
							0,
							expected
						)
						const draft_random = create_random(seed * 7919 + round)
						/**
						 * @param {typeof base} draft
						 * @returns {void}
						 */
						function recipe(draft) {
							for (let i = 0; i < steps; i++) mutate(draft, draft_random, 0, draft)
							assert.isTrue(
								deepEqual(draft, expected),
								`seed ${seed} round ${round}`
							)
							const current = deepCopy(draft)
							assert.isFalse(
								has_proxy(current),
								`seed ${seed} round ${round}`
							)
							assert.isTrue(
								same_shape(current, expected),
								`seed ${seed} round ${round}`
							)
							assert.deepEqual(
								deepDiff(expected, draft),
								[],
								`seed ${seed} round ${round}`
							)
						}
						next = round == 1
							// eslint-disable-next-line no-await-in-loop
							? await deepUpdate(
								/** @type {typeof base} */(next)/**/,
								async draft => {
									await Promise.resolve()
									recipe(draft)
								},
								{ graph: next === input }
							)
							: deepUpdate(
								/** @type {typeof base} */(next)/**/,
								recipe,
								{ graph: next === input }
							)
						assert.isTrue(
							deepEqual(next, expected),
							`seed ${seed} round ${round}`
						)
						assert.isTrue(
							same_shape(next, expected),
							`seed ${seed} round ${round}`
						)
						assert.isFalse(
							has_proxy(next),
							`seed ${seed} round ${round}`
						)
						if (frozen) {
							assert.isFalse(
								has_object(
									next,
									item => !Object.isFrozen(item) && !ArrayBuffer.isView(item)
								),
								`seed ${seed} round ${round}`
							)
						}
						expected = deepCopy(expected)
					}
					assert.isTrue(
						deepEqual(input, snapshot),
						`seed ${seed}`
					)
					assert.isTrue(
						same_shape(input, snapshot),
						`seed ${seed}`
					)
				}
			}
		)
		it(
			"update of shared values read through every path matches mutation of a copy",
			() => {
				for (let seed = 0; seed < 200; seed++) {
					const { root } = make_graph(create_random(seed))
					const list = Array.from(
						{ length: seed % 80 },
						(_, id) => ({ id })
					)
					const base = {
						list,
						root,
						tail: {
							first: list[seed % 50] ?? { id: -1 },
							root
						}
					}
					const snapshot = deepCopy(base)
					const expected = deepCopy(base)
					Object.assign(expected.tail.first, { seed })
					const steps = 1 + seed % 4
					const reference_random = create_random(seed * 7919)
					for (let i = 0; i < steps; i++) mutate(
						expected,
						reference_random,
						0,
						expected
					)
					const draft_random = create_random(seed * 7919)
					const next = deepUpdate(
						base,
						draft => {
							const seen = new Set()
							/** @type {unknown[]} */
							const queue = [ draft ]
							for (let i = 0; i < queue.length; i++) {
								const item = queue[i]
								if (typeof item != "object" || item === null || seen.has(item)) continue
								seen.add(item)
								queue.push(
									...item instanceof Map
										? item.values()
										: item instanceof Set
											? item
											: Object.values(item)
								)
							}
							Object.assign(draft.tail.first, { seed })
							for (let i = 0; i < steps; i++) mutate(draft, draft_random, 0, draft)
						}
					)
					assert.isTrue(
						deepEqual(next, expected),
						`seed ${seed}`
					)
					assert.isTrue(
						same_shape(next, expected),
						`seed ${seed}`
					)
					assert.isTrue(
						same_shape(base, snapshot),
						`seed ${seed}`
					)
				}
			}
		)
	}
)
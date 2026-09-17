/** @import { Change } from "data-lube" */
/** @import { CaseConfig, Failure, GenOptions, Iso, Kind, Op, Rand, RefClone, Seg, Side, Spec, Val } from "./private.js" */
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
	"reference oracle",
	() => {
		const seeds = Number(
			process.env["DATA_LUBE_SEEDS"] ?? ""
		) || 0
		const first = Number(
			process.env["DATA_LUBE_SEED"] ?? ""
		) || 1
		const only = process.env["DATA_LUBE_CASE"]
		const timeout = seeds
			? 86400000
			: 120000
		class Part {
			#serial
			/** @type {string} */
			name
			/** @type {unknown} */
			ref
			/**
			 * @param {string} name
			 * @param {unknown} ref
			 * @param {number} serial
			 */
			constructor(name, ref, serial) {
				this.name = name
				this.ref = ref
				this.#serial = serial
			}
			get serial() {
				return this.#serial
			}
		}
		class Tag {
			/** @type {string} */
			label
			/**
			 * @param {string} label
			 */
			constructor(label) {
				this.label = label
			}
		}
		const primitives = [
			0,
			1,
			-1,
			2,
			NaN,
			"s",
			"",
			"t",
			null,
			undefined,
			true,
			false
		]
		const obj_keys = [ "a", "b", "c", "d", "x" ]
		const map_keys = [ "k1", "k2", 3, "k4" ]
		/**
		 * @param {unknown} root
		 * @param {Op} op
		 * @param {unknown[]} v
		 * @param {Set<unknown> | undefined} touched
		 * @returns {void}
		 */
		function apply(root, op, v, touched) {
			const target = at(root, op.path)
			touched?.add(target)
			switch (op.kind) {
			case "o-set":
				fields(target)[op.k] = v[0]
				break
			case "o-delete":
				delete fields(target)[op.k]
				break
			case "a-set":
				as_array(target)[op.i] = v[0]
				break
			case "a-delete":
				delete as_array(target)[op.i]
				break
			case "splice":
				as_array(target).splice(op.i, 1)
				break
			case "push":
				as_array(target).push(...v)
				break
			case "unshift":
				as_array(target).unshift(...v)
				break
			case "pop":
				as_array(target).pop()
				break
			case "reverse":
				as_array(target).reverse()
				break
			case "clear":
				as_map(target).clear()
				break
			case "length":
				as_array(target).length = op.n
				break
			case "m-set":
				as_map(target).set(op.k, v[0])
				break
			case "m-delete":
				as_map(target).delete(op.k)
				break
			case "s-add":
				as_set(target).add(v[0])
				break
			case "s-delete":
				as_set(target).delete(v[0])
				break
			default:
			}
		}
		/**
		 * @param {unknown} value
		 * @returns {unknown[]}
		 */
		function as_array(value) {
			return /** @type {unknown[]} */(value)/**/
		}
		/**
		 * @param {unknown} value
		 * @returns {Map<unknown, unknown>}
		 */
		function as_map(value) {
			return /** @type {Map<unknown, unknown>} */(value)/**/
		}
		/**
		 * @param {unknown} value
		 * @returns {Set<unknown>}
		 */
		function as_set(value) {
			return /** @type {Set<unknown>} */(value)/**/
		}
		/**
		 * @param {Map<unknown, Set<unknown>>} pairs
		 * @param {unknown} a
		 * @param {unknown} b
		 * @returns {void}
		 */
		function assume(pairs, a, b) {
			let set = pairs.get(a)
			if (!set) pairs.set(a, set = new Set())
			set.add(b)
		}
		/**
		 * @param {unknown} root
		 * @param {Seg[]} path
		 * @returns {unknown}
		 */
		function at(root, path) {
			let v = root
			for (const s of path) v = step(v, s)
			return v
		}
		/**
		 * @param {{ failures: Failure[], label: string, trace: string[] }} ctx
		 * @param {Op & { kind: "check" }} op
		 * @param {unknown} draft
		 * @param {unknown} reference
		 * @param {{ copy: unknown, expect: unknown, identity: (value: unknown) => boolean }[]} snapshots
		 * @returns {void}
		 */
		function check_inside(ctx, op, draft, reference, snapshots) {
			const d1 = at(draft, op.path)
			const e1 = at(reference, op.path)
			const d2 = at(draft, op.path2)
			const e2 = at(reference, op.path2)
			try {
				if (op.mode == "equal") {
					if (!deepEqual(d1, e1)) fail(
						ctx,
						"draft-equal",
						`deepEqual(draft, reference) is false: ${show(e1)}`
					)
					if (deepEqual(d1, d2) != ref_equal(e1, e2)) fail(
						ctx,
						"draft-equal-pair",
						`deepEqual(a, b) is ${deepEqual(d1, d2)}: a=${show(e1)} b=${show(e2)}`
					)
				} else if (op.mode == "copy") {
					const identity = has_proxy(d1)
						? is_instance
						: () => false
					const copy = deepCopy(d1)
					const res = iso(copy, e1, identity)
					if (res.fail) fail(
						ctx,
						"draft-copy",
						`deepCopy(draft) differs: ${res.fail}; copy=${show(copy)} expected=${show(e1)}`
					)
					if (has_proxy(copy)) fail(
						ctx,
						"draft-copy-proxy",
						"deepCopy(draft) holds a proxy"
					)
					snapshots.push(
						{
							copy,
							expect: ref_clone(e1).root,
							identity
						}
					)
				} else if (op.mode == "diff") {
					const own = deepDiff(d1, e1)
					if (own.length) fail(
						ctx,
						"draft-diff-self",
						`deepDiff(draft, reference) is not empty: ${show(own)}`
					)
					const a = deepDiff(d1, d2)
					const b = deepDiff(e1, e2)
					if (!ref_equal(a, b)) fail(
						ctx,
						"draft-diff",
						`deepDiff(a, b) differs: ${show(a)} vs ${show(b)}`
					)
				} else {
					const merged = deepMerge(d1, d2)
					const expected = deepMerge(e1, e2)
					if (!deepEqual(merged, expected) || !ref_equal(deepCopy(merged), expected)) fail(
						ctx,
						"draft-merge",
						`deepMerge(a, b) differs: ${show(deepCopy(merged))} vs ${show(expected)}`
					)
				}
			} catch (error) {
				fail(
					ctx,
					`draft-${op.mode}-throw`,
					String(error)
				)
			}
		}
		/**
		 * @param {Map<unknown, Set<unknown>>} pairs
		 * @returns {Map<unknown, Set<unknown>>}
		 */
		function clone_pairs(pairs) {
			/** @type {Map<unknown, Set<unknown>>} */
			const out = new Map()
			for (const [ k, v ] of pairs) out.set(k, new Set(v))
			return out
		}
		/**
		 * @param {{ failures: Failure[], label: string, trace: string[] }} ctx
		 * @param {string} kind
		 * @param {string} detail
		 * @returns {void}
		 */
		function fail(ctx, kind, detail) {
			ctx.failures.push(
				{
					detail,
					kind,
					text: `${ctx.label}\n  ${ctx.trace.join("\n  ")}`
				}
			)
		}
		/**
		 * @param {unknown} value
		 * @returns {Record<string, unknown>}
		 */
		function fields(value) {
			return /** @type {Record<string, unknown>} */(value)/**/
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} root
		 * @param {boolean} checks
		 * @returns {Op}
		 */
		function gen_op(r, root, checks) {
			if (checks && r.chance(0.12)) {
				return {
					kind: "check",
					mode: r.pick(
						/** @type {const} */([ "copy", "diff", "equal", "merge" ])/**/
					),
					path: pick_path(r, root, "container"),
					path2: pick_path(r, root, "container")
				}
			}
			const path = pick_path(r, root, "container")
			const target = at(root, path)
			const kind = kind_of(target)
			if (kind == "obj") {
				const keys = Object.keys(fields(target))
				if (keys.length && r.chance(0.25)) return {
					k: r.pick(keys),
					kind: "o-delete",
					path
				}
				return {
					k: r.chance(0.6) && keys.length
						? r.pick(keys)
						: r.pick(obj_keys),
					kind: "o-set",
					path,
					v: gen_val(r, root)
				}
			}
			if (kind == "arr") {
				const length = as_array(target).length
				const which = r.weighted(
					[
						[ "set", 4 ],
						[ "push", 3 ],
						[ "pop", 1 ],
						[ "splice", 1 ],
						[ "unshift", 1 ],
						[ "reverse", 1 ],
						[ "hole", 1 ],
						[ "length", 1 ]
					]
				)
				if (which == "set") return {
					i: r.int(length + 1),
					kind: "a-set",
					path,
					v: gen_val(r, root)
				}
				if (which == "push" || which == "unshift") return {
					args: [ gen_val(r, root) ],
					kind: which,
					path
				}
				if ((which == "splice" || which == "hole") && length) {
					return {
						i: r.int(length),
						kind: which == "hole"
							? "a-delete"
							: "splice",
						path
					}
				}
				if (which == "length") return {
					kind: "length",
					n: r.int(length + 2),
					path
				}
				if (which == "reverse") return { kind: "reverse", path }
				return { kind: "pop", path }
			}
			if (kind == "map") {
				const keys = [ ...as_map(target).keys() ]
				if (r.chance(0.05)) return { kind: "clear", path }
				if (keys.length && r.chance(0.25)) return {
					k: r.pick(keys),
					kind: "m-delete",
					path
				}
				return {
					k: r.chance(0.5) && keys.length
						? r.pick(keys)
						: r.pick(map_keys),
					kind: "m-set",
					path,
					v: gen_val(r, root)
				}
			}
			const size = as_set(target).size
			if (r.chance(0.05)) return { kind: "clear", path }
			if (size && r.chance(0.35)) {
				return {
					kind: "s-delete",
					path,
					v: r.chance(0.7)
						? {
							path: [
								...path,
								{ n: r.int(size), t: "s" }
							],
							t: "ref"
						}
						: { t: "prim", v: r.pick(primitives) }
				}
			}
			return {
				kind: "s-add",
				path,
				v: gen_val(r, root)
			}
		}
		/**
		 * @param {Rand} r
		 * @param {number} depth
		 * @param {number} refs
		 * @returns {Spec}
		 */
		function gen_spec(r, depth, refs) {
			const t = depth > 2
				? "prim"
				: r.weighted(
					/** @type {[ Spec["t"], number ][]} */([
						[ "prim", 3 ],
						[ "obj", 4 ],
						[ "arr", 2 ],
						[ "map", 1 ],
						[ "set", 1 ],
						[ "date", 1 ],
						[ "part", 1 ],
						[
							"ref",
							refs > 0
								? 2
								: 0
						]
					])/**/
				)
			if (t == "prim") return { t, v: r.pick(primitives) }
			if (t == "date") return { at: r.int(3) * 1000, t }
			if (t == "part") return { name: `new${r.int(9)}`, t }
			if (t == "ref") return { path: r.int(refs), t }
			const n = r.int(3)
			if (t == "obj") {
				/** @type {[ string, Spec ][]} */
				const entries = []
				for (let i = 0; i < n; i++) entries.push(
					[
						r.pick(obj_keys),
						gen_spec(r, depth + 1, refs)
					]
				)
				return { entries, t }
			}
			if (t == "map") {
				/** @type {[ unknown, Spec ][]} */
				const entries = []
				for (let i = 0; i < n; i++) entries.push(
					[
						r.pick(map_keys),
						gen_spec(r, depth + 1, refs)
					]
				)
				return { entries, t }
			}
			/** @type {Spec[]} */
			const items = []
			for (let i = 0; i < n; i++) items.push(gen_spec(r, depth + 1, refs))
			return { items, t }
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} root
		 * @returns {Val}
		 */
		function gen_val(r, root) {
			const t = r.weighted(
				/** @type {[ Val["t"] | "merge", number ][]} */([
					[ "prim", 4 ],
					[ "ref", 3 ],
					[ "fresh", 3 ],
					[ "merge", 1 ]
				])/**/
			)
			if (t == "prim") return { t, v: r.pick(primitives) }
			if (t == "ref") return {
				path: pick_path(r, root, "any"),
				t
			}
			if (t == "merge") return {
				path: pick_path(r, root, "any"),
				spec: gen_spec(r, 0, 0),
				t
			}
			const count = r.int(3)
			const spec = gen_spec(r, 0, count)
			return {
				refs: Array.from(
					{ length: count },
					() => pick_path(r, root, "any")
				),
				spec,
				t
			}
		}
		/**
		 * @param {Rand} r
		 * @param {GenOptions} opt
		 * @returns {unknown}
		 */
		function gen_value(r, opt) {
			const n = 1 + r.int(opt.size)
			/** @type {{ kind: Kind, value: unknown }[]} */
			const shells = []
			for (let i = 0; i < n; i++) {
				const kind = i == 0
					? r.weighted(
						/** @type {[ Kind, number ][]} */([
							[ "obj", 6 ],
							[ "arr", 2 ],
							[ "map", 1 ],
							[ "set", 1 ]
						])/**/
					)
					: r.weighted(
						/** @type {[ Kind, number ][]} */([
							[ "obj", 30 ],
							[ "arr", 20 ],
							[ "map", 12 ],
							[ "set", 10 ],
							[ "date", 5 ],
							[ "part", 8 ],
							[ "tag", 5 ]
						])/**/
					)
				/** @type {unknown} */
				let value
				if (kind == "obj") {
					value = r.chance(0.1)
						? Object.create(null)
						: {}
				} else if (kind == "arr") {
					value = []
				} else if (kind == "map") {
					value = new Map()
				} else if (kind == "set") {
					value = new Set()
				} else if (kind == "date") {
					value = new Date(r.int(4) * 1000)
				} else if (kind == "part") {
					value = new Part(`p${i}`, undefined, i)
				} else {
					value = new Tag(`t${i}`)
				}
				shells.push({ kind, value })
			}
			/** @type {Set<number>} */
			const used = new Set()
			/**
			 * @param {number} from
			 * @returns {unknown}
			 */
			function child(from) {
				if (r.chance(0.35)) return r.pick(primitives)
				/** @type {number[]} */
				const candidates = []
				for (let j = 0; j < n; j++) {
					if (j == 0 && !opt.cycles) continue
					if (j == from) {
						if (opt.cycles && r.chance(0.2)) candidates.push(j)
						continue
					}
					if (!opt.shared && used.has(j)) continue
					if (!opt.cycles && j < from) continue
					candidates.push(j)
				}
				if (!candidates.length) return r.pick(primitives)
				const j = r.pick(candidates)
				if (!opt.shared && !opt.cycles) used.add(j)
				return /** @type {{ value: unknown }} */(shells[j])/**/.value
			}
			for (let i = 0; i < n; i++) {
				const { kind, value } = /** @type {{ kind: Kind, value: unknown }} */(shells[i])/**/
				const count = r.int(4) + (i == 0
					? 1
					: 0)
				if (kind == "obj") {
					for (let c = 0; c < count; c++) fields(value)[r.pick(obj_keys)] = child(i)
				} else if (kind == "arr") {
					const array = as_array(value)
					for (let c = 0; c < count; c++) {
						if (opt.holes && r.chance(0.2)) {
							array.length++
						} else {
							array.push(child(i))
						}
					}
				} else if (kind == "map") {
					for (let c = 0; c < count; c++) as_map(value).set(r.pick(map_keys), child(i))
				} else if (kind == "set") {
					for (let c = 0; c < count; c++) as_set(value).add(child(i))
				} else if (kind == "part") {
					/** @type {Part} */(value)/**/.ref = child(i)
				}
			}
			const root = /** @type {{ value: unknown }} */(shells[0])/**/.value
			if (opt.freeze == "deep") {
				deepFreeze(root)
			} else if (opt.freeze == "partial") {
				for (const shell of shells) {
					if (r.chance(0.3)) deepFreeze(shell.value)
				}
			} else if (opt.freeze == "shallow") {
				for (const shell of shells) {
					if (r.chance(0.4) && shell.kind != "part") Object.freeze(shell.value)
				}
			}
			return root
		}
		/**
		 * @param {unknown} root
		 * @returns {boolean}
		 */
		function has_proxy(root) {
			const seen = new Set()
			const stack = [ root ]
			while (stack.length) {
				const v = stack.pop()
				if (typeof v != "object" || v === null || seen.has(v)) continue
				seen.add(v)
				if (types.isProxy(v)) return true
				if (v instanceof Map) {
					stack.push(...v.keys(), ...v.values())
				} else if (v instanceof Set) {
					stack.push(...v)
				} else {
					stack.push(...Object.values(v))
				}
			}
			return false
		}
		/**
		 * @param {Kind} kind
		 * @returns {boolean}
		 */
		function is_drafted_kind(kind) {
			return kind == "obj" || kind == "arr" || kind == "map" || kind == "set"
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function is_identity(value) {
			const kind = kind_of(value)
			return kind == "part" || kind == "tag" || kind == "date" || kind == "fn"
		}
		/**
		 * @param {unknown} value
		 * @returns {boolean}
		 */
		function is_instance(value) {
			return value instanceof Part || value instanceof Tag
		}
		/**
		 * @param {unknown} v
		 * @returns {boolean}
		 */
		function is_plain(v) {
			if (typeof v != "object" || v === null) return false
			const proto = Object.getPrototypeOf(v)
			return proto === Object.prototype || proto === null
		}
		/**
		 * @param {unknown} result
		 * @param {unknown} expected
		 * @param {(value: unknown) => boolean} identity
		 * @returns {Iso}
		 */
		function iso(result, expected, identity) {
			/** @type {Map<unknown, unknown>} */
			const r2e = new Map()
			/** @type {Map<unknown, unknown>} */
			const e2r = new Map()
			/** @type {[ unknown, unknown, string ][]} */
			const stack = [ [ result, expected, "$" ] ]
			while (stack.length) {
				const [ r, e, path ] = /** @type {[ unknown, unknown, string ]} */(stack.pop())/**/
				const kind = kind_of(e)
				if (kind == "prim") {
					if (!same_prim(r, e)) return {
						fail: `${path}: ${show(r)} vs ${show(e)}`,
						pairs: r2e
					}
					continue
				}
				if (identity(e)) {
					if (r !== e) return {
						fail: `${path}: identity of ${kind} not kept`,
						pairs: r2e
					}
					continue
				}
				if (e2r.has(e) || r2e.has(r)) {
					if (e2r.get(e) !== r || r2e.get(r) !== e) return {
						fail: `${path}: sharing differs`,
						pairs: r2e
					}
					continue
				}
				if (kind_of(r) != kind) return {
					fail: `${path}: kind ${kind_of(r)} vs ${kind}`,
					pairs: r2e
				}
				if (Object.getPrototypeOf(r) !== Object.getPrototypeOf(e)) return {
					fail: `${path}: prototype differs`,
					pairs: r2e
				}
				r2e.set(r, e)
				e2r.set(e, r)
				if (kind == "obj" || kind == "part" || kind == "tag") {
					const left = Object.keys(fields(r))
					const right = Object.keys(fields(e))
					if (left.join("|") != right.join("|")) return {
						fail: `${path}: keys [${left.join()}] vs [${right.join()}]`,
						pairs: r2e
					}
					for (const k of right) stack.push(
						[
							fields(r)[k],
							fields(e)[k],
							`${path}.${k}`
						]
					)
				} else if (kind == "arr") {
					const left = as_array(r)
					const right = as_array(e)
					if (left.length != right.length) return {
						fail: `${path}: length ${left.length} vs ${right.length}`,
						pairs: r2e
					}
					for (let i = 0; i < right.length; i++) {
						if (i in left != i in right) return {
							fail: `${path}[${i}]: hole`,
							pairs: r2e
						}
						stack.push(
							[ left[i], right[i], `${path}[${i}]` ]
						)
					}
				} else if (kind == "map") {
					const left = [ ...as_map(r) ]
					const right = [ ...as_map(e) ]
					if (left.length != right.length) return {
						fail: `${path}: map size ${left.length} vs ${right.length}`,
						pairs: r2e
					}
					for (let i = 0; i < right.length; i++) {
						const [ rk, rv ] = /** @type {[ unknown, unknown ]} */(left[i])/**/
						const [ ek, ev ] = /** @type {[ unknown, unknown ]} */(right[i])/**/
						if (kind_of(ek) == "prim") {
							if (!same_prim(rk, ek)) return {
								fail: `${path}: map key #${i} ${show(rk)} vs ${show(ek)}`,
								pairs: r2e
							}
						} else {
							stack.push([ rk, ek, `${path}.key#${i}` ])
						}
						stack.push(
							[ rv, ev, `${path}.get(${show(ek)})` ]
						)
					}
				} else if (kind == "set") {
					const left = [ ...as_set(r) ]
					const right = [ ...as_set(e) ]
					if (left.length != right.length) return {
						fail: `${path}: set size ${left.length} vs ${right.length}`,
						pairs: r2e
					}
					for (let i = 0; i < right.length; i++) stack.push(
						[
							left[i],
							right[i],
							`${path}.member#${i}`
						]
					)
				} else if (kind == "date") {
					if (!same_prim(
						/** @type {Date} */(r)/**/.getTime(),
						/** @type {Date} */(e)/**/.getTime()
					)) return {
						fail: `${path}: date`,
						pairs: r2e
					}
				} else {
					return {
						fail: `${path}: unexpected ${kind}`,
						pairs: r2e
					}
				}
			}
			return { pairs: r2e }
		}
		/**
		 * @param {WeakKey} a
		 * @param {WeakKey} b
		 * @param {Map<unknown, Set<unknown>>} pairs
		 * @returns {boolean}
		 */
		function keys_equal(a, b, pairs) {
			if (Array.isArray(a)) return true
			const left = Object.keys(a)
			if (left.length != Object.keys(b).length) return false
			for (const k of left) {
				if (!Object.prototype.hasOwnProperty.call(b, k) || !ref_equal(fields(a)[k], fields(b)[k], pairs)) return false
			}
			return true
		}
		/**
		 * @param {unknown} value
		 * @returns {Kind}
		 */
		function kind_of(value) {
			if (typeof value == "function") return "fn"
			if (typeof value != "object" || value === null) return "prim"
			if (Array.isArray(value)) return "arr"
			if (value instanceof Map) return "map"
			if (value instanceof Set) return "set"
			if (value instanceof Date) return "date"
			if (value instanceof Part) return "part"
			if (value instanceof Tag) return "tag"
			return "obj"
		}
		/**
		 * @param {Spec} spec
		 * @param {(i: number) => unknown} ref_side
		 * @param {(i: number) => unknown} draft_side
		 * @returns {{ draft: unknown, pairs: [ unknown, unknown ][], ref: unknown }}
		 */
		function materialize(spec, ref_side, draft_side) {
			/** @type {[ unknown, unknown ][]} */
			const pairs = []
			/**
			 * @param {Spec} s
			 * @returns {[ unknown, unknown ]}
			 */
			function go(s) {
				if (s.t == "prim") return [ s.v, s.v ]
				if (s.t == "ref") return [
					ref_side(s.path),
					draft_side(s.path)
				]
				if (s.t == "date") {
					const date = new Date(s.at)
					pairs.push([ date, date ])
					return [ date, date ]
				}
				if (s.t == "part") {
					const part = new Part(s.name, undefined, 99)
					pairs.push([ part, part ])
					return [ part, part ]
				}
				if (s.t == "obj") {
					/** @type {Record<string, unknown>} */
					const a = {}
					/** @type {Record<string, unknown>} */
					const b = {}
					pairs.push([ a, b ])
					for (const [ k, c ] of s.entries) {
						const [ x, y ] = go(c)
						a[k] = x
						b[k] = y
					}
					return [ a, b ]
				}
				if (s.t == "map") {
					const a = new Map()
					const b = new Map()
					pairs.push([ a, b ])
					for (const [ k, c ] of s.entries) {
						const [ x, y ] = go(c)
						a.set(k, x)
						b.set(k, y)
					}
					return [ a, b ]
				}
				if (s.t == "arr") {
					/** @type {unknown[]} */
					const a = []
					/** @type {unknown[]} */
					const b = []
					pairs.push([ a, b ])
					for (const c of s.items) {
						const [ x, y ] = go(c)
						a.push(x)
						b.push(y)
					}
					return [ a, b ]
				}
				const a = new Set()
				const b = new Set()
				pairs.push([ a, b ])
				for (const c of s.items) {
					const [ x, y ] = go(c)
					a.add(x)
					b.add(y)
				}
				return [ a, b ]
			}
			const [ ref, draft ] = go(spec)
			return { draft, pairs, ref }
		}
		/**
		 * @param {Map<unknown, Set<unknown>>} pairs
		 * @param {Map<unknown, Set<unknown>>} trial
		 * @returns {void}
		 */
		function merge_pairs(pairs, trial) {
			for (const [ x, s ] of trial) {
				for (const y of s) assume(pairs, x, y)
			}
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} input
		 * @param {CaseConfig} cfg
		 * @param {{ failures: Failure[], label: string, trace: string[] }} ctx
		 * @param {boolean} graph
		 * @param {boolean} chained
		 * @returns {Promise<void>}
		 */
		async function one_update(r, input, cfg, ctx, graph, chained) {
			const snap = snapshot(input)
			const rc = ref_clone(input)
			/** @type {Side} */
			const ref = { fresh: [], root: rc.root }
			/** @type {Set<unknown>} */
			const touched = new Set()
			/** @type {{ copy: unknown, expect: unknown, identity: (value: unknown) => boolean }[]} */
			const snapshots = []
			const strict = !cfg.gen.shared || graph
			let returned_new = false
			let returned_draft_root = false
			let changed = false
			/**
			 * @param {unknown} draft
			 * @returns {void}
			 */
			function body(draft) {
				const op = gen_op(r, ref.root, strict)
				ctx.trace.push(op_text(op))
				if (op.kind == "check") {
					check_inside(ctx, op, draft, ref.root, snapshots)
					return
				}
				changed = true
				const vals = op.kind == "push" || op.kind == "unshift"
					? op.args
					: "v" in op
						? [ op.v ]
						: []
				/** @type {unknown[]} */
				const rv = []
				/** @type {unknown[]} */
				const dv = []
				for (const x of vals) {
					const [ a, b ] = resolve_val(x, ref, { fresh: [], root: draft })
					rv.push(a)
					dv.push(b)
				}
				apply(draft, op, dv, undefined)
				apply(ref.root, op, rv, touched)
			}
			/**
			 * @param {unknown} draft
			 * @returns {unknown}
			 */
			function make_return(draft) {
				/** @type {Spec} */
				const spec = r.chance(0.5)
					? {
						entries: [
							[ "a", { path: 0, t: "ref" } ],
							[ "b", gen_spec(r, 1, 0) ]
						],
						t: "obj"
					}
					: { path: 0, t: "ref" }
				let refs = [ pick_path(r, ref.root, "any") ]
				if (cfg.returns == "mutate+return" && spec.t == "ref") {
					while (!refs[0]?.length && slots(ref.root).some(
						([ , x ]) => typeof x == "object" && x !== null
					) && r.chance(0.95)) refs = [ pick_path(r, ref.root, "any") ]
				}
				returned_new = true
				ctx.trace.push(
					`return ${show_spec(spec, refs.map(path_text))}`
				)
				const [ a, b ] = resolve_val(
					{ refs, spec, t: "fresh" },
					ref,
					{ fresh: [], root: draft }
				)
				if (b === draft) returned_draft_root = true
				ref.root = a
				return b
			}
			const count = cfg.returns == "new"
				? r.int(2)
				: 1 + r.int(6)
			/**
			 * @param {unknown} draft
			 * @returns {unknown}
			 */
			function finish(draft) {
				if (cfg.returns == "draft") return draft
				if (cfg.returns == "new" || cfg.returns == "mutate+return") return make_return(draft)
				return undefined
			}
			/**
			 * @param {unknown} draft
			 * @returns {void}
			 */
			function step_once(draft) {
				if (cfg.returns != "new") {
					body(draft)
					return
				}
				const op = gen_op(r, ref.root, true)
				if (op.kind == "check") {
					ctx.trace.push(op_text(op))
					check_inside(ctx, op, draft, ref.root, snapshots)
				}
			}
			/** @type {unknown} */
			let result
			/** @type {unknown} */
			let error
			const options = graph
				? { graph: true }
				: undefined
			try {
				result = cfg.async
					? await deepUpdate(
						input,
						async draft => {
							for (let i = 0; i < count; i++) {
								// eslint-disable-next-line no-await-in-loop
								await null
								step_once(draft)
							}
							await null
							return finish(draft)
						},
						options
					)
					: deepUpdate(
						input,
						draft => {
							for (let i = 0; i < count; i++) step_once(draft)
							return finish(draft)
						},
						options
					)
			} catch (caught) {
				error = caught
			}
			if (cfg.returns == "mutate+return" && changed) {
				const message = snap.check()
				if (message) fail(ctx, "input-changed", message)
				const to_orig = to_orig_of(rc)
				const mutated = [ ...rc.clone_to_orig ].some(
					([ c, o ]) => !shallow_same(c, o, to_orig)
				)
				if (mutated && !returned_draft_root && !(error instanceof TypeError)) fail(
					ctx,
					"mutate+return",
					`expected a TypeError, got ${error
						? String(error)
						: show(result)}`
				)
				return
			}
			if (error) {
				fail(
					ctx,
					"throw",
					`${String(error)}\n${/** @type {Error} */(error)/**/.stack?.split("\n").slice(1, 4)
						.join("\n")}`
				)
				return
			}
			const message = snap.check()
			if (message) fail(ctx, "input-changed", message)
			if (has_proxy(result)) fail(
				ctx,
				"proxy-leak",
				"the result holds a draft"
			)
			for (const s of snapshots) {
				const res = iso(s.copy, s.expect, s.identity)
				if (res.fail) fail(
					ctx,
					"snapshot-changed",
					`a snapshot taken inside the recipe changed: ${res.fail}`
				)
			}
			if (!strict) return
			const res = iso(result, ref.root, is_identity)
			if (res.fail) {
				fail(
					ctx,
					"structure",
					`${res.fail}\n  result=${show(result)}\n  expect=${show(ref.root)}`
				)
				return
			}
			if (!deepEqual(result, ref.root)) fail(
				ctx,
				"deepEqual-vs-iso",
				"deepEqual(result, reference) is false while isomorphic"
			)
			const fresh = new Map(ref.fresh)
			const to_orig = to_orig_of(rc)
			const nodes = [ ...res.pairs.values() ]
			const dirty = new Set()
			for (const e of nodes) {
				if (fresh.has(e) || rc.clone_to_orig.has(e) && !shallow_same(
					e,
					rc.clone_to_orig.get(e),
					to_orig
				)) dirty.add(e)
			}
			/**
			 * @param {Set<unknown>} from
			 * @returns {Set<unknown>}
			 */
			function reaches(from) {
				const out = new Set(from)
				let grew = true
				while (grew) {
					grew = false
					for (const e of nodes) {
						if (!out.has(e) && slots(e).some(([ , x ]) => out.has(x))) {
							out.add(e)
							grew = true
						}
					}
				}
				return out
			}
			const must_copy = reaches(dirty)
			const maybe = reaches(
				new Set([ ...dirty, ...touched ])
			)
			for (const [ rr, e ] of res.pairs) {
				const orig = rc.clone_to_orig.get(e)
				if (orig === undefined) continue
				if (must_copy.has(e) && rr === orig) fail(
					ctx,
					"not-copied",
					`a changed object kept its original: ${show(e)}`
				)
				if (!maybe.has(e) && rr !== orig) fail(
					ctx,
					"not-shared",
					`an unchanged object was copied: ${show(e)}`
				)
			}
			/**
			 * @param {unknown} x
			 * @returns {boolean}
			 */
			function original(x) {
				return rc.clone_to_orig.has(x) || snap.objects.has(x)
			}
			/** @type {unknown[]} */
			const starts = []
			for (const [ rr, e ] of res.pairs) {
				const orig = rc.clone_to_orig.get(e)
				if (orig === undefined || rr === orig || !Object.isFrozen(orig)) continue
				for (const [ , x ] of slots(e)) starts.push(x)
			}
			if (returned_new && Object.isFrozen(input)) starts.push(ref.root)
			const region = new Set()
			for (let x = starts.pop(); x !== undefined || starts.length; x = starts.pop()) {
				if (typeof x != "object" || x === null || region.has(x) || original(x)) continue
				region.add(x)
				if (x instanceof Part) {
					starts.push(x.ref)
				} else {
					starts.push(
						...slots(x).map(([ , y ]) => y)
					)
				}
			}
			for (const [ rr, e ] of res.pairs) {
				const orig = rc.clone_to_orig.get(e)
				const frozen = Object.isFrozen(rr)
				if (fresh.has(e)) {
					if (region.has(e) && !frozen) fail(
						ctx,
						"added-not-frozen",
						`an object added under a frozen parent is not frozen: ${show(rr)}`
					)
					if (!region.has(e) && frozen) fail(
						ctx,
						"added-frozen",
						`an object added under unfrozen parents got frozen: ${show(rr)}`
					)
					continue
				}
				if (orig === undefined || rr === orig) continue
				if (Object.isFrozen(orig) != frozen) fail(
					ctx,
					"copy-frozen",
					`a copy of ${Object.isFrozen(orig)
						? "a frozen"
						: "an unfrozen"} original is ${frozen
						? "frozen"
						: "not frozen"}: ${show(rr)}`
				)
			}
			for (const x of region) {
				if (is_identity(x) && !Object.isFrozen(x)) fail(
					ctx,
					"added-not-frozen",
					`an added ${kind_of(x)} under a frozen parent is not frozen`
				)
			}
			if (cfg.chain && !chained && result !== input) {
				ctx.trace.push(
					"--- chained update without the option ---"
				)
				await one_update(
					r,
					result,
					{
						...cfg,
						chain: false,
						gen: { ...cfg.gen, shared: true }
					},
					ctx,
					false,
					true
				)
			}
		}
		/**
		 * @param {Op} op
		 * @returns {string}
		 */
		function op_text(op) {
			const p = path_text(op.path)
			switch (op.kind) {
			case "o-set":
				return `${p}.${op.k} = ${val_text(op.v)}`
			case "o-delete":
				return `delete ${p}.${op.k}`
			case "a-set":
				return `${p}[${op.i}] = ${val_text(op.v)}`
			case "a-delete":
				return `delete ${p}[${op.i}]`
			case "splice":
				return `${p}.splice(${op.i}, 1)`
			case "push":
			case "unshift":
				return `${p}.${op.kind}(${op.args.map(val_text).join(", ")})`
			case "pop":
			case "reverse":
			case "clear":
				return `${p}.${op.kind}()`
			case "length":
				return `${p}.length = ${op.n}`
			case "m-set":
				return `${p}.set(${show(op.k)}, ${val_text(op.v)})`
			case "m-delete":
				return `${p}.delete(${show(op.k)})`
			case "s-add":
				return `${p}.add(${val_text(op.v)})`
			case "s-delete":
				return `${p}.delete(${val_text(op.v)})`
			default:
				return `check ${op.mode}(${p}, ${path_text(op.path2)})`
			}
		}
		/**
		 * @param {Seg[]} path
		 * @returns {string}
		 */
		function path_text(path) {
			let out = "d"
			for (const s of path) {
				if (s.t == "o") {
					out += `.${s.k}`
				} else if (s.t == "a") {
					out += `[${s.i}]`
				} else if (s.t == "m") {
					out += `.get(${show(s.k)})`
				} else {
					out += `.nth(${s.n})`
				}
			}
			return out
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} root
		 * @param {"any" | "container"} leaf
		 * @returns {Seg[]}
		 */
		function pick_path(r, root, leaf) {
			/** @type {Seg[]} */
			const path = []
			let v = root
			for (let d = 0; d < 6; d++) {
				const options = slots(v).filter(
					([ , x ]) => leaf == "any"
						? typeof x == "object" && x !== null
						: is_drafted_kind(kind_of(x))
				)
				const drafted = options.filter(
					([ , x ]) => is_drafted_kind(kind_of(x))
				)
				if (!options.length || r.chance(0.3)) break
				const [ seg, x ] = r.pick(
					r.chance(0.8) && drafted.length
						? drafted
						: options
				)
				path.push(seg)
				v = x
				if (!is_drafted_kind(kind_of(v))) break
			}
			return path
		}
		/**
		 * @param {number} seed
		 * @returns {Rand}
		 */
		function rand(seed) {
			let s = seed >>> 0
			/**
			 * @param {number} n
			 * @returns {number}
			 */
			function int(n) {
				return Math.floor(next() * n)
			}
			/**
			 * @returns {number}
			 */
			function next() {
				s = s + 0x6d2b79f5 >>> 0
				let t = s
				t = Math.imul(t ^ t >>> 15, t | 1)
				t ^= t + Math.imul(t ^ t >>> 7, t | 61)
				return ((t ^ t >>> 14) >>> 0) / 4294967296
			}
			/**
			 * @template T
			 * @param {readonly T[]} items
			 * @returns {T}
			 */
			function pick(items) {
				if (!items.length) throw new Error("empty pick")
				return /** @type {T} */(items[int(items.length)])/**/
			}
			/**
			 * @template T
			 * @param {readonly (readonly [ T, number ])[]} items
			 * @returns {T}
			 */
			function weighted(items) {
				let total = 0
				for (const [ , w ] of items) total += w
				let r = next() * total
				for (const [ v, w ] of items) {
					r -= w
					if (r < 0) return v
				}
				return /** @type {readonly [ T, number ]} */(items[items.length - 1])/**/[0]
			}
			return {
				chance: p => next() < p,
				int,
				pick,
				weighted
			}
		}
		/**
		 * @param {unknown} root
		 * @returns {RefClone}
		 */
		function ref_clone(root) {
			/** @type {Map<unknown, unknown>} */
			const orig_to_clone = new Map()
			/** @type {Map<unknown, unknown>} */
			const clone_to_orig = new Map()
			/**
			 * @param {unknown} clone
			 * @param {unknown} v
			 * @returns {void}
			 */
			function pair(clone, v) {
				orig_to_clone.set(v, clone)
				clone_to_orig.set(clone, v)
			}
			/**
			 * @param {unknown} v
			 * @returns {unknown}
			 */
			function walk(v) {
				const kind = kind_of(v)
				if (!is_drafted_kind(kind)) return v
				if (orig_to_clone.has(v)) return orig_to_clone.get(v)
				if (kind == "obj") {
					/** @type {Record<string, unknown>} */
					const c = Object.getPrototypeOf(v) === null
						? Object.create(null)
						: {}
					pair(c, v)
					for (const k of Object.keys(fields(v))) c[k] = walk(fields(v)[k])
					return c
				}
				if (kind == "arr") {
					const a = as_array(v)
					/** @type {unknown[]} */
					const c = new Array(a.length)
					pair(c, v)
					for (let i = 0; i < a.length; i++) {
						if (i in a) c[i] = walk(a[i])
					}
					return c
				}
				if (kind == "map") {
					const c = new Map()
					pair(c, v)
					for (const [ k, x ] of as_map(v)) c.set(k, walk(x))
					return c
				}
				const c = new Set()
				pair(c, v)
				for (const x of as_set(v)) c.add(walk(x))
				return c
			}
			return { clone_to_orig, root: walk(root) }
		}
		/**
		 * @param {unknown} a
		 * @param {unknown} b
		 * @param {Map<unknown, Set<unknown>>} [pairs]
		 * @returns {boolean}
		 */
		function ref_equal(a, b, pairs = new Map()) {
			if (same_prim(a, b)) return true
			if (typeof a != "object" || a === null || typeof b != "object" || b === null) return false
			if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
			if (pairs.get(a)?.has(b)) return true
			assume(pairs, a, b)
			if (a instanceof Date) return same_prim(
				a.getTime(),
				/** @type {Date} */(b)/**/.getTime()
			) && keys_equal(a, b, pairs)
			if (Array.isArray(a)) {
				const other = as_array(b)
				if (a.length != other.length) return false
				for (let i = 0; i < a.length; i++) {
					if (i in a != i in other || !ref_equal(a[i], other[i], pairs)) return false
				}
				return true
			}
			if (a instanceof Map) {
				const other = as_map(b)
				if (a.size != other.size) return false
				const used = new Set()
				for (const [ k, v ] of a) {
					if (typeof k != "object" || k === null) {
						if (!other.has(k) || !ref_equal(v, other.get(k), pairs)) return false
						used.add(k)
						continue
					}
					let found = false
					for (const [ k2, v2 ] of other) {
						if (used.has(k2) || typeof k2 != "object" || k2 === null) continue
						const trial = clone_pairs(pairs)
						if (ref_equal(k, k2, trial) && ref_equal(v, v2, trial)) {
							merge_pairs(pairs, trial)
							used.add(k2)
							found = true
							break
						}
					}
					if (!found) return false
				}
				return keys_equal(a, b, pairs)
			}
			if (a instanceof Set) {
				const other = as_set(b)
				if (a.size != other.size) return false
				const used = new Set()
				for (const v of a) {
					if (typeof v != "object" || v === null || other.has(v)) {
						if (!other.has(v)) return false
						used.add(v)
						continue
					}
					let found = false
					for (const v2 of other) {
						if (used.has(v2) || typeof v2 != "object" || v2 === null) continue
						const trial = clone_pairs(pairs)
						if (ref_equal(v, v2, trial)) {
							merge_pairs(pairs, trial)
							used.add(v2)
							found = true
							break
						}
					}
					if (!found) return false
				}
				return keys_equal(a, b, pairs)
			}
			return keys_equal(a, b, pairs)
		}
		/**
		 * @param {unknown} a
		 * @param {unknown} b
		 * @param {[ unknown, unknown ][]} fresh
		 * @returns {unknown}
		 */
		function ref_merge_into(a, b, fresh) {
			if (!is_plain(a) || !is_plain(b) || a === b) return b
			const left = fields(a)
			const right = fields(b)
			/** @type {Record<string, unknown>} */
			const out = Object.getPrototypeOf(a) === null
				? Object.create(null)
				: {}
			fresh.push([ out, undefined ])
			for (const k of Object.keys(left)) define(out, k, left[k])
			for (const k of Object.keys(right)) {
				define(
					out,
					k,
					Object.prototype.hasOwnProperty.call(left, k)
						? ref_merge_into(left[k], right[k], fresh)
						: right[k]
				)
			}
			return out
		}
		/**
		 * @param {Failure[]} failures
		 * @param {number} cases
		 * @returns {void}
		 */
		function report(failures, cases) {
			if (!failures.length) return
			/** @type {Map<string, Failure[]>} */
			const groups = new Map()
			for (const failure of failures) groups.set(
				failure.kind,
				[
					...groups.get(failure.kind) ?? [],
					failure
				]
			)
			const lines = [
				`${failures.length} failures in ${cases} cases`
			]
			for (const [ kind, list ] of groups) {
				const [ shortest ] = [ ...list ].sort(
					(a, b) => a.text.length - b.text.length
				)
				lines.push(
					`=== ${kind} x${list.length}\n${shortest?.text}\n  -> ${shortest?.detail}`
				)
			}
			assert.fail(lines.join("\n\n"))
		}
		/**
		 * @param {Val} x
		 * @param {Side} ref
		 * @param {Side} draft
		 * @returns {[ unknown, unknown ]}
		 */
		function resolve_val(x, ref, draft) {
			if (x.t == "prim") return [ x.v, x.v ]
			if (x.t == "ref") return [
				at(ref.root, x.path),
				at(draft.root, x.path)
			]
			if (x.t == "merge") {
				const patch = materialize(
					x.spec,
					() => undefined,
					() => undefined
				)
				ref.fresh.push(...patch.pairs)
				return [
					ref_merge(
						[ at(ref.root, x.path), patch.ref ],
						ref.fresh
					),
					deepMerge(
						at(draft.root, x.path),
						patch.draft
					)
				]
			}
			const refs = x.refs
			const m = materialize(
				x.spec,
				i => at(
					ref.root,
					/** @type {Seg[]} */(refs[i])/**/
				),
				i => at(
					draft.root,
					/** @type {Seg[]} */(refs[i])/**/
				)
			)
			ref.fresh.push(...m.pairs)
			return [ m.ref, m.draft ]
		}
		/**
		 * @param {unknown} a
		 * @param {unknown} b
		 * @returns {boolean}
		 */
		function same_prim(a, b) {
			return a === b || Object.is(a, b)
		}
		/**
		 * @param {Seg} s
		 * @returns {unknown}
		 */
		function seg_key(s) {
			return s.t == "a"
				? s.i
				: s.t == "s"
					? s.n
					: s.k
		}
		/**
		 * @param {unknown} clone
		 * @param {unknown} orig
		 * @param {(v: unknown) => unknown} to_orig
		 * @returns {boolean}
		 */
		function shallow_same(clone, orig, to_orig) {
			const left = slots(clone)
			const right = slots(orig)
			if (kind_of(clone) == "arr" && as_array(clone).length != as_array(orig).length) return false
			return left.length == right.length && left.every(
				([ seg, x ], i) => {
					const [ other, y ] = /** @type {[ Seg, unknown ]} */(right[i])/**/
					return seg.t == other.t && same_prim(seg_key(seg), seg_key(other)) && same_prim(to_orig(x), y)
				}
			)
		}
		/**
		 * @param {unknown} value
		 * @param {number} [depth]
		 * @param {Set<unknown>} [seen]
		 * @returns {string}
		 */
		function show(value, depth = 0, seen = new Set()) {
			const kind = kind_of(value)
			if (kind == "prim") {
				if (typeof value == "string") return JSON.stringify(value)
				if (Object.is(value, -0)) return "-0"
				return String(value)
			}
			if (seen.has(value)) return "<cycle>"
			if (depth > 5) return "..."
			seen.add(value)
			try {
				const frozen = Object.isFrozen(value)
					? "#"
					: ""
				if (kind == "date") return `${frozen}Date(${/** @type {Date} */(value)/**/.getTime()})`
				if (kind == "fn") return "fn"
				if (kind == "part") return `${frozen}Part(${/** @type {Part} */(value)/**/.name},${show(/** @type {Part} */(value)/**/.ref, depth + 1, seen)})`
				if (kind == "tag") return `${frozen}Tag(${/** @type {Tag} */(value)/**/.label})`
				if (kind == "arr") {
					const array = as_array(value)
					/** @type {string[]} */
					const items = []
					for (let i = 0; i < array.length; i++) {
						items.push(
							i in array
								? show(array[i], depth + 1, seen)
								: "<hole>"
						)
					}
					return `${frozen}[${items.join(", ")}]`
				}
				if (kind == "map") return `${frozen}Map{${[ ...as_map(value) ].map(([ k, v ]) => `${show(k, depth + 1, seen)}=>${show(v, depth + 1, seen)}`).join(", ")}}`
				if (kind == "set") return `${frozen}Set{${[ ...as_set(value) ].map(v => show(v, depth + 1, seen)).join(", ")}}`
				return `${frozen}{${Object.keys(fields(value)).map(k => `${k}: ${show(fields(value)[k], depth + 1, seen)}`)
					.join(", ")}}`
			} finally {
				seen.delete(value)
			}
		}
		/**
		 * @param {Spec} s
		 * @param {string[]} refs
		 * @returns {string}
		 */
		function show_spec(s, refs) {
			if (s.t == "prim") return show(s.v)
			if (s.t == "ref") return refs[s.path] ?? "?"
			if (s.t == "date") return `new Date(${s.at})`
			if (s.t == "part") return `new Part(${JSON.stringify(s.name)})`
			if (s.t == "obj") return `{ ${s.entries.map(([ k, c ]) => `${k}: ${show_spec(c, refs)}`).join(", ")} }`
			if (s.t == "map") return `new Map([${s.entries.map(([ k, c ]) => `[${show(k)}, ${show_spec(c, refs)}]`).join(", ")}])`
			if (s.t == "arr") return `[${s.items.map(c => show_spec(c, refs)).join(", ")}]`
			return `new Set([${s.items.map(c => show_spec(c, refs)).join(", ")}])`
		}
		/**
		 * @param {unknown} v
		 * @returns {[ Seg, unknown ][]}
		 */
		function slots(v) {
			const kind = kind_of(v)
			if (kind == "obj") return Object.keys(fields(v)).map(
				k => [ { k, t: "o" }, fields(v)[k] ]
			)
			if (kind == "arr") {
				/** @type {[ Seg, unknown ][]} */
				const out = []
				const a = as_array(v)
				for (let i = 0; i < a.length; i++) {
					if (i in a) out.push([ { i, t: "a" }, a[i] ])
				}
				return out
			}
			if (kind == "map") return [ ...as_map(v) ].map(
				([ k, x ]) => [ { k, t: "m" }, x ]
			)
			if (kind == "set") return [ ...as_set(v) ].map((x, n) => [ { n, t: "s" }, x ])
			return []
		}
		/**
		 * @param {unknown} root
		 * @returns {{ check: () => string | undefined, objects: Set<unknown> }}
		 */
		function snapshot(root) {
			/** @type {(() => string | undefined)[]} */
			const records = []
			/** @type {Set<unknown>} */
			const objects = new Set()
			const stack = [ root ]
			while (stack.length) {
				const v = stack.pop()
				if (typeof v != "object" || v === null || objects.has(v)) continue
				objects.add(v)
				const kind = kind_of(v)
				/**
				 * @returns {{ core: unknown[], frozen: boolean, writable: unknown[] }}
				 */
				function describe_value() {
					/** @type {unknown[]} */
					const core = []
					/** @type {unknown[]} */
					const writable = []
					for (const k of Reflect.ownKeys(fields(v))) {
						const d = Object.getOwnPropertyDescriptor(v, k)
						core.push(k, d?.value, d?.enumerable)
						writable.push(d?.writable, d?.configurable)
					}
					if (kind == "map") {
						for (const [ k, x ] of as_map(v)) core.push("m", k, x)
					}
					if (kind == "set") {
						for (const x of as_set(v)) core.push("s", x)
					}
					if (kind == "date") core.push(
						"t",
						/** @type {Date} */(v)/**/.getTime()
					)
					return {
						core,
						frozen: Object.isFrozen(v),
						writable
					}
				}
				const before = describe_value()
				records.push(
					() => {
						const after = describe_value()
						/**
						 * @param {unknown[]} x
						 * @param {unknown[]} y
						 * @returns {boolean}
						 */
						function same(x, y) {
							return x.length == y.length && x.every((z, i) => same_prim(z, y[i]))
						}
						if (!same(after.core, before.core)) return `input ${kind} changed: ${show(v, 3)}`
						if (after.frozen != before.frozen || !same(after.writable, before.writable)) return `input ${kind} got frozen: ${show(v, 3)}`
						return undefined
					}
				)
				for (const k of Reflect.ownKeys(v)) stack.push(
					fields(v)[/** @type {string} */(k)/**/]
				)
				if (kind == "map") {
					for (const [ k, x ] of as_map(v)) stack.push(k, x)
				}
				if (kind == "set") {
					for (const x of as_set(v)) stack.push(x)
				}
			}
			return {
				check: () => {
					for (const record of records) {
						const message = record()
						if (message) return message
					}
					return undefined
				},
				objects
			}
		}
		/**
		 * @param {unknown} v
		 * @param {Seg} s
		 * @returns {unknown}
		 */
		function step(v, s) {
			if (s.t == "o") return fields(v)[s.k]
			if (s.t == "a") return as_array(v)[s.i]
			if (s.t == "m") return as_map(v).get(s.k)
			return [ ...as_set(v) ][s.n]
		}
		/**
		 * @param {RefClone} rc
		 * @returns {(v: unknown) => unknown}
		 */
		function to_orig_of(rc) {
			return v => rc.clone_to_orig.has(v)
				? rc.clone_to_orig.get(v)
				: v
		}
		/**
		 * @param {number} seed
		 * @param {CaseConfig} cfg
		 * @param {Failure[]} failures
		 * @returns {Promise<void>}
		 */
		async function update_case(seed, cfg, failures) {
			const r = rand(seed)
			const input = gen_value(r, cfg.gen)
			await one_update(
				r,
				input,
				cfg,
				{
					failures,
					label: `seed=${seed} ${JSON.stringify(cfg)}\n  input=${show(input)}`,
					trace: []
				},
				cfg.graph,
				false
			)
		}
		/**
		 * @param {Val} x
		 * @returns {string}
		 */
		function val_text(x) {
			if (x.t == "prim") return show(x.v)
			if (x.t == "ref") return path_text(x.path)
			if (x.t == "merge") return `deepMerge(${path_text(x.path)}, ${show_spec(x.spec, [])})`
			return show_spec(x.spec, x.refs.map(path_text))
		}
		it(
			"deepUpdate matches a reference clone mutated the same way",
			async () => {
				const per = seeds || 8
				/** @type {CaseConfig[]} */
				const configs = []
				for (const shape of [ "tree", "graph", "shared" ]) {
					for (const freeze of /** @type {const} */([ "none", "deep", "partial", "shallow" ])/**/) {
						for (const returns of /** @type {const} */([
							"mutate",
							"draft",
							"new",
							"mutate+return"
						])/**/) {
							for (const async of [ false, true ]) {
								configs.push(
									{
										async,
										chain: returns == "mutate",
										gen: {
											cycles: shape != "tree",
											freeze,
											holes: true,
											shared: shape != "tree",
											size: 8
										},
										graph: shape == "graph",
										returns
									}
								)
							}
						}
					}
				}
				/** @type {Failure[]} */
				const failures = []
				let cases = 0
				for (let c = 0; c < configs.length; c++) {
					for (let i = 0; i < per; i++) {
						const seed = first * 1000003 + c * 100000 + i
						if (only && String(seed) != only) continue
						cases++
						// eslint-disable-next-line no-await-in-loop
						await update_case(
							seed,
							/** @type {CaseConfig} */(configs[c])/**/,
							failures
						)
					}
				}
				report(failures, cases)
			},
			timeout
		)
		/**
		 * @param {Record<string, unknown>} o
		 * @param {string} k
		 * @param {unknown} value
		 * @returns {void}
		 */
		function define(o, k, value) {
			Object.defineProperty(
				o,
				k,
				{
					configurable: true,
					enumerable: true,
					value,
					writable: true
				}
			)
		}
		/**
		 * @param {unknown} v
		 * @param {Map<unknown, unknown>} [seen]
		 * @returns {unknown}
		 */
		function fill_holes(v, seen = new Map()) {
			if (typeof v != "object" || v === null || !is_drafted_kind(kind_of(v))) return v
			if (seen.has(v)) return seen.get(v)
			if (Array.isArray(v)) {
				/** @type {unknown[]} */
				const out = []
				seen.set(v, out)
				for (let i = 0; i < v.length; i++) out.push(fill_holes(v[i], seen))
				return out
			}
			if (v instanceof Map) {
				const out = new Map()
				seen.set(v, out)
				for (const [ k, x ] of v) out.set(k, fill_holes(x, seen))
				return out
			}
			if (v instanceof Set) {
				const out = new Set()
				seen.set(v, out)
				for (const x of v) out.add(fill_holes(x, seen))
				return out
			}
			/** @type {Record<string, unknown>} */
			const out = Object.create(Object.getPrototypeOf(v))
			seen.set(v, out)
			for (const k of Object.keys(v)) out[k] = fill_holes(fields(v)[k], seen)
			return out
		}
		/**
		 * @param {unknown} root
		 * @returns {boolean}
		 */
		function has_cycle(root) {
			/** @type {Map<unknown, number>} */
			const state = new Map()
			/**
			 * @param {unknown} v
			 * @returns {boolean}
			 */
			function go(v) {
				if (typeof v != "object" || v === null || kind_of(v) == "date") return false
				const s = state.get(v)
				if (s == 1) return true
				if (s == 2) return false
				state.set(v, 1)
				const kids = v instanceof Map
					? [ ...v.values(), ...v.keys() ]
					: v instanceof Set
						? [ ...v ]
						: Object.values(v)
				for (const c of kids) {
					if (go(c)) return true
				}
				state.set(v, 2)
				return false
			}
			return go(root)
		}
		/**
		 * @param {Rand} r
		 * @param {number} [depth]
		 * @returns {unknown}
		 */
		function json_safe(r, depth = 0) {
			const w = depth > 3
				? 0
				: r.int(4)
			if (w == 0) return r.pick(
				[ 0, 1, "s", "", null, true, false, 2.5 ]
			)
			if (w == 1) return Array.from(
				{ length: r.int(4) },
				() => json_safe(r, depth + 1)
			)
			/** @type {Record<string, unknown>} */
			const o = {}
			for (let i = r.int(4); i > 0; i--) define(
				o,
				r.pick(
					[
						...obj_keys,
						"__proto__",
						"constructor",
						"0",
						"10",
						"2"
					]
				),
				json_safe(r, depth + 1)
			)
			return o
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} root
		 * @param {number} count
		 * @returns {unknown}
		 */
		function mutate_clone(r, root, count) {
			const clone = ref_clone(root).root
			/** @type {unknown[]} */
			const nodes = []
			const seen = new Set()
			const stack = [ clone ]
			while (stack.length) {
				const v = stack.pop()
				if (typeof v != "object" || v === null || seen.has(v) || !is_drafted_kind(kind_of(v))) continue
				seen.add(v)
				nodes.push(v)
				stack.push(
					...slots(v).map(([ , x ]) => x)
				)
			}
			for (let i = 0; i < count && nodes.length; i++) {
				const t = r.pick(nodes)
				const kind = kind_of(t)
				const value = r.chance(0.7)
					? r.pick(primitives)
					: r.chance(0.5)
						? {}
						: r.pick(nodes)
				if (kind == "obj") {
					if (r.chance(0.3)) {
						delete fields(t)[r.pick(obj_keys)]
					} else {
						fields(t)[r.pick(obj_keys)] = value
					}
				} else if (kind == "arr") {
					const a = as_array(t)
					const w = r.int(4)
					if (w == 0) {
						a.push(value)
					} else if (w == 1) {
						a.pop()
					} else if (w == 2 && a.length) {
						delete a[r.int(a.length)]
					} else {
						a[r.int(a.length + 1)] = value
					}
				} else if (kind == "map") {
					if (r.chance(0.3)) {
						as_map(t).delete(r.pick(map_keys))
					} else {
						as_map(t).set(r.pick(map_keys), value)
					}
				} else if (r.chance(0.3)) {
					as_set(t).delete([ ...as_set(t) ][0])
				} else {
					as_set(t).add(value)
				}
			}
			return clone
		}
		/**
		 * @param {Rand} r
		 * @param {unknown} v
		 * @param {number} [depth]
		 * @returns {unknown}
		 */
		function mutate_json(r, v, depth = 0) {
			if (r.chance(0.15) || depth > 4) return json_safe(r, depth)
			if (Array.isArray(v)) {
				const out = v.map(
					x => mutate_json(r, x, depth + 1)
				)
				if (r.chance(0.2)) out.push(json_safe(r, depth + 1))
				if (r.chance(0.2)) out.shift()
				return out
			}
			if (typeof v == "object" && v !== null) {
				/** @type {Record<string, unknown>} */
				const out = {}
				for (const [ k, x ] of Object.entries(v)) {
					if (!r.chance(0.15)) define(
						out,
						k,
						mutate_json(r, x, depth + 1)
					)
				}
				if (r.chance(0.3)) define(
					out,
					r.pick(obj_keys),
					json_safe(r, depth + 1)
				)
				return out
			}
			return v
		}
		/**
		 * @param {unknown[]} values
		 * @param {[ unknown, unknown ][]} fresh
		 * @returns {unknown}
		 */
		function ref_merge(values, fresh) {
			let acc = values[0]
			for (const b of values.slice(1)) {
				if (b !== undefined && b !== null) acc = ref_merge_into(acc, b, fresh)
			}
			return acc
		}
		it(
			"deepEqual, deepCopy, deepDiff and deepMerge match references",
			() => {
				const count = seeds
					? seeds * 50
					: 600
				/** @type {Failure[]} */
				const failures = []
				for (let i = 0; i < count; i++) {
					const seed = first * 7919 + i
					if (only && String(seed) != only) continue
					const r = rand(seed)
					/** @type {GenOptions} */
					const opt = {
						cycles: r.chance(0.4),
						freeze: r.pick(
							/** @type {const} */([ "none", "deep", "partial" ])/**/
						),
						holes: true,
						shared: r.chance(0.5),
						size: 2 + r.int(10)
					}
					const a = gen_value(r, opt)
					const b = r.chance(0.2)
						? gen_value(r, opt)
						: mutate_clone(r, a, r.int(4))
					const ctx = {
						failures,
						label: `seed=${seed} a=${show(a)} b=${show(b)}`,
						trace: []
					}
					const equal = deepEqual(a, b)
					if (equal != deepEqual(b, a)) fail(ctx, "equal-symmetry", "")
					if (equal != ref_equal(a, b)) fail(
						ctx,
						"equal-vs-reference",
						`deepEqual is ${equal}`
					)
					if (!deepEqual(a, a) || !deepEqual(b, b)) fail(ctx, "equal-reflexive", "")
					const copy = deepCopy(a)
					const res = iso(
						copy,
						a,
						v => typeof v == "function"
					)
					if (res.fail) fail(ctx, "copy-iso", res.fail)
					for (const [ c, o ] of res.pairs) {
						if (c === o) fail(ctx, "copy-shares-input", show(c))
					}
					if (!deepEqual(copy, a)) fail(ctx, "copy-not-equal", "")
					/** @type {unknown} */
					let kept
					try {
						kept = deepUpdate(a, () => {})
					} catch (error) {
						kept = error
					}
					if (is_drafted_kind(kind_of(a))
						? kept !== a
						: !(kept instanceof TypeError)) fail(
						ctx,
						"update-undrafted",
						show(kept)
					)
					if (!has_cycle(a) && !has_cycle(b)) {
						const snap = snapshot(a)
						/** @type {Change[]} */
						let changes = []
						try {
							changes = deepDiff(a, b)
							const patched = deepPatch(a, changes)
							if (!ref_equal(
								fill_holes(patched),
								fill_holes(b)
							)) fail(
								ctx,
								"diff-round-trip",
								`patched=${show(patched)} changes=${show(changes)}`
							)
							if (Object.isFrozen(a) && typeof patched == "object" && patched !== null && patched !== a && !Object.isFrozen(patched)) fail(ctx, "diff-frozen", show(patched))
							if (deepDiff(a, a).length) fail(ctx, "diff-self", "")
						} catch (error) {
							fail(
								ctx,
								"diff-throw",
								`${String(error)} changes=${show(changes)}`
							)
						}
						const message = snap.check()
						if (message) fail(ctx, "diff-input-changed", message)
						if (typeof b == "object" && b !== null && !Object.isFrozen(b) && Object.isFrozen(a)) {
							const after = snapshot(b)
							deepPatch(a, deepDiff(a, b))
							const changed = after.check()
							if (changed) fail(ctx, "diff-after-changed", changed)
						}
					}
					const j1 = json_safe(r)
					const j2 = r.chance(0.8)
						? mutate_json(r, j1)
						: json_safe(r)
					const json_ctx = {
						failures,
						label: `seed=${seed} j1=${JSON.stringify(j1)} j2=${JSON.stringify(j2)}`,
						trace: []
					}
					try {
						/** @type {Change[]} */
						const wire = JSON.parse(
							JSON.stringify(deepDiff(j1, j2))
						)
						const source = r.chance(0.5)
							? deepFreeze(JSON.parse(JSON.stringify(j1)))
							: j1
						const patched = deepPatch(source, wire)
						if (!ref_equal(patched, j2)) fail(
							json_ctx,
							"json-round-trip",
							`patched=${JSON.stringify(patched)} wire=${JSON.stringify(wire)}`
						)
					} catch (error) {
						fail(
							json_ctx,
							"json-throw",
							String(error)
						)
					}
					const layers = [
						j1,
						j2,
						r.chance(0.3)
							? undefined
							: json_safe(r),
						r.chance(0.3)
							? null
							: mutate_json(r, j2)
					]
					const merged = deepMerge(...layers)
					const expected = ref_merge(layers, [])
					if (!ref_equal(merged, expected) || JSON.stringify(merged) != JSON.stringify(expected)) fail(
						{
							failures,
							label: `seed=${seed} layers=${JSON.stringify(layers)}`,
							trace: []
						},
						"merge-vs-reference",
						`${JSON.stringify(merged)} vs ${JSON.stringify(expected)}`
					)
				}
				report(failures, count)
			},
			timeout
		)
	}
)
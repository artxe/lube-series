/** @import { Ref } from "async-lube" */
/** @import { DynamicFlow } from "./private.js" */
import { flow } from "async-lube"
import { getEventListeners } from "node:events"
import { assert, describe, it } from "vitest"
describe(
	"flow scale",
	() => {
		/**
		 * @param {((value: number | undefined) => number)[]} nodes
		 * @param {boolean} reverse
		 * @returns {import("async-lube").Flow<unknown, number>}
		 */
		function chain(nodes, reverse) {
			/** @type {DynamicFlow} */
			let definition = flow()
			const order = reverse ? [ ...nodes.keys() ].reverse() : [ ...nodes.keys() ]
			for (const i of order) {
				definition = i
					? definition.add(
					/** @type {Ref} */(nodes[i])/**/,
						/** @type {Ref} */(nodes[i - 1])/**/
					)
					: definition.add(
					/** @type {Ref} */(nodes[i])/**/
					)
			}
			return /** @type {import("async-lube").Flow<unknown, number>} */(/** @type {unknown} */(definition))/**/
		}
		/**
		 * @param {(size: number) => Promise<number[]>} work
		 * @param {number} small
		 * @param {number} large
		 * @returns {Promise<number[]>}
		 */
		async function growth(work, small, large) {
			/**
			 * @param {number} size
			 * @returns {Promise<number[]>}
			 */
			async function best(size) {
				/** @type {number[]} */
				const least = []
				for (let round = 0; round < 3; round++) {
					for (const [ phase, ms ] of (await work(size)).entries()) {
						least[phase] = Math.min(least[phase] ?? Infinity, ms)
					}
				}
				return least
			}
			const low = await best(small)
			return (await best(large)).map(
				(ms, phase) => ms / Math.max(low[phase] ?? 0, 1)
			)
		}
		/**
		 * @param {number} count
		 * @returns {((value: number | undefined) => number)[]}
		 */
		function steps(count) {
			return Array.from(
				{ length: count },
				(_, i) => {
					/**
					 * @param {number | undefined} value
					 */
					function step(value) {
						return (typeof value == "number" ? value : 0) + 1
					}
					Object.defineProperty(step, "name", { value: "s" + i })
					return step
				}
			)
		}
		it(
			"cancelling a batch on a shared signal",
			async () => {
				const items = Array.from({ length: 10000 }, (_, i) => i)
				/** @type {AbortSignal[]} */
				const signals = []
				const hang = flow.each(
					(
						/** @type {number} */ _,
						/** @type {import("async-lube").NodeContext} */ { signal, sleep }
					) => {
						signals.push(signal)
						return sleep(1e9)
					}
				)
				const controller = new AbortController()
				const run = flow().add(hang, { name: "hang" })
					.run(
						items,
						{ signal: controller.signal }
					)
				await new Promise(
					resolve => setImmediate(resolve)
				)
				assert.equal(run.nodes["hang"], "running")
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					1
				)
				assert.equal(
					getEventListeners(
						/** @type {AbortSignal} */(signals[0])/**/,
						"abort"
					).length,
					1
				)
				controller.abort("closed")
				await run.catch(() => {})
				assert.equal(run.status, "cancelled")
				assert.equal(signals.length, items.length)
				assert.isTrue(
					signals.every(signal => signal.aborted)
				)
				assert.equal(new Set(signals).size, 1)
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
			},
			20000
		)
		it(
			"deep chains in any order",
			async () => {
				const nodes = steps(20000)
				const reversed = chain(nodes, true)
				const first = /** @type {(value: number | undefined) => number} */(nodes[0])/**/
				const last = /** @type {(value: number | undefined) => number} */(nodes[19999])/**/
				const backwards = reversed.run()
				assert.equal(await backwards, 1)
				assert.equal(backwards.get(last), 20000)
				const looped = reversed.edge(last, [ first ], () => null)
				const run = looped.run()
				await run
				assert.equal(run.get(last), 20000)
				assert.equal(run.nodes["s0"], "done")
				function fall_back() {
					return 0
				}
				const with_fallback = chain(nodes, false)
					.add(fall_back, { fallback: first })
				assert.equal(await with_fallback.run(), 0)
			},
			30000
		)
		it(
			"large graphs stay linear",
			async () => {
				const ratios = await growth(
					async size => {
						const nodes = steps(size)
						let at = performance.now()
						const forward = chain(nodes, false)
						const built = performance.now() - at
						at = performance.now()
						const run = forward.run()
						assert.equal(await run, size)
						const ran = performance.now() - at
						at = performance.now()
						run.reload(nodes[0])
						assert.equal(await run, size)
						const reloaded = performance.now() - at
						const controller = new AbortController()
						function root() {
							return 1
						}
						/** @type {DynamicFlow} */
						let wide = flow().add(root)
						for (const node of steps(size)) {
							wide = wide.add(node, root)
						}
						at = performance.now()
						const fanned = wide.run(
							void 0,
							{ signal: controller.signal }
						)
						assert.equal(await fanned, 2)
						const spread = performance.now() - at
						assert.equal(
							Object.keys(fanned.results).length,
							size + 1
						)
						assert.equal(
							getEventListeners(controller.signal, "abort").length,
							0
						)
						return [ built, ran, reloaded, spread ]
					},
					2500,
					20000
				)
				assert.isBelow(
					Math.max(...ratios),
					32,
					ratios.join(" ")
				)
			},
			60000
		)
		it(
			"queues and nested batches stay linear",
			async () => {
				const queues = await growth(
					async size => {
						const message = flow.input("message")
						/**
						 * @param {unknown} value
						 */
						async function handle(value) {
							return value
						}
						const queued = flow()
							.add(message)
							.add(
								handle,
								message,
								{ overlap: "queue" }
							)
							.run()
						const started = performance.now()
						for (let i = 0; i < size; i++) {
							queued.send(message, i)
						}
						assert.equal(await queued, size - 1)
						return [ performance.now() - started ]
					},
					5000,
					40000
				)
				assert.isBelow(
					Math.max(...queues),
					32,
					queues.join(" ")
				)
				const batches = await growth(
					async size => {
						const approve = flow.input("approve")
						/**
						 * @param {import("async-lube").NodeContext} context
						 */
						async function summarize({ state }) {
							await null
							return state
						}
						const review = flow()
							.add(summarize)
							.add(approve, summarize)
						const reviews = flow().add(
							flow.each(review),
							{ name: "review" }
						)
						const nested = flow()
							.add(reviews, { name: "batch" })
							.run(
								Array.from({ length: size }, (_, i) => i)
							)
						await nested.idle()
						assert.equal(nested.status, "waiting")
						const sending = performance.now()
						for (let i = 0; i < size; i++) {
							nested.send(
								`batch.review.${i}.approve`,
								true
							)
						}
						await nested
						return [ performance.now() - sending ]
					},
					500,
					4000
				)
				assert.isBelow(
					Math.max(...batches),
					32,
					batches.join(" ")
				)
				function root() {
					return 1
				}
				/** @type {DynamicFlow} */
				let wide = flow().add(root)
				for (const node of steps(200000)) {
					wide = wide.add(node, root)
				}
				const fanned = wide.run()
				await fanned
				fanned.reload(root)
				assert.equal(await fanned, 2)
			},
			120000
		)
	}
)
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
			for (const i of order) definition = i
				? definition.add(
					/** @type {Ref} */(nodes[i])/**/,
					/** @type {Ref} */(nodes[i - 1])/**/
				)
				: definition.add(
					/** @type {Ref} */(nodes[i])/**/
				)
			return /** @type {import("async-lube").Flow<unknown, number>} */(/** @type {unknown} */(definition))/**/
		}
		/**
		 * @param {number} count
		 * @returns {((value: number | undefined) => number)[]}
		 */
		function steps(count) {
			return Array.from(
				{ length: count },
				(_, i) => {
					function step(
						/** @type {number | undefined} */ value
					) {
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
				const started = Date.now()
				controller.abort("closed")
				await run.catch(() => {})
				assert.equal(run.status, "cancelled")
				assert.isBelow(Date.now() - started, 1000)
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
				const nodes = steps(20000)
				const started = Date.now()
				const forward = chain(nodes, false)
				assert.isBelow(Date.now() - started, 2500)
				const run = forward.run()
				assert.equal(await run, 20000)
				assert.isBelow(Date.now() - started, 5000)
				const reloaded = Date.now()
				run.reload(nodes[0])
				assert.equal(await run, 20000)
				assert.isBelow(Date.now() - reloaded, 2500)
				const controller = new AbortController()
				function root() {
					return 1
				}
				/** @type {DynamicFlow} */
				let wide = flow().add(root)
				for (const node of steps(20000)) wide = wide.add(node, root)
				const spread = Date.now()
				const fanned = wide.run(
					void 0,
					{ signal: controller.signal }
				)
				assert.equal(await fanned, 2)
				assert.equal(
					Object.keys(fanned.results).length,
					20001
				)
				assert.isBelow(Date.now() - spread, 2500)
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
			},
			30000
		)
		it(
			"queues and nested batches stay linear",
			async () => {
				const message = flow.input("message")
				async function handle(/** @type {unknown} */ value) {
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
				const started = Date.now()
				for (let i = 0; i < 40000; i++) queued.send(message, i)
				assert.equal(await queued, 39999)
				assert.isBelow(Date.now() - started, 1500)
				const approve = flow.input("approve")
				async function summarize(
					/** @type {import("async-lube").NodeContext} */ { state }
				) {
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
						Array.from({ length: 4000 }, (_, i) => i)
					)
				await nested.idle()
				assert.equal(nested.status, "waiting")
				const sending = Date.now()
				for (let i = 0; i < 4000; i++) nested.send(
					`batch.review.${i}.approve`,
					true
				)
				await nested
				assert.isBelow(Date.now() - sending, 500)
				function root() {
					return 1
				}
				/** @type {DynamicFlow} */
				let wide = flow().add(root)
				for (const node of steps(200000)) wide = wide.add(node, root)
				const fanned = wide.run()
				await fanned
				fanned.reload(root)
				assert.equal(await fanned, 2)
			},
			60000
		)
	}
)
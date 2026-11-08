import { CancelError, offload } from "async-lube"
import { assert, describe, it } from "vitest"
const store_url = new URL(
	"./fixtures/store.js",
	import.meta.url
)
const broken_url = new URL(
	"./fixtures/broken.js",
	import.meta.url
)
describe(
	"offload of a module",
	() => {
		it(
			"gathers the requests that arrive within the delay into one batch",
			async () => {
				/** @type {number[]} */
				const sizes = []
				const store = offload(
					store_url,
					{
						delay: 300,
						onBatch: value => {
							sizes.push(
								/** @type {{ size: number }} */(value)/**/.size
							)
						}
					}
				)
				await store.ready
				const first = store.call(1)
				await new Promise(
					resolve => setTimeout(resolve, 0)
				)
				await Promise.all([ first, store.call(1) ])
				assert.deepEqual(sizes, [ 2 ])
				await store.close()
			}
		)
		it(
			"lets the sent calls finish on close, runs the close of the module and rejects later calls",
			async () => {
				const closed = new SharedArrayBuffer(4)
				const store = offload(
					store_url,
					{
						data: {
							close_error: "close failed",
							closed
						}
					}
				)
				const slow = store.call("slow")
				const closing = store.close()
				assert.equal(store.close(), closing)
				const later = rejection(store.call(1))
				assert.equal(
					/** @type {Error} */(await rejection(closing))/**/.message,
					"close failed"
				)
				assert.equal(await slow, "slow")
				assert.equal(
					Atomics.load(new Int32Array(closed), 0),
					1
				)
				const error = await later
				assert.instanceOf(error, CancelError)
				assert.equal(
					/** @type {Error} */(error)/**/.message,
					"The offload was closed"
				)
				assert.instanceOf(
					await rejection(store.call(1)),
					CancelError
				)
			}
		)
		it(
			"matches replies to calls and keeps the state of the worker",
			async () => {
				const store = offload(
					store_url.href,
					{ data: { start: 10 } }
				)
				await store.ready
				assert.equal(await store.call(1), 11)
				assert.deepEqual(
					await Promise.all(
						[
							store.call(2),
							store.call("echo"),
							store.call(3)
						]
					),
					[ 13, "echo", 16 ]
				)
				const error = /** @type {Error} */(await rejection(store.call("fail")))/**/
				assert.equal(error.name, "RangeError")
				assert.equal(error.message, "bad request")
				assert.equal(await store.call(4), 20)
				await store.close()
			}
		)
		it(
			"rejects every call of a batch that failed, and runs the other batches",
			async () => {
				const store = offload(store_url)
				const calls = [
					store.call(1),
					store.call("poison"),
					store.call(1)
				]
				for (const call of calls) {
					const error = /** @type {Error} */(await rejection(call))/**/
					assert.equal(error.message, "commit failed")
				}
				assert.equal(await store.call(1), 3)
				await store.close()
			}
		)
		it(
			"rejects ready and every call when the setup fails",
			async () => {
				const broken = offload(broken_url)
				const waiting = broken.call(1)
				const error = /** @type {Error} */(await rejection(broken.ready))/**/
				assert.equal(error.name, "RangeError")
				assert.equal(error.message, "setup failed")
				assert.equal(
					/** @type {Error} */(await rejection(waiting))/**/.message,
					"setup failed"
				)
				assert.equal(
					/** @type {Error} */(await rejection(broken.call(2)))/**/.message,
					"setup failed"
				)
				await broken.close()
			}
		)
		it(
			"rejects the pending calls and later calls of a worker that crashed",
			async () => {
				const store = offload(store_url)
				await store.ready
				const crashing = store.call("crash")
				const waiting = store.call("slow")
				const error = /** @type {Error} */(await rejection(crashing))/**/
				assert.equal(error.name, "RangeError")
				assert.equal(error.message, "crashed")
				assert.equal(
					/** @type {Error} */(await rejection(waiting))/**/.message,
					"crashed"
				)
				assert.equal(
					/** @type {Error} */(await rejection(store.call(1)))/**/.message,
					"crashed"
				)
				await store.close()
			}
		)
		it(
			"runs the calls of one tick as one batch",
			async () => {
				/** @type {number[]} */
				const sizes = []
				const store = offload(
					store_url,
					{
						onBatch: value => {
							sizes.push(
								/** @type {{ size: number }} */(value)/**/.size
							)
						}
					}
				)
				await Promise.all(
					[
						store.call(1),
						store.call(1),
						store.call(1)
					]
				)
				await store.call(1)
				assert.deepEqual(sizes, [ 3, 1 ])
				await store.close()
			}
		)
		it(
			"settles the calls of a batch after onBatch resolves, and rejects them if it rejects",
			async () => {
				/** @type {string[]} */
				const events = []
				const gate = Promise.withResolvers()
				let fail = false
				const store = offload(
					store_url,
					{
						onBatch: async () => {
							events.push("shipping")
							if (fail) {
								throw RangeError("not shipped")
							}
							await gate.promise
							events.push("shipped")
						}
					}
				)
				const first = store.call(1).then(() => events.push("settled"))
				await until(
					() => events.includes("shipping")
				)
				await new Promise(
					resolve => setTimeout(resolve, 20)
				)
				assert.deepEqual(events, [ "shipping" ])
				gate.resolve(void 0)
				await first
				assert.deepEqual(
					events,
					[ "shipping", "shipped", "settled" ]
				)
				fail = true
				const error = /** @type {Error} */(await rejection(store.call(1)))/**/
				assert.equal(error.message, "not shipped")
				await store.close()
			}
		)
		it(
			"throws a TypeError for a string that is no URL and for a bad option",
			() => {
				assert.throws(
					() => offload("not a url"),
					TypeError
				)
				assert.throws(
					() => offload(
						store_url,
						/** @type {never} */({ delai: 1 })/**/
					),
					TypeError,
					"Unknown offload option \"delai\""
				)
				assert.throws(
					() => offload(store_url, { delay: -1 }),
					TypeError,
					"delay"
				)
				assert.throws(
					() => offload(
						store_url,
						{
							onBatch: /** @type {never} */("fn")/**/
						}
					),
					TypeError,
					"onBatch"
				)
			}
		)
		/**
		 * @param {PromiseLike<unknown>} promise
		 * @returns {Promise<unknown>}
		 */
		function rejection(promise) {
			return Promise.resolve(promise)
				.then(
					() => assert.fail("No error occurred"),
					error => error
				)
		}
		/**
		 * @param {() => boolean} condition
		 * @returns {Promise<void>}
		 */
		async function until(condition) {
			const started = Date.now()
			while (!condition()) {
				if (Date.now() - started > 10000) {
					assert.fail("Timed out")
				}
				await new Promise(
					resolve => setTimeout(resolve, 5)
				)
			}
		}
	}
)
import { CancelError, offload } from "async-lube"
import { assert, describe, it } from "vitest"
describe(
	"offload in a browser",
	() => {
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
		it(
			"rejects the call of a Worker that crashed, and runs the next call in a new Worker",
			async () => {
				const crashing = offload(
					(/** @type {boolean} */ crash) => {
						if (!crash) {
							return "fine"
						}
						setTimeout(
							() => {
								throw RangeError("crashed")
							}
						)
						return new Promise(() => {})
					}
				)
				const error = /** @type {Error} */(await rejection(crashing(true)))/**/
				assert.instanceOf(error, Error)
				assert.include(error.message, "crashed")
				assert.equal(await crashing(false), "fine")
				crashing.close()
			}
		)
		it(
			"runs in a Worker and terminates it on cancel",
			async () => {
				const hash = offload(
					async (/** @type {string} */ text) => {
						const bytes = await crypto.subtle.digest(
							"SHA-256",
							new TextEncoder().encode(text)
						)
						return [ ...new Uint8Array(bytes) ].length
					}
				)
				assert.equal(await hash("lube"), 32)
				const spin = offload(
					(/** @type {number} */ value) => {
						if (value) {
							for (;;) { }
						}
						return typeof document
					},
					{ concurrency: 2 }
				)
				const running = spin(1)
				await new Promise(
					resolve => setTimeout(resolve, 50)
				)
				running.cancel()
				assert.instanceOf(
					await rejection(running),
					CancelError
				)
				assert.equal(await spin(0), "undefined")
				const broken = offload(
					() => {
						throw new TypeError("bad input")
					}
				)
				const error = /** @type {Error} */(await rejection(broken()))/**/
				assert.equal(error.name, "TypeError")
				assert.equal(error.message, "bad input")
				hash.close()
				spin.close()
				broken.close()
			}
		)
	}
)
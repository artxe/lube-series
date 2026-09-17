import { CancelError, offload } from "async-lube"
import { execFile } from "node:child_process"
import { assert, describe, it, vi } from "vitest"
describe(
	"offload",
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
			"cancels",
			async () => {
				const spin = offload(
					(/** @type {number} */ value) => {
						if (value) for (;;);
						return "done"
					}
				)
				const running = spin(1)
				const queued = spin(1)
				queued.cancel()
				assert.instanceOf(
					await rejection(queued),
					CancelError
				)
				await new Promise(
					resolve => setTimeout(resolve, 50)
				)
				running.cancel("Stop")
				const error = /** @type {CancelError} */(await rejection(running))/**/
				assert.instanceOf(error, CancelError)
				assert.equal(error.message, "Stop")
				assert.equal(await spin(0), "done")
				const controller = new AbortController()
				const signaled = spin(1, controller.signal)
				controller.abort()
				assert.instanceOf(
					await rejection(signaled),
					CancelError
				)
				assert.instanceOf(
					await rejection(spin(0, AbortSignal.abort())),
					CancelError
				)
				const closing = spin(1)
				const waiting = spin(0)
				spin.close()
				assert.instanceOf(
					await rejection(waiting),
					CancelError
				)
				assert.instanceOf(
					await rejection(closing),
					CancelError
				)
				assert.equal(await spin(0), "done")
				spin.close()
			}
		)
		it(
			"lets the process exit",
			async () => {
				const entry = new URL(
					"../../packages/async-lube/src/index.js",
					import.meta.url
				).href
				const output = await new Promise(
					(resolve, reject) => execFile(
						process.execPath,
						[
							"--input-type=module",
							"-e",
							`const { offload } = await import(${JSON.stringify(entry)}); console.log(await offload(value => value * 2)(21))`
						],
						{ timeout: 20000 },
						(error, stdout) => error ? reject(error) : resolve(stdout.trim())
					)
				)
				assert.equal(output, "42")
			},
			30000
		)
		it(
			"runs a function in a worker",
			async () => {
				const sum = offload(
					async (
						/** @type {number[]} */ values,
						/** @type {number} */ extra
					) => values.reduce(
						(total, value) => total + value,
						extra
					)
				)
				assert.equal(await sum([ 1, 2, 3 ], 4), 10)
				const fail = offload(
					() => {
						throw new RangeError("too big")
					}
				)
				const error = /** @type {Error} */(await rejection(fail()))/**/
				assert.equal(error.name, "RangeError")
				assert.equal(error.message, "too big")
				const outer = 1
				const closure = offload(() => outer)
				assert.instanceOf(
					await rejection(closure()),
					Error
				)
				const echo = offload(
					(/** @type {unknown} */ value) => value
				)
				assert.instanceOf(
					await rejection(echo(() => 1)),
					Error
				)
				assert.equal(
					await echo("still works"),
					"still works"
				)
				const odd = offload(
					() => {
						throw { message: "odd", run() {} }
					}
				)
				const odd_error = /** @type {Error} */(await rejection(odd()))/**/
				assert.instanceOf(odd_error, Error)
				assert.equal(odd_error.message, "odd")
				odd.close()
				assert.throws(
					() => offload(
						/** @type {never} */("code")/**/
					),
					"needs a function"
				)
				assert.throws(
					() => offload(() => 1, { concurrency: 0 }),
					"concurrency"
				)
				assert.throws(
					() => offload(
						() => 1,
						/** @type {never} */({ concurency: 2 })/**/
					),
					TypeError,
					"Unknown offload option \"concurency\""
				)
				const spy = vi.spyOn(process, "getBuiltinModule")
					.mockReturnValue(void 0)
				try {
					const nowhere = offload(() => 1)
					assert.instanceOf(
						await rejection(nowhere()),
						TypeError
					)
				} finally {
					spy.mockRestore()
				}
				sum.close()
				fail.close()
				closure.close()
				echo.close()
			}
		)
		it(
			"runs as many at once as its concurrency",
			async () => {
				const gated = offload(
					(
						/** @type {SharedArrayBuffer} */ shared
					) => {
						const cells = new Int32Array(shared)
						const order = Atomics.add(cells, 0, 1) + 1
						Atomics.wait(cells, 1, 0)
						return order
					},
					{ concurrency: 2 }
				)
				const shared = new SharedArrayBuffer(8)
				const cells = new Int32Array(shared)
				const all = Promise.all(
					[
						gated(shared),
						gated(shared),
						gated(shared)
					]
				)
				const started = Date.now()
				while (Atomics.load(cells, 0) < 2) {
					if (Date.now() - started > 5000) assert.fail("Timed out")
					await new Promise(
						resolve => setTimeout(resolve, 5)
					)
				}
				await new Promise(
					resolve => setTimeout(resolve, 50)
				)
				assert.equal(Atomics.load(cells, 0), 2)
				Atomics.store(cells, 1, 1)
				Atomics.notify(cells, 1)
				assert.sameMembers(await all, [ 1, 2, 3 ])
				gated.close()
			},
			30000
		)
	}
)
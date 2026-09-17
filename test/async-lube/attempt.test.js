import {
	CancelError,
	TimeoutError,
	attempt,
	flow
} from "async-lube"
import { afterEach, assert, describe, it, vi } from "vitest"
describe(
	"attempt",
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
		afterEach(() => vi.useRealTimers())
		it(
			"attempt",
			async () => {
				/** @type {number[]} */
				const attempts = []
				assert.equal(
					await attempt(
						({ attempt: count }) => {
							attempts.push(count)
							if (count < 3) throw Error("busy")
							return "row"
						},
						{ retry: 2 }
					),
					"row"
				)
				assert.deepEqual(attempts, [ 1, 2, 3 ])
				/** @type {unknown[][]} */
				const delays = []
				const stopped_error = Error("stop")
				assert.equal(
					await rejection(
						attempt(
							() => {
								throw stopped_error
							},
							{
								retry: {
									count: 5,
									delay: (count, error, fallback) => {
										delays.push([ count, error, fallback ])
										return count < 2 ? 0 : void 0
									}
								}
							}
						)
					),
					stopped_error
				)
				assert.deepEqual(
					delays,
					[
						[ 1, stopped_error, 0 ],
						[ 2, stopped_error, 0 ]
					]
				)
				let flow_attempts = 0
				const flow_error = /** @type {Error} */(await rejection(
					flow()
						.add(
							() => {
								flow_attempts++
								throw stopped_error
							},
							{
								retry: {
									count: 5,
									delay: (count, error, fallback) => {
										delays.push([ count, error, fallback ])
										return void 0
									}
								}
							}
						)
						.run()
				))/**/
				assert.equal(flow_error.cause, stopped_error)
				assert.equal(flow_attempts, 1)
				assert.deepEqual(
					delays.at(-1),
					[ 1, stopped_error, 0 ]
				)
				const denied = Error("denied")
				assert.equal(
					await rejection(
						attempt(
							() => {
								throw denied
							},
							{
								retry: {
									count: 5,
									when: error => error != denied
								}
							}
						)
					),
					denied
				)
				vi.useFakeTimers()
				/** @type {boolean[]} */
				const aborted = []
				const slow = attempt(
					({ signal }) => new Promise(
						(_, reject) => signal.addEventListener(
							"abort",
							() => {
								aborted.push(true)
								reject(signal.reason)
							}
						)
					),
					{
						retry: { count: 1, delay: 1000 },
						timeout: 500
					}
				)
				const failed = rejection(slow)
				await vi.advanceTimersByTimeAsync(500)
				assert.lengthOf(aborted, 1)
				await vi.advanceTimersByTimeAsync(1500)
				assert.instanceOf(await failed, TimeoutError)
				assert.lengthOf(aborted, 2)
				const controller = new AbortController()
				const waiting = rejection(
					attempt(
						() => {
							throw Error("down")
						},
						{
							retry: { count: 3, delay: 60000 },
							signal: controller.signal
						}
					)
				)
				await vi.advanceTimersByTimeAsync(10)
				controller.abort("Leaving")
				const cancel = /** @type {CancelError} */(await waiting)/**/
				assert.instanceOf(cancel, CancelError)
				assert.equal(cancel.message, "Leaving")
				assert.instanceOf(
					await rejection(
						attempt(
							() => 1,
							{ signal: AbortSignal.abort() }
						)
					),
					CancelError
				)
				for (const [ options, message ] of /** @type {const} */([
					[
						{ timeout: -1 },
						"The timeout of attempt() must be a positive number of milliseconds"
					],
					[
						{ retry: -1 },
						"The retry count of attempt() must be a non-negative integer or Infinity"
					],
					[
						{ retry: { count: 1, delay: -1 } },
						"The retry delay of attempt() must be non-negative milliseconds or a function"
					],
					[
						{
							retry: { count: 1, when: true }
						},
						"The retry when of attempt() must be a function"
					],
					[
						{ retry: "2" },
						"The retry of attempt() must be a non-negative integer or { count, delay, when }"
					],
					[
						{ timout: 10 },
						"Unknown attempt option \"timout\""
					],
					[
						{ retry: { count: 1, delays: 5 } },
						"Unknown attempt option \"retry.delays\""
					]
				])/**/) {
					/** @type {Promise<unknown> | undefined} */
					let pending
					assert.doesNotThrow(
						() => pending = attempt(
							() => 1,
							/** @type {never} */(options)/**/
						)
					)
					const error = /** @type {Error} */(await rejection(
						/** @type {Promise<unknown>} */(pending)/**/
					))/**/
					assert.instanceOf(error, TypeError)
					assert.equal(error.message, message)
				}
				const stopper = new AbortController()
				const stopped = rejection(
					attempt(
						() => {
							throw Error("down")
						},
						{
							retry: {
								count: 3,
								delay: () => 1000,
								when: () => {
									stopper.abort("Stopped")
									return true
								}
							},
							signal: stopper.signal
						}
					)
				)
				assert.instanceOf(await stopped, CancelError)
			}
		)
	}
)
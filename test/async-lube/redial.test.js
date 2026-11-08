import { redial } from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"redial",
	() => {
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"a connect that throws or rejects counts as a close",
			async () => {
				const stop = new AbortController()
				/** @type {number[]} */
				const times = []
				const start = Date.now()
				const stopped = redial(
					({ attempt }) => {
						times.push(Date.now() - start)
						if (attempt % 2) {
							throw Error("refused")
						}
						return Promise.reject(Error("refused"))
					},
					{
						base: 100,
						most: 1000,
						signal: stop.signal
					}
				)
				await vi.advanceTimersByTimeAsync(800)
				assert.deepEqual(times, [ 0, 100, 300, 700 ])
				stop.abort()
				await stopped
			}
		)
		it(
			"an open connection resets the delay to base",
			async () => {
				const stop = new AbortController()
				/** @type {number[]} */
				const times = []
				const start = Date.now()
				const stopped = redial(
					({ attempt, close, open }) => {
						times.push(Date.now() - start)
						if (attempt == 3) {
							open()
						}
						close()
					},
					{
						base: 100,
						most: 10000,
						signal: stop.signal
					}
				)
				await vi.advanceTimersByTimeAsync(700)
				assert.deepEqual(
					times,
					[ 0, 100, 300, 400, 500, 700 ]
				)
				stop.abort()
				await stopped
			}
		)
		it(
			"connects again after each close with doubling delays capped at most",
			async () => {
				const stop = new AbortController()
				/** @type {number[]} */
				const times = []
				const start = Date.now()
				const stopped = redial(
					({ close }) => {
						times.push(Date.now() - start)
						close()
					},
					{
						base: 100,
						most: 500,
						signal: stop.signal
					}
				)
				await vi.advanceTimersByTimeAsync(2000)
				assert.deepEqual(
					times,
					[ 0, 100, 300, 700, 1200, 1700 ]
				)
				stop.abort()
				await stopped
			}
		)
		it(
			"counts every connect in attempt",
			async () => {
				const stop = new AbortController()
				/** @type {number[]} */
				const attempts = []
				const stopped = redial(
					({ attempt, close }) => {
						attempts.push(attempt)
						close()
					},
					{
						base: 1,
						most: 1,
						signal: stop.signal
					}
				)
				await vi.advanceTimersByTimeAsync(3)
				assert.deepEqual(attempts, [ 1, 2, 3, 4 ])
				stop.abort()
				await stopped
			}
		)
		it(
			"ignores open and close of a connection that already closed",
			async () => {
				const stop = new AbortController()
				/** @type {{ close(): void, open(): void }[]} */
				const contexts = []
				let calls = 0
				const stopped = redial(
					context => {
						calls++
						contexts.push(context)
						if (calls == 1) {
							context.close()
						}
					},
					{
						base: 100,
						most: 1000,
						signal: stop.signal
					}
				)
				await vi.advanceTimersByTimeAsync(100)
				assert.equal(calls, 2)
				contexts[0]?.close()
				contexts[0]?.open()
				await vi.advanceTimersByTimeAsync(5000)
				assert.equal(calls, 2)
				contexts[1]?.close()
				await vi.advanceTimersByTimeAsync(199)
				assert.equal(calls, 2)
				await vi.advanceTimersByTimeAsync(1)
				assert.equal(calls, 3)
				stop.abort()
				contexts[2]?.close()
				await stopped
			}
		)
		it(
			"never connects with a signal that is already aborted",
			async () => {
				let calls = 0
				await redial(
					() => {
						calls++
					},
					{ signal: AbortSignal.abort() }
				)
				assert.equal(calls, 0)
			}
		)
		it(
			"on abort during the delay resolves at once without connecting again",
			async () => {
				const stop = new AbortController()
				let calls = 0
				const stopped = redial(
					({ close }) => {
						calls++
						close()
					},
					{ base: 1000, signal: stop.signal }
				)
				await vi.advanceTimersByTimeAsync(10)
				stop.abort()
				await stopped
				assert.equal(vi.getTimerCount(), 0)
				await vi.advanceTimersByTimeAsync(100000)
				assert.equal(calls, 1)
			}
		)
		it(
			"on abort stops the timer, aborts the signal of the connection and resolves after its close",
			async () => {
				const stop = new AbortController()
				const reason = Error("stop")
				/** @type {AbortSignal[]} */
				const signals = []
				/** @type {(() => void)[]} */
				const closers = []
				let resolved = false
				const stopped = redial(
					({ close, signal }) => {
						signals.push(signal)
						closers.push(close)
					},
					{ signal: stop.signal }
				)
				stopped.then(
					() => {
						resolved = true
					}
				)
				await vi.advanceTimersByTimeAsync(0)
				assert.equal(signals.length, 1)
				assert.isFalse(signals[0]?.aborted)
				stop.abort(reason)
				await vi.advanceTimersByTimeAsync(0)
				assert.equal(signals[0]?.reason, reason)
				assert.isFalse(resolved)
				closers[0]?.()
				await stopped
				await vi.advanceTimersByTimeAsync(100000)
				assert.equal(signals.length, 1)
				assert.equal(vi.getTimerCount(), 0)
			}
		)
		it(
			"rejects bad options with a TypeError",
			() => {
				const signal = new AbortController().signal
				assert.throws(
					() => redial(
						connect,
						/** @type {never} */({})/**/
					),
					TypeError,
					"signal"
				)
				assert.throws(
					() => redial(
						connect,
						/** @type {never} */(void 0)/**/
					),
					TypeError,
					"signal"
				)
				assert.throws(
					() => redial(connect, { base: 0, signal }),
					TypeError,
					"base"
				)
				assert.throws(
					() => redial(connect, { most: -1, signal }),
					TypeError,
					"most"
				)
				assert.throws(
					() => redial(
						connect,
						{ base: 10, most: 5, signal }
					),
					TypeError,
					"most"
				)
				assert.throws(
					() => redial(
						connect,
						/** @type {never} */({ signal, wait: 1 })/**/
					),
					TypeError,
					"wait"
				)
				/** @returns {void} */
				/** @returns {void} */
				function connect() {}
			}
		)
	}
)
import { CancelError, attempt, limiter } from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"limiter",
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
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"counts no call of a key that it does not hold, and rejects with the CancelError that aborted a signal",
			async () => {
				const pool = limiter({ concurrency: 1 })
				const tenant = pool.key("tenant")
				assert.equal(tenant.pending, 0)
				assert.equal(tenant.running, 0)
				const reason = new CancelError("Left the page")
				assert.equal(
					await rejection(
						tenant(
							() => 1,
							AbortSignal.abort(reason)
						)
					),
					reason
				)
				const holder = await tenant.acquire()
				const controller = new AbortController()
				const queued = rejection(
					tenant(() => 1, controller.signal)
				)
				assert.equal(tenant.pending, 1)
				controller.abort(reason)
				assert.equal(await queued, reason)
				holder.release()
				assert.equal(tenant.running, 0)
			}
		)
		it(
			"limiter",
			async () => {
				const pool = limiter({ concurrency: 2 })
				let active = 0
				let peak = 0
				/** @type {number[]} */
				const order = []
				/**
				 * @param {number} id
				 * @returns {Promise<number>}
				 */
				async function query(id) {
					active++
					peak = Math.max(peak, active)
					await new Promise(
						resolve => setTimeout(resolve, 10)
					)
					active--
					order.push(id)
					return id
				}
				const results = Promise.all(
					[ 1, 2, 3, 4, 5 ].map(id => pool(() => query(id)))
				)
				assert.equal(pool.running, 2)
				assert.equal(pool.pending, 3)
				assert.deepEqual(await results, [ 1, 2, 3, 4, 5 ])
				assert.equal(peak, 2)
				assert.equal(pool.running, 0)
				const controller = new AbortController()
				const blocker = pool(
					() => new Promise(
						resolve => setTimeout(resolve, 30)
					)
				)
				const other = pool(
					() => new Promise(
						resolve => setTimeout(resolve, 30)
					)
				)
				const left = rejection(
					pool(() => "never", controller.signal)
				)
				controller.abort()
				assert.instanceOf(await left, CancelError)
				assert.equal(pool.pending, 0)
				assert.instanceOf(
					await rejection(
						pool(() => 1, AbortSignal.abort())
					),
					CancelError
				)
				const late = new AbortController()
				await Promise.all([ blocker, other ])
				const started_call = pool(() => "ran", late.signal)
				late.abort()
				assert.equal(await started_call, "ran")
				assert.equal(
					await rejection(
						pool(
							() => {
								throw Error("query failed")
							}
						)
					)
						.then(
							error => /** @type {Error} */(error)/**/.message
						),
					"query failed"
				)
				vi.useFakeTimers()
				const quota = limiter(
					{ rate: { count: 2, per: 1000 } }
				)
				/** @type {number[]} */
				const started = []
				const calls = [ 1, 2, 3, 4, 5 ].map(
					id => quota(
						() => {
							started.push(id)
							return id
						}
					)
				)
				await vi.advanceTimersByTimeAsync(0)
				assert.deepEqual(started, [ 1, 2 ])
				await vi.advanceTimersByTimeAsync(999)
				assert.deepEqual(started, [ 1, 2 ])
				await vi.advanceTimersByTimeAsync(1)
				assert.deepEqual(started, [ 1, 2, 3, 4 ])
				await vi.advanceTimersByTimeAsync(1000)
				assert.deepEqual(
					await Promise.all(calls),
					[ 1, 2, 3, 4, 5 ]
				)
				assert.throws(
					() => limiter({ concurrency: 0 }),
					"concurrency"
				)
				assert.throws(
					() => limiter({ rate: { count: 1, per: 0 } }),
					"rate"
				)
				assert.throws(
					() => limiter(
						/** @type {never} */({ concurency: 2 })/**/
					),
					TypeError,
					"Unknown limiter option \"concurency\""
				)
				assert.throws(
					() => limiter(
						/** @type {never} */({ rate: { count: 1, par: 10 } })/**/
					),
					TypeError,
					"Unknown limiter option \"rate.par\""
				)
			}
		)
		it(
			"limiter leases and keys",
			async () => {
				const writer = limiter({ concurrency: 1 })
				const first = await writer.acquire()
				assert.equal(writer.running, 1)
				/** @type {string[]} */
				const order = []
				const second = writer.acquire()
					.then(
						lease => {
							order.push("second")
							return lease
						}
					)
				const call = writer(() => order.push("call"))
				await new Promise(
					resolve => setTimeout(resolve, 5)
				)
				assert.deepEqual(order, [])
				assert.equal(writer.pending, 2)
				first.release()
				first.release()
				const lease = await second
				assert.deepEqual(order, [ "second" ])
				lease.release()
				await call
				assert.deepEqual(order, [ "second", "call" ])
				const blocker = await writer.acquire()
				const controller = new AbortController()
				const waiting = rejection(
					writer.acquire(controller.signal)
				)
				controller.abort()
				assert.instanceOf(await waiting, CancelError)
				blocker.release()
				assert.equal(writer.running, 0)
				const per_user = limiter({ concurrency: 1 })
				/** @type {string[]} */
				const log = []
				/**
				 * @param {string} user
				 * @param {number} ms
				 * @returns {Promise<void>}
				 */
				async function job(user, ms) {
					log.push(`start ${user}`)
					await new Promise(
						resolve => setTimeout(resolve, ms)
					)
					log.push(`end ${user}`)
				}
				const alice = per_user.key("alice")
				await Promise.all(
					[
						alice(() => job("a1", 20)),
						per_user.key("alice")(() => job("a2", 5)),
						per_user.key("bob")(() => job("b1", 5))
					]
				)
				assert.deepEqual(
					log,
					[
						"start a1",
						"start b1",
						"end b1",
						"end a1",
						"start a2",
						"end a2"
					]
				)
				assert.equal(alice.running, 0)
				log.length = 0
				await Promise.all(
					[
						alice(() => job("a3", 10)),
						per_user.key("alice")(() => job("a4", 1))
					]
				)
				assert.deepEqual(
					log,
					[
						"start a3",
						"end a3",
						"start a4",
						"end a4"
					]
				)
				vi.useFakeTimers()
				const quota = limiter(
					{ rate: { count: 1, per: 1000 } }
				)
				/** @type {number[]} */
				const sent = []
				await quota.key("tenant")(() => sent.push(Date.now()))
				await vi.advanceTimersByTimeAsync(10)
				const next = quota.key("tenant")(() => sent.push(Date.now()))
				await vi.advanceTimersByTimeAsync(500)
				assert.lengthOf(sent, 1)
				await vi.advanceTimersByTimeAsync(500)
				await next
				assert.lengthOf(sent, 2)
				assert.isAtLeast(
					/** @type {number} */(sent[1])/**/ - /** @type {number} */(sent[0])/**/,
					1000
				)
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(vi.getTimerCount(), 0)
			}
		)
		it(
			"runs a queued call that the abort of its signal gave a slot, and keeps the calls after it",
			async () => {
				const pool = limiter({ concurrency: 1 })
				const slot = await pool.acquire()
				const controller = new AbortController()
				const holding = rejection(
					attempt(
						({ signal }) => new Promise(
							resolve => signal.addEventListener(
								"abort",
								() => {
									slot.release()
									resolve(null)
								}
							)
						),
						{ signal: controller.signal }
					)
				)
				/** @type {string[]} */
				const order = []
				const queued = pool(
					() => {
						order.push("queued")
						return "ran"
					},
					controller.signal
				)
				const after = pool(
					() => {
						order.push("after")
						return "after"
					}
				)
				await vi.advanceTimersByTimeAsync(0)
				controller.abort()
				assert.instanceOf(await holding, CancelError)
				assert.equal(await queued, "ran")
				assert.equal(await after, "after")
				assert.deepEqual(order, [ "queued", "after" ])
				await vi.advanceTimersByTimeAsync(0)
				assert.equal(pool.running, 0)
			}
		)
	}
)
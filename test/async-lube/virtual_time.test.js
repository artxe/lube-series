import {
	TimeoutError,
	channel,
	debounce,
	every,
	flow,
	http,
	throttle,
	until
} from "async-lube"
import { afterEach, assert, describe, it, vi } from "vitest"
describe(
	"virtual time",
	() => {
		const day = 86400000
		afterEach(() => vi.useRealTimers())
		it(
			"every",
			async () => {
				vi.useFakeTimers()
				/** @type {[number, number][]} */
				const ticks = []
				const started = Date.now()
				const controller = new AbortController()
				const polling = (async () => {
					for await (const tick of every(
						1000,
						{ signal: controller.signal }
					)) {
						ticks.push([ tick, Date.now() - started ])
						if (tick == 2) await new Promise(
							resolve => setTimeout(resolve, 2500)
						)
					}
				})()
				await vi.advanceTimersByTimeAsync(999)
				assert.deepEqual(ticks, [])
				await vi.advanceTimersByTimeAsync(1)
				await vi.advanceTimersByTimeAsync(1000)
				assert.deepEqual(
					ticks,
					[ [ 1, 1000 ], [ 2, 2000 ] ]
				)
				await vi.advanceTimersByTimeAsync(2500)
				assert.deepEqual(ticks.at(-1), [ 3, 4500 ])
				await vi.advanceTimersByTimeAsync(1000)
				assert.deepEqual(ticks.at(-1), [ 4, 5500 ])
				controller.abort()
				await polling
				assert.lengthOf(ticks, 4)
				/** @type {import("async-lube").Channel<void>} */
				const stop = channel()
				/** @type {number[]} */
				const quick = []
				const bounded = (async () => {
					for await (const tick of until(
						every(1000, { immediate: true }),
						stop
					)) quick.push(tick)
				})()
				await vi.advanceTimersByTimeAsync(0)
				assert.deepEqual(quick, [ 1 ])
				await vi.advanceTimersByTimeAsync(500)
				stop.send()
				await vi.advanceTimersByTimeAsync(0)
				await bounded
				assert.equal(vi.getTimerCount(), 0)
				assert.throws(() => every(0), "positive")
			}
		)
		it(
			"flows",
			async () => {
				vi.useFakeTimers()
				let calls = 0
				function poll() {
					calls++
					if (calls < 3) throw Error("pending")
					return calls
				}
				const approve = flow.input("approve")
				const run = flow().add(
					poll,
					{
						retry: { count: 5, delay: day }
					}
				)
					.add(
						approve,
						poll,
						{
							catch: () => "expired",
							timeout: 7 * day
						}
					)
					.run()
				await vi.advanceTimersByTimeAsync(2 * day)
				assert.equal(calls, 3)
				assert.equal(run.nodes["approve"], "waiting")
				await vi.advanceTimersByTimeAsync(7 * day)
				assert.equal(await run, "expired")
				const approval = flow().add(
					approve,
					{
						catch: (
							_error,
							/** @type {import("async-lube").NodeContext} */ { key }
						) => `expired ${JSON.stringify(key)}`,
						timeout: 40 * day
					}
				)
					.run()
				await vi.advanceTimersByTimeAsync(30 * day)
				assert.equal(
					approval.nodes["approve"],
					"waiting"
				)
				await vi.advanceTimersByTimeAsync(10 * day)
				assert.equal(await approval, "expired \"\"")
			}
		)
		it(
			"requests",
			async () => {
				vi.useFakeTimers()
				let sent = 0
				const api = http(
					{
						base: "https://api.test",
						fetch: async () => new Response(
							String(++sent),
							{
								headers: {
									"Content-Type": "application/json"
								}
							}
						)
					}
				)
				const request = api.get(
					"/search",
					{ q: "a" },
					{ debounce: 300 }
				)
				await vi.advanceTimersByTimeAsync(299)
				assert.equal(sent, 0)
				await vi.advanceTimersByTimeAsync(1)
				assert.equal(await request, 1)
				const slow = http(
					{
						base: "https://api.test",
						fetch: (_, init) => new Promise(
							(_resolve, reject) => init?.signal?.addEventListener(
								"abort",
								() => reject(init.signal?.reason)
							)
						),
						timeout: 5000
					}
				)
				const late = slow.get("/slow").safe()
				await vi.advanceTimersByTimeAsync(5000)
				const [ error ] = await late
				assert.instanceOf(error, TimeoutError)
			}
		)
		it(
			"streams",
			async () => {
				vi.useFakeTimers()
				/** @type {import("async-lube").Channel<string>} */
				const typed = channel()
				/** @type {string[]} */
				const quiet = []
				/** @type {string[]} */
				const paced = []
				const reading = Promise.all(
					[
						(async () => {
							for await (const value of debounce(typed, 300)) quiet.push(value)
						})(),
						(async () => {
							for await (const value of throttle(typed, 1000)) paced.push(value)
						})()
					]
				)
				await vi.advanceTimersByTimeAsync(0)
				typed.send("a")
				typed.send("ab")
				await vi.advanceTimersByTimeAsync(299)
				assert.deepEqual(quiet, [])
				assert.deepEqual(paced, [ "a" ])
				await vi.advanceTimersByTimeAsync(1)
				assert.deepEqual(quiet, [ "ab" ])
				await vi.advanceTimersByTimeAsync(700)
				assert.deepEqual(paced, [ "a", "ab" ])
				typed.close()
				await reading
			}
		)
	}
)
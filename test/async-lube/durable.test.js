import {
	CancelError,
	FlowError,
	HttpError,
	NetworkError,
	SocketError,
	TimeoutError
} from "async-lube"
import { dueAt, durable, memory, sqlite } from "async-lube/durable"
import { DatabaseSync } from "node:sqlite"
import { mock } from "node:test"
import { afterEach, assert, describe, it, vi } from "vitest"
describe.each(
	[
		[ "memory", () => memory() ],
		[
			"sqlite",
			() => sqlite(new DatabaseSync(":memory:"))
		]
	]
)(
	"durable with %s",
	(_name, create_store) => {
		/**
		 * @param {import("async-lube").DurableStore} inner
		 * @param {(saved: import("async-lube").SavedRun, write: number) => "after" | "before" | undefined} when
		 * @returns {import("async-lube").DurableStore}
		 */
		function failing(inner, when) {
			let writes = 0
			return {
				due: (now, limit) => inner.due(now, limit),
				get: key => inner.get(key),
				async put(key, saved, expected) {
					const fault = when(saved, ++writes)
					if (fault == "before") throw Error("disk full")
					const written = await inner.put(key, saved, expected)
					if (fault == "after") throw Error("connection reset")
					return written
				}
			}
		}
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
		 * @template T
		 * @param {PromiseLike<T>} promise
		 * @param {number} ms
		 * @returns {Promise<T>}
		 */
		async function settled(promise, ms) {
			const result = Promise.resolve(promise)
			result.catch(() => {})
			await vi.advanceTimersByTimeAsync(ms)
			return result
		}
		/**
		 * @param {number} ms
		 * @returns {Promise<void>}
		 */
		function sleep(ms) {
			return new Promise(
				resolve => setTimeout(resolve, ms)
			)
		}
		/**
		 * @param {() => Promise<void>} body
		 * @returns {Promise<unknown[]>}
		 */
		async function unhandled_in(body) {
			/** @type {unknown[]} */
			const errors = []
			/**
			 * @param {unknown} error
			 * @returns {void}
			 */
			function collect(error) {
				errors.push(error)
			}
			process.on("unhandledRejection", collect)
			try {
				await body()
				await new Promise(
					resolve => process.nextTick(resolve)
				)
			} finally {
				process.off("unhandledRejection", collect)
			}
			return errors
		}
		afterEach(() => vi.useRealTimers())
		it(
			"aborts a run whose lease it cannot renew before the lease ends, before another worker takes it",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				let broken = false
				/** @type {string[]} */
				const events = []
				/**
				 * @param {string} worker
				 * @returns {(input: null, context: import("async-lube").DurableContext) => Promise<string>}
				 */
				function slow(worker) {
					return (_, { step }) => step(
						"slow",
						({ signal }) => new Promise(
							resolve => {
								events.push(`${worker} start`)
								signal.addEventListener(
									"abort",
									() => {
										events.push(`${worker} abort`)
										resolve(worker)
									}
								)
								setTimeout(() => resolve(worker), 5000)
							}
						)
					)
				}
				const first = durable(
					failing(
						inner,
						() => broken ? "before" : void 0
					),
					slow("A"),
					{ lease: 300, owner: "A" }
				)
				const second = durable(
					inner,
					slow("B"),
					{ lease: 300, owner: "B" }
				)
				const errors = await unhandled_in(
					async () => {
						const running = first.run("k", null)
						await vi.advanceTimersByTimeAsync(10)
						broken = true
						void second.serve({ interval: 50 })
						await vi.advanceTimersByTimeAsync(1000)
						broken = false
						assert.deepEqual(
							events,
							[ "A start", "A abort", "B start" ]
						)
						assert.equal(
							await settled(running, 6000),
							"B"
						)
					}
				)
				assert.deepEqual(errors, [])
				first.stop()
				second.stop()
			}
		)
		it(
			"cancels a failed run, so that it never runs again",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let charges = 0
				const job = durable(
					store,
					async (/** @type {null} */ _, { step }) => step(
						"charge",
						() => {
							charges++
							throw RangeError("declined")
						}
					)
				)
				assert.instanceOf(
					await rejection(job.run("k", null)),
					RangeError
				)
				await job.cancel("k", "Given up")
				const saved = await job.get("k")
				assert.equal(saved?.status, "cancelled")
				const error = /** @type {Error} */(await rejection(job.run("k", null)))/**/
				assert.instanceOf(error, CancelError)
				assert.equal(error.message, "Given up")
				assert.instanceOf(
					await rejection(job.join("k")),
					CancelError
				)
				assert.isFalse(await job.start("k", null))
				await job.cancel("k", "Again")
				assert.equal(
					(await job.get("k"))?.version,
					saved?.version
				)
				assert.equal(charges, 1)
				job.stop()
			}
		)
		it(
			"cancels a run in memory and refuses what is sent to it",
			async () => {
				vi.useFakeTimers()
				const job = durable(
					create_store(),
					async (/** @type {null} */ _, { wait }) => wait("a"),
					{ idle: 1000 }
				)
				const done = job.run("k", null)
				await vi.advanceTimersByTimeAsync(10)
				const cancelling = job.cancel("k")
				const sent = job.send("k", "a", "late")
				await cancelling
				assert.instanceOf(
					await rejection(done),
					CancelError
				)
				const error = /** @type {Error} */(await rejection(sent))/**/
				assert.equal(
					error.message,
					"The run \"k\" is cancelled"
				)
				job.stop()
			}
		)
		it(
			"cancels a run in memory when the first write of the cancel fails",
			async () => {
				vi.useFakeTimers()
				let broken = false
				const job = durable(
					failing(
						create_store(),
						saved => {
							if (!broken || saved.status != "cancelled") return void 0
							broken = false
							return "before"
						}
					),
					async (/** @type {null} */ _, { wait }) => wait("a"),
					{ idle: 60000 }
				)
				const running = rejection(job.run("k", null))
				await vi.advanceTimersByTimeAsync(10)
				broken = true
				await job.cancel("k")
				assert.instanceOf(
					await settled(running, 1000),
					CancelError
				)
				assert.equal(
					(await job.get("k"))?.status,
					"cancelled"
				)
				job.stop()
			}
		)
		it(
			"cancels a run that another worker holds with a CancelError as the reason of its signal",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {unknown} */
				let reason
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<null>}
				 */
				function slow(_input, { step }) {
					return step(
						"slow",
						({ signal }) => new Promise(
							resolve => signal.addEventListener(
								"abort",
								() => {
									reason = signal.reason
									resolve(null)
								}
							)
						)
					)
				}
				const holder = durable(
					store,
					slow,
					{ lease: 60, owner: "A" }
				)
				const running = rejection(holder.run("k", null))
				await vi.advanceTimersByTimeAsync(10)
				const other = durable(store, slow, { owner: "B" })
				await other.cancel("k", "Sold elsewhere")
				await vi.advanceTimersByTimeAsync(60)
				assert.instanceOf(reason, CancelError)
				assert.equal(
					/** @type {Error} */(reason)/**/.message,
					"Sold elsewhere"
				)
				assert.instanceOf(await running, CancelError)
				holder.stop()
				other.stop()
			}
		)
		it(
			"delivers a value sent while a waiting run stays in memory for a step",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const job = durable(
					store,
					async (
						/** @type {null} */ _,
						{ step, wait }
					) => {
						const [ approval, exported ] = await Promise.all(
							[
								wait("approval"),
								step(
									"slow export",
									async () => {
										await sleep(1500)
										return "exported"
									}
								)
							]
						)
						return `${approval} ${exported}`
					},
					{ idle: 200 }
				)
				const done = job.run("k", null)
				await vi.advanceTimersByTimeAsync(700)
				await job.send("k", "approval", "yes")
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(await done, "yes exported")
				const saved = await job.get("k")
				assert.equal(saved?.status, "done")
				assert.isUndefined(saved?.events)
				job.stop()
			}
		)
		it(
			"delivers a value sent while the run is being saved to leave memory",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				/** @type {PromiseWithResolvers<void> | undefined} */
				let gate
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due: (now, limit) => inner.due(now, limit),
					get: key => inner.get(key),
					async put(key, saved, expected) {
						if (saved.status == "waiting" && gate) await gate.promise
						return inner.put(key, saved, expected)
					}
				}
				const job = durable(
					store,
					async (/** @type {null} */ _, { wait }) => `${await wait("a")} ${await wait("a")}`,
					{ idle: 100, poll: 10 }
				)
				gate = Promise.withResolvers()
				const done = job.run("k", null)
				await vi.advanceTimersByTimeAsync(150)
				const first = job.send("k", "a", "first")
				await vi.advanceTimersByTimeAsync(10)
				const second = job.send("k", "a", "second")
				await vi.advanceTimersByTimeAsync(10)
				gate.resolve()
				gate = void 0
				await first
				await second
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(await done, "first second")
				job.stop()
			}
		)
		it(
			"delivers events in memory",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {string[]} */
				const log = []
				const gate = Promise.withResolvers()
				const chat = durable(
					store,
					async (
						/** @type {null} */ _input,
						{ step, wait }
					) => {
						await step("greet", () => gate.promise)
						const first = await wait("reply")
						log.push(`first ${first}`)
						const second = await wait("reply")
						log.push(`second ${second}`)
						try {
							await wait("late", { timeout: 20 })
						} catch (error) {
							if (!(error instanceof TimeoutError)) throw error
							log.push("late timed out")
						}
						return "done"
					},
					{ idle: 1000 }
				)
				const done = chat.run("c", null)
				await vi.advanceTimersByTimeAsync(5)
				await chat.send("c", "reply", "early")
				gate.resolve(null)
				await vi.advanceTimersByTimeAsync(5)
				assert.deepEqual(log, [ "first early" ])
				await chat.send("c", "reply", "in memory")
				await vi.advanceTimersByTimeAsync(19)
				assert.deepEqual(
					log,
					[
						"first early",
						"second in memory"
					]
				)
				assert.equal(await settled(done, 1), "done")
				assert.deepEqual(
					log,
					[
						"first early",
						"second in memory",
						"late timed out"
					]
				)
				assert.equal(chat.running, 0)
				chat.stop()
			}
		)
		it(
			"delivers every value sent around the idle boundary once and in order",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const job = durable(
					store,
					async (/** @type {null} */ _, { wait }) => {
						/** @type {unknown[]} */
						const values = []
						for (let index = 0; index < 4; index++) values.push(await wait("a"))
						return values
					},
					{ idle: 100, poll: 10 }
				)
				const serving = job.serve({ interval: 10 })
				for (const offset of [ 0, 50, 99, 100, 101, 102, 110, 200 ]) {
					const key = `k${offset}`
					const done = job.run(key, null)
					await vi.advanceTimersByTimeAsync(offset)
					await job.send(key, "a", 1)
					await job.send(key, "a", 2)
					await vi.advanceTimersByTimeAsync(offset % 7)
					await job.send(key, "a", 3)
					await job.send(key, "a", 4)
					await vi.advanceTimersByTimeAsync(1000)
					assert.deepEqual(
						/** @type {unknown} */(await done)/**/,
						[ 1, 2, 3, 4 ],
						key
					)
					const saved = await job.get(key)
					assert.equal(saved?.status, "done")
					assert.isUndefined(saved?.events)
				}
				job.stop()
				await serving
			}
		)
		it(
			"delivers values sent at once around the idle boundary exactly once",
			async () => {
				vi.useFakeTimers()
				const job = durable(
					create_store(),
					async (/** @type {null} */ _, { wait }) => {
						/** @type {number[]} */
						const values = []
						for (let index = 0; index < 3; index++) values.push(await wait("a"))
						return values
					},
					{ idle: 100, poll: 10 }
				)
				for (const offset of [ 99, 100, 101 ]) {
					const key = `k${offset}`
					const done = job.run(key, null)
					await vi.advanceTimersByTimeAsync(offset)
					await Promise.all(
						[
							job.send(key, "a", 1),
							job.send(key, "a", 2),
							job.send(key, "a", 3)
						]
					)
					await vi.advanceTimersByTimeAsync(1000)
					assert.deepEqual(
						[
							.../** @type {number[]} */(await done)/**/
						].sort(),
						[ 1, 2, 3 ],
						key
					)
				}
				job.stop()
			}
		)
		it(
			"delivers values that another worker sends to a run in memory",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function chat(_input, { wait }) {
					return `${await wait("a")} ${await wait("a")} ${await wait("a")}`
				}
				const first = durable(
					store,
					chat,
					{ idle: 100, poll: 10 }
				)
				const second = durable(
					store,
					chat,
					{ idle: 100, poll: 10 }
				)
				const done = first.run("k", null)
				await vi.advanceTimersByTimeAsync(10)
				await second.send("k", "a", 1)
				await first.send("k", "a", 2)
				await vi.advanceTimersByTimeAsync(150)
				await second.send("k", "a", 3)
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(await done, "1 2 3")
				const saved = await first.get("k")
				assert.equal(saved?.status, "done")
				assert.isUndefined(saved?.events)
				first.stop()
				second.stop()
			}
		)
		it(
			"fails, reruns and cancels",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let broken = true
				let inserts = 0
				const job = durable(
					store,
					async (/** @type {null} */ _, { step }) => {
						await step("insert", () => ++inserts)
						return step(
							"charge",
							() => {
								if (broken) throw TypeError("card declined")
								return "charged"
							}
						)
					}
				)
				const error = /** @type {Error} */(await rejection(job.run("j1", null)))/**/
				assert.equal(error.message, "card declined")
				const saved = await job.get("j1")
				assert.equal(saved?.status, "failed")
				assert.equal(
					saved?.error?.message,
					"card declined"
				)
				broken = false
				assert.equal(
					await job.run("j1", null),
					"charged"
				)
				assert.equal(inserts, 1)
				job.stop()
				const waiter = durable(
					store,
					async (/** @type {null} */ _, { wait }) => wait("never"),
					{ idle: 5 }
				)
				const waiting = waiter.run("j2", null)
				await vi.advanceTimersByTimeAsync(20)
				await waiter.cancel("j2", "Not needed")
				assert.instanceOf(
					await rejection(waiting),
					CancelError
				)
				assert.equal(
					(await waiter.get("j2"))?.status,
					"cancelled"
				)
				assert.instanceOf(
					await rejection(waiter.join("j2")),
					CancelError
				)
				waiter.stop()
			}
		)
		it(
			"finishes a run when a write of the store fails before or after it commits",
			async () => {
				vi.useFakeTimers()
				for (const fault of /** @type {const} */([ "before", "after" ])/**/) {
					for (let broken = 2; broken <= 4; broken++) {
						const inner = create_store()
						const job = durable(
							failing(
								inner,
								(_, write) => write == broken ? fault : void 0
							),
							async (/** @type {null} */ _, { step }) => {
								await step("a", () => 1)
								await step("b", () => 2)
								return "ok"
							}
						)
						const errors = await unhandled_in(
							async () => {
								assert.equal(
									await settled(job.run("k", null), 60000),
									"ok"
								)
							}
						)
						assert.deepEqual(errors, [])
						assert.equal(
							(await inner.get("k"))?.status,
							"done"
						)
						job.stop()
					}
				}
			}
		)
		it(
			"gives a wait in memory a value that another worker sent before its deadline",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function confirm(_input, { wait }) {
					try {
						return `got ${await wait("confirm", { timeout: 1000 })}`
					} catch (error) {
						if (error instanceof TimeoutError) return "timed out"
						throw error
					}
				}
				const holder = durable(
					store,
					confirm,
					{
						idle: 60000,
						owner: "A",
						poll: 5000
					}
				)
				const other = durable(store, confirm, { owner: "B" })
				const outcome = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(700)
				await other.send("k", "confirm", "ok")
				assert.equal(
					await settled(outcome, 5000),
					"got ok"
				)
				holder.stop()
				other.stop()
			}
		)
		it(
			"gives a wait in memory a value that another worker sent before its deadline also when the write that took it failed",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let failed = false
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<unknown>}
				 */
				async function confirm(_input, { wait }) {
					try {
						return await wait("b", { timeout: 10 })
					} catch (error) {
						if (error instanceof TimeoutError) return "timed out"
						throw error
					}
				}
				const holder = durable(
					failing(
						store,
						saved => {
							if (failed || !saved.events?.["a"] || !saved.events["b"]) return void 0
							failed = true
							return "before"
						}
					),
					confirm,
					{
						idle: 60000,
						owner: "A",
						poll: 5000
					}
				)
				const other = durable(store, confirm, { owner: "B" })
				const running = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(1)
				await other.send("k", "b", "sent")
				const error = /** @type {Error} */(await rejection(holder.send("k", "a", "local")))/**/
				assert.equal(error.message, "disk full")
				assert.equal(
					await settled(running, 1000),
					"sent"
				)
				holder.stop()
				other.stop()
			}
		)
		it(
			"gives a wait reached after its deadline a value that another worker sent before it",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const start = Date.now()
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<unknown>}
				 */
				async function late(_input, { step, wait }) {
					await step(
						"slow",
						async () => {
							await sleep(1000)
							return 1
						}
					)
					try {
						return await wait("a", { until: start + 100 })
					} catch (error) {
						if (error instanceof TimeoutError) return "timed out"
						throw error
					}
				}
				/** @type {import("async-lube").DurableStore} */
				const slow = {
					due: (now, limit) => store.due(now, limit),
					get: key => store.get(key),
					async put(key, saved, expected) {
						await sleep(1)
						return store.put(key, saved, expected)
					}
				}
				const holder = durable(
					slow,
					late,
					{
						idle: 60000,
						owner: "A",
						poll: 5000
					}
				)
				const other = durable(store, late, { owner: "B" })
				const outcome = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(50)
				await other.send("k", "a", "early")
				assert.equal(
					await settled(outcome, 2000),
					"early"
				)
				holder.stop()
				other.stop()
			}
		)
		it(
			"gives a waiting run the values queued before a new one",
			async () => {
				const store = create_store()
				await store.put(
					"k",
					{
						events: { a: [ { at: 0, value: "old" } ] },
						input: null,
						journal: [
							{
								done: false,
								name: "a",
								type: "wait"
							}
						],
						status: "waiting",
						version: 1
					},
					void 0
				)
				const job = durable(
					store,
					async (/** @type {null} */ _, { wait }) => `${await wait("a")} ${await wait("a")}`,
					{ poll: 5 }
				)
				const done = job.join("k")
				await job.send("k", "a", "new")
				assert.equal(await done, "old new")
				job.stop()
			}
		)
		it(
			"gives onError of serve the failures of the runs it ran in the background with their keys",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @param {string} input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function nap(input, { sleep: pause, step }) {
					if (!input.startsWith("fast")) await pause("nap", 5000)
					return step(
						"wake",
						({ signal }) => {
							if (input.endsWith("bad")) throw RangeError(`no ${input}`)
							if (input == "gone") {
								return new Promise(
									(_, reject) => signal.addEventListener(
										"abort",
										() => reject(signal.reason)
									)
								)
							}
							return input
						}
					)
				}
				const first = durable(store, nap, { idle: 0 })
				for (const key of [ "bad", "good", "gone" ]) await first.start(key, key)
				await vi.advanceTimersByTimeAsync(10)
				first.stop()
				const second = durable(store, nap)
				/** @type {[unknown, string | undefined][]} */
				const errors = []
				const serving = second.serve(
					{
						interval: 1000,
						onError: (error, key) => void errors.push([ error, key ])
					}
				)
				await vi.advanceTimersByTimeAsync(6000)
				await second.cancel("gone")
				assert.isTrue(
					await second.start("fast", "fast bad")
				)
				await vi.advanceTimersByTimeAsync(10)
				assert.deepEqual(
					errors.map(
						([ error, key ]) => [
							key,
							error instanceof RangeError && error.message
						]
					),
					[
						[ "bad", "no bad" ],
						[ "fast", "no fast bad" ]
					]
				)
				assert.equal(
					(await store.get("good"))?.status,
					"done"
				)
				assert.equal(
					(await store.get("gone"))?.status,
					"cancelled"
				)
				second.stop()
				await serving
			}
		)
		it(
			"gives the function copies of the values that the run keeps",
			async () => {
				vi.useFakeTimers()
				const job = durable(
					create_store(),
					async (
						/** @type {{ tags: string[] }} */ input,
						{ sleep: pause, step, wait }
					) => {
						input.tags.push("changed")
						const list = await step(
							"list",
							() => /** @type {number[]} */([])/**/
						)
						for (let index = 0; index < 3; index++) list.push(
							/** @type {number} */(await wait("n"))/**/
						)
						const bid = /** @type {{ amount: number }} */(await wait("bid"))/**/
						bid.amount *= 2
						await pause("later", 50)
						return {
							bid: bid.amount,
							list,
							tags: input.tags
						}
					},
					{ idle: 10, poll: 10 }
				)
				const input = { tags: [ "a" ] }
				const done = job.run("k", input)
				await job.send("k", "n", 1)
				await vi.advanceTimersByTimeAsync(100)
				await job.send("k", "n", 2)
				await vi.advanceTimersByTimeAsync(100)
				await job.send("k", "n", 3)
				const sent = { amount: 100 }
				await job.send("k", "bid", sent)
				sent.amount = 999
				input.tags.push("caller")
				await vi.advanceTimersByTimeAsync(1000)
				assert.deepEqual(
					await done,
					{
						bid: 200,
						list: [ 1, 2, 3 ],
						tags: [ "a", "changed" ]
					}
				)
				assert.deepEqual(
					(await job.get("k"))?.input,
					{ tags: [ "a" ] }
				)
				job.stop()
			}
		)
		it(
			"joins a run without starting one",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let calls = 0
				const job = durable(
					store,
					async (
						/** @type {{ id: string }} */ lot,
						{ step, wait }
					) => {
						await step(
							"open",
							() => {
								calls++
								if (lot.id == "broken") throw RangeError("no stock")
								return null
							}
						)
						return `${lot.id} ${await wait("close")}`
					},
					{ idle: 10, poll: 10 }
				)
				const missing = /** @type {Error} */(await rejection(job.join("a")))/**/
				assert.equal(
					missing.message,
					"There is no run \"a\""
				)
				assert.isUndefined(await job.get("a"))
				assert.isTrue(
					await job.start("a", { id: "a" })
				)
				assert.isFalse(
					await job.start("a", { id: "other" })
				)
				assert.deepEqual(
					(await job.get("a"))?.input,
					{ id: "a" }
				)
				const joined = job.join("a")
				await vi.advanceTimersByTimeAsync(50)
				await job.send("a", "close", "sold")
				assert.equal(await joined, "a sold")
				await job.send("b", "close", "early")
				assert.isTrue(
					await job.start("b", { id: "b" })
				)
				assert.equal(await job.join("b"), "b early")
				assert.equal(calls, 2)
				await rejection(job.run("c", { id: "broken" }))
				const failed = /** @type {Error} */(await rejection(job.join("c")))/**/
				assert.equal(failed.message, "no stock")
				assert.equal(calls, 3)
				job.stop()
			}
		)
		it(
			"keeps a send to a run in memory at one write",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				let puts = 0
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due: (now, limit) => inner.due(now, limit),
					get: key => inner.get(key),
					put(key, saved, expected) {
						puts++
						return inner.put(key, saved, expected)
					}
				}
				const job = durable(
					store,
					async (
						/** @type {number} */ count,
						{ wait }
					) => {
						let sum = 0
						for (let index = 0; index < count; index++) sum += /** @type {number} */(await wait("bid"))/**/
						return sum
					}
				)
				const done = job.run("k", 200)
				await vi.advanceTimersByTimeAsync(0)
				puts = 0
				for (let index = 0; index < 200; index++) await job.send("k", "bid", 1)
				assert.equal(await done, 200)
				assert.isAtMost(puts, 202)
				job.stop()
			}
		)
		it(
			"keeps the class and the fields of an error when the run runs again after a crash",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const request = { method: "GET", url: "/orders/1" }
				/** @type {(() => Error)[]} */
				const failures = [
					() => new CancelError("Not needed"),
					() => new TimeoutError(250, request),
					() => new HttpError(
						new Response(
							null,
							{
								headers: { "retry-after": "5" },
								status: 429,
								statusText: "Too Many Requests"
							}
						),
						{ message: "slow down", retry: 5 },
						request
					),
					() => Object.assign(
						new HttpError(
							new Response(null, { status: 500 }),
							null,
							request
						),
						{ status: 0 }
					),
					() => new NetworkError(TypeError("offline"), request),
					() => new SocketError(4001, "bye", request),
					() => new FlowError("load", RangeError("no stock")),
					() => SyntaxError("bad json"),
					() => TypeError("not a function"),
					() => RangeError("too far"),
					() => Object.assign(
						Error(
							"declined",
							{ cause: Error("card") }
						),
						{
							code: "E_CARD",
							name: "PaymentError"
						}
					)
				]
				/**
				 * @param {unknown} error
				 * @returns {string}
				 */
				function summary(error) {
					const type = [
						CancelError,
						FlowError,
						HttpError,
						NetworkError,
						SocketError,
						TimeoutError,
						SyntaxError,
						TypeError,
						RangeError,
						Error
					].find(
						candidate => error instanceof candidate
					)
					const fields = /** @type {Error & Record<string, unknown>} */(error)/**/
					const { cause, headers, response } = fields
					return JSON.stringify(
						[
							type?.name,
							fields.name,
							fields.message,
							cause instanceof Error ? [ cause.name, cause.message ] : cause,
							[
								"code",
								"data",
								"node",
								"reason",
								"request",
								"status",
								"statusText",
								"timeout"
							].map(key => fields[key]),
							headers instanceof Headers ? headers.get("retry-after") : void 0,
							response instanceof Response
						]
					)
				}
				let hang = true
				/** @type {string[]} */
				const log = []
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function saga(_input, { step }) {
					for (const [ index, failure ] of failures.entries()) {
						try {
							await step(
								`fail ${index}`,
								() => {
									throw failure()
								}
							)
						} catch (error) {
							log.push(summary(error))
						}
					}
					await step(
						"hang",
						() => hang ? new Promise(() => {}) : null
					)
					return "done"
				}
				const first = durable(store, saga, { lease: 30 })
				void first.run("s", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(20)
				first.stop()
				hang = false
				const second = durable(store, saga, { lease: 30 })
				assert.equal(
					await settled(second.join("s"), 100),
					"done"
				)
				assert.equal(log.length, 2 * failures.length)
				assert.deepEqual(
					log.slice(failures.length),
					log.slice(0, failures.length)
				)
				assert.deepEqual(
					log.slice(0, failures.length).map(
						line => /** @type {unknown[]} */(JSON.parse(line))/**/[0]
					),
					[
						"CancelError",
						"TimeoutError",
						"HttpError",
						"HttpError",
						"NetworkError",
						"SocketError",
						"FlowError",
						"SyntaxError",
						"TypeError",
						"RangeError",
						"Error"
					]
				)
				second.stop()
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function refund(_input, { step }) {
					try {
						return await step(
							"charge",
							() => {
								throw /** @type {() => Error} */(failures[2])/**/()
							}
						)
					} catch (error) {
						await step("undo", () => null)
						throw error
					}
				}
				const payer = durable(store, refund)
				const failed = await rejection(payer.run("r", null))
				payer.stop()
				const restarted = durable(store, refund)
				const replayed = await rejection(restarted.run("r", null))
				const joined = await rejection(restarted.join("r"))
				assert.instanceOf(failed, HttpError)
				assert.instanceOf(replayed, HttpError)
				assert.equal(
					summary(replayed),
					summary(failed)
				)
				assert.equal(summary(joined), summary(failed))
				assert.equal(
					/** @type {HttpError} */(replayed)/**/.response.status,
					429
				)
				restarted.stop()
			}
		)
		it(
			"keeps the values that another worker sends after a write that failed once it committed",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let failed = false
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<unknown[]>}
				 */
				async function collect(_input, { wait }) {
					await wait("go")
					return [
						await wait("b"),
						await wait("b"),
						await wait("b")
					]
				}
				const holder = durable(
					failing(
						store,
						saved => {
							const values = saved.events?.["b"]?.map(event => event.value) ?? []
							if (failed || !values.includes("first") || !values.includes("lost")) return void 0
							failed = true
							return "after"
						}
					),
					collect,
					{ idle: 60000, owner: "A" }
				)
				const other = durable(store, collect, { owner: "B" })
				const running = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(0)
				await other.send("k", "b", "first")
				const error = /** @type {Error} */(await rejection(holder.send("k", "b", "lost")))/**/
				assert.equal(
					error.message,
					"connection reset"
				)
				await other.send("k", "b", "second")
				await holder.send("k", "b", "third")
				await holder.send("k", "go", 1)
				assert.deepEqual(
					await settled(running, 1000),
					[ "first", "second", "third" ]
				)
				holder.stop()
				other.stop()
			}
		)
		it(
			"leaves a run to the worker that holds it when another worker sends to it",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {string[]} */
				const log = []
				/**
				 * @param {string} name
				 * @param {number} lease
				 * @returns {import("async-lube").Durable<null, string>}
				 */
				function worker(name, lease) {
					return durable(
						store,
						async (
							/** @type {null} */ _,
							{ step, wait }
						) => {
							const [ bid ] = await Promise.all(
								[
									wait("bid"),
									step(
										"stream",
										async ({ signal }) => {
											log.push(`${name} start`)
											await sleep(300)
											log.push(
												`${name} ${signal.aborted ? "aborted" : "done"}`
											)
											return 1
										}
									)
								]
							)
							return `${name} ${bid}`
						},
						{
							idle: 60000,
							lease,
							owner: name,
							poll: 10
						}
					)
				}
				const holder = worker("A", 30000)
				const sender = worker("B", 30000)
				const done = holder.run("lot", null)
				await vi.advanceTimersByTimeAsync(50)
				await sender.send("lot", "bid", 7)
				await vi.advanceTimersByTimeAsync(20)
				assert.equal(sender.running, 0)
				await vi.advanceTimersByTimeAsync(400)
				assert.equal(await done, "A 7")
				assert.deepEqual(log, [ "A start", "A done" ])
				assert.equal(
					(await sender.get("lot"))?.status,
					"done"
				)
				log.length = 0
				const crashing = worker("C", 200)
				void crashing.run("next", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(50)
				crashing.stop()
				const taker = worker("D", 200)
				await taker.send("next", "bid", 8)
				assert.equal(taker.running, 0)
				const serving = taker.serve({ interval: 50 })
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(await taker.join("next"), "D 8")
				assert.sameMembers(
					log,
					[
						"C aborted",
						"C start",
						"D done",
						"D start"
					]
				)
				holder.stop()
				sender.stop()
				taker.stop()
				await serving
			}
		)
		it(
			"leaves no timer behind when the function waits after its worker stopped",
			async () => {
				vi.useFakeTimers()
				const job = durable(
					create_store(),
					async (
						/** @type {null} */ _,
						{ step, wait }
					) => {
						await step(
							"slow",
							async () => {
								await sleep(300)
								return 1
							}
						)
						return wait("confirm")
					},
					{ idle: 60000 }
				)
				const running = rejection(job.run("k", null))
				await vi.advanceTimersByTimeAsync(50)
				job.stop()
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(vi.getTimerCount(), 0)
				assert.instanceOf(await running, CancelError)
			}
		)
		it(
			"names the deadline in the TimeoutError of a wait until it, also when the run runs again",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const deadline = Date.now() + 1000
				/**
				 * @param {{ timeout: number, until: number }} input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<unknown>}
				 */
				function bid(input, { wait }) {
					return wait("bid", input)
				}
				const first = durable(store, bid)
				const late = /** @type {Error} */(await rejection(
					settled(
						first.run(
							"a",
							{ timeout: 5000, until: deadline }
						),
						1100
					)
				))/**/
				assert.instanceOf(late, TimeoutError)
				assert.equal(
					late.message,
					`Timed out at ${new Date(deadline).toISOString()}`
				)
				const soon = /** @type {Error} */(await rejection(
					settled(
						first.run(
							"b",
							{
								timeout: 300,
								until: Date.now() + 1000
							}
						),
						400
					)
				))/**/
				assert.equal(
					soon.message,
					"Timed out after 300ms"
				)
				first.stop()
				const second = durable(store, bid)
				const again = /** @type {Error} */(await rejection(
					settled(
						second.run(
							"a",
							{ timeout: 5000, until: deadline }
						),
						10
					)
				))/**/
				assert.instanceOf(again, TimeoutError)
				assert.equal(again.message, late.message)
				second.stop()
			}
		)
		it(
			"never starts a step that the function called just before its worker stopped",
			async () => {
				vi.useFakeTimers()
				/** @type {boolean[]} */
				const aborted = []
				const worker = { stop: () => {} }
				const job = durable(
					create_store(),
					async (/** @type {null} */ _, { step }) => {
						const stepping = step(
							"s",
							({ signal }) => {
								aborted.push(signal.aborted)
								return 1
							}
						)
						worker.stop()
						return stepping
					}
				)
				worker.stop = () => job.stop()
				const running = rejection(job.run("k", null))
				await vi.advanceTimersByTimeAsync(10)
				assert.deepEqual(aborted, [])
				assert.instanceOf(await running, CancelError)
			}
		)
		it(
			"rejects a run whose steps changed",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const before = durable(
					store,
					async (/** @type {null} */ _, { step }) => {
						await step("a", () => 1)
						return step("b", () => new Promise(() => {}))
					},
					{ lease: 30 }
				)
				void before.run("c1", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(10)
				before.stop()
				const after = durable(
					store,
					async (/** @type {null} */ _, { step }) => {
						await step("x", () => 1)
						return 2
					},
					{ lease: 30 }
				)
				const error = /** @type {Error} */(await rejection(
					settled(after.run("c1", null), 100)
				))/**/
				assert.match(error.message, /step 1 was "a"/)
				const migrated = durable(
					store,
					async (/** @type {null} */ _, { step }) => {
						await step("x", () => 1)
						return step("b", () => "migrated")
					},
					{
						lease: 30,
						migrate: saved => ({
							...saved,
							journal: saved.journal.map(
								entry => entry.name == "a" ? { ...entry, name: "x" } : entry
							)
						}),
						revision: 2
					}
				)
				assert.equal(
					await settled(migrated.run("c1", null), 100),
					"migrated"
				)
				after.stop()
				migrated.stop()
			}
		)
		it(
			"rejects a send with the error of the store when it cannot save the value, and delivers none of it",
			async () => {
				vi.useFakeTimers()
				let broken = false
				const job = durable(
					failing(
						create_store(),
						() => broken ? "before" : void 0
					),
					async (/** @type {null} */ _, { wait }) => wait("a"),
					{ idle: 60000 }
				)
				const running = job.run("k", null)
				await vi.advanceTimersByTimeAsync(10)
				broken = true
				const error = /** @type {Error} */(await rejection(job.send("k", "a", "first")))/**/
				broken = false
				assert.equal(error.message, "disk full")
				await job.send("k", "a", "second")
				assert.equal(
					await settled(running, 100),
					"second"
				)
				job.stop()
			}
		)
		it(
			"rejects unknown options and invalid numbers",
			async () => {
				const store = create_store()
				assert.throws(
					() => durable(
						store,
						async () => 1,
						/** @type {never} */({ pol: 10 })/**/
					),
					TypeError,
					"Unknown durable option \"pol\""
				)
				assert.throws(
					() => durable(store, async () => 1, { lease: 0 }),
					TypeError,
					"lease"
				)
				const job = durable(
					store,
					(/** @type {null} */ _, { wait }) => {
						try {
							return wait(
								"approve",
								/** @type {never} */({ timout: 5 })/**/
							)
						} catch {
							return "thrown"
						}
					}
				)
				const error = /** @type {Error} */(await rejection(job.run("o", null)))/**/
				assert.instanceOf(error, TypeError)
				assert.equal(
					error.message,
					"Unknown wait option \"timout\""
				)
				const serving = /** @type {Error} */(await rejection(
					job.serve(
						/** @type {never} */({ intervl: 5 })/**/
					)
				))/**/
				assert.instanceOf(serving, TypeError)
				assert.equal(
					serving.message,
					"Unknown serve option \"intervl\""
				)
				for (const [ serve_options, message ] of /** @type {[Record<string, unknown>, string][]} */([
					[
						{ limit: 5 },
						"Unknown serve option \"limit\""
					],
					[
						{ batch: 0 },
						"The batch of serve() must be a positive integer"
					],
					[
						{ batch: 1.5 },
						"The batch of serve() must be a positive integer"
					],
					[
						{ interval: 0 },
						"The interval of serve() must be a positive number of milliseconds"
					],
					[
						{ interval: Infinity },
						"The interval of serve() must be a positive number of milliseconds"
					],
					[
						{ onError: "log" },
						"The onError of serve() must be a function"
					]
				])/**/) {
					const rejected = /** @type {Error} */(await rejection(
						job.serve(
							/** @type {never} */(serve_options)/**/
						)
					))/**/
					assert.instanceOf(rejected, TypeError)
					assert.equal(rejected.message, message)
				}
				for (const option of [ "lease", "poll" ]) {
					assert.throws(
						() => durable(
							store,
							async () => 1,
							{ [option]: Infinity }
						),
						TypeError,
						option
					)
				}
				/** @type {Record<string, number>} */
				const numbers = {
					infinite: Infinity,
					nan: NaN,
					negative: -1,
					zero: 0
				}
				const sleeper = durable(
					store,
					async (
						/** @type {string} */ name,
						{ sleep: pause }
					) => {
						await pause(
							"nap",
							/** @type {number} */(numbers[name])/**/
						)
						return name
					}
				)
				const waiter = durable(
					store,
					(
						/** @type {string} */ name,
						{ wait }
					) => wait(
						"approve",
						{ timeout: numbers[name] }
					)
				)
				for (const name of [ "infinite", "nan", "negative" ]) {
					const slept = /** @type {Error} */(await rejection(sleeper.run(`s-${name}`, name)))/**/
					assert.instanceOf(slept, TypeError)
					assert.equal(
						slept.message,
						"The ms of sleep() must be a non-negative number of milliseconds"
					)
					const waited = /** @type {Error} */(await rejection(waiter.run(`w-${name}`, name)))/**/
					assert.instanceOf(waited, TypeError)
					assert.equal(
						waited.message,
						"The timeout of wait() must be a non-negative number of milliseconds"
					)
				}
				vi.useFakeTimers()
				assert.equal(
					await settled(
						sleeper.run("s-zero", "zero"),
						10
					),
					"zero"
				)
				assert.instanceOf(
					await rejection(
						settled(waiter.run("w-zero", "zero"), 10)
					),
					TimeoutError
				)
				job.stop()
				sleeper.stop()
				waiter.stop()
			}
		)
		it(
			"rejects values that JSON does not keep",
			async () => {
				const store = create_store()
				/** @type {{ self?: unknown }} */
				const circular = {}
				circular.self = circular
				/** @type {[() => unknown, string][]} */
				const cases = [
					[
						() => new Date(0),
						"an instance of Date"
					],
					[
						() => ({ at: new Map() }),
						"an instance of Map at .at"
					],
					[
						() => [ 1, void 0 ],
						"undefined at [1]"
					],
					[
						() => ({ list: Array(2) }),
						"undefined at .list[0]"
					],
					[
						() => ({ n: 1n }),
						"a BigInt at .n"
					],
					[
						() => ({ total: NaN }),
						"NaN at .total"
					],
					[
						() => [ [ -Infinity ] ],
						"-Infinity at [0][0]"
					],
					[
						() => ({ f() {} }),
						"a function at .f"
					],
					[ () => Symbol("s"), "a symbol" ],
					[
						() => circular,
						"a circular reference at .self"
					],
					[
						() => new class Order {}(),
						"an instance of Order"
					],
					[
						() => Error("e"),
						"an instance of Error"
					]
				]
				const job = durable(
					store,
					async (
						/** @type {number} */ index,
						{ step }
					) => step(
						"value",
						cases[index]?.[0] ?? (() => 1)
					)
				)
				for (const [ index, [ , problem ] ] of cases.entries()) {
					const error = /** @type {Error} */(await rejection(job.run(`v${index}`, index)))/**/
					assert.instanceOf(error, TypeError)
					assert.equal(
						error.message,
						`The result of step "value" of run "v${index}" is not a JSON value: ${problem}`
					)
					assert.equal(
						(await job.get(`v${index}`))?.status,
						"failed"
					)
				}
				const input = /** @type {Error} */(await rejection(
					job.run(
						"input",
						/** @type {never} */(new Date(0))/**/
					)
				))/**/
				assert.instanceOf(input, TypeError)
				assert.equal(
					input.message,
					"The input of run \"input\" is not a JSON value: an instance of Date"
				)
				assert.isUndefined(await job.get("input"))
				for (const [ value, problem ] of /** @type {const} */([
					[ new Set(), "an instance of Set" ],
					[ void 0, "undefined" ]
				])/**/) {
					const sent = /** @type {Error} */(await rejection(
						job.send(
							"sent",
							"approve",
							/** @type {never} */(value)/**/
						)
					))/**/
					assert.instanceOf(sent, TypeError)
					assert.equal(
						sent.message,
						`The value sent to "approve" of run "sent" is not a JSON value: ${problem}`
					)
				}
				assert.isUndefined(await job.get("sent"))
				const result_job = durable(
					store,
					async () => /** @type {never} */(new Set())/**/
				)
				const result = /** @type {Error} */(await rejection(result_job.run("result")))/**/
				assert.instanceOf(result, TypeError)
				assert.equal(
					result.message,
					"The result of run \"result\" is not a JSON value: an instance of Set"
				)
				assert.equal(
					(await result_job.get("result"))?.status,
					"failed"
				)
				job.stop()
				result_job.stop()
			}
		)
		it(
			"replays a finished sleep",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let hang = true
				/** @type {string[]} */
				const log = []
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function nap(_input, { sleep: pause, step }) {
					await pause("nap", 5)
					log.push("after nap")
					await step(
						"hang",
						() => hang ? new Promise(() => {}) : null
					)
					return "woke"
				}
				const first = durable(store, nap, { lease: 30 })
				void first.run("n", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(10)
				assert.deepEqual(log, [ "after nap" ])
				await vi.advanceTimersByTimeAsync(20)
				first.stop()
				hang = false
				const second = durable(
					store,
					nap,
					{ lease: 30, poll: 10 }
				)
				assert.equal(
					await settled(second.join("n"), 100),
					"woke"
				)
				assert.deepEqual(
					log,
					[ "after nap", "after nap" ]
				)
				second.stop()
			}
		)
		it(
			"replays a step failure that the function caught",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let charges = 0
				let hang = true
				/** @type {string[]} */
				const log = []
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function saga(_input, { step }) {
					let paid = true
					try {
						await step(
							"charge",
							() => {
								if (++charges == 1) throw RangeError("card declined")
								return "ok"
							}
						)
					} catch (error) {
						const { message, name } = /** @type {Error} */(error)/**/
						log.push(`${name} ${message}`)
						await step("notify", () => "mailed")
						paid = false
					}
					await step(
						"hang",
						() => hang ? new Promise(() => {}) : null
					)
					return paid ? "shipped" : "declined"
				}
				const first = durable(store, saga, { lease: 30 })
				void first.run("s", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(20)
				first.stop()
				hang = false
				const second = durable(store, saga, { lease: 30 })
				assert.equal(
					await settled(second.join("s"), 100),
					"declined"
				)
				assert.equal(charges, 1)
				assert.deepEqual(
					log,
					[
						"RangeError card declined",
						"RangeError card declined"
					]
				)
				second.stop()
			}
		)
		it(
			"replays finished steps after a crash",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {string[]} */
				const calls = []
				/** @type {string[]} */
				const keys = []
				let hang = true
				/**
				 * @param {{ amount: number }} order
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function checkout(order, { step }) {
					const id = await step(
						"insert",
						() => {
							calls.push("insert")
							return 7
						}
					)
					const paid = await step(
						"charge",
						({ key }) => {
							calls.push("charge")
							keys.push(key)
							return hang ? new Promise(() => {}) : `paid ${order.amount}`
						}
					)
					return `${id} ${paid}`
				}
				const first = durable(store, checkout, { lease: 50 })
				void first.run("order-1", { amount: 5 })
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(20)
				assert.deepEqual(calls, [ "insert", "charge" ])
				first.stop()
				hang = false
				const second = durable(store, checkout, { lease: 50 })
				assert.equal(
					await settled(second.join("order-1"), 100),
					"7 paid 5"
				)
				assert.deepEqual(
					calls,
					[ "insert", "charge", "charge" ]
				)
				assert.equal(keys[0], keys[1])
				assert.equal(
					await second.join("order-1"),
					"7 paid 5"
				)
				assert.lengthOf(calls, 3)
				assert.equal(
					(await second.get("order-1"))?.status,
					"done"
				)
				second.stop()
			}
		)
		it(
			"resumes a run whose save to leave memory threw",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				let failures = 1
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due: (now, limit) => inner.due(now, limit),
					get: key => inner.get(key),
					put(key, saved, expected) {
						if (saved.status == "waiting" && failures-- > 0) throw Error("disk full")
						return inner.put(key, saved, expected)
					}
				}
				const job = durable(
					store,
					async (/** @type {null} */ _, { wait }) => wait("a"),
					{ idle: 100, poll: 10 }
				)
				const done = job.run("k", null)
				await vi.advanceTimersByTimeAsync(500)
				assert.equal(
					(await job.get("k"))?.status,
					"waiting"
				)
				await job.send("k", "a", "yes")
				assert.equal(await done, "yes")
				job.stop()
			}
		)
		it(
			"returns the values that the store keeps after the run left memory",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {unknown[]} */
				const seen = []
				const job = durable(
					store,
					async (
						/** @type {{ tags: string[] }} */ input,
						{ sleep: pause, step }
					) => {
						const value = await step(
							"value",
							() => ({
								empty: Object.assign(Object.create(null), { a: 1 }),
								gone: void 0,
								list: [
									{ n: -1.5, no: false, none: null }
								],
								tags: input.tags
							})
						)
						seen.push(value)
						await pause("a day", 86400000)
						return value
					}
				)
				const done = job.run("k", { tags: [ "a" ] })
				await vi.advanceTimersByTimeAsync(10)
				assert.equal(job.running, 0)
				const serving = job.serve({ interval: 60000 })
				await vi.advanceTimersByTimeAsync(86400000 + 60000)
				const expected = {
					empty: { a: 1 },
					list: [
						{ n: -1.5, no: false, none: null }
					],
					tags: [ "a" ]
				}
				assert.deepEqual(
					/** @type {unknown} */(await done)/**/,
					expected
				)
				assert.lengthOf(seen, 2)
				assert.deepEqual(seen[1], expected)
				assert.notProperty(seen[1], "gone")
				job.stop()
				await serving
			}
		)
		it(
			"runs a failed run again from the step that failed it unless steps ran after its error",
			async () => {
				const store = create_store()
				/** @type {Set<string>} */
				const booked = new Set()
				/** @type {string[]} */
				const calls = []
				const declined = new Set([ "plain", "saga" ])
				const job = durable(
					store,
					async (
						/** @type {boolean} */ compensate,
						{ key, step }
					) => {
						try {
							await step(
								"check",
								() => {
									throw TypeError("no stock")
								}
							)
						} catch {
							await step("log", () => "logged")
						}
						await step(
							"book",
							() => void booked.add(key)
						)
						try {
							return await step(
								"charge",
								() => {
									calls.push(`charge ${key}`)
									if (declined.has(key)) throw TypeError("card declined")
									return "charged"
								}
							)
						} catch (error) {
							if (compensate) {
								await step(
									"cancel",
									() => {
										calls.push(`cancel ${key}`)
										booked.delete(key)
									}
								)
							}
							throw Error("failed", { cause: error })
						}
					}
				)
				for (const [ key, compensate ] of /** @type {const} */([
					[ "plain", false ],
					[ "saga", true ]
				])/**/) {
					const error = /** @type {Error} */(await rejection(job.run(key, compensate)))/**/
					assert.equal(error.message, "failed")
				}
				declined.clear()
				assert.equal(
					await job.run("plain", false),
					"charged"
				)
				assert.deepEqual(
					(await job.get("plain"))?.journal.map(entry => entry.name),
					[ "check", "log", "book", "charge" ]
				)
				for (let count = 0; count < 2; count++) {
					const error = /** @type {Error} */(await rejection(job.run("saga", true)))/**/
					assert.equal(error.message, "failed")
				}
				const saved = await job.get("saga")
				assert.equal(saved?.status, "failed")
				assert.deepEqual(
					saved?.journal.map(entry => entry.name),
					[
						"check",
						"log",
						"book",
						"charge",
						"cancel"
					]
				)
				assert.deepEqual([ ...booked ], [ "plain" ])
				assert.deepEqual(
					calls,
					[
						"charge plain",
						"charge saga",
						"cancel saga",
						"charge plain"
					]
				)
				job.stop()
			}
		)
		it(
			"runs a key once",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				let runs = 0
				/**
				 * @param {number} value
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<number>}
				 */
				function work(value, { step }) {
					return step(
						"work",
						async () => {
							runs++
							await sleep(10)
							return value * 2
						}
					)
				}
				const job = durable(store, work)
				const other = durable(store, work)
				assert.deepEqual(
					await settled(
						Promise.all(
							[
								job.run("a", 2),
								job.run("a", 2),
								other.run("a", 2)
							]
						),
						1000
					),
					[ 4, 4, 4 ]
				)
				assert.equal(runs, 1)
				job.stop()
				other.stop()
			}
		)
		it(
			"runs no step of a function that goes on after its worker stopped, and the worker that takes the run runs it once",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {string[]} */
				const calls = []
				/**
				 * @param {string} worker
				 * @returns {(input: null, context: import("async-lube").DurableContext) => Promise<string>}
				 */
				function checkout(worker) {
					return async (_, { step }) => {
						await step(
							"slow",
							async () => {
								await sleep(300)
								return "ok"
							}
						)
						await step(
							"charge",
							() => {
								calls.push(worker)
								return 1
							}
						)
						return "done"
					}
				}
				const first = durable(
					store,
					checkout("A"),
					{ lease: 100, owner: "A" }
				)
				const second = durable(
					store,
					checkout("B"),
					{ lease: 100, owner: "B", poll: 50 }
				)
				const running = rejection(first.run("k", null))
				await vi.advanceTimersByTimeAsync(50)
				first.stop()
				void second.serve({ interval: 20 })
				await vi.advanceTimersByTimeAsync(1000)
				assert.deepEqual(calls, [ "B" ])
				assert.instanceOf(await running, CancelError)
				assert.equal(
					(await store.get("k"))?.status,
					"done"
				)
				second.stop()
			}
		)
		it(
			"sees the outcome of another worker",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<never>}
				 */
				function slow(_input, { step }) {
					return step(
						"work",
						async () => {
							await sleep(30)
							throw RangeError("out of stock")
						}
					)
				}
				const first = durable(store, slow, { poll: 10 })
				const second = durable(store, slow, { poll: 10 })
				const own = rejection(first.run("s", null))
				await vi.advanceTimersByTimeAsync(5)
				const joined = /** @type {Error} */(await rejection(settled(second.join("s"), 100)))/**/
				assert.equal(joined.name, "RangeError")
				assert.equal(joined.message, "out of stock")
				await own
				const newer = durable(store, slow, { revision: 2 })
				const error = /** @type {Error} */(await rejection(newer.run("s", null)))/**/
				assert.match(
					error.message,
					/revision undefined/
				)
				first.stop()
				second.stop()
				newer.stop()
				assert.instanceOf(
					await rejection(first.join("s")),
					CancelError
				)
				assert.throws(
					() => sqlite(
						/** @type {never} */({})/**/,
						"bad name"
					),
					"identifier"
				)
			}
		)
		it(
			"serves on when the store fails and gives the errors to onError",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				/** @type {string[]} */
				const faults = []
				/** @type {number[]} */
				const batches = []
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due(now, limit) {
						batches.push(limit)
						if (!faults.length) {
							faults.push("due")
							throw Error("due failed")
						}
						return inner.due(now, limit)
					},
					get(key) {
						if (faults.length == 1) {
							faults.push("get")
							throw Error("get failed")
						}
						return inner.get(key)
					},
					put: (key, saved, expected) => inner.put(key, saved, expected)
				}
				/**
				 * @param {null} _input
				 * @param {import("async-lube").DurableContext} context
				 * @returns {Promise<string>}
				 */
				async function nap(_input, { sleep: pause }) {
					await pause("nap", 5000)
					return "woke"
				}
				const first = durable(inner, nap, { idle: 0 })
				await first.start("k", null)
				await vi.advanceTimersByTimeAsync(10)
				first.stop()
				const second = durable(store, nap)
				/** @type {string[]} */
				const errors = []
				const serving = second.serve(
					{
						batch: 7,
						interval: 1000,
						onError: (error, key) => void errors.push(
							`${key ?? "-"} ${/** @type {Error} */(error)/**/.message}`
						)
					}
				)
				await vi.advanceTimersByTimeAsync(8000)
				assert.deepEqual(
					errors,
					[ "- due failed", "k get failed" ]
				)
				assert.deepEqual([ ...new Set(batches) ], [ 7 ])
				assert.equal(
					(await inner.get("k"))?.status,
					"done"
				)
				second.stop()
				await serving
			}
		)
		it(
			"sleeps without memory",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const day = 86400000
				/** @type {string[]} */
				const log = []
				const reminder = durable(
					store,
					async (
						/** @type {string} */ user,
						{ sleep: pause, step }
					) => {
						await step(
							"signup",
							() => log.push(`signed ${user}`)
						)
						await pause("wait a day", day)
						await step(
							"remind",
							() => log.push(`reminded ${user}`)
						)
						return "sent"
					}
				)
				const done = reminder.run("kim", "kim")
				await vi.advanceTimersByTimeAsync(10)
				assert.equal(
					(await reminder.get("kim"))?.status,
					"sleeping"
				)
				assert.equal(reminder.running, 0)
				const serving = reminder.serve({ interval: 60000 })
				await vi.advanceTimersByTimeAsync(day + 60000)
				assert.equal(await done, "sent")
				assert.deepEqual(
					log,
					[ "signed kim", "reminded kim" ]
				)
				reminder.stop()
				await serving
			}
		)
		it(
			"stops a run whose lease is taken",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/** @type {boolean[]} */
				const aborted = []
				const job = durable(
					store,
					async (/** @type {null} */ _, { step }) => {
						await step(
							"slow",
							({ signal }) => new Promise(
								resolve => {
									signal.addEventListener(
										"abort",
										() => {
											aborted.push(true)
											resolve(null)
										}
									)
								}
							)
						)
						return "done"
					},
					{ lease: 60 }
				)
				const running = job.run("k1", null)
				running.catch(() => {})
				await vi.advanceTimersByTimeAsync(10)
				const saved = /** @type {import("async-lube").SavedRun} */(await store.get("k1"))/**/
				await store.put(
					"k1",
					{
						...saved,
						lease: Date.now() + 60000,
						owner: "someone else",
						version: saved.version + 1
					},
					saved.version
				)
				await vi.advanceTimersByTimeAsync(60)
				assert.deepEqual(aborted, [ true ])
				assert.equal(
					(await store.get("k1"))?.owner,
					"someone else"
				)
				job.stop()
			}
		)
		it(
			"takes a value that another worker sent while the run leaves memory",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @param {string} owner
				 * @returns {import("async-lube").Durable<null, string>}
				 */
				function worker(owner) {
					return durable(
						store,
						async (/** @type {null} */ _, { wait }) => `got ${await wait("a")}`,
						{ idle: 100, owner, poll: 60000 }
					)
				}
				const holder = worker("A")
				const sender = worker("B")
				const done = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(50)
				await sender.send("k", "a", "b")
				assert.lengthOf(
					(await store.get("k"))?.inbox ?? [],
					1
				)
				await vi.advanceTimersByTimeAsync(100)
				assert.equal(await done, "got b")
				holder.stop()
				sender.stop()
			}
		)
		it(
			"takes each value that another worker sends once when writes collide",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				let collisions = 2
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due: (now, limit) => inner.due(now, limit),
					get: key => inner.get(key),
					async put(key, saved, expected) {
						if (saved.owner == "A" && expected !== void 0 && !saved.inbox && collisions > 0) await sender.send("k", "a", `b${--collisions}`)
						return inner.put(key, saved, expected)
					}
				}
				/**
				 * @param {string} owner
				 * @returns {import("async-lube").Durable<null, string>}
				 */
				function worker(owner) {
					return durable(
						store,
						async (/** @type {null} */ _, { wait }) => `${await wait("a")} ${await wait("a")} ${await wait("a")}`,
						{ idle: 60000, owner, poll: 10 }
					)
				}
				const holder = worker("A")
				const sender = worker("B")
				const done = holder.run("k", null)
				await vi.advanceTimersByTimeAsync(10)
				await holder.send("k", "a", "a1")
				await vi.advanceTimersByTimeAsync(100)
				assert.equal(await done, "b1 b0 a1")
				holder.stop()
				sender.stop()
			}
		)
		it(
			"tells a caller in the same process without reading the store again and again",
			async () => {
				vi.useFakeTimers()
				const inner = create_store()
				let reads = 0
				/** @type {import("async-lube").DurableStore} */
				const store = {
					due: (now, limit) => inner.due(now, limit),
					get(key) {
						reads++
						return inner.get(key)
					},
					put: (key, saved, expected) => inner.put(key, saved, expected)
				}
				const day = 86400000
				const job = durable(
					store,
					async (
						/** @type {string} */ name,
						{ sleep: pause, wait }
					) => {
						if (name == "nap") {
							await pause("a day", day)
							return "awake"
						}
						return wait("approve")
					},
					{ idle: 10 }
				)
				const napping = job.run("nap", "nap")
				const waiting = job.run("ask", "ask")
				await vi.advanceTimersByTimeAsync(20)
				assert.equal(job.running, 0)
				reads = 0
				await vi.advanceTimersByTimeAsync(day)
				assert.equal(await napping, "awake")
				assert.isBelow(reads, 4000)
				reads = 0
				await job.send("ask", "approve", "yes")
				assert.equal(await waiting, "yes")
				assert.isBelow(reads, 5)
				const other = durable(store, async () => "never")
				const joined = other.run("ask")
				assert.equal(await joined, "yes")
				job.stop()
				other.stop()
			}
		)
		it(
			"tells when a run is due",
			() => {
				/** @type {import("async-lube").SavedRun} */
				const base = {
					input: null,
					journal: [],
					status: "running",
					version: 1
				}
				assert.equal(dueAt(base), 0)
				assert.equal(
					dueAt(
						{ ...base, lease: 500, owner: "a" }
					),
					500
				)
				assert.equal(
					dueAt(
						{
							...base,
							status: "sleeping",
							wake: 900
						}
					),
					900
				)
				assert.equal(
					dueAt({ ...base, status: "waiting" }),
					void 0
				)
				assert.equal(
					dueAt({ ...base, status: "done" }),
					void 0
				)
				assert.equal(
					dueAt({ ...base, status: "pending" }),
					void 0
				)
			}
		)
		it(
			"times out a wait at its deadline when a value arrives after it",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				/**
				 * @returns {import("async-lube").Durable<null, string>}
				 */
				function worker() {
					return durable(
						store,
						async (/** @type {null} */ _, { wait }) => {
							const first = await wait("bid", { timeout: 200 })
								.catch(
									error => error instanceof TimeoutError ? "timed out" : Promise.reject(error)
								)
							return `${first} ${await wait("bid")}`
						},
						{ idle: 10, poll: 10 }
					)
				}
				const first = worker()
				void first.run("k", null)
					.catch(() => {})
				await vi.advanceTimersByTimeAsync(50)
				first.stop()
				await vi.advanceTimersByTimeAsync(550)
				const second = worker()
				await second.send("k", "bid", "late")
				const joined = second.join("k")
				await vi.advanceTimersByTimeAsync(100)
				assert.equal(await joined, "timed out late")
				second.stop()
			}
		)
		it(
			"times out a wait while the run stays in memory for a step",
			async () => {
				vi.useFakeTimers()
				const start = Date.now()
				const job = durable(
					create_store(),
					async (
						/** @type {null} */ _,
						{ step, wait }
					) => {
						const [ answer ] = await Promise.all(
							[
								wait("approval", { timeout: 300 })
									.catch(
										() => `expired at ${Date.now() - start}`
									),
								step("slow", () => sleep(1000))
							]
						)
						return answer
					},
					{ idle: 100 }
				)
				const done = job.run("k", null)
				await vi.advanceTimersByTimeAsync(1000)
				assert.equal(await done, "expired at 300")
				job.stop()
			}
		)
		it(
			"waits again in a run that failed by its timeout",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const approval = durable(
					store,
					async (
						/** @type {null} */ _,
						{ step, wait }
					) => {
						const asked = await step("ask", () => "asked")
						const answer = await wait("approve", { timeout: 20 })
						return `${asked} ${answer}`
					}
				)
				assert.instanceOf(
					await rejection(
						settled(approval.run("t", null), 20)
					),
					TimeoutError
				)
				await approval.send("t", "approve", "late")
				assert.equal(
					(await approval.get("t"))?.status,
					"failed"
				)
				assert.equal(
					await approval.run("t", null),
					"asked late"
				)
				assert.instanceOf(
					await rejection(
						settled(approval.run("u", null), 20)
					),
					TimeoutError
				)
				const again = approval.run("u", null)
				await vi.advanceTimersByTimeAsync(19)
				await approval.send("u", "approve", "now")
				assert.equal(await again, "asked now")
				approval.stop()
			}
		)
		it(
			"waits for events",
			async () => {
				vi.useFakeTimers()
				const store = create_store()
				const refund = durable(
					store,
					async (
						/** @type {string} */ order,
						{ step, wait }
					) => {
						try {
							const answer = await wait("approve", { timeout: 200 })
							return await step(
								"refund",
								() => `${answer} ${order}`
							)
						} catch (error) {
							if (error instanceof TimeoutError) return `expired ${order}`
							throw error
						}
					},
					{ idle: 10 }
				)
				const approved = refund.run("r1", "o1")
				await vi.advanceTimersByTimeAsync(30)
				assert.equal(
					(await refund.get("r1"))?.status,
					"waiting"
				)
				await refund.send("r1", "approve", "yes")
				assert.equal(
					await settled(approved, 10),
					"yes o1"
				)
				await refund.send("r2", "approve", "early")
				assert.equal(
					await settled(refund.run("r2", "o2"), 10),
					"early o2"
				)
				const expired = refund.run("r3", "o3")
				const serving = refund.serve({ interval: 20 })
				assert.equal(
					await settled(expired, 250),
					"expired o3"
				)
				refund.stop()
				await serving
				assert.instanceOf(
					await rejection(
						refund.send("r1", "approve", "again")
					),
					Error
				)
			}
		)
		it(
			"waits until a time",
			async () => {
				vi.useFakeTimers()
				const start = Date.now()
				const job = durable(
					create_store(),
					async (
						/** @type {{ timeout?: number, until: number }} */ input,
						{ wait }
					) => {
						try {
							return await wait("bid", input)
						} catch (error) {
							if (error instanceof TimeoutError) return Date.now() - start
							throw error
						}
					},
					{ idle: 10, poll: 10 }
				)
				const closing = job.run("a", { until: start + 1000 })
				const sold = job.run("b", { until: start + 1000 })
				const sooner = job.run(
					"c",
					{
						timeout: 300,
						until: start + 1000
					}
				)
				await vi.advanceTimersByTimeAsync(100)
				await job.send("b", "bid", "sold")
				await vi.advanceTimersByTimeAsync(2000)
				const closed = /** @type {number} */(await closing)/**/
				assert.isAtLeast(closed, 1000)
				assert.isBelow(closed, 1100)
				assert.equal(await sold, "sold")
				assert.isBelow(
					/** @type {number} */(await sooner)/**/,
					1000
				)
				const error = await rejection(
					job.run("d", { until: Number.NaN })
				)
				assert.instanceOf(error, TypeError)
				job.stop()
			}
		)
	}
)
describe(
	"durable with the mock timers of node:test",
	() => {
		afterEach(() => mock.timers.reset())
		it(
			"runs days in an instant when the promises run between small ticks",
			async () => {
				mock.timers.enable(
					{
						apis: [
							"setTimeout",
							"setInterval",
							"Date"
						]
					}
				)
				/**
				 * @param {number} ms
				 * @param {number=} step
				 * @returns {Promise<void>}
				 */
				async function advance(ms, step = 60000) {
					const end = Date.now() + ms
					while (Date.now() < end) {
						await flush()
						mock.timers.tick(
							Math.min(step, end - Date.now())
						)
					}
					await flush()
				}
				/**
				 * @returns {Promise<void>}
				 */
				function flush() {
					return new Promise(
						resolve => setImmediate(resolve)
					)
				}
				/**
				 * @param {number} ms
				 * @returns {Promise<void>}
				 */
				function pause(ms) {
					return new Promise(
						resolve => setTimeout(resolve, ms)
					)
				}
				const day = 86400000
				const job = durable(
					memory(),
					async (
						/** @type {string} */ id,
						{ step, wait }
					) => {
						await step(
							"fetch",
							async () => {
								await pause(50)
								await pause(50)
								return id
							}
						)
						try {
							return await wait("approve", { timeout: 3 * day })
						} catch (error) {
							if (error instanceof TimeoutError) return "expired"
							throw error
						}
					}
				)
				const start = Date.now()
				const expiring = job.run("a", "a")
				const approved = job.run("b", "b")
				await advance(2000, 10)
				assert.equal(
					(await job.get("a"))?.status,
					"waiting"
				)
				await job.send("b", "approve", "yes")
				assert.equal(await approved, "yes")
				await advance(3 * day)
				assert.equal(await expiring, "expired")
				assert.equal(
					Date.now() - start,
					3 * day + 2000
				)
				job.stop()
			}
		)
	}
)
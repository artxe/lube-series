/** @import { NodeContext as Context } from "async-lube" */
import {
	FlowError,
	channel,
	flow,
	limiter,
	until
} from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"flow recovery",
	() => {
		/**
		 * @param {number} ms
		 * @returns {Promise<void>}
		 */
		function pause(ms) {
			return new Promise(
				resolve => setTimeout(resolve, ms)
			)
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
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"a condition on a resource opens none, and cancel ends a stream after the run",
			async () => {
				/** @type {string[]} */
				const log = []
				function begin() {
					log.push("begin")
					return { id: 1 }
				}
				function check() {
					return false
				}
				function insert(
					/** @type {{ id: number }} */ tx
				) {
					log.push("insert")
					return tx.id
				}
				const run = flow()
					.add(check)
					.add(
						begin,
						check,
						{
							release: () => void log.push("release"),
							when: ok => ok
						}
					)
					.add(insert, begin)
					.run()
				await run
				assert.deepEqual(log, [])
				assert.equal(run.nodes["insert"], "skipped")
				function count() {
					return 1
				}
				const counted = flow().add(count)
					.run()
				const stream = counted.stream(count)
				counted.then(
					() => counted.cancel(),
					() => counted.cancel()
				)
				/** @type {number[]} */
				const values = []
				for await (const value of stream) values.push(value)
				assert.deepEqual(values, [ 1 ])
			}
		)
		it(
			"a failed queue update reruns with its arguments and key before the updates behind it",
			async () => {
				const value = flow.input("value")
				/** @type {string[]} */
				const calls = []
				/** @type {Set<unknown>} */
				const failing = new Set()
				async function write(
					/** @type {unknown} */ n,
					/** @type {Context} */ { key, sleep }
				) {
					calls.push(n + " " + key)
					await sleep(5)
					if (failing.delete(n)) throw Error("down " + n)
					return n
				}
				/** @type {[string, () => import("async-lube").Flow<unknown, unknown>][]} */
				const kinds = [
					[
						"overlap",
						() => flow().add(
							write,
							value,
							{ name: "w", overlap: "queue" }
						)
					],
					[
						"flow.queue",
						() => flow().add(
							write,
							flow.queue(value),
							{ name: "w" }
						)
					]
				]
				for (const [ kind, build ] of kinds) {
					calls.length = 0
					failing.add(2)
					const run = build().run(void 0, { id: "r" })
					for (const n of [ 1, 2, 3 ]) run.send(value, n)
					await rejection(run)
					assert.equal(run.pending("w"), 2, kind)
					const saved = JSON.parse(JSON.stringify(run.snapshot()))
					run.retry()
					assert.equal(await run, 3, kind)
					assert.deepEqual(
						calls,
						[
							"1 r:w:1",
							"2 r:w:2",
							"2 r:w:2",
							"3 r:w:3"
						],
						kind
					)
					calls.length = 0
					const resumed = build().run(void 0, { snapshot: saved })
					assert.equal(await resumed, 3, kind)
					assert.deepEqual(
						calls,
						[ "2 r:w:2", "3 r:w:3" ],
						kind
					)
					calls.length = 0
					failing.add(2)
					const sent = build().run(void 0, { id: "r" })
					for (const n of [ 1, 2, 3 ]) sent.send(value, n)
					await rejection(sent)
					sent.send(value, 4)
					assert.equal(await sent, 4, kind)
					assert.deepEqual(
						calls,
						[
							"1 r:w:1",
							"2 r:w:2",
							"2 r:w:2",
							"3 r:w:3",
							"4 r:w:4"
						],
						kind
					)
				}
				calls.length = 0
				failing.add(2)
				/** @type {unknown[]} */
				const results = []
				const caught = flow().add(
					write,
					flow.queue(value),
					{ catch: () => -2, name: "w" }
				)
					.add(
						(/** @type {unknown} */ result) => results.push(result),
						flow.queue(write),
						{ name: "log" }
					)
					.run(void 0, { id: "r" })
				for (const n of [ 1, 2, 3 ]) caught.send(value, n)
				assert.equal(await caught, 3)
				assert.deepEqual(results, [ 1, -2, 3 ])
				assert.deepEqual(
					calls,
					[ "1 r:w:1", "2 r:w:2", "3 r:w:3" ]
				)
				calls.length = 0
				failing.add(2)
				const optional = flow().add(
					write,
					value,
					{
						name: "w",
						optional: true,
						overlap: "queue"
					}
				)
					.run(void 0, { id: "r" })
				for (const n of [ 1, 2, 3 ]) optional.send(value, n)
				assert.equal(await optional, 3)
				optional.retry()
				assert.equal(await optional, 3)
				assert.deepEqual(
					calls,
					[ "1 r:w:1", "2 r:w:2", "3 r:w:3" ]
				)
				calls.length = 0
				let rejected = true
				function check(/** @type {unknown} */ n) {
					if (n == 2 && rejected) throw Error("rejected")
					return n
				}
				const other = flow().add(
					write,
					value,
					{ name: "w", overlap: "queue" }
				)
					.add(check, value, { name: "check" })
					.run(void 0, { id: "r" })
				other.send(value, 1)
				other.send(value, 2)
				await rejection(other)
				assert.equal(other.pending("w"), 2)
				rejected = false
				other.retry()
				await other
				assert.deepEqual(
					calls,
					[ "1 r:w:1", "1 r:w:1", "2 r:w:2" ]
				)
			}
		)
		it(
			"a failure in a cycle that a stream starts is not unhandled when the run is caught, subscribed or idle is awaited",
			async () => {
				/** @type {unknown[]} */
				const unhandled = []
				/**
				 * @param {unknown} error
				 * @returns {void}
				 */
				function collect(error) {
					unhandled.push(error)
				}
				process.on("unhandledRejection", collect)
				try {
					for (const watch of [ "catch", "idle", "subscribe" ]) {
						const alarms = channel()
						function handle(/** @type {unknown} */ n) {
							if (n == 2) throw Error("alarm " + n)
							return n
						}
						const run = flow().add(alarms, { name: "alarms" })
							.add(handle, flow.queue(alarms))
							.run()
						if (watch == "catch") run.catch(() => {})
						else if (watch == "idle") void run.idle()
						else run.subscribe(() => {})
						alarms.send(1)
						await pause(10)
						assert.equal(run.status, "done", watch)
						alarms.send(2)
						await pause(10)
						assert.equal(run.status, "failed", watch)
						run.cancel()
					}
					await pause(10)
				} finally {
					process.off("unhandledRejection", collect)
				}
				assert.deepEqual(unhandled, [])
			}
		)
		it(
			"a failure is not unhandled once the run is subscribed or idle is awaited",
			async () => {
				/** @type {unknown[]} */
				const unhandled = []
				/**
				 * @param {unknown} error
				 * @returns {void}
				 */
				function collect(error) {
					unhandled.push(error)
				}
				process.on("unhandledRejection", collect)
				try {
					let fails = true
					function work() {
						if (fails) throw Error("down")
						return "up"
					}
					const code = flow.input("code")
					for (const watch of [ "idle", "subscribe" ]) {
						fails = true
						const run = flow().add(code)
							.add(work, code)
							.run()
						if (watch == "idle") await run.idle()
						else run.subscribe(() => {})
						run.send(code, 1)
						await pause(10)
						assert.equal(run.status, "failed", watch)
						run.send(code, 2)
						await pause(10)
						assert.equal(run.status, "failed", watch)
						fails = false
						run.retry()
						assert.equal(await run, "up")
					}
					await pause(10)
				} finally {
					process.off("unhandledRejection", collect)
				}
				assert.deepEqual(unhandled, [])
			}
		)
		it(
			"a node that runs for arguments that changed before a snapshot gets a new key after resume",
			async () => {
				/** @type {string[]} */
				const log = []
				const coupon = flow.input("coupon")
				async function charge(
					/** @type {unknown} */ q,
					/** @type {Context} */ { key, sleep }
				) {
					log.push(q + " " + key)
					await sleep(50)
					return "receipt " + q
				}
				async function quote(
					/** @type {unknown} */ code,
					/** @type {Context} */ { sleep }
				) {
					await sleep(20)
					return "quote " + code
				}
				const definition = flow().add(coupon)
					.add(quote, coupon)
					.add(charge, quote)
				for (const resume of [ false, true ]) {
					log.length = 0
					let run = definition.run(void 0, { id: "order" })
					run.send(coupon, "A")
					await pause(30)
					run.send(coupon, "B")
					await pause(5)
					if (resume) {
						const saved = JSON.parse(JSON.stringify(run.snapshot()))
						run.cancel()
						run.catch(() => {})
						run = definition.run(void 0, { snapshot: saved })
					}
					assert.equal(await run, "receipt quote B")
					assert.deepEqual(
						log,
						[
							"quote A order:charge:1",
							"quote B order:charge:2"
						]
					)
				}
			}
		)
		it(
			"a resource keeps its key after resume",
			async () => {
				/** @type {string[]} */
				const keys = []
				async function notify(/** @type {unknown} */ shipped) {
					await pause(50)
					return shipped
				}
				function reserve(/** @type {Context} */ { key }) {
					keys.push(key)
					return { id: key }
				}
				function ship(
					/** @type {{ id: string }} */ reservation
				) {
					return reservation.id + " shipped"
				}
				const definition = flow().add(reserve, { release: () => {} })
					.add(ship, reserve)
					.add(notify, ship)
				const run = definition.run(void 0, { id: "w" })
				await pause(10)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				run.catch(() => {})
				assert.equal(
					await definition.run(void 0, { snapshot: saved }),
					"w:reserve:1 shipped"
				)
				assert.deepEqual(
					keys,
					[ "w:reserve:1", "w:reserve:1" ]
				)
			}
		)
		it(
			"a resource that arrives in the tick another node fails is released",
			async () => {
				/** @type {string[]} */
				const released = []
				async function fail() {
					throw Error("boom")
				}
				async function open() {
					return { id: 1 }
				}
				function use(
					/** @type {{ id: number }} */ tx
				) {
					return tx.id
				}
				const run = flow()
					.add(fail)
					.add(
						open,
						{
							release: (_, error) => void released.push(
								/** @type {Error} */(error)/**/.name
							)
						}
					)
					.add(use, open)
					.run()
				await rejection(run)
				await pause(1)
				assert.deepEqual(released, [ "CancelError" ])
				assert.equal(run.nodes["open"], "cancelled")
			}
		)
		it(
			"a resumed queue runs the update that arrives after its dependency ran again",
			async () => {
				/** @type {unknown[]} */
				const handled = []
				const message = flow.input("message")
				let version = 0
				async function handle(
					/** @type {unknown} */ value,
					/** @type {Context} */ { sleep }
				) {
					await sleep(20)
					handled.push(value)
					return value
				}
				async function source() {
					await pause(5)
					return ++version
				}
				function tag(
					/** @type {unknown} */ n,
					/** @type {unknown} */ m
				) {
					return m + " " + n
				}
				const definition = flow().add(source)
					.add(message)
					.add(tag, source, message)
					.add(handle, tag, { overlap: "queue" })
				const run = definition.run()
				run.send(message, "a")
				await pause(10)
				run.reload(source)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				run.catch(() => {})
				const resumed = definition.run(void 0, { snapshot: saved })
				assert.equal(await resumed, "a 2")
				assert.deepEqual(handled, [ "a 1", "a 2" ])
			}
		)
		it(
			"a resumed queue update leaves the finished nodes after it alone",
			async () => {
				/** @type {string[]} */
				const calls = []
				const extra = flow.input("extra")
				function first(/** @type {unknown} */ tx) {
					calls.push("first " + tx)
					return "first " + tx
				}
				async function open(/** @type {Context} */ { key }) {
					calls.push("open " + key)
					await pause(10)
					return key
				}
				function second(
					/** @type {unknown} */ tx,
					/** @type {unknown} */ value
				) {
					return "second " + tx + " " + value
				}
				const definition = flow().add(
					open,
					{
						overlap: "queue",
						release: () => {}
					}
				)
					.add(first, open)
					.add(second, open, extra)
				const run = definition.run(void 0, { id: "r" })
				run.send(extra, 1)
				assert.equal(await run, "second r:open:1 1")
				run.send(extra, 2)
				await pause(5)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				run.catch(() => {})
				const resumed = definition.run(void 0, { snapshot: saved })
				assert.equal(
					await resumed,
					"second r:open:2 2"
				)
				assert.equal(
					resumed.get(first),
					"first r:open:1"
				)
				assert.deepEqual(
					calls,
					[
						"open r:open:1",
						"first r:open:1",
						"open r:open:2",
						"open r:open:2"
					]
				)
			}
		)
		it(
			"a resumed queue update that cancel drops takes its key along",
			async () => {
				/** @type {string[]} */
				const calls = []
				const message = flow.input("message")
				let version = 0
				async function handle(
					/** @type {unknown} */ value,
					/** @type {Context} */ { key, sleep }
				) {
					calls.push(value + " " + key)
					await sleep(20)
					return value
				}
				async function source() {
					await pause(5)
					return ++version
				}
				function tag(
					/** @type {unknown} */ n,
					/** @type {unknown} */ m
				) {
					return m + " " + n
				}
				const definition = flow().add(source)
					.add(message)
					.add(tag, source, message)
					.add(handle, tag, { overlap: "queue" })
				const run = definition.run(void 0, { id: "r" })
				run.send(message, "a")
				await pause(10)
				run.reload(source)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				run.catch(() => {})
				const cancelled = definition.run(void 0, { snapshot: saved })
				cancelled.cancel()
				cancelled.catch(() => {})
				const again = JSON.parse(
					JSON.stringify(cancelled.snapshot())
				)
				assert.equal(
					await definition.run(void 0, { snapshot: again }),
					"a 2"
				)
				assert.deepEqual(
					calls,
					[
						"a 1 r:handle:1",
						"a 2 r:handle:2"
					]
				)
			}
		)
		it(
			"a resumed run that is done opens no resource that only a resource needs",
			async () => {
				let opened = 0
				function begin(
					/** @type {unknown} */ connection
				) {
					opened++
					return connection + " tx"
				}
				function connect() {
					opened++
					return "connection"
				}
				function insert(/** @type {unknown} */ tx) {
					return "insert in " + tx
				}
				const definition = flow().add(connect, { release: () => {} })
					.add(
						begin,
						connect,
						{ release: () => {} }
					)
					.add(insert, begin)
				const run = definition.run()
				assert.equal(
					await run,
					"insert in connection tx"
				)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				assert.equal(
					await definition.run(void 0, { snapshot: saved }),
					"insert in connection tx"
				)
				assert.equal(opened, 2)
			}
		)
		it(
			"a snapshot redoes every node after an uncommitted resource",
			async () => {
				let opened = 0
				function begin() {
					return { id: ++opened }
				}
				function end(
					/** @type {unknown} */ sent,
					/** @type {unknown} */ waited
				) {
					return sent + " " + waited
				}
				function insert(
					/** @type {{ id: number }} */ tx
				) {
					return "row " + tx.id
				}
				function notify(/** @type {unknown} */ row) {
					return "sent " + row
				}
				async function slow() {
					await pause(20)
					return "slow"
				}
				const definition = flow().add(begin, { release: () => {} })
					.add(insert, begin)
					.add(notify, insert)
					.add(slow)
					.add(end, notify, slow)
				const run = definition.run()
				await pause(5)
				assert.equal(run.get(notify), "sent row 1")
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				run.catch(() => {})
				const resumed = definition.run(void 0, { snapshot: saved })
				assert.equal(await resumed, "sent row 2 slow")
				assert.equal(resumed.get(insert), "row 2")
			}
		)
		it(
			"a stream is handled until a value of another stream arrives",
			async () => {
				const bids = channel()
				const end = channel()
				const bidding = until(bids, end)
				/** @type {unknown[]} */
				const handled = []
				function close(
					/** @type {unknown} */ last,
					/** @type {unknown} */ ended
				) {
					return ended + " after " + last
				}
				async function handle(
					/** @type {unknown} */ bid,
					/** @type {Context} */ { sleep }
				) {
					await sleep(5)
					handled.push(bid)
					return bid
				}
				const auction = flow().add(bidding, { name: "bids" })
					.add(handle, flow.queue(bidding))
					.add(end, { name: "end" })
					.add(close, handle, end)
				assert.deepEqual(auction.check(), [])
				const run = auction.run()
				await pause(1)
				bids.send(1)
				bids.send(2)
				await pause(1)
				end.send("closed")
				await pause(1)
				bids.send(3)
				assert.equal(await run, "closed after 2")
				assert.deepEqual(handled, [ 1, 2 ])
				run.cancel()
			}
		)
		it(
			"nodes of a sub-flow item get the index of the item",
			async () => {
				/** @type {(number | undefined)[]} */
				const indexes = []
				function read(
					/** @type {Context} */ { index }
				) {
					indexes.push(index)
				}
				const inner = flow().add(read)
				const item = flow().add(read)
					.add(inner, { name: "inner" })
				await flow().add(
					flow.each(item),
					{ name: "items" }
				)
					.run([ "a", "b" ])
				assert.deepEqual(indexes.sort(), [ 0, 0, 1, 1 ])
				indexes.length = 0
				await flow().add(read)
					.run()
				assert.deepEqual(indexes, [ void 0 ])
			}
		)
		it(
			"queue keys belong to one update through cancel, limit and retry",
			async () => {
				const message = flow.input("message")
				/** @type {string[]} */
				const calls = []
				/** @type {Set<unknown>} */
				const failing = new Set()
				async function handle(
					/** @type {unknown} */ m,
					/** @type {Context} */ { key, sleep }
				) {
					calls.push(
						m + " " + key.slice(key.lastIndexOf(":") + 1)
					)
					await sleep(30)
					if (failing.delete(m)) throw Error("down " + m)
					return m
				}
				const cancelled = flow().add(
					handle,
					message,
					{ overlap: "queue" }
				)
					.run()
				cancelled.send(message, "a")
				await pause(10)
				cancelled.send(message, "b")
				cancelled.cancel()
				cancelled.catch(() => {})
				cancelled.retry()
				assert.equal(await cancelled, "b")
				assert.deepEqual(calls, [ "a 1", "b 2" ])
				/** @type {[string, () => import("async-lube").Flow<unknown, unknown>][]} */
				const limited = [
					[
						"overlap",
						() => flow().add(
							handle,
							message,
							{ limit: 1, overlap: "queue" }
						)
					],
					[
						"flow.queue",
						() => flow().add(
							handle,
							flow.queue(message),
							{ limit: 1 }
						)
					]
				]
				for (const [ kind, build ] of limited) {
					calls.length = 0
					failing.add("a")
					const run = build().run()
					run.send(message, "a")
					await rejection(run)
					run.send(message, "b")
					run.send(message, "c")
					assert.equal(await run, "c", kind)
					assert.deepEqual(
						calls,
						[ "a 1", "a 1", "c 2" ],
						kind
					)
				}
				/** @type {[string, () => import("async-lube").Flow<unknown, unknown>][]} */
				const optional = [
					[
						"overlap",
						() => flow().add(
							handle,
							message,
							{ optional: true, overlap: "queue" }
						)
					],
					[
						"flow.queue",
						() => flow().add(
							handle,
							flow.queue(message),
							{ optional: true }
						)
					]
				]
				for (const [ kind, build ] of optional) {
					for (const resume of [ false, true ]) {
						calls.length = 0
						failing.add("b")
						const definition = build()
						const failed = definition.run(void 0, { id: "r" })
						failed.send(message, "a")
						failed.send(message, "b")
						await failed
						const run = resume
							? definition.run(
								void 0,
								{
									snapshot: JSON.parse(
										JSON.stringify(failed.snapshot())
									)
								}
							)
							: failed
						assert.equal(
							run.nodes["handle"],
							"failed",
							kind
						)
						run.retry()
						assert.equal(await run, "b", kind)
						run.send(message, "c")
						assert.equal(await run, "c", kind)
						assert.deepEqual(
							calls,
							[ "a 1", "b 2", "b 2", "c 3" ],
							kind + " " + resume
						)
						calls.length = 0
						failing.add("b")
						const skipped = definition.run(void 0, { id: "r" })
						skipped.send(message, "a")
						skipped.send(message, "b")
						await skipped
						const next = resume
							? definition.run(
								void 0,
								{
									snapshot: JSON.parse(
										JSON.stringify(skipped.snapshot())
									)
								}
							)
							: skipped
						next.send(message, "c")
						assert.equal(await next, "c", kind)
						assert.equal(next.pending("handle"), 0, kind)
						assert.deepEqual(
							calls,
							[ "a 1", "b 2", "c 3" ],
							kind + " " + resume
						)
					}
				}
			}
		)
		it(
			"race cancels the branches that only the losers need",
			async () => {
				const stop = flow.input("stop")
				let rounds = 0
				/** @type {AbortSignal | undefined} */
				let plan_signal
				function finish(/** @type {number} */ round) {
					return "answer " + round
				}
				async function plan(
					/** @type {Context} */ { signal, sleep }
				) {
					plan_signal = signal
					rounds++
					await sleep(40)
					return rounds
				}
				function respond(
					/** @type {string | undefined} */ answer,
					/** @type {unknown} */ stopped
				) {
					return stopped ? "stopped" : answer
				}
				function tool(/** @type {number} */ round) {
					return round
				}
				const agent = flow()
					.add(plan)
					.add(tool, plan)
					.add(finish, tool)
					.add(stop)
					.add(
						respond,
						finish,
						stop,
						{ join: "race" }
					)
					.edge(
						tool,
						[ plan, finish ],
						round => round < 5 ? plan : finish
					)
				const run = agent.run()
				await pause(60)
				const started = Date.now()
				run.send(stop, true)
				assert.equal(await run, "stopped")
				assert.isBelow(Date.now() - started, 100)
				assert.equal(rounds, 2)
				assert.isTrue(plan_signal?.aborted)
				assert.deepEqual(
					run.nodes,
					{
						finish: "skipped",
						plan: "skipped",
						respond: "done",
						stop: "done",
						tool: "skipped"
					}
				)
				rounds = 0
				const answered = agent.run()
				assert.equal(await answered, "answer 5")
				assert.equal(
					answered.nodes["stop"],
					"skipped"
				)
				/** @type {AbortSignal | undefined} */
				let shared_signal
				function fast() {
					return "fast"
				}
				async function fetch_data(
					/** @type {Context} */ { signal }
				) {
					shared_signal = signal
					await pause(30)
					return "data"
				}
				function first(
					/** @type {string | undefined} */ a,
					/** @type {string | undefined} */ b
				) {
					return a ?? b
				}
				function keep(/** @type {string} */ data) {
					return "kept " + data
				}
				function report(
					/** @type {string | undefined} */ a,
					/** @type {string} */ b
				) {
					return [ a, b ]
				}
				function slow(/** @type {string} */ data) {
					return "slow " + data
				}
				assert.deepEqual(
					await flow()
						.add(fetch_data)
						.add(slow, fetch_data)
						.add(fast)
						.add(first, fast, slow, { join: "race" })
						.add(keep, fetch_data)
						.add(report, first, keep)
						.run(),
					[ "fast", "kept data" ]
				)
				assert.isFalse(shared_signal?.aborted)
			}
		)
		it(
			"retry gives a failed node a new key when its arguments changed",
			async () => {
				/** @type {string[]} */
				const log = []
				const coupon = flow.input("coupon")
				async function charge(
					/** @type {unknown} */ q,
					/** @type {Context} */ { key, sleep }
				) {
					log.push(q + " " + key)
					await sleep(10)
					if (q == "quote A") throw Error("declined")
					return "receipt " + q
				}
				async function quote(
					/** @type {unknown} */ code,
					/** @type {Context} */ { sleep }
				) {
					await sleep(20)
					return "quote " + code
				}
				const run = flow().add(coupon)
					.add(quote, coupon)
					.add(charge, quote)
					.run(void 0, { id: "order" })
				run.send(coupon, "A")
				await pause(25)
				run.send(coupon, "B")
				await rejection(run)
				run.retry()
				assert.equal(await run, "receipt quote B")
				assert.deepEqual(
					log,
					[
						"quote A order:charge:1",
						"quote B order:charge:2"
					]
				)
			}
		)
		it(
			"retry gives a failed node its retries again in every path",
			async () => {
				/** @type {number[]} */
				const attempts = []
				function inner(
					/** @type {Context} */ { attempt }
				) {
					attempts.push(attempt)
					throw Error("down")
				}
				const sub = flow().add(inner, { retry: 1 })
				const run = flow().add(
					sub,
					{ name: "sub", optional: true }
				)
					.run()
				await run
				run.retry()
				await run
				assert.deepEqual(attempts, [ 1, 2, 1, 2 ])
				attempts.length = 0
				const items = flow().add(
					flow.each(sub),
					{ name: "items", optional: true }
				)
					.run([ 1 ])
				await items
				items.retry()
				await items
				assert.deepEqual(attempts, [ 1, 2, 1, 2 ])
				attempts.length = 0
				const outer = flow().add(sub, { name: "sub", retry: 1 })
					.run()
				await rejection(outer)
				assert.deepEqual(attempts, [ 1, 2, 1, 2 ])
			}
		)
		it(
			"retry keeps the result of a race that a failed node lost",
			async () => {
				/** @type {string[]} */
				const log = []
				let broken = true
				function decide(
					/** @type {unknown} */ a,
					/** @type {unknown} */ b,
					/** @type {Context} */ { key }
				) {
					log.push(`decide ${a} ${b} ${key}`)
					return a ?? b
				}
				async function fast() {
					await pause(1)
					return "fast"
				}
				function other(/** @type {unknown} */ b) {
					return "other " + b
				}
				async function slow() {
					await pause(20)
					if (broken) {
						broken = false
						throw Error("slow failed")
					}
					return "slow"
				}
				const definition = flow().add(fast)
					.add(slow)
					.add(
						decide,
						fast,
						slow,
						{ finish: true, join: "race" }
					)
					.add(other, slow)
				const run = definition.run(void 0, { id: "r" })
				await rejection(run)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.retry()
				assert.equal(await run, "other slow")
				assert.equal(run.get(decide), "fast")
				const resumed = definition.run(void 0, { snapshot: saved })
				assert.equal(await resumed, "other slow")
				assert.equal(resumed.get(decide), "fast")
				assert.deepEqual(
					log,
					[
						"decide fast undefined r:decide:1"
					]
				)
			}
		)
		it(
			"retry of a resource that failed to open again keeps the nodes that used the committed one",
			async () => {
				/** @type {string[]} */
				const calls = []
				let opened = 0
				function first(/** @type {unknown} */ tx) {
					calls.push("first " + tx)
					return tx
				}
				function open() {
					if (++opened == 2) throw Error("busy")
					return opened
				}
				function second(/** @type {unknown} */ tx) {
					calls.push("second " + tx)
					return tx
				}
				const run = flow().add(open, { release: () => {} })
					.add(first, open)
					.add(second, open)
					.run()
				await run
				run.reload(second)
				await rejection(run)
				run.retry()
				assert.equal(await run, 3)
				assert.deepEqual(
					calls,
					[ "first 1", "second 1", "second 3" ]
				)
			}
		)
		it(
			"send ignores a sub-flow that finished and keeps the value for one that failed",
			async () => {
				const sold_out = flow.input("sold_out")
				function end(
					/** @type {unknown} */ ended,
					/** @type {unknown} */ out
				) {
					return out ? "sold out" : ended
				}
				async function timer(
					/** @type {Context} */ { sleep }
				) {
					await sleep(5)
					return "timer"
				}
				const sale = flow().add(timer)
					.add(sold_out)
					.add(
						end,
						timer,
						sold_out,
						{ join: "race" }
					)
				async function slow(
					/** @type {Context} */ { sleep }
				) {
					await sleep(30)
					return "slow"
				}
				const run = flow().add(sale, { name: "sale" })
					.add(slow)
					.run()
				await pause(15)
				run.send("sale.sold_out", true)
				assert.equal(run.status, "running")
				assert.equal(await run, "slow")
				assert.equal(run.results["sale"], "timer")
				run.send("sale.sold_out", true)
				assert.equal(run.status, "done")
				assert.throws(
					() => run.send("sale.missing", true),
					"\"missing\" is not added to the flow"
				)
				const approve = flow.input("approve")
				let broken = true
				function decide(
					/** @type {unknown} */ approved
				) {
					if (broken) throw Error("down")
					return approved
				}
				const review = flow().add(approve)
					.add(decide, approve)
				const failed = flow().add(review, { name: "review" })
					.run()
				failed.send("review.approve", false)
				await rejection(failed)
				failed.send("review.approve", true)
				broken = false
				failed.retry()
				assert.isTrue(await failed)
			}
		)
		it(
			"send keeps values for sub-flow items that have not started",
			async () => {
				const approve = flow.input("approve")
				function decide(
					/** @type {number} */ _,
					/** @type {unknown} */ approved
				) {
					return approved
				}
				async function prepare(
					/** @type {Context} */ { sleep }
				) {
					await sleep(10)
					return 1
				}
				const review = flow().add(prepare)
					.add(approve)
					.add(decide, prepare, approve)
				const docs = flow().add(
					flow.each(review),
					{ concurrency: 1, name: "docs" }
				)
				const run = docs.run([ 1, 2, 3 ])
				run.send("docs.2.approve", false)
				run.send("docs.0.approve", true)
				assert.throws(
					() => run.send("docs.3.approve", true),
					"Flow node \"docs\" has no item 3"
				)
				assert.throws(
					() => run.send("docs.x.approve", true),
					"Flow node \"docs\" has no item x"
				)
				assert.throws(
					() => run.send("docs.0.nope", true),
					"\"nope\" is not added to the flow"
				)
				assert.throws(
					() => run.send("docs.0.prepare", true),
					"Flow node \"prepare\" is not an input"
				)
				assert.throws(
					() => run.send("docs.0", true),
					"The path \"docs.0\" does not name an input"
				)
				await run.idle()
				assert.equal(
					run.nodes["docs.1.approve"],
					"waiting"
				)
				run.send("docs.1.approve", true)
				assert.deepEqual(await run, [ true, true, false ])
				run.send("docs.0.approve", false)
				assert.deepEqual(await run, [ true, true, false ])
				assert.equal(run.status, "done")
				const single = flow()
					.add(prepare)
					.add(
						review,
						prepare,
						{ name: "review" }
					)
					.run()
				single.send("review.approve", true)
				assert.isTrue(await single)
				const early = docs.run([ 1, 2 ], { id: "early" })
				early.send("docs.1.approve", false)
				early.send("docs.0.approve", true)
				const saved = JSON.parse(
					JSON.stringify(early.snapshot())
				)
				early.cancel()
				await early.catch(() => {})
				assert.deepEqual(
					saved.nodes.docs.sends,
					{
						0: [ [ "approve", true ] ],
						1: [ [ "approve", false ] ]
					}
				)
				assert.deepEqual(
					await docs.run([ 1, 2 ], { snapshot: saved }),
					[ true, false ]
				)
			}
		)
		it(
			"snapshot of a failed run keeps the failure and resumes it with its retries",
			async () => {
				/** @type {number[]} */
				const attempts = []
				let broken = true
				function charge(
					/** @type {Context} */ { attempt }
				) {
					attempts.push(attempt)
					if (broken) throw TypeError("declined")
					return "paid"
				}
				const checkout = flow().add(charge, { retry: 1 })
				const run = checkout.run(void 0, { id: "order" })
				await rejection(run)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				assert.equal(
					saved.nodes.charge.status,
					"failed"
				)
				assert.isTrue(saved.nodes.charge.fatal)
				assert.deepEqual(
					saved.errors,
					{
						charge: {
							message: "declined",
							name: "TypeError"
						}
					}
				)
				const again = checkout.run(void 0, { snapshot: saved })
				const error = await rejection(again)
				assert.instanceOf(error, FlowError)
				assert.deepEqual(attempts, [ 1, 2, 1, 2 ])
				assert.equal(again.nodes["charge"], "failed")
				assert.hasAllKeys(again.errors, [ "charge" ])
				broken = false
				attempts.length = 0
				const resumed = checkout.run(void 0, { snapshot: saved })
				assert.equal(await resumed, "paid")
				assert.deepEqual(attempts, [ 1 ])
				assert.deepEqual(resumed.errors, {})
				broken = true
				attempts.length = 0
				const sub = flow().add(charge, { retry: 1 })
				const parent = flow().add(sub, { name: "sub" })
				const nested = parent.run()
				await rejection(nested)
				const nested_saved = JSON.parse(
					JSON.stringify(nested.snapshot())
				)
				assert.equal(
					nested_saved.nodes.sub.status,
					"failed"
				)
				assert.equal(
					nested_saved.nodes.sub.subs[""].nodes.charge.status,
					"failed"
				)
				assert.deepEqual(
					nested_saved.errors.sub.cause,
					{
						message: "declined",
						name: "TypeError"
					}
				)
				broken = false
				assert.equal(
					await parent.run(
						void 0,
						{ snapshot: nested_saved }
					),
					"paid"
				)
				assert.deepEqual(attempts, [ 1, 2, 1 ])
				broken = true
				attempts.length = 0
				const optional = flow().add(
					sub,
					{ name: "sub", optional: true }
				)
				const partial = optional.run()
				await partial
				const partial_saved = JSON.parse(
					JSON.stringify(partial.snapshot())
				)
				const continued = optional.run(
					void 0,
					{ snapshot: partial_saved }
				)
				assert.hasAllKeys(
					continued.errors,
					[ "sub", "sub.charge" ]
				)
				await continued
				assert.deepEqual(attempts, [ 1, 2 ])
				broken = false
				continued.retry()
				assert.equal(await continued, "paid")
				assert.deepEqual(attempts, [ 1, 2, 1 ])
			}
		)
		it(
			"transactions of one limiter in sub-flows of one run release their slots in turn",
			async () => {
				/** @type {string[]} */
				const log = []
				const writer = limiter({ concurrency: 1 })
				function audit() {
					return "audit"
				}
				/**
				 * @param {Context} context
				 * @returns {Promise<{ lease: { release(): void }, name: string }>}
				 */
				async function begin({ signal, state }) {
					const lease = await writer.acquire(signal)
					log.push("begin " + state)
					return { lease, name: String(state) }
				}
				function end(
					/** @type {{ lease: { release(): void }, name: string }} */ tx,
					/** @type {unknown} */ error
				) {
					log.push(
						(error ? "rollback " : "commit ") + tx.name
					)
					tx.lease.release()
				}
				function insert(
					/** @type {{ name: string }} */ tx
				) {
					return "inserted " + tx.name
				}
				function order() {
					return "order"
				}
				function save() {
					return flow().add(begin, { release: end })
						.add(insert, begin)
				}
				const run = flow().add(order)
					.add(audit)
					.add(
						save(),
						order,
						{ name: "save_order" }
					)
					.add(
						save(),
						audit,
						{ name: "save_audit" }
					)
					.run()
				assert.equal(await run, "inserted audit")
				assert.deepEqual(
					log,
					[
						"begin order",
						"commit order",
						"begin audit",
						"commit audit"
					]
				)
			}
		)
	}
)
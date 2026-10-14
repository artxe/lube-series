/** @import { NodeContext as Context } from "async-lube" */
/** @import { SavedFlow } from "./private.js" */
import {
	CancelError,
	FlowError,
	channel,
	flow
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
	"flow corners",
	() => {
		/**
		 * @param {{ snapshot(): import("async-lube").FlowSnapshot }} run
		 * @returns {SavedFlow}
		 */
		function internals(run) {
			return /** @type {SavedFlow} */(/** @type {unknown} */(run.snapshot()))/**/
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
				if (Date.now() - started > 2000) {
					assert.fail("Timed out")
				}
				await pause(5)
			}
		}
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"a catch that ends after the run was cancelled records nothing",
			async () => {
				function charge() {
					throw Error("declined")
				}
				let caught = 0
				const run = flow().add(
					charge,
					{
						catch: async () => {
							await pause(10)
							caught++
							return "refunded"
						}
					}
				)
					.run()
				await pause(5)
				run.cancel()
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				await pause(10)
				assert.equal(caught, 1)
				assert.deepEqual(run.errors, {})
				assert.equal(run.nodes["charge"], "cancelled")
			}
		)
		it(
			"a catch that throws fails the run with its error",
			async () => {
				function charge() {
					throw Error("declined")
				}
				const run = flow().add(
					charge,
					{
						catch: () => {
							throw Error("refund failed")
						}
					}
				)
					.run()
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"charge\" failed: refund failed"
				)
				assert.equal(
					/** @type {Error} */(run.errors["charge"])/**/.message,
					"refund failed"
				)
			}
		)
		it(
			"a fallback list goes to every node in it",
			async () => {
				function cache() {
					return "cache"
				}
				function mirror() {
					return "mirror"
				}
				function primary() {
					throw Error("down")
				}
				const run = flow().add(mirror)
					.add(cache)
					.add(
						primary,
						{ fallback: [ mirror, cache ] }
					)
					.run()
				assert.isUndefined(await run)
				assert.deepEqual(
					run.nodes,
					{
						cache: "done",
						mirror: "done",
						primary: "skipped"
					}
				)
			}
		)
		it(
			"a fallback past maxSteps fails the run",
			async () => {
				function backup() {
					return "backup"
				}
				function primary() {
					throw Error("down")
				}
				const run = flow({ maxSteps: 1 }).add(backup)
					.add(primary, { fallback: backup })
					.run()
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"backup\" failed: The flow exceeded 1 steps"
				)
			}
		)
		it(
			"a finished node that gets a release is saved to run again",
			async () => {
				function open() {
					return "tx"
				}
				/**
				 * @param {string} tx
				 */
				function use(tx) {
					return tx + "!"
				}
				const plain = flow().add(open)
					.add(use, open)
					.run()
				await plain
				const saved = JSON.parse(
					JSON.stringify(plain.snapshot())
				)
				/** @type {unknown[]} */
				const released = []
				const resumed = flow().add(
					open,
					{
						release: tx => void released.push(tx)
					}
				)
					.add(use, open)
					.run(void 0, { snapshot: saved })
				const again = internals(resumed)
				assert.equal(
					again.nodes["open"]?.status,
					"idle"
				)
				assert.notProperty(again.nodes["open"], "runs")
				assert.equal(
					again.nodes["use"]?.status,
					"idle"
				)
				assert.equal(await resumed, "tx!")
				assert.deepEqual(released, [ "tx" ])
			}
		)
		it(
			"a kept dependency that changed keeps the done items of a retried each",
			async () => {
				/** @type {import("async-lube").Input<number[]>} */
				const value = flow.input("value")
				/**
				 * @param {number} n
				 */
				function check(n) {
					if (n < 0) {
						throw Error("negative")
					}
					return n
				}
				const run = flow().add(value)
					.add(
						flow.each(check),
						flow.keep(value),
						{ name: "items", optional: true }
					)
					.run()
				run.send(value, [ 1, -2 ])
				assert.deepEqual(await run, [ 1, void 0 ])
				run.send(value, [ 3, 4 ])
				assert.deepEqual(await run, [ 1, void 0 ])
				run.retry()
				assert.deepEqual(await run, [ 1, 4 ])
			}
		)
		it(
			"a queue dependent restarted after cancel gets a new key",
			async () => {
				const value = flow.input("value")
				/** @type {string[]} */
				const keys = []
				/**
				 * @param {unknown} n
				 * @param {Context} context
				 */
				async function write(n, { key, sleep }) {
					keys.push(key)
					await sleep(10)
					return n
				}
				const run = flow().add(value)
					.add(write, flow.queue(value))
					.run(void 0, { id: "r" })
				run.send(value, 1)
				await pause(2)
				run.cancel()
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				run.send(value, 1)
				assert.equal(await run, 1)
				assert.deepEqual(
					keys,
					[ "r:write:1", "r:write:2" ]
				)
			}
		)
		it(
			"a queue node that an optional failure holds counts no pending update",
			async () => {
				const value = flow.input("value")
				/**
				 * @param {unknown} n
				 */
				function positive(n) {
					if (Number(n) < 0) {
						throw Error("negative")
					}
					return n
				}
				const run = flow().add(value)
					.add(
						positive,
						flow.queue(value),
						{ optional: true }
					)
					.run()
				run.send(value, -1)
				assert.isUndefined(await run)
				assert.equal(run.nodes["positive"], "failed")
				assert.equal(run.pending(positive), 0)
				run.send(value, 2)
				assert.equal(await run, 2)
			}
		)
		it(
			"a queue node that restarts does not retrigger its running edge target",
			async () => {
				const value = flow.input("value")
				/** @type {(() => void)[]} */
				const source_gates = []
				/** @type {(() => void)[]} */
				const target_gates = []
				/**
					 * @param {(() => void)[]} gates
					 * @returns {Promise<void>}
					 */
				async function release(gates) {
					await until(() => gates.length > 0)
					;/** @type {() => void} */(gates.shift())/**/()
					await pause(1)
				}
				/**
				 * @param {unknown} n
				 */
				async function source(n) {
					await new Promise(
						resolve => source_gates.push(() => resolve(void 0))
					)
					return n
				}
				/** @type {Record<string, number[]>} */
				const results = {}
				for (const overlap of /** @type {const} */([ "queue", "rerun", "restart" ])/**/) {
					let starts = 0
					let finished = 0
					async function target() {
						starts++
						await new Promise(
							resolve => target_gates.push(() => resolve(void 0))
						)
						finished++
						return "target"
					}
					const run = flow().add(value)
						.add(
							source,
							value,
							{ overlap: "queue" }
						)
						.add(target, { overlap })
						.edge(
							source,
							[ target ],
							n => n == 1 || n == 4 ? target : null
						)
						.run()
					for (let n = 1; n <= 4; n++) {
						run.send(value, n)
					}
					await release(source_gates)
					assert.equal(starts, 1)
					await release(target_gates)
					assert.equal(starts, 1)
					await release(source_gates)
					await release(source_gates)
					assert.equal(starts, 1)
					await release(source_gates)
					assert.equal(starts, 2)
					await release(target_gates)
					await run
					results[overlap] = [ starts, finished ]
				}
				assert.deepEqual(
					results,
					{
						queue: [ 2, 2 ],
						rerun: [ 2, 2 ],
						restart: [ 2, 2 ]
					}
				)
			}
		)
		it(
			"a queue node that restarts runs its edge target once per completion",
			async () => {
				const value = flow.input("value")
				/** @type {(() => void)[]} */
				const gates = []
				/**
				 * @param {unknown} n
				 */
				async function source(n) {
					await new Promise(
						resolve => gates.push(() => resolve(void 0))
					)
					return n
				}
				let starts = 0
				/**
				 * @param {Context} context
				 */
				async function target({ sleep }) {
					starts++
					await sleep(30)
					return "target"
				}
				const run = flow().add(value)
					.add(
						source,
						value,
						{ overlap: "queue" }
					)
					.add(target, { overlap: "queue" })
					.edge(source, target)
					.run()
				for (let n = 1; n <= 4; n++) {
					run.send(value, n)
				}
				for (let n = 1; n <= 4; n++) {
					await until(() => gates.length > 0)
					;/** @type {() => void} */(gates.shift())/**/()
					await pause(1)
				}
				assert.equal(await run, "target")
				assert.equal(starts, 4)
			}
		)
		it(
			"a queue node that restarts still retriggers its running dependent",
			async () => {
				const value = flow.input("value")
				/** @type {(() => void)[]} */
				const gates = []
				/**
				 * @param {unknown} n
				 */
				async function source(n) {
					await new Promise(
						resolve => gates.push(() => resolve(void 0))
					)
					return n
				}
				/** @type {unknown[]} */
				const seen = []
				/**
				 * @param {unknown} n
				 * @param {Context} context
				 */
				async function dependent(n, { sleep }) {
					seen.push(n)
					await sleep(30)
					return n
				}
				const run = flow().add(value)
					.add(
						source,
						value,
						{ overlap: "queue" }
					)
					.add(dependent, source)
					.run()
				for (let n = 1; n <= 3; n++) {
					run.send(value, n)
				}
				for (let n = 1; n <= 3; n++) {
					await until(() => gates.length > 0)
					;/** @type {() => void} */(gates.shift())/**/()
					await pause(1)
				}
				assert.equal(await run, 3)
				assert.equal(seen.at(-1), 3)
				assert.isAbove(seen.length, 1)
			}
		)
		it(
			"a race abandons a dependency whose other dependent waits for a removed edge",
			async () => {
				/**
				 * @param {string | undefined} first
				 * @param {string | undefined} second
				 */
				function r(first, second) {
					return first ?? second
				}
				function w() {
					return "w"
				}
				/**
				 * @param {Context} context
				 */
				async function x({ sleep }) {
					await sleep(5)
					return "x"
				}
				/**
				 * @param {Context} context
				 */
				async function y({ sleep }) {
					await sleep(50)
					return "y"
				}
				/**
				 * @param {string} value
				 */
				function z(value) {
					return value
				}
				const started = flow().add(x)
					.add(y)
					.add(w)
					.add(z, y)
					.add(r, x, y, { join: "race" })
					.edge(w, z)
					.run()
				const saved = JSON.parse(
					JSON.stringify(started.snapshot())
				)
				started.cancel()
				assert.instanceOf(
					await rejection(started),
					CancelError
				)
				assert.isFalse(saved.nodes.z.activated)
				const resumed = flow().add(x)
					.add(y)
					.add(w)
					.add(z, y)
					.add(r, x, y, { join: "race" })
					.run(void 0, { snapshot: saved })
				assert.equal(await resumed, "x")
				assert.equal(resumed.nodes["y"], "skipped")
				assert.equal(resumed.nodes["z"], "idle")
			}
		)
		it(
			"a resource opens for a queued value of its dependent",
			async () => {
				const job = flow.input("job")
				let opened = 0
				function open() {
					opened++
					return "tx"
				}
				/**
				 * @param {string} tx
				 * @param {unknown} value
				 */
				function work(tx, value) {
					return tx + ":" + String(value)
				}
				const run = flow().add(job)
					.add(open, { release: () => {} })
					.add(work, open, flow.queue(job))
					.run()
				await pause(1)
				assert.equal(opened, 0)
				run.send(job, 1)
				assert.equal(await run, "tx:1")
				assert.equal(opened, 1)
			}
		)
		it(
			"a resource stays closed when another dependency of its dependent skips",
			async () => {
				let opened = 0
				/**
				 * @param {Context} context
				 */
				async function load({ sleep }) {
					await sleep(5)
					return "data"
				}
				function never() {
					return 1
				}
				function open() {
					opened++
					return "tx"
				}
				function write() {
					return "written"
				}
				const run = flow().add(never, { when: () => false })
					.add(open, { release: () => {} })
					.add(load)
					.add(write, open, never, load)
					.run()
				assert.isUndefined(await run)
				assert.equal(opened, 0)
				assert.equal(run.nodes["write"], "skipped")
			}
		)
		it(
			"a result that throws on access fails its node, also after a trace reloads it",
			async () => {
				const hostile = new Proxy(
					{},
					{
						get: (_, key) => {
							if (key == "then") {
								return void 0
							}
							throw TypeError("no access")
						}
					}
				)
				let calls = 0
				function make() {
					calls++
					return hostile
				}
				let reloads = 0
				const run = flow().add(make)
					.run(
						void 0,
						{
							trace: event => {
								if (event.type == "done" && !reloads++) {
									run.reload(make)
								}
							}
						}
					)
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"make\" failed: no access"
				)
				assert.equal(calls, 2)
			}
		)
		it(
			"a retry delay that ends as the run is cancelled starts no attempt",
			async () => {
				vi.setTimerTickMode("manual")
				async function flush() {
					for (let i = 0; i < 50; i++) {
						await Promise.resolve()
					}
				}
				let calls = 0
				function flaky() {
					calls++
					throw Error("busy")
				}
				/** @type {string[]} */
				const events = []
				const retried = flow().add(
					flaky,
					{
						retry: { count: 1, delay: 100 }
					}
				)
				const run = retried.run(
					void 0,
					{
						trace: event => void events.push("run " + event.type)
					}
				)
				run.catch(() => {})
				await flush()
				const resumed = retried.run(
					void 0,
					{
						snapshot: run.snapshot(),
						trace: event => void events.push("resumed " + event.type)
					}
				)
				resumed.catch(() => {})
				setTimeout(
					() => {
						run.cancel()
						resumed.cancel()
					},
					100
				)
				vi.advanceTimersByTime(100)
				await flush()
				assert.equal(calls, 1)
				assert.deepEqual(
					events,
					[ "run start", "run fail" ]
				)
				assert.equal(run.status, "cancelled")
				assert.equal(resumed.status, "cancelled")
			}
		)
		it(
			"a run cancelled while retry.when decides does not retry",
			async () => {
				let calls = 0
				function flaky() {
					calls++
					throw Error("busy")
				}
				/** @type {string[]} */
				const events = []
				const run = flow().add(
					flaky,
					{
						retry: {
							count: 1,
							when: async () => {
								run.cancel()
								return true
							}
						}
					}
				)
					.run(
						void 0,
						{
							trace: event => void events.push(event.type)
						}
					)
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				assert.equal(calls, 1)
				assert.deepEqual(events, [ "start", "cancel" ])
			}
		)
		it(
			"a running node whose dependency reloads and skips is skipped",
			async () => {
				let skipping = false
				/**
				 * @param {Context} context
				 */
				function source({ skip }) {
					return skipping ? skip() : 1
				}
				/** @type {unknown[]} */
				const seen = []
				/**
				 * @param {number} n
				 * @param {Context} context
				 */
				async function work(n, { sleep }) {
					seen.push(n)
					await sleep(10)
					return n
				}
				const runs = [
					flow().add(source)
						.add(work, source)
						.run(),
					flow().add(source)
						.add(work, source, { overlap: "queue" })
						.run()
				]
				await pause(2)
				skipping = true
				for (const run of runs) {
					run.reload(source)
				}
				for (const run of runs) {
					assert.isUndefined(await run)
					assert.equal(run.nodes["work"], "skipped")
				}
				assert.deepEqual(seen, [ 1, 1 ])
			}
		)
		it(
			"a snapshot gives a node that became an edge target its activation",
			async () => {
				function a() {
					return "a"
				}
				function b() {
					return "b"
				}
				const before = flow().add(a)
					.add(b)
					.run()
				await before
				const saved = JSON.parse(
					JSON.stringify(before.snapshot())
				)
				const after = flow().add(a)
					.add(b)
					.edge(a, b)
					.run(void 0, { snapshot: saved })
				assert.equal(await after, "b")
				assert.deepEqual(
					internals(after).nodes["b"]?.activators,
					[ "*" ]
				)
			}
		)
		it(
			"a snapshot leaves out errors of nodes the flow does not have",
			async () => {
				function soft() {
					throw Error("soft")
				}
				const optional = flow().add(soft, { optional: true })
				const run = optional.run()
				await run
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				saved.errors.gone = { message: "old", name: "Error" }
				const resumed = optional.run(void 0, { snapshot: saved })
				assert.sameMembers(
					Object.keys(resumed.errors),
					[ "gone", "soft" ]
				)
				assert.deepEqual(
					Object.keys(resumed.snapshot().errors),
					[ "soft" ]
				)
			}
		)
		it(
			"a snapshot leaves out the caught error of a node that runs again on resume",
			async () => {
				function open() {
					return "tx"
				}
				/**
				 * @param {Context} context
				 */
				async function slow({ sleep }) {
					await sleep(10)
					return "slow"
				}
				function use() {
					throw Error("failed")
				}
				const run = flow().add(open, { release: () => {} })
					.add(
						use,
						open,
						{ catch: () => "caught" }
					)
					.add(slow)
					.run()
				await pause(1)
				assert.property(run.errors, "use")
				const saved = internals(run)
				assert.equal(
					saved.nodes["use"]?.status,
					"idle"
				)
				assert.notProperty(saved.errors, "use")
				assert.equal(await run, "slow")
			}
		)
		it(
			"a snapshot that keeps a node waiting for a removed edge does not keep its targets waiting",
			async () => {
				function a() {
					return "a"
				}
				function b() {
					return "b"
				}
				function s() {
					return "s"
				}
				function t() {
					return "t"
				}
				const started = flow().add(a)
					.add(b)
					.add(s)
					.add(t)
					.edge(a, b)
					.edge(b, t)
					.edge(s, t)
					.run()
				const saved = JSON.parse(
					JSON.stringify(started.snapshot())
				)
				started.cancel()
				assert.instanceOf(
					await rejection(started),
					CancelError
				)
				assert.isFalse(saved.nodes.b.activated)
				const resumed = flow().add(a)
					.add(b)
					.add(s)
					.add(t)
					.edge(b, t)
					.edge(s, [ t ], () => null)
					.run(void 0, { snapshot: saved })
				assert.isUndefined(await resumed)
				assert.deepEqual(
					resumed.nodes,
					{
						a: "done",
						b: "idle",
						s: "done",
						t: "skipped"
					}
				)
			}
		)
		it(
			"a stream queue node that goes to its fallback lets the stream read on",
			async () => {
				let produced = 0
				async function* numbers() {
					for (let value = 1; value <= 6; value++) {
						produced = value
						yield value
					}
				}
				/** @type {number[]} */
				const handled = []
				/**
				 * @param {number} value
				 * @param {Context} context
				 */
				async function handle(value, { sleep }) {
					await sleep(5)
					if (value % 2) {
						throw Error("odd")
					}
					handled.push(value)
					return value
				}
				let recovered = 0
				function recover() {
					recovered++
					return 0
				}
				const run = flow().add(recover)
					.add(
						handle,
						numbers(),
						{
							fallback: recover,
							limit: 1,
							overflow: "wait",
							overlap: "queue"
						}
					)
					.run()
				await until(() => handled.length == 3)
				assert.deepEqual(handled, [ 2, 4, 6 ])
				assert.equal(recovered, 3)
				assert.equal(produced, 6)
				run.cancel()
			}
		)
		it(
			"a stream that fails after the run's signal aborted leaves the run cancelled",
			async () => {
				const controller = new AbortController()
				/** @type {import("async-lube").Channel<number>} */
				const source = channel()
				/**
				 * @param {number} n
				 */
				function use(n) {
					return n
				}
				const run = flow().add(use, source)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				source.send(1)
				assert.equal(await run, 1)
				controller.abort("closed")
				source.fail(Error("lost"))
				await pause(1)
				assert.equal(run.status, "cancelled")
			}
		)
		it(
			"a stream waits for room only while its queue holds values",
			async () => {
				let produced = 0
				async function* numbers() {
					for (let value = 1; value <= 3; value++) {
						produced = value
						yield value
					}
				}
				/** @type {number[]} */
				const handled = []
				/**
				 * @param {number} n
				 */
				function handle(n) {
					handled.push(n)
					return n
				}
				const go = flow.input("go")
				const waiting = flow().add(go)
					.add(
						handle,
						flow.queue(numbers()),
						go,
						{ limit: 1, overflow: "wait" }
					)
					.run()
				await pause(5)
				assert.equal(produced, 1)
				waiting.send(go, true)
				await until(() => handled.length == 3)
				assert.deepEqual(handled, [ 1, 2, 3 ])
				waiting.cancel()
				handled.length = 0
				produced = 0
				const gate = flow.input("gate")
				const stream = numbers()
				const buffered = flow().add(gate)
					.add(stream, gate, { name: "numbers" })
					.add(
						handle,
						flow.queue(stream),
						{ limit: 1, overflow: "wait" }
					)
					.run()
				await pause(5)
				assert.equal(produced, 3)
				buffered.send(gate, true)
				assert.equal(await buffered, 3)
				assert.deepEqual(handled, [ 3 ])
				buffered.cancel()
			}
		)
		it(
			"a sub-flow keeps its optional failures through snapshots",
			async () => {
				function broken() {
					throw Error("broken")
				}
				const leaf = flow().add(broken, { optional: true })
				const middle = flow().add(
					flow.each(leaf),
					{ name: "items" }
				)
					.add(leaf, { name: "single" })
				const outer = flow().add(middle, { name: "middle" })
				const run = outer.run([ 1, 2 ])
				assert.isUndefined(await run)
				const failures = [
					"middle.items.0.broken",
					"middle.items.1.broken",
					"middle.single.broken"
				]
				assert.sameMembers(
					Object.keys(run.errors),
					failures
				)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				const resumed = outer.run([ 1, 2 ], { snapshot: saved })
				assert.sameMembers(
					Object.keys(resumed.errors),
					failures
				)
				assert.deepEqual(
					internals(resumed).nodes["middle"]?.subs,
					saved.nodes.middle.subs
				)
				assert.isUndefined(await resumed)
			}
		)
		it(
			"a when that cancels the run and throws leaves it cancelled",
			async () => {
				async function load() {
					return 1
				}
				let ran = 0
				function guarded() {
					ran++
					return 2
				}
				const run = flow().add(load)
					.add(
						guarded,
						load,
						{
							when: () => {
								run.cancel()
								throw Error("guard")
							}
						}
					)
					.run()
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				assert.equal(ran, 0)
				assert.deepEqual(run.errors, {})
			}
		)
		it(
			"an each source that ends as the run is cancelled runs no items",
			async () => {
				let calls = 0
				/**
				 * @param {number} n
				 */
				function double(n) {
					calls++
					return n * 2
				}
				/** @type {IteratorResult<number>} */
				const first = { done: false, value: 1 }
				/** @type {IteratorResult<number>} */
				const last = { done: true, value: void 0 }
				/** @type {{ cancel(): void }[]} */
				const runs = []
				/**
				 * @param {(step: IteratorResult<number>) => void} resolve
				 * @returns {Promise<void>}
				 */
				function end_as_cancelled(resolve) {
					resolve(last)
					for (const run of runs) {
						run.cancel()
					}
					return Promise.resolve()
				}
				let reads = 0
				/** @type {AsyncIterable<number>} */
				const source = {
					[Symbol.asyncIterator]: () => ({
						next: () => reads++
							? /** @type {Promise<IteratorResult<number>>} */(/** @type {unknown} */({ then: end_as_cancelled }))/**/
							: Promise.resolve(first)
					})
				}
				const run = flow().add(
					flow.each(double),
					{ name: "items" }
				)
					.run(source)
				runs.push(run)
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				assert.equal(calls, 0)
				assert.equal(reads, 2)
			}
		)
		it(
			"an edge selection that cannot become a string after the step limit keeps the first error",
			async () => {
				function first() {
					return 1
				}
				/**
				 * @param {number} n
				 */
				function second(n) {
					return n
				}
				function third() {
					return 3
				}
				const run = flow({ maxSteps: 1 }).add(first)
					.add(second, first)
					.add(third)
					.edge(
						first,
						[ third ],
						() => /** @type {never} */(Object.create(null))/**/
					)
					.run()
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"second\" failed: The flow exceeded 1 steps"
				)
			}
		)
		it(
			"an edge selector that throws stops a queue dependent from taking the value",
			async () => {
				const value = flow.input("value")
				/** @type {unknown[]} */
				const written = []
				function audit() {
					return "audit"
				}
				/**
				 * @param {unknown} n
				 */
				function write(n) {
					written.push(n)
					return n
				}
				const run = flow().add(value)
					.add(write, flow.queue(value))
					.add(audit)
					.edge(
						value,
						[ audit ],
						n => {
							if (n == 2) {
								throw Error("bad value")
							}
							return null
						}
					)
					.run()
				run.send(value, 1)
				assert.isUndefined(await run)
				run.send(value, 2)
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"value\" failed: bad value"
				)
				assert.deepEqual(written, [ 1 ])
				assert.equal(run.nodes["write"], "done")
			}
		)
		it(
			"an input with an empty name is added as input",
			() => {
				const run = flow().add(flow.input(""))
					.run()
				assert.deepEqual(run.nodes, { input: "waiting" })
				run.cancel()
				run.catch(() => {})
			}
		)
		it(
			"an item catch cannot skip its item and is ignored after cancel",
			async () => {
				/**
				 * @param {number} n
				 */
				function check(n) {
					if (n < 0) {
						throw Error("negative")
					}
					return n
				}
				const skipping = flow().add(
					flow.each(check),
					{
						catch: (_, item, { skip }) => item < 0 ? skip() : item,
						name: "items"
					}
				)
					.run([ 1, -1 ])
				const error = await rejection(skipping)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"items\" failed: The catch of flow node \"items\" cannot return goto() or skip() for an item"
				)
				const late = flow().add(
					flow.each(check),
					{
						catch: async () => {
							await pause(10)
							return 0
						},
						name: "items"
					}
				)
					.run([ -1 ])
				const thrown = flow().add(
					flow.each(check),
					{
						catch: async () => {
							await pause(10)
							throw Error("late")
						},
						name: "items"
					}
				)
					.run([ -1 ])
				await pause(5)
				late.cancel()
				thrown.cancel()
				assert.instanceOf(
					await rejection(late),
					CancelError
				)
				assert.instanceOf(
					await rejection(thrown),
					CancelError
				)
				await pause(10)
				assert.deepEqual(late.errors, {})
				assert.deepEqual(thrown.errors, {})
			}
		)
		it(
			"cancel stops a stream whose pending read then fails",
			async () => {
				/** @type {((error: unknown) => void) | undefined} */
				let fail_read
				/**
				 * @returns {Promise<IteratorResult<number>>}
				 */
				function read() {
					return new Promise(
						(_, reject) => {
							fail_read = reject
						}
					)
				}
				/** @type {AsyncIterable<number>} */
				const socket = {
					[Symbol.asyncIterator]: () => ({
						next: read,
						return: async () => {
							fail_read?.(Error("closed"))
							return { done: true, value: void 0 }
						}
					})
				}
				/**
				 * @param {number} n
				 */
				function use(n) {
					return n
				}
				const run = flow().add(use, socket)
					.run()
				await pause(1)
				run.cancel()
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				await pause(1)
				assert.equal(run.status, "cancelled")
				assert.deepEqual(run.errors, {})
			}
		)
		it(
			"check follows edges and passes shared dependencies once",
			() => {
				function first() {
					return 1
				}
				function later() {
					return 2
				}
				assert.deepEqual(
					flow().add(first)
						.add(later)
						.edge(first, later)
						.check(),
					[]
				)
				function base() {
					return 1
				}
				/**
				 * @param {number} a
				 * @param {number} b
				 */
				function both(a, b) {
					return a + b
				}
				/**
				 * @param {number | undefined} a
				 * @param {number | undefined} b
				 */
				function close(a, b) {
					return a ?? b
				}
				/**
				 * @param {number} n
				 */
				function left(n) {
					return n
				}
				/**
				 * @param {number} n
				 */
				function right(n) {
					return n
				}
				assert.deepEqual(
					flow().add(base, { finish: true })
						.add(left, base)
						.add(right, base)
						.add(both, left, right)
						.add(first)
						.add(close, both, first, { join: "race" })
						.check(),
					[]
				)
			}
		)
		it(
			"each over a sub-flow retries a failed item from where it stopped",
			async () => {
				let prepared = 0
				const failing = new Set([ 1 ])
				/**
				 * @param {number} base
				 * @param {Context} context
				 */
				function finish(base, { index }) {
					if (failing.delete(Number(index))) {
						throw Error("busy")
					}
					return base + Number(index)
				}
				function prepare() {
					prepared++
					return 10
				}
				const per_item = flow().add(prepare)
					.add(finish, prepare)
				const run = flow().add(
					flow.each(per_item),
					{ name: "items", retry: 1 }
				)
					.run([ "a", "b" ])
				assert.deepEqual(await run, [ 10, 11 ])
				assert.equal(prepared, 2)
			}
		)
		it(
			"errors name a flow and values that are not nodes",
			async () => {
				function step() {
					return 1
				}
				const sub = flow().add(step)
				assert.throws(
					() => flow().add(sub)
						.add(sub),
					"a flow is already added as flow node \"flow\""
				)
				const run = flow().add(step)
					.run()
				assert.throws(
					() => run.get(/** @type {never} */(42)/**/),
					"42 is not added to the flow"
				)
				assert.equal(await run, 1)
			}
		)
		it(
			"flow.each() called directly maps an async iterable",
			async () => {
				async function* letters() {
					yield "a"
					yield "b"
				}
				/**
				 * @param {string} letter
				 */
				function upper(letter) {
					return letter.toUpperCase()
				}
				assert.deepEqual(
					await flow.each(upper)(letters()),
					[ "A", "B" ]
				)
				const shout = /** @type {import("async-lube").Flow<string>} */(flow())/**/
					.add(
						(
							/** @type {Context<string>} */ { state }
						) => state + "!",
						{ name: "shout" }
					)
				assert.deepEqual(
					await flow.each(shout)(letters()),
					[ "a!", "b!" ]
				)
			}
		)
		it(
			"item paths name the sub-run of an item",
			async () => {
				const approve = flow.input("approve")
				const review = flow().add(approve)
				function tally() {
					return 0
				}
				const run = flow().add(tally)
					.add(
						flow.each(review),
						{ name: "reviews" }
					)
					.run([ 1, 2 ])
				await pause(1)
				assert.equal(
					run.pending("reviews.0.approve"),
					1
				)
				assert.throws(
					() => run.pending("reviews.5.approve"),
					"Flow node \"reviews\" has no item 5"
				)
				assert.throws(
					() => run.pending("tally.count"),
					"Flow node \"tally\" is not a flow, so \"tally.count\" names nothing"
				)
				run.reload("reviews.1")
				assert.equal(
					run.nodes["reviews.1.approve"],
					"waiting"
				)
				run.send("reviews.0.approve", "a")
				run.send("reviews.1.approve", "b")
				assert.deepEqual(
					await run.then(value => value),
					[ "a", "b" ]
				)
				assert.throws(
					() => run.pending("reviews.0"),
					"The path \"reviews.0\" does not name a node"
				)
				run.reload("reviews.0")
				assert.equal(run.status, "done")
			}
		)
		it(
			"options that do not apply are rejected",
			() => {
				function step() {
					return 1
				}
				assert.throws(
					() => flow(
						/** @type {never} */({ retries: 1 })/**/
					),
					"Unknown flow option \"retries\""
				)
				assert.throws(
					() => flow().add(
						step,
						/** @type {never} */({ concurrency: 2 })/**/
					),
					"applies only to flow.each()"
				)
				assert.throws(
					() => flow().add(
						step,
						{
							retry: {
								count: 1,
								when: /** @type {never} */(5)/**/
							}
						}
					),
					"must be a count or { count, delay, when }"
				)
				assert.throws(
					() => flow().add(step)
						.run(
							void 0,
							{
								snapshot: /** @type {never} */({ version: 1 })/**/
							}
						),
					"Invalid flow snapshot"
				)
			}
		)
		it(
			"reload starts a node that an edited snapshot holds as pending",
			async () => {
				function held() {
					return "held"
				}
				function late() {
					return "late"
				}
				/**
				 * @param {Context} context
				 */
				async function slow({ sleep }) {
					await sleep(5)
					return "slow"
				}
				const limited = flow({ concurrency: 1 }).add(slow)
					.add(late)
					.add(held)
				const first = limited.run()
				const saved = JSON.parse(
					JSON.stringify(first.snapshot())
				)
				first.cancel()
				assert.instanceOf(
					await rejection(first),
					CancelError
				)
				saved.nodes.held.status = "pending"
				const resumed = limited.run(void 0, { snapshot: saved })
				assert.deepEqual(
					resumed.nodes,
					{
						held: "pending",
						late: "pending",
						slow: "running"
					}
				)
				resumed.reload(held)
				assert.equal(await resumed, "held")
				assert.deepEqual(
					resumed.nodes,
					{
						held: "done",
						late: "done",
						slow: "done"
					}
				)
			}
		)
		it(
			"retry and send do nothing once the run's signal is aborted",
			async () => {
				const controller = new AbortController()
				const value = flow.input("value")
				let calls = 0
				/**
				 * @param {unknown} v
				 */
				function once(v) {
					if (!calls++) {
						throw Error("first")
					}
					return v
				}
				const run = flow().add(value)
					.add(once, value)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				run.send(value, 1)
				assert.instanceOf(await rejection(run), FlowError)
				controller.abort("closed")
				assert.equal(run.status, "failed")
				run.retry()
				assert.equal(run.status, "cancelled")
				run.send(value, 2)
				assert.equal(run.status, "cancelled")
				assert.equal(calls, 1)
			}
		)
		it(
			"sends to a sub-flow before it starts all arrive",
			async () => {
				const a = flow.input("a")
				const b = flow.input("b")
				/**
				 * @param {unknown} x
				 * @param {unknown} y
				 */
				function sum(x, y) {
					return Number(x) + Number(y)
				}
				/**
				 * @param {Context} context
				 */
				async function warm({ sleep }) {
					await sleep(5)
					return 0
				}
				const run = flow().add(warm)
					.add(
						flow().add(a)
							.add(b)
							.add(sum, a, b),
						warm,
						{ name: "group" }
					)
					.run()
				run.send("group.a", 1)
				run.send("group.b", 2)
				assert.equal(await run, 3)
			}
		)
		it(
			"the step limit failing a queued node keeps the first error, also for a catch",
			async () => {
				function broken() {
					throw Error("broken")
				}
				function next() {
					return "next"
				}
				const failed = flow(
					{ concurrency: 1, maxSteps: 1 }
				).add(broken)
					.add(next)
					.run()
				const error = await rejection(failed)
				assert.instanceOf(error, FlowError)
				assert.equal(
					error.message,
					"Flow node \"next\" failed: The flow exceeded 1 steps"
				)
				assert.equal(
					/** @type {Error} */(failed.errors["broken"])/**/.message,
					"broken"
				)
				/** @type {AbortSignal[]} */
				const signals = []
				const caught = flow(
					{ concurrency: 1, maxSteps: 1 }
				).add(
					broken,
					{
						catch: (_, { signal }) => {
							signals.push(signal)
							return "caught"
						}
					}
				)
					.add(next)
					.run()
				const second = await rejection(caught)
				assert.instanceOf(second, FlowError)
				assert.equal(
					second.message,
					"Flow node \"next\" failed: The flow exceeded 1 steps"
				)
				assert.lengthOf(signals, 1)
				assert.isFalse(signals[0]?.aborted)
			}
		)
	}
)
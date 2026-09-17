/** @import { NodeContext as Context } from "async-lube" */
/** @import { MergeContext, SavedFlow } from "./private.js" */
import {
	CancelError,
	FlowError,
	TimeoutError,
	channel,
	flow,
	isCancel
} from "async-lube"
import { execFileSync } from "node:child_process"
import { getEventListeners } from "node:events"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"flow",
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
		 * @template T
		 * @param {PromiseLike<T>} promise
		 * @returns {Promise<T>}
		 */
		async function settled(promise) {
			const result = Promise.resolve(promise)
			result.catch(() => {})
			await vi.runAllTimersAsync()
			return result
		}
		/**
		 * @param {() => boolean} condition
		 * @returns {Promise<void>}
		 */
		async function until(condition) {
			const started = Date.now()
			while (!condition()) {
				if (Date.now() - started > 2000) assert.fail("Timed out")
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
			"abort before start",
			async () => {
				let calls = 0
				function pay() {
					calls++
					return "paid"
				}
				const controller = new AbortController()
				controller.abort("closed")
				const run = flow().add(pay)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				assert.equal(run.status, "cancelled")
				const error = await rejection(run)
				assert.instanceOf(error, CancelError)
				assert.equal(error.cause, "closed")
				await pause(0)
				assert.equal(calls, 0)
				assert.deepEqual(run.nodes, { pay: "idle" })
				run.reload()
				assert.equal(run.status, "cancelled")
				assert.equal(calls, 0)
			}
		)
		it(
			"activation and stale branches",
			async () => {
				let polls = 0
				function hide() {
					return "hidden"
				}
				async function poll() {
					await pause(1)
					if (++polls < 3) throw Error("Pending")
					return "job"
				}
				function route() {
					return "show"
				}
				function show(/** @type {string} */ job) {
					return "show " + job
				}
				const shown = flow()
					.add(route)
					.add(
						poll,
						{
							catch: async (_, { goto, sleep }) => (await sleep(1), goto(poll))
						}
					)
					.add(show, poll)
					.add(hide)
					.edge(route, { hide, show })
					.run()
				await shown
				assert.deepEqual(
					shown.nodes,
					{
						hide: "skipped",
						poll: "done",
						route: "done",
						show: "done"
					}
				)
				let plan = "premium"
				function basic() {
					return "basic home"
				}
				function get_plan() {
					return plan
				}
				function home(
					/** @type {string | undefined} */ a,
					/** @type {string | undefined} */ b
				) {
					return a ?? b
				}
				function premium() {
					return "premium home"
				}
				const page = flow()
					.add(get_plan)
					.add(premium)
					.add(basic)
					.add(
						home,
						premium,
						basic,
						{ join: "any" }
					)
					.edge(get_plan, { basic, premium })
					.run()
				assert.equal(await page, "premium home")
				plan = "basic"
				page.reload(get_plan)
				assert.equal(await page, "basic home")
				assert.equal(page.nodes["premium"], "skipped")
				let tries = 0
				function check(/** @type {number} */ count) {
					return count < 3 ? "again" : "done"
				}
				function fetch_it() {
					return ++tries
				}
				const looped = flow()
					.add(check, fetch_it)
					.add(fetch_it)
					.edge(
						check,
						{ again: fetch_it },
						result => result == "again" ? result : null
					)
					.run()
				assert.equal(await looped, 3)
				tries = 0
				const strict = flow()
					.add(check, fetch_it)
					.add(fetch_it)
					.edge(
						check,
						/** @type {never} */({ again: fetch_it })/**/
					)
					.run()
				const failure = /** @type {FlowError} */(await rejection(strict))/**/
				assert.instanceOf(failure, FlowError)
				assert.equal(failure.node, "check")
				assert.match(
					String(failure.cause),
					/selected "done", which is not one of its keys/
				)
			}
		)
		it(
			"arriving dependencies",
			async () => {
				const bread = flow.input("bread")
				const cabbage = flow.input("cabbage")
				const patty = flow.input("patty")
				/** @type {string[]} */
				const log = []
				async function burger(
					/** @type {unknown} */ b,
					/** @type {unknown} */ p,
					/** @type {unknown} */ c,
					/** @type {Context} */ { sleep }
				) {
					log.push(`start ${b}+${p}+${c}`)
					try {
						await sleep(200)
					} catch (error) {
						log.push(`drop ${b}+${p}+${c}`)
						throw error
					}
					return `${b}+${p}+${c}`
				}
				const run = flow().add(bread)
					.add(patty)
					.add(cabbage)
					.add(
						burger,
						flow.queue(bread),
						flow.restart(patty),
						flow.keep(cabbage),
						{ name: "burger", optional: true }
					)
					.run()
				run.catch(() => {})
				/** @type {unknown[]} */
				const served = []
				void (async () => {
					for await (const made of run.stream(burger)) served.push(made)
				})()
				await pause(2)
				run.send(patty, "p1")
				run.send(cabbage, "c1")
				run.send(bread, "b1")
				await pause(25)
				run.send(cabbage, "c2")
				await pause(25)
				run.send(patty, "p2")
				await pause(25)
				run.send(bread, "b2")
				await pause(700)
				assert.deepEqual(
					log,
					[
						"start b1+p1+c1",
						"drop b1+p1+c1",
						"start b1+p2+c2",
						"start b2+p2+c2"
					]
				)
				assert.deepEqual(
					served,
					[ "b1+p2+c2", "b2+p2+c2" ]
				)
				run.cancel()
				assert.throws(
					() => flow.queue(/** @type {never} */(7)/**/),
					/flow.queue\(\) needs/
				)
				assert.throws(
					() => flow().add(
						() => 1,
						flow.keep(
							/** @type {never} */("bread")/**/
						)
					),
					/flow.keep\(\) needs/
				)
			}
		)
		it(
			"arriving queues",
			async () => {
				const bread = flow.input("bread")
				/** @type {unknown[]} */
				const made = []
				async function burger(
					/** @type {unknown} */ value,
					/** @type {Context} */ { sleep }
				) {
					await sleep(60)
					made.push(value)
					return value
				}
				const limited = flow().add(bread)
					.add(
						burger,
						flow.queue(bread),
						{ limit: 2, name: "burger" }
					)
					.run()
				limited.catch(() => {})
				await pause(2)
				limited.send(bread, "b1")
				await pause(10)
				for (const value of [ "b2", "b3", "b4" ]) limited.send(bread, value)
				assert.equal(limited.pending(burger), 3)
				await pause(400)
				assert.equal(limited.pending(burger), 0)
				assert.deepEqual(made, [ "b1", "b3", "b4" ])
				assert.equal(limited.status, "done")
				limited.send(bread, "b5")
				assert.equal(await limited, "b5")
				assert.deepEqual(made, [ "b1", "b3", "b4", "b5" ])
				limited.cancel()
				const paused = flow().add(bread)
					.add(
						burger,
						flow.queue(bread),
						{ name: "burger" }
					)
					.run()
				paused.catch(() => {})
				await pause(2)
				for (const value of [ "c1", "c2", "c3" ]) paused.send(bread, value)
				await pause(10)
				const saved = JSON.parse(
					JSON.stringify(paused.snapshot())
				)
				paused.cancel()
				assert.deepEqual(
					saved.nodes.burger.queued,
					{ bread: [ "c1", "c2", "c3" ] }
				)
				made.length = 0
				const resumed = flow().add(bread)
					.add(
						burger,
						flow.queue(bread),
						{ name: "burger" }
					)
					.run(void 0, { snapshot: saved })
				resumed.catch(() => {})
				await pause(400)
				assert.deepEqual(made, [ "c1", "c2", "c3" ])
				resumed.cancel()
				assert.throws(
					() => flow().add(bread)
						.add(
							burger,
							bread,
							/** @type {never} */({ limit: 2 })/**/
						),
					"flow.queue() dependency"
				)
			}
		)
		it(
			"branches and loops like a flowchart",
			async () => {
				/** @param {MergeContext} context */
				function compare({ state: s }) {
					return Number(s.a[s.i]) < Number(s.b[s.j])
				}
				/** @param {MergeContext} context */
				function rest_a({ state: s }) {
					return void s.c.push(...s.a.slice(s.i))
				}
				/** @param {MergeContext} context */
				function rest_b({ state: s }) {
					return void s.c.push(...s.b.slice(s.j))
				}
				/** @param {MergeContext} context */
				function take_a({ state: s }) {
					return void s.c.push(Number(s.a[s.i++]))
				}
				/** @param {MergeContext} context */
				function take_b({ state: s }) {
					return void s.c.push(Number(s.b[s.j++]))
				}
				/** @type {MergeContext["state"]} */
				const state = {
					a: [ 1, 3, 5, 9 ],
					b: [ 2, 4, 6 ],
					c: [],
					i: 0,
					j: 0
				}
				const merge = /** @type {import("async-lube").Flow<MergeContext["state"]>} */(flow({ maxSteps: 100 }))/**/
					.add(compare)
					.add(take_a)
					.add(take_b)
					.add(rest_a)
					.add(rest_b)
					.edge(
						compare,
						{ false: take_b, true: take_a }
					)
					.edge(
						take_a,
						[ compare, rest_b ],
						(_, { state: s }) => s.i < s.a.length ? compare : rest_b
					)
					.edge(
						take_b,
						[ compare, rest_a ],
						(_, { state: s }) => s.j < s.b.length ? compare : rest_a
					)
				const run = merge.run(state)
				await run
				assert.deepEqual(state.c, [ 1, 2, 3, 4, 5, 6, 9 ])
				assert.equal(run.status, "done")
				assert.deepEqual(
					run.nodes,
					{
						compare: "done",
						rest_a: "done",
						rest_b: "skipped",
						take_a: "skipped",
						take_b: "done"
					}
				)
				assert.equal(
					merge.mermaid(),
					[
						"flowchart TD",
						"\tn0[\"compare\"]",
						"\tn1[\"take_a\"]",
						"\tn2[\"take_b\"]",
						"\tn3[\"rest_a\"]",
						"\tn4[\"rest_b\"]",
						"\tn0 -.->|\"false\"| n2",
						"\tn0 -.->|\"true\"| n1",
						"\tn1 -.-> n0",
						"\tn1 -.-> n4",
						"\tn2 -.-> n0",
						"\tn2 -.-> n3"
					].join("\n")
				)
			}
		)
		it(
			"builder",
			async () => {
				function a() {
					return 1
				}
				function b(/** @type {number} */ value) {
					return value + 1
				}
				const base = flow().add(a)
				const first = base.add(b, a)
				assert.notInclude(base.mermaid(), "\"b\"")
				assert.include(first.mermaid(), "n0 --> n1")
				function c(/** @type {number} */ value) {
					return value + 2
				}
				const second = base.add(c, a)
				const third = first.add(c, a)
				const second_run = second.run()
				assert.equal(await second_run, 3)
				assert.deepEqual(
					Object.keys(second_run.nodes),
					[ "a", "c" ]
				)
				const third_run = third.run()
				assert.equal(await third_run, 3)
				assert.deepEqual(
					Object.keys(third_run.nodes),
					[ "a", "b", "c" ]
				)
				assert.deepEqual(
					Object.keys(first.run().nodes),
					[ "a", "b" ]
				)
				assert.deepEqual(
					Object.keys(base.add(() => 0).run().nodes),
					[ "a", "node" ]
				)
				assert.deepEqual(
					Object.keys(base.add(() => 0).run().nodes),
					[ "a", "node" ]
				)
				assert.throws(
					() => second.add(c, a),
					"function \"c\" is already added as flow node \"c\""
				)
				function load() {
					return 1
				}
				const loaders = { load: () => 2 }
				const named = flow()
					.add(load)
					.add(loaders.load)
					.add(() => 3)
					.add(() => 4)
					.run()
				await named
				assert.deepEqual(
					Object.keys(named.nodes),
					[ "load", "load_2", "node", "node_2" ]
				)
				function items() {
					return [ 1 ]
				}
				const b_all = flow.each(b)
				const chart = flow()
					.add(items)
					.add(b_all, items)
					.add(
						flow.input("confirm"),
						b_all,
						{ fallback: a }
					)
					.add(a)
				assert.include(
					chart.mermaid(),
					"n1@{ shape: procs, label: \"b\" }"
				)
				assert.include(
					chart.mermaid(),
					"n2[/\"confirm\"/]"
				)
				assert.include(
					chart.mermaid(),
					"n2 -.->|\"fallback\"| n3"
				)
				function accepted(/** @type {boolean} */ value) {
					return value
				}
				function rejected() {
					return false
				}
				function route() {
					return true
				}
				assert.equal(
					flow()
						.add(route)
						.add(accepted, route)
						.add(rejected)
						.edge(
							route,
							{ false: rejected, true: accepted }
						)
						.add(a)
						.edge(accepted, a)
						.mermaid(),
					[
						"flowchart TD",
						"\tn0[\"route\"]",
						"\tn1[\"accepted\"]",
						"\tn2[\"rejected\"]",
						"\tn3[\"a\"]",
						"\tn0 -.->|\"false\"| n2",
						"\tn0 -->|\"true\"| n1",
						"\tn1 -.-> n3"
					].join("\n")
				)
				assert.include(
					flow().add(base, { name: "sub" })
						.mermaid(),
					"n0[[\"sub\"]]"
				)
				assert.equal(
					flow().add(route)
						.add(
							rejected,
							{ finish: true, overlap: "queue" }
						)
						.add(accepted, flow.queue(route))
						.add(
							a,
							accepted,
							rejected,
							{ join: "race" }
						)
						.mermaid(),
					[
						"flowchart TD",
						"\tn0[\"route\"]",
						"\tn1[\"rejected (finish, overlap: queue)\"]",
						"\tn2[\"accepted\"]",
						"\tn3[\"a (join: race)\"]",
						"\tn0 -->|\"queue\"| n2",
						"\tn2 --> n3",
						"\tn1 --> n3"
					].join("\n")
				)
				assert.throws(
					() => base.add(a),
					"function \"a\" is already added as flow node \"a\""
				)
				assert.throws(
					() => base.add(
						/** @type {never} */(b)/**/,
						{ name: "a" }
					),
					"Flow node \"a\" is already defined"
				)
				assert.throws(
					() => base.add(
						/** @type {never} */(b)/**/,
						{ name: "a.b" }
					),
					"without \".\""
				)
				assert.throws(
					() => base.add(/** @type {never} */(1)/**/),
					"must be a function, an input, a flow or a stream"
				)
				assert.throws(
					() => base.add(
						/** @type {never} */(b)/**/,
						/** @type {never} */(1)/**/
					),
					"must be functions, inputs, flows or streams"
				)
				assert.throws(
					() => base.add(
						b,
						a,
						/** @type {never} */({ catch: "a" })/**/
					),
					"must be a function"
				)
				assert.throws(
					() => base.add(
						b,
						a,
						/** @type {never} */({ catch: () => 0, fallback: a })/**/
					),
					"both catch and fallback"
				)
				assert.throws(
					() => base.add(
						b,
						a,
						{
							fallback: /** @type {never} */(1)/**/
						}
					),
					"fallback of flow node"
				)
				assert.throws(
					() => flow.each(
						/** @type {never} */(flow.input())/**/
					),
					"flow.each() needs a function or a flow"
				)
				assert.throws(
					() => base.add(
						b,
						a,
						/** @type {never} */({ join: "some" })/**/
					),
					"must be \"all\", \"any\" or \"race\""
				)
				assert.throws(
					() => base.edge(/** @type {never} */(1)/**/, a),
					"must start from"
				)
				assert.throws(
					() => base.edge(a, a)
						.edge(a, a),
					"already defined"
				)
				assert.throws(
					() => base.edge(a, /** @type {never} */(1)/**/),
					"Invalid edge"
				)
				assert.throws(
					() => base.edge(
						a,
						/** @type {never} */(a)/**/,
						/** @type {never} */(() => a)/**/
					),
					"must list its targets"
				)
				assert.throws(
					() => flow().add(b, a)
						.run(),
					"depends on function \"a\", which is not added"
				)
				assert.throws(
					() => base.edge(a, b)
						.run(),
					"goes to function \"b\", which is not added"
				)
				assert.throws(
					() => flow().add(a, { fallback: b })
						.run(),
					"fallback of flow node \"a\" is function \"b\""
				)
				function x(/** @type {number} */ value) {
					return value
				}
				function y(/** @type {number} */ value) {
					return value
				}
				assert.throws(
					() => flow().add(x, y)
						.add(y, x)
						.run(),
					"Circular dependency: x -> y -> x"
				)
			}
		)
		it(
			"cancel",
			async () => {
				/** @type {AbortSignal[]} */
				const signals = []
				/** @param {Context} context */
				function hang({ signal }) {
					signals.push(signal)
					return new Promise(() => {})
				}
				/** @param {Context} context */
				function wait_long({ signal, sleep }) {
					signals.push(signal)
					return sleep(10000)
				}
				const run = flow()
					.add(hang)
					.add(wait_long)
					.run()
				await pause(5)
				run.cancel("leave")
				const error = await rejection(run)
				assert.instanceOf(error, CancelError)
				assert.isTrue(isCancel(error))
				assert.equal(run.status, "cancelled")
				assert.isTrue(
					signals.every(signal => signal.aborted)
				)
				assert.deepEqual(
					run.nodes,
					{
						hang: "cancelled",
						wait_long: "cancelled"
					}
				)
				const controller = new AbortController()
				const signalled = flow()
					.add(wait_long)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				controller.abort("unmounted")
				assert.isTrue(
					isCancel(await rejection(signalled))
				)
			}
		)
		it(
			"cancel during retry delay",
			async () => {
				let attempts = 0
				/** @type {AbortSignal | undefined} */
				let last_signal
				/** @param {Context} context */
				function flaky({ signal }) {
					attempts++
					last_signal = signal
					throw Error("again")
				}
				const run = flow()
					.add(
						flaky,
						{ retry: { count: 5, delay: 30 } }
					)
					.run()
				await pause(10)
				assert.equal(run.status, "running")
				assert.equal(run.nodes["flaky"], "running")
				run.cancel("leave")
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
				assert.isTrue(last_signal?.aborted)
				await pause(60)
				assert.equal(attempts, 1)
				assert.deepEqual(
					run.nodes,
					{ flaky: "cancelled" }
				)
				const controller = new AbortController()
				const signalled = flow()
					.add(
						flaky,
						{ retry: { count: 5, delay: 30 } }
					)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				await pause(10)
				controller.abort()
				assert.instanceOf(
					await rejection(signalled),
					CancelError
				)
				await pause(60)
				assert.equal(attempts, 2)
			}
		)
		it(
			"cancel edge cases",
			async () => {
				/** @type {string[]} */
				const calls = []
				function pay() {
					calls.push("pay")
					return "paid"
				}
				const cancelled = flow().add(pay)
					.run()
				cancelled.cancel()
				assert.instanceOf(
					await rejection(cancelled),
					CancelError
				)
				const controller = new AbortController()
				const aborted = flow().add(pay)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				controller.abort()
				assert.instanceOf(
					await rejection(aborted),
					CancelError
				)
				await pause(5)
				assert.deepEqual(calls, [])
				const unmount = new AbortController()
				const reloaded = flow().add(pay)
					.run(
						void 0,
						{ signal: unmount.signal }
					)
				assert.equal(await reloaded, "paid")
				unmount.abort("unmounted")
				reloaded.reload()
				assert.equal(reloaded.status, "cancelled")
				assert.instanceOf(
					await rejection(reloaded),
					CancelError
				)
				function gate() {
					return "open"
				}
				/** @type {import("async-lube").FlowRun<unknown, string>} */
				const gated = flow()
					.add(gate)
					.add(
						pay,
						gate,
						{
							when: () => {
								gated.cancel("user left")
								return true
							}
						}
					)
					.run()
				assert.instanceOf(
					await rejection(gated),
					CancelError
				)
				await pause(5)
				assert.deepEqual(calls, [ "pay" ])
				const code = flow.input("code")
				function use_code(/** @type {unknown} */ value) {
					return "paid " + value
				}
				const waiting = flow().add(code)
					.add(use_code, code)
					.run()
				waiting.cancel()
				await rejection(waiting)
				waiting.send(code, "1234")
				assert.equal(await waiting, "paid 1234")
			}
		)
		it(
			"catch, optional and failure",
			async () => {
				function combine(
					/** @type {string} */ recovered,
					/** @type {undefined} */ missing
				) {
					return [ recovered, missing ]
				}
				/** @returns {string} */
				function down() {
					throw Error("down")
				}
				function ignored() {
					throw Error("ignored")
				}
				const recovered = flow()
					.add(
						down,
						{
							catch: error => "fallback: " + /** @type {Error} */(error)/**/.message
						}
					)
					.add(ignored, { optional: true })
					.add(combine, down, ignored)
					.run()
				assert.deepEqual(
					await recovered,
					[ "fallback: down", void 0 ]
				)
				assert.deepEqual(
					recovered.nodes,
					{
						combine: "done",
						down: "done",
						ignored: "failed"
					}
				)
				assert.deepEqual(
					Object.keys(recovered.errors).sort(),
					[ "down", "ignored" ]
				)
				/** @type {AbortSignal | undefined} */
				let sibling_signal
				async function broken() {
					await pause(5)
					throw Error("boom")
				}
				/** @param {Context} context */
				function slow({ signal, sleep }) {
					sibling_signal = signal
					return sleep(10000)
				}
				const failing = flow()
					.add(slow)
					.add(broken)
					.run()
				const error = await rejection(failing)
				assert.instanceOf(error, FlowError)
				assert.equal(error.node, "broken")
				assert.equal(
					error.message,
					"Flow node \"broken\" failed: boom"
				)
				assert.isTrue(sibling_signal?.aborted)
				assert.equal(failing.status, "failed")
				assert.deepEqual(
					failing.nodes,
					{
						broken: "failed",
						slow: "cancelled"
					}
				)
			}
		)
		it(
			"check",
			async () => {
				function first() {
					return 1
				}
				function second(/** @type {number} */ value) {
					return value + 1
				}
				assert.deepEqual(
					flow().add(first)
						.add(second, first)
						.check(),
					[]
				)
				function loop_a(/** @type {unknown} */ value) {
					return value
				}
				function loop_b(/** @type {unknown} */ value) {
					return value
				}
				const cyclic = flow().add(loop_a, loop_b)
					.add(loop_b, loop_a)
				assert.deepEqual(
					cyclic.check(),
					[
						"Circular dependency: loop_a -> loop_b -> loop_a"
					]
				)
				assert.throws(
					() => cyclic.run(),
					"Circular dependency"
				)
				function dead_a() {
					return 1
				}
				function dead_b() {
					return 2
				}
				const dead = flow().add(dead_a, { fallback: dead_b })
					.add(dead_b, { fallback: dead_a })
				assert.deepEqual(
					dead.check(),
					[
						"Flow node \"dead_a\" never starts: it does not run with the flow, and no node that runs goes to it",
						"Flow node \"dead_b\" never starts: it does not run with the flow, and no node that runs goes to it"
					]
				)
				const run = dead.run()
				await run
				assert.deepEqual(
					run.nodes,
					{ dead_a: "idle", dead_b: "idle" }
				)
				assert.deepEqual(
					flow().add(first)
						.add(second, first)
						.edge(second, first)
						.check(),
					[]
				)
				const bids = channel()
				const end = flow.input("end")
				function close(
					/** @type {unknown} */ bid,
					/** @type {unknown} */ ended
				) {
					return ended ?? bid
				}
				function handle(/** @type {unknown} */ bid) {
					return bid
				}
				assert.deepEqual(
					flow().add(bids, { name: "bids" })
						.add(handle, flow.queue(bids))
						.add(end)
						.add(close, handle, end, { join: "race" })
						.check(),
					[
						"Flow node \"close\" races \"handle\", which runs again for every value of the stream \"bids\", so the race ends with its first value"
					]
				)
				assert.deepEqual(
					flow().add(bids, { name: "bids" })
						.add(end)
						.add(close, bids, end, { join: "race" })
						.check(),
					[
						"Flow node \"close\" races the stream \"bids\", so the race ends with its first value"
					]
				)
				assert.deepEqual(
					flow().add(first)
						.add(end)
						.add(close, first, end, { join: "race" })
						.check(),
					[]
				)
				function pay(/** @type {number} */ value) {
					return value
				}
				assert.deepEqual(
					flow().add(first)
						.add(pay, first, { finish: true })
						.add(end)
						.add(close, pay, end, { join: "race" })
						.check(),
					[]
				)
				assert.deepEqual(
					flow().add(first)
						.add(pay, first, { finish: true })
						.add(end)
						.add(close, first, end, { join: "race" })
						.check(),
					[
						"Flow node \"pay\" has finish, but no race can abandon it"
					]
				)
				assert.deepEqual(
					flow().add(first)
						.add(pay, first, { finish: true })
						.add(second, pay)
						.add(end)
						.add(close, second, end, { join: "race" })
						.check(),
					[]
				)
				assert.deepEqual(
					flow().add(() => 1)
						.add(
							flow().add(first)
								.add(flow.input())
						)
						.add(first)
						.add(bids)
						.check(),
					[
						"Flow node \"node\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option",
						"Flow node \"flow\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option",
						"Flow node \"flow.input\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option",
						"Flow node \"stream\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option"
					]
				)
				assert.deepEqual(
					flow().add(flow.input("otp"))
						.add(flow.input("otp"))
						.check(),
					[
						"Flow node \"otp_2\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option"
					]
				)
				assert.deepEqual(
					flow().add(first)
						.add(flow().add(first), { name: "a" })
						.add(flow().add(first), { name: "b" })
						.check(),
					[]
				)
			}
		)
		it(
			"concurrency",
			async () => {
				let active = 0
				let max_active = 0
				function create_task() {
					return async () => {
						max_active = Math.max(max_active, ++active)
						await pause(5)
						active--
					}
				}
				const a = create_task()
				await flow({ concurrency: 2 })
					.add(a, { name: "a" })
					.add(create_task(), { name: "b" })
					.add(create_task(), { name: "c" })
					.add(create_task(), a, { name: "d" })
					.add(create_task(), { name: "e" })
					.run()
				assert.equal(max_active, 2)
				active = 0
				max_active = 0
				function failing() {
					throw Error("down")
				}
				const run = flow({ concurrency: 1 })
					.add(
						failing,
						{
							catch: (_, { sleep }) => sleep(20).then(() => "late")
						}
					)
					.add(create_task(), { name: "b" })
					.add(create_task(), { name: "c" })
					.run()
				await pause(1)
				assert.deepEqual(
					run.nodes,
					{
						b: "running",
						c: "pending",
						failing: "running"
					}
				)
				run.reload(failing)
				await run
				assert.deepEqual(
					run.results,
					{
						b: void 0,
						c: void 0,
						failing: "late"
					}
				)
				assert.equal(max_active, 1)
			}
		)
		it(
			"dead paths with several sources",
			async () => {
				/** @type {string[]} */
				const log = []
				function a() {
					return pause(5)
				}
				function b() {
					return pause(30)
				}
				function d() {
					return (log.push("d"), "D")
				}
				function e() {
					return (log.push("e"), "E")
				}
				function merge(
					/** @type {string | undefined} */ x,
					/** @type {string | undefined} */ y
				) {
					log.push("merge")
					return [ x, y ].join("|")
				}
				assert.equal(
					await flow()
						.add(a)
						.add(b)
						.add(d)
						.add(e)
						.add(merge, d, e, { join: "any" })
						.edge(a, [ d, e ], () => e)
						.edge(b, d)
						.run(),
					"D|E"
				)
				assert.deepEqual(log, [ "e", "d", "merge" ])
			}
		)
		it(
			"deep chains",
			async () => {
				/** @type {import("async-lube").Flow<{ go: boolean }, boolean | undefined>} */
				let chain = /** @type {import("async-lube").Flow<{ go: boolean }>} */(flow())/**/
				function first(
					/** @type {Context<{ go: boolean }>} */ { state }
				) {
					return state.go
				}
				/** @type {import("async-lube").Ref<boolean>} */
				let previous = first
				chain = chain.add(
					first,
					{
						name: "n0",
						when: (
							/** @type {{ state: { go: boolean } }} */ { state }
						) => state.go
					}
				)
				for (let i = 1; i < 5000; i++) {
					function next(/** @type {boolean} */ value) {
						return value
					}
					chain = chain.add(next, previous, { name: "n" + i })
					previous = next
				}
				const state = { go: false }
				const run = chain.run(state)
				assert.equal(await run, void 0)
				assert.equal(run.nodes["n4999"], "skipped")
				state.go = true
				run.reload()
				assert.equal(await run, true)
			}
		)
		it(
			"dependencies",
			async () => {
				/** @type {string[]} */
				const events = []
				async function get_cart() {
					events.push("start cart")
					await pause(5)
					events.push("end cart")
					return "cart"
				}
				function get_quote(
					/** @type {string} */ cart,
					/** @type {string} */ user
				) {
					return cart + "+" + user
				}
				async function get_user() {
					events.push("start user")
					await pause(20)
					events.push("end user")
					return "user"
				}
				const run = flow()
					.add(get_user)
					.add(get_cart)
					.add(get_quote, get_cart, get_user)
					.run()
				assert.equal(await run, "cart+user")
				assert.deepEqual(
					events,
					[
						"start user",
						"start cart",
						"end cart",
						"end user"
					]
				)
				assert.deepEqual(
					run.results,
					{
						get_cart: "cart",
						get_quote: "cart+user",
						get_user: "user"
					}
				)
				assert.equal(run.get(get_cart), "cart")
				assert.throws(
					() => run.get(() => 1),
					"is not added to the flow"
				)
				events.length = 0
				const reversed = flow()
					.add(get_quote, get_cart, get_user)
					.add(get_cart)
					.add(get_user)
					.run()
				assert.equal(await reversed, "user")
				assert.equal(
					reversed.get(get_quote),
					"cart+user"
				)
				assert.deepEqual(
					events,
					[
						"start cart",
						"start user",
						"end cart",
						"end user"
					]
				)
			}
		)
		it(
			"duplicate dependencies",
			async () => {
				function a() {
					return 1
				}
				function twice(
					/** @type {number} */ x,
					/** @type {number} */ y,
					/** @type {Context} */ { name }
				) {
					return [ x, y, name ]
				}
				assert.deepEqual(
					await flow().add(a)
						.add(twice, a, a)
						.run(),
					[ 1, 1, "twice" ]
				)
				function self(/** @type {number} */ x) {
					return x
				}
				assert.throws(
					() => flow().add(self, self)
						.run(),
					"Circular dependency: self -> self"
				)
			}
		)
		it(
			"each",
			async () => {
				let active = 0
				let max_active = 0
				/** @type {Record<string, number>} */
				const attempts = {}
				function files() {
					return [ "a", "b", "c", "d" ]
				}
				/**
				 * @param {string} file
				 * @param {Context} context
				 */
				async function upload(file, { index }) {
					max_active = Math.max(max_active, ++active)
					attempts[file] = (attempts[file] ?? 0) + 1
					await pause(5)
					active--
					if (file == "b" && Number(attempts[file]) < 2) throw Error("flaky")
					if (file == "c") throw Error("broken")
					return file.toUpperCase() + index
				}
				const uploads = flow()
					.add(files)
					.add(
						flow.each(upload),
						files,
						{
							concurrency: 2,
							optional: true,
							retry: 1
						}
					)
					.run()
				assert.deepEqual(
					await uploads,
					[ "A0", "B1", void 0, "D3" ]
				)
				assert.equal(max_active, 2)
				assert.deepEqual(
					attempts,
					{ a: 1, b: 2, c: 2, d: 1 }
				)
				assert.deepEqual(
					Object.keys(uploads.errors),
					[ "upload.2" ]
				)
				function lines() {
					return [ "1", "x", "3" ]
				}
				/** @param {string} line */
				function parse(line) {
					if (Number.isNaN(Number(line))) throw Error("NaN")
					return Number(line)
				}
				const parsed = await flow()
					.add(lines)
					.add(
						flow.each(parse),
						lines,
						{
							catch: (_, line) => "bad " + line
						}
					)
					.run()
				assert.deepEqual(parsed, [ 1, "bad x", 3 ])
				/** @type {AbortSignal[]} */
				const signals = []
				function numbers() {
					return [ 1, 2, 3 ]
				}
				/**
				 * @param {number} value
				 * @param {Context} context
				 */
				async function work(value, { signal }) {
					signals.push(signal)
					if (value == 1) {
						await pause(1)
						throw Error("first")
					}
					return new Promise(() => {})
				}
				const error = await rejection(
					flow()
						.add(numbers)
						.add(flow.each(work), numbers)
						.run()
				)
				assert.instanceOf(error, FlowError)
				assert.equal(
					/** @type {Error} */(error.cause)/**/.message,
					"first"
				)
				assert.isTrue(
					signals.slice(1).every(signal => signal.aborted)
				)
				function docs() {
					return [ "a", "b" ]
				}
				const approve = flow.input("approve")
				/** @param {Context<string>} context */
				function title({ state }) {
					return state.toUpperCase()
				}
				const review = /** @type {import("async-lube").Flow<string>} */(flow())/**/
					.add(title)
					.add(approve, title)
				const reviews = flow()
					.add(docs)
					.add(
						flow.each(review),
						docs,
						{ name: "review" }
					)
					.run()
				await pause(0)
				assert.equal(reviews.status, "waiting")
				assert.equal(
					reviews.nodes["review.1.title"],
					"done"
				)
				assert.equal(
					reviews.nodes["review.1.approve"],
					"waiting"
				)
				assert.throws(
					() => reviews.send("review.2.approve", true),
					"Flow node \"review\" has no item 2"
				)
				reviews.send("review.1.approve", false)
				reviews.send("review.0.approve", true)
				assert.deepEqual(await reviews, [ true, false ])
				assert.deepEqual(
					await flow.each(parse)([ "1", "2" ]),
					[ 1, 2 ]
				)
				assert.deepEqual(
					await flow.each(
						/** @type {import("async-lube").Flow<string>} */(flow())/**/.add(title)
					)([ "a", "b" ]),
					[ "A", "B" ]
				)
				function skip_item(
					/** @type {unknown} */ _,
					/** @type {Context} */ { skip }
				) {
					return skip()
				}
				const sentinel = await rejection(
					flow()
						.add(numbers)
						.add(flow.each(skip_item), numbers)
						.run()
				)
				assert.instanceOf(sentinel, FlowError)
				assert.equal(
					/** @type {Error} */(sentinel.cause)/**/.message,
					"Flow node \"skip_item\" cannot return goto() or skip() for an item"
				)
				const rethrown = await rejection(
					flow()
						.add(numbers)
						.add(
							flow.each(work),
							numbers,
							{
								catch: () => {
									throw Error("catch failed")
								}
							}
						)
						.run()
				)
				assert.instanceOf(rethrown, FlowError)
				assert.equal(
					/** @type {Error} */(rethrown.cause)/**/.message,
					"catch failed"
				)
			}
		)
		it(
			"each and input are members of flow",
			async () => {
				const lube = await import("async-lube")
				assert.notProperty(lube, "each")
				assert.notProperty(lube, "input")
				assert.equal(flow.input("otp").name, "otp")
				assert.deepEqual(
					await flow.each(
						(/** @type {number} */ value) => value * 2
					)([ 1, 2 ]),
					[ 2, 4 ]
				)
			}
		)
		it(
			"each over async sources",
			async () => {
				async function* rows() {
					for (const n of [ 1, 2, 3 ]) yield n
				}
				const double = flow.each(
					(/** @type {number} */ x) => x * 2
				)
				assert.deepEqual(
					await flow().add(double)
						.run(rows()),
					[ 2, 4, 6 ]
				)
				function source() {
					return { [Symbol.asyncIterator]: rows }
				}
				assert.deepEqual(
					await flow().add(source)
						.add(double, source)
						.run(),
					[ 2, 4, 6 ]
				)
				let reads = 0
				let closed = false
				const endless = {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							reads++
							await pause(1)
							return { done: false, value: reads }
						},
						return: async () => {
							closed = true
							return { done: true, value: void 0 }
						}
					})
				}
				const run = flow().add(double)
					.run(endless)
				const rejected = rejection(run)
				await pause(5)
				run.cancel()
				assert.instanceOf(await rejected, CancelError)
				await pause(5)
				assert.isTrue(closed)
				assert.match(
					/** @type {Error} */(await rejection(
						flow().add(double)
							.run(7)
					))/**/.message,
					/an iterable or an async iterable/
				)
			}
		)
		it(
			"each over state",
			async () => {
				const double = flow.each(
					(/** @type {number} */ x) => x * 2
				)
				assert.deepEqual(
					await flow().add(double)
						.run([ 1, 2, 3 ]),
					[ 2, 4, 6 ]
				)
				const doubles = flow().add(double)
				function lists() {
					return [ [ 1 ], [ 2, 3 ] ]
				}
				assert.deepEqual(
					await flow().add(lists)
						.add(flow.each(doubles), lists)
						.run(),
					[ [ 2 ], [ 4, 6 ] ]
				)
			}
		)
		it(
			"each results after a JSON snapshot",
			async () => {
				let broken = true
				function emails() {
					return [ "a", "b", "c" ]
				}
				function send_mail(/** @type {string} */ to) {
					if (broken && to == "b") throw Error("smtp")
					return to
				}
				const send_all = flow.each(send_mail)
				const mails = flow().add(emails)
					.add(
						send_all,
						emails,
						{ optional: true }
					)
				const run = mails.run()
				assert.deepEqual(await run, [ "a", void 0, "c" ])
				const resumed = mails.run(
					void 0,
					{
						snapshot: JSON.parse(JSON.stringify(run.snapshot()))
					}
				)
				const result = await resumed
				assert.deepEqual(result, [ "a", void 0, "c" ])
				assert.strictEqual(result[1], void 0)
				assert.deepEqual(
					resumed.get(send_all),
					[ "a", void 0, "c" ]
				)
				broken = false
				resumed.retry()
				assert.deepEqual(await resumed, [ "a", "b", "c" ])
			}
		)
		it(
			"each retry chains",
			async () => {
				let flaky = true
				function numbers() {
					return [ 1, 2, 3 ]
				}
				const double = flow.each(
					(/** @type {number} */ x) => {
						if (x == 2 && flaky) {
							flaky = false
							throw Error("flaky")
						}
						return x * 2
					}
				)
				const increment = flow.each(
					(
						/** @type {number | undefined} */ x
					) => {
						if (x === void 0) throw Error("missing")
						return x + 1
					}
				)
				const run = flow()
					.add(numbers)
					.add(
						double,
						numbers,
						{ name: "double", optional: true }
					)
					.add(
						increment,
						double,
						{
							name: "increment",
							optional: true
						}
					)
					.run()
				assert.deepEqual(await run, [ 3, void 0, 7 ])
				assert.deepEqual(
					Object.keys(run.errors).sort(),
					[ "double.1", "increment.1" ]
				)
				run.retry()
				assert.deepEqual(await run, [ 3, 5, 7 ])
				assert.deepEqual(run.errors, {})
				let node_calls = 0
				let item_calls = 0
				function one() {
					return [ 1 ]
				}
				function plain() {
					node_calls++
					throw Error("plain")
				}
				const items = flow.each(
					() => {
						item_calls++
						throw Error("item")
					}
				)
				const caught = flow()
					.add(one)
					.add(
						plain,
						{ catch: () => "fallback" }
					)
					.add(
						items,
						one,
						{
							catch: () => "fallback",
							name: "items"
						}
					)
					.run()
				assert.deepEqual(await caught, [ "fallback" ])
				assert.deepEqual(
					Object.keys(caught.errors).sort(),
					[ "items.0", "plain" ]
				)
				caught.retry()
				await caught
				assert.deepEqual(
					[ node_calls, item_calls ],
					[ 1, 1 ]
				)
				function files() {
					return [ "a", "b", "c" ]
				}
				const upload = flow.each(
					(/** @type {string} */ file) => {
						if (file == "b") throw Error("too large")
						return file
					}
				)
				const failed = flow().add(files)
					.add(upload, files, { name: "upload" })
					.run()
				const error = await rejection(failed)
				assert.instanceOf(error, FlowError)
				assert.equal(error.node, "upload")
				assert.deepEqual(
					Object.keys(failed.errors).sort(),
					[ "upload", "upload.1" ]
				)
				assert.deepEqual(
					internals(failed).nodes["upload"]?.items,
					[
						{ value: "a" },
						null,
						{ value: "c" }
					]
				)
				const ten_times = flow.each(
					(/** @type {number} */ x) => x * 10
				)
				function values() {
					return [ 1, 2 ].values()
				}
				const once = flow()
					.add(values)
					.add(
						ten_times,
						values,
						{ name: "ten_times" }
					)
					.run()
				assert.deepEqual(await once, [ 10, 20 ])
				once.reload(ten_times)
				assert.deepEqual(await once, [ 10, 20 ])
			}
		)
		it(
			"edge keys and cancel reasons",
			async () => {
				const choice = flow.input("choice")
				function no() {
					return "no"
				}
				function yes() {
					return "yes"
				}
				const branched = flow()
					.add(choice)
					.add(yes)
					.add(no)
					.edge(choice, { false: no, true: yes })
					.run()
				branched.send(choice, Object.create(null))
				const error = await rejection(branched)
				assert.instanceOf(error, FlowError)
				assert.equal(
					/** @type {FlowError} */(error)/**/.node,
					"choice"
				)
				assert.equal(branched.status, "failed")
				/** @type {unknown} */
				let reason
				const cancelled = flow()
					.add(
						(
							/** @type {Context} */ { signal, sleep }
						) => {
							signal.addEventListener(
								"abort",
								() => {
									reason = signal.reason
								}
							)
							return sleep(1000)
						}
					)
					.run()
				await pause(0)
				cancelled.cancel("closed")
				assert.strictEqual(
					await rejection(cancelled),
					reason
				)
			}
		)
		it(
			"edge selectors",
			async () => {
				/** @type {string[]} */
				const log = []
				function answer() {
					return log.push("answer")
				}
				function ask() {
					return log.push("ask")
				}
				function judge(
					/** @type {Context<{ verdict: string }>} */ { state }
				) {
					return { verdict: state.verdict }
				}
				const agent = /** @type {import("async-lube").Flow<{ verdict: string }>} */(flow())/**/
					.add(judge)
					.add(answer)
					.add(ask)
					.edge(
						judge,
						{
							"answer": answer,
							"ask the user": ask
						},
						result => /** @type {"answer" | "ask the user"} */(result.verdict)/**/
					)
				await agent.run({ verdict: "ask the user" })
				await agent.run({ verdict: "answer" })
				assert.deepEqual(log, [ "ask", "answer" ])
				const typo = await rejection(
					agent.run({ verdict: "answr" })
				)
				assert.instanceOf(typo, FlowError)
				assert.equal(
					/** @type {Error} */(typo.cause)/**/.message,
					"The edge from \"judge\" selected \"answr\", which is not one of its keys"
				)
				const object_map = await rejection(
					/** @type {import("async-lube").Flow<{ verdict: string }>} */(flow())/**/
						.add(judge)
						.add(answer)
						.edge(
							judge,
							/** @type {never} */({ answer })/**/
						)
						.run({ verdict: "answer" })
				)
				assert.instanceOf(object_map, FlowError)
				assert.equal(
					/** @type {Error} */(object_map.cause)/**/.message,
					"The edge from \"judge\" selected \"[object Object]\", which is not one of its keys"
				)
				log.length = 0
				await /** @type {import("async-lube").Flow<{ verdict: string }>} */(flow())/**/
					.add(judge)
					.add(answer)
					.add(ask)
					.edge(judge, [ answer, ask ])
					.run({ verdict: "both" })
				assert.deepEqual(log, [ "answer", "ask" ])
				const stray = await rejection(
					/** @type {import("async-lube").Flow<{ verdict: string }>} */(flow())/**/
						.add(judge)
						.add(answer)
						.add(ask)
						.edge(judge, [ answer ], () => ask)
						.run({ verdict: "stray" })
				)
				assert.instanceOf(stray, FlowError)
				assert.equal(
					/** @type {Error} */(stray.cause)/**/.message,
					"The edge from \"judge\" selected function \"ask\", which is not one of its targets"
				)
			}
		)
		it(
			"edge target order",
			async () => {
				for (const order of [ "ac", "ca" ]) {
					/** @type {string[]} */
					const log = []
					function a(
						/** @type {Context<{ n: number }>} */ { state }
					) {
						return state.n
					}
					function b(/** @type {number} */ value) {
						return value
					}
					async function c() {
						log.push("c")
						await pause(5)
						return "c"
					}
					const run = /** @type {import("async-lube").Flow<{ n: number }>} */(flow())/**/
						.add(a)
						.add(b, a)
						.add(c)
						.edge(
							b,
							[ a, c ],
							(_, { state }) => state.n++ < 1
								? order == "ac"
									? [ a, c ]
									: [ c, a ]
								: null
						)
						.run({ n: 0 })
					assert.equal(await run, "c")
					assert.deepEqual(
						run.nodes,
						{ a: "done", b: "done", c: "done" }
					)
					assert.deepEqual(log, [ "c" ])
				}
			}
		)
		it(
			"edge targets and dependents",
			async () => {
				/** @type {string[]} */
				const log = []
				function declined() {
					log.push("declined")
				}
				function next(
					/** @type {{ id: string } | "declined"} */ paid
				) {
					log.push("next " + String(paid))
				}
				async function pay() {
					return /** @type {{ id: string } | "declined"} */("declined")/**/
				}
				const mapped = flow().add(pay)
					.add(declined)
					.add(next, pay)
					.edge(
						pay,
						/** @type {never} */({ declined })/**/
					)
					.run()
				await mapped
				assert.sameMembers(
					log,
					[ "declined", "next declined" ]
				)
				log.length = 0
				const selected = flow().add(pay)
					.add(declined)
					.add(next, pay)
					.edge(
						pay,
						[ declined, next ],
						paid => paid == "declined" ? declined : next
					)
					.run()
				await selected
				assert.deepEqual(log, [ "declined" ])
				assert.equal(
					selected.nodes["next"],
					"skipped"
				)
			}
		)
		it(
			"empty flow",
			async () => {
				const run = flow().run()
				assert.isUndefined(await run)
				assert.equal(run.status, "done")
			}
		)
		it(
			"endless loops",
			async () => {
				function tick(
					/** @type {Context<{ n: number }>} */ { state }
				) {
					return ++state.n
				}
				assert.equal(
					await /** @type {import("async-lube").Flow<{ n: number }>} */(flow())/**/.add(tick)
						.edge(
							tick,
							[ tick ],
							count => count < 20000 ? tick : null
						)
						.run({ n: 0 }),
					20000
				)
				const message = flow.input("message")
				let handled = 0
				async function handle() {
					handled++
				}
				const consumer = flow().add(message)
					.add(handle, message)
					.edge(handle, message)
					.run()
				for (let i = 0; i < 12000; i++) {
					consumer.send(message, i)
					await new Promise(
						resolve => setImmediate(resolve)
					)
				}
				assert.equal(handled, 12000)
				assert.equal(consumer.status, "waiting")
			}
		)
		it(
			"error branch",
			async () => {
				let attempts = 0
				function pay() {
					if (++attempts < 3) throw Error("Card declined")
					return "paid"
				}
				const retry_prompt = flow.input("retry_prompt")
				/**
				 * @param {unknown} answer
				 * @param {Context} context
				 */
				function again(answer, { goto }) {
					return answer ? goto(pay) : "given up"
				}
				const payment = flow({ maxSteps: 20 })
					.add(pay, { catch: () => "declined" })
					.add(retry_prompt)
					.add(again, retry_prompt)
					.edge(
						pay,
						[ retry_prompt ],
						result => result == "declined" ? retry_prompt : null
					)
				const run = payment.run()
				await pause(0)
				assert.equal(run.status, "waiting")
				assert.equal(
					run.nodes["retry_prompt"],
					"waiting"
				)
				run.send(retry_prompt, true)
				await pause(0)
				assert.equal(
					run.nodes["retry_prompt"],
					"waiting"
				)
				run.send(retry_prompt, true)
				await run
				assert.equal(run.get(pay), "paid")
				assert.equal(attempts, 3)
				attempts = -10
				const given_up = payment.run()
				given_up.send(retry_prompt, false)
				assert.equal(await given_up, "given up")
				let polls = 0
				function poll() {
					if (++polls < 3) throw Error("Not ready")
					return "ready"
				}
				const polled = await flow()
					.add(
						poll,
						{
							catch: async (_, { goto, sleep }) => (await sleep(1), goto(poll))
						}
					)
					.run()
				assert.equal(polled, "ready")
				assert.equal(polls, 3)
				function banner() {
					throw Error("Ads blocked")
				}
				function page() {
					return "page"
				}
				const skipped = flow()
					.add(
						banner,
						{ catch: (_, { skip }) => skip() }
					)
					.add(page, banner, { join: "any" })
					.run()
				assert.isUndefined(await skipped)
				assert.deepEqual(skipped.results, {})
			}
		)
		it(
			"fallback and dead paths",
			async () => {
				/** @type {string[]} */
				const order = []
				function pay() {
					order.push("pay")
					throw Error("down")
				}
				function pay_later() {
					order.push("later")
					return "later"
				}
				function receipt(
					/** @type {undefined} */ now,
					/** @type {string | undefined} */ later
				) {
					return "receipt " + (now ?? later)
				}
				const failed = flow()
					.add(
						pay,
						{ fallback: pay_later, retry: 2 }
					)
					.add(pay_later)
					.add(
						receipt,
						pay,
						pay_later,
						{ join: "any" }
					)
					.run()
				assert.equal(await failed, "receipt later")
				assert.deepEqual(
					order,
					[ "pay", "pay", "pay", "later" ]
				)
				assert.deepEqual(
					failed.nodes,
					{
						pay: "skipped",
						pay_later: "done",
						receipt: "done"
					}
				)
				assert.equal(
					/** @type {Error} */(failed.errors["pay"])/**/.message,
					"down"
				)
				function card() {
					return "card"
				}
				function cash() {
					return "cash"
				}
				function paid(
					/** @type {string | undefined} */ by_card,
					/** @type {string | undefined} */ by_cash
				) {
					return by_card ?? by_cash
				}
				const succeeded = flow()
					.add(card, { fallback: cash })
					.add(cash)
					.add(paid, card, cash, { join: "any" })
					.run()
				assert.equal(await succeeded, "card")
				assert.equal(
					succeeded.nodes["cash"],
					"skipped"
				)
				function charge() {
					throw Error("card")
				}
				function release(/** @type {string} */ id) {
					return "released " + id
				}
				function reserve() {
					return "R1"
				}
				assert.equal(
					await flow()
						.add(reserve)
						.add(
							charge,
							reserve,
							{ fallback: release }
						)
						.add(release, reserve)
						.run(),
					"released R1"
				)
				function check() {
					return true
				}
				function merge(
					/** @type {string | undefined} */ a,
					/** @type {string | undefined} */ b
				) {
					return a ?? b
				}
				function no() {
					return "no"
				}
				function yes() {
					return "yes"
				}
				const branched = flow()
					.add(check)
					.add(yes)
					.add(no)
					.add(merge, yes, no, { join: "any" })
					.edge(check, { false: no, true: yes })
					.run()
				assert.equal(await branched, "yes")
				assert.equal(branched.nodes["no"], "skipped")
				function next() {
					return "next"
				}
				/** @param {Context} context */
				function off({ skip }) {
					return skip()
				}
				const chained = flow()
					.add(off)
					.add(next)
					.edge(off, next)
					.run()
				await chained
				assert.deepEqual(
					chained.nodes,
					{ next: "skipped", off: "skipped" }
				)
			}
		)
		it(
			"fatal failures",
			async () => {
				function after(/** @type {undefined} */ value) {
					return "after " + value
				}
				function broken() {
					throw Error("fatal")
				}
				function other() {
					return "other"
				}
				const run = flow()
					.add(other)
					.add(broken)
					.add(after, broken)
					.run()
				await rejection(run)
				run.reload(other)
				const error = await rejection(run)
				assert.instanceOf(error, FlowError)
				assert.equal(error.node, "broken")
				assert.equal(run.nodes["after"], "idle")
				function selected() {
					return "A"
				}
				function target() {
					return "B"
				}
				const failed = flow()
					.add(selected)
					.add(target)
					.edge(
						selected,
						[ target ],
						() => {
							throw Error("select failed")
						}
					)
					.run()
				await rejection(failed)
				assert.deepEqual(failed.results, {})
				assert.isUndefined(failed.get(selected))
				const delayed = flow()
					.add(
						broken,
						{
							retry: {
								count: 1,
								delay: () => {
									throw Error("delay failed")
								}
							}
						}
					)
					.run()
				const delay_error = await rejection(delayed)
				assert.instanceOf(delay_error, FlowError)
				assert.equal(
					/** @type {Error} */(delay_error.cause)/**/.message,
					"delay failed"
				)
			}
		)
		it(
			"goto and inputs",
			async () => {
				/** @type {string[]} */
				const sent = []
				function send_code() {
					return void sent.push("code")
				}
				const code = flow.input("code")
				/**
				 * @param {unknown} value
				 * @param {Context} context
				 */
				function verify(value, { goto }) {
					return value == "1234" ? "verified" : goto(code)
				}
				const signup = flow()
					.add(send_code)
					.add(code, send_code)
					.add(verify, code)
				const run = signup.run()
				await pause(0)
				assert.equal(run.nodes["code"], "waiting")
				run.send(code, "0000")
				await pause(0)
				assert.equal(run.nodes["code"], "waiting")
				assert.equal(run.nodes["verify"], "idle")
				run.send(code, "1234")
				assert.equal(await run, "verified")
				assert.deepEqual(
					run.results,
					{
						code: "1234",
						send_code: void 0,
						verify: "verified"
					}
				)
				assert.deepEqual(sent, [ "code" ])
				const early = signup.run()
				early.send(code, "1234")
				assert.equal(await early, "verified")
				assert.throws(
					() => early.send(
						/** @type {never} */(verify)/**/,
						1
					),
					"is not an input"
				)
				assert.throws(
					() => early.send(flow.input("other"), 1),
					"is not added to the flow"
				)
				let checks = 0
				/** @type {unknown[]} */
				const shown = []
				/** @param {Context} context */
				function check({ goto }) {
					return ++checks < 3 ? goto(delay) : "ready"
				}
				/** @param {Context} context */
				function delay({ sleep }) {
					return sleep(1)
				}
				function show(/** @type {string} */ value) {
					return void shown.push(value)
				}
				const polled = flow()
					.add(delay)
					.add(check)
					.add(show, check)
					.edge(delay, check)
					.run()
				await polled
				assert.equal(polled.get(check), "ready")
				assert.deepEqual(shown, [ "ready" ])
			}
		)
		it(
			"idempotency keys",
			async () => {
				/** @type {string[]} */
				const keys = []
				let failures = 2
				async function charge(
					/** @type {Context} */ { attempt, key }
				) {
					keys.push(key)
					if (failures-- > 0) throw Error(`attempt ${attempt}`)
					return key
				}
				const run = flow().add(charge, { retry: 3 })
					.run()
				const first = await run
				assert.typeOf(first, "string")
				assert.deepEqual(keys, [ first, first, first ])
				run.reload(charge)
				assert.notEqual(await run, first)
				keys.length = 0
				failures = 1
				const failed = flow().add(charge)
					.run()
				await rejection(failed)
				failed.retry()
				await failed
				assert.equal(keys[0], keys[1])
				/** @type {string[]} */
				const item_keys = []
				function upload(
					/** @type {number} */ item,
					/** @type {Context} */ { key }
				) {
					item_keys.push(key)
					return item
				}
				await flow().add(flow.each(upload))
					.run([ 1, 2 ])
				assert.equal(new Set(item_keys).size, 2)
				/** @type {string[]} */
				const sent = []
				async function pay(
					/** @type {Context} */ { key, sleep }
				) {
					await sleep(1)
					sent.push(key)
					await sleep(1000)
					return key
				}
				const before_crash = flow().add(pay)
					.run()
				before_crash.catch(() => {})
				const persisted = JSON.parse(
					JSON.stringify(before_crash.snapshot())
				)
				await pause(20)
				before_crash.cancel()
				const after_crash = flow().add(pay)
					.run(void 0, { snapshot: persisted })
				after_crash.catch(() => {})
				await pause(20)
				after_crash.cancel()
				assert.lengthOf(sent, 2)
				assert.equal(sent[0], sent[1])
				const other = flow().add(pay)
					.run()
				other.catch(() => {})
				await pause(20)
				other.cancel()
				assert.notEqual(sent[2], sent[0])
			}
		)
		it(
			"input edge cases",
			async () => {
				/** @type {AbortSignal | undefined} */
				let catch_signal
				const otp = flow.input("otp")
				const waiting = flow()
					.add(
						otp,
						{
							catch: async (_, { signal, sleep }) => {
								catch_signal = signal
								await sleep(1000)
							},
							timeout: 5
						}
					)
					.run()
				await pause(20)
				waiting.cancel()
				assert.isTrue(catch_signal?.aborted)
				assert.isTrue(
					isCancel(await rejection(waiting))
				)
				const code = flow.input("code")
				const late = flow()
					.add(
						code,
						{
							catch: () => pause(20).then(() => "fallback"),
							timeout: 5
						}
					)
					.run()
				await pause(10)
				late.send(code, "late")
				assert.equal(await late, "fallback")
				late.reload(code)
				await pause(0)
				assert.equal(late.nodes["code"], "waiting")
				late.cancel()
				const value = flow.input("value")
				function echo(/** @type {unknown} */ sent) {
					return "echo " + sent
				}
				function last(
					/** @type {string} */ a,
					/** @type {string} */ b
				) {
					return a + " " + b
				}
				function slow() {
					return pause(30).then(() => "slow")
				}
				const restarted = flow()
					.add(value)
					.add(echo, value)
					.add(slow)
					.add(last, slow, echo)
					.run()
				restarted.send(value, 1)
				await pause(5)
				restarted.cancel()
				await rejection(restarted)
				restarted.send(value, 2)
				assert.equal(await restarted, "slow echo 2")
			}
		)
		it(
			"input timeout",
			async () => {
				const confirm = flow.input("confirm")
				assert.isFalse(
					await flow()
						.add(
							confirm,
							{ catch: () => false, timeout: 10 }
						)
						.run()
				)
				const error = await rejection(
					flow()
						.add(confirm, { timeout: 10 })
						.run()
				)
				assert.instanceOf(error, FlowError)
				assert.instanceOf(error.cause, TimeoutError)
			}
		)
		it(
			"inputs added by their dependents",
			async () => {
				const bread = flow.input("bread")
				const cabbage = flow.input("cabbage")
				const patty = flow.input("patty")
				function burger(
					/** @type {unknown} */ b,
					/** @type {unknown} */ p,
					/** @type {unknown} */ c
				) {
					return `${b}+${p}+${c}`
				}
				const run = flow()
					.add(
						burger,
						flow.queue(bread),
						flow.restart(patty),
						flow.keep(cabbage)
					)
					.run()
				run.catch(() => {})
				await pause(1)
				assert.deepEqual(
					Object.keys(run.nodes),
					[
						"bread",
						"patty",
						"cabbage",
						"burger"
					]
				)
				run.send(patty, "p")
				run.send(cabbage, "c")
				run.send(bread, "b")
				assert.equal(await run, "b+p+c")
				const code = flow.input("code")
				function pay(
					/** @type {number} */ value,
					/** @type {unknown} */ given
				) {
					return `${value}+${given}`
				}
				function quote() {
					return 1
				}
				const late = flow().add(quote)
					.add(pay, quote, code)
					.add(
						code,
						quote,
						{ name: "otp", timeout: 1000 }
					)
					.run()
				await pause(1)
				assert.deepEqual(
					late.nodes,
					{
						otp: "waiting",
						pay: "idle",
						quote: "done"
					}
				)
				late.send(code, "1234")
				assert.equal(await late, "1+1234")
				assert.throws(
					() => flow().add(code)
						.add(code),
					"is already added"
				)
				const shared = flow().add(quote)
					.add(pay, quote, code)
				const renamed = shared.add(code, { name: "pin" })
				assert.deepEqual(
					Object.keys(renamed.run().nodes),
					[ "quote", "pin", "pay" ]
				)
				assert.deepEqual(
					Object.keys(shared.run().nodes),
					[ "quote", "code", "pay" ]
				)
			}
		)
		it(
			"inputs keep their latest value",
			async () => {
				const bread = flow.input("bread")
				const cabbage = flow.input("cabbage")
				const patty = flow.input("patty")
				/** @type {string[]} */
				const made = []
				function burger(
					/** @type {unknown} */ a,
					/** @type {unknown} */ b,
					/** @type {unknown} */ c
				) {
					made.push(`${a}+${b}+${c}`)
					return made.length
				}
				const run = flow().add(bread)
					.add(patty)
					.add(cabbage)
					.add(
						burger,
						bread,
						patty,
						cabbage,
						{ overlap: "queue" }
					)
					.run()
				run.catch(() => {})
				await pause(1)
				run.send(bread, "b1")
				run.send(patty, "p1")
				await pause(5)
				assert.deepEqual(made, [])
				run.send(cabbage, "c1")
				await pause(5)
				assert.deepEqual(made, [ "b1+p1+c1" ])
				run.send(patty, "p2")
				await pause(5)
				run.send(bread, "b2")
				await pause(5)
				assert.deepEqual(
					made,
					[ "b1+p1+c1", "b1+p2+c1", "b2+p2+c1" ]
				)
				run.cancel()
			}
		)
		it(
			"large batches",
			async () => {
				vi.useRealTimers()
				const items = Array.from({ length: 50000 }, (_, i) => i)
				function list() {
					return items
				}
				const double = flow.each(
					async (/** @type {number} */ x) => x * 2
				)
				const controller = new AbortController()
				const started = Date.now()
				const result = await flow().add(list)
					.add(
						double,
						list,
						{
							name: "double",
							retry: 1,
							timeout: 1000
						}
					)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				assert.equal(result.length, 50000)
				assert.equal(result[49999], 99998)
				assert.isBelow(Date.now() - started, 2000)
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
			},
			20000
		)
		it(
			"live sources",
			async () => {
				/** @type {string[]} */
				const log = []
				function fast() {
					return 0
				}
				function merge(
					/** @type {unknown} */ target_result,
					/** @type {unknown} */ other_result
				) {
					return [ target_result, other_result ]
				}
				function mid() {
					return log.push("mid")
				}
				function other() {
					return "O"
				}
				function slow() {
					return pause(20)
				}
				function target() {
					log.push("target")
					return "T"
				}
				assert.deepEqual(
					await flow()
						.add(slow)
						.add(fast)
						.add(mid)
						.add(target)
						.add(other)
						.add(
							merge,
							target,
							other,
							{ join: "any" }
						)
						.edge(slow, mid)
						.edge(mid, target)
						.edge(fast, [ target ], () => null)
						.run(),
					[ "T", "O" ]
				)
				assert.deepEqual(log, [ "mid", "target" ])
				let aborted = false
				let starts = 0
				function a() {
					return "a"
				}
				function b() {
					return pause(10)
				}
				async function t(
					/** @type {Context} */ { signal }
				) {
					starts++
					await pause(30)
					aborted = signal.aborted
				}
				const reloading = flow().add(a)
					.add(b)
					.add(t)
					.edge(a, t)
					.edge(b, [ t ], () => null)
					.run()
				await reloading
				reloading.reload(b)
				await reloading
				assert.deepEqual(
					[ starts, aborted ],
					[ 1, false ]
				)
				function fetch_page(
					/** @type {Context<{ i: number, pages: number }>} */ { state }
				) {
					return state.i
				}
				function init(
					/** @type {Context<{ i: number, pages: number }>} */ { state }
				) {
					return state.pages > 0
				}
				function more(
					/** @type {number} */ _,
					/** @type {Context<{ i: number, pages: number }>} */ { state }
				) {
					return state.i < state.pages
				}
				function report(
					/** @type {unknown} */ started,
					/** @type {unknown} */ saved
				) {
					return [ started, saved ]
				}
				function save(
					/** @type {number} */ page,
					/** @type {Context<{ i: number, pages: number }>} */ { state }
				) {
					state.i++
					return page
				}
				const pages = /** @type {import("async-lube").Flow<{ i: number, pages: number }>} */(flow())/**/
					.add(init)
					.add(fetch_page)
					.add(save, fetch_page)
					.add(more, save)
					.add(report, init, save, { join: "any" })
					.edge(
						init,
						[ fetch_page ],
						ok => ok ? fetch_page : null
					)
					.edge(
						more,
						[ fetch_page ],
						ok => ok ? fetch_page : null
					)
				assert.deepEqual(
					await pages.run({ i: 0, pages: 2 }),
					[ true, 1 ]
				)
				const empty = pages.run({ i: 0, pages: 0 })
				assert.deepEqual(await empty, [ false, void 0 ])
				assert.equal(
					empty.nodes["fetch_page"],
					"skipped"
				)
				function get_cached() {
					return "C"
				}
				function get_prices() {
					return "P"
				}
				function render(
					/** @type {unknown} */ prices,
					/** @type {unknown} */ cached
				) {
					return [ prices, cached ]
				}
				const prices = flow()
					.add(get_cached)
					.add(
						get_prices,
						{ fallback: get_cached }
					)
					.add(
						render,
						get_prices,
						get_cached,
						{ join: "any" }
					)
					.run()
				assert.deepEqual(await prices, [ "P", void 0 ])
				assert.equal(
					prices.nodes["get_cached"],
					"skipped"
				)
			}
		)
		it(
			"loop dependents",
			async () => {
				/**
				 * @param {"queue" | "restart"} overlap
				 * @param {number} ms
				 * @returns {Promise<number[]>}
				 */
				async function count_to_five(overlap, ms) {
					let ticks = 0
					/** @type {number[]} */
					const seen = []
					async function after(
						/** @type {number} */ n,
						/** @type {Context} */ { sleep }
					) {
						if (ms) await sleep(ms)
						seen.push(n)
					}
					async function tick(
						/** @type {Context} */ { sleep }
					) {
						await sleep(1)
						return ++ticks
					}
					await flow()
						.add(tick)
						.add(after, tick, { overlap })
						.edge(
							tick,
							[ tick ],
							n => n < 5 ? tick : null
						)
						.run()
					return seen
				}
				assert.deepEqual(
					await count_to_five("restart", 0),
					[ 1, 2, 3, 4, 5 ]
				)
				assert.deepEqual(
					await count_to_five("restart", 200),
					[ 5 ]
				)
				assert.deepEqual(
					await count_to_five("queue", 30),
					[ 1, 2, 3, 4, 5 ]
				)
			}
		)
		it(
			"loop exits",
			async () => {
				let polls = 0
				/** @type {string[]} */
				const saved = []
				async function poll(
					/** @type {Context} */ { sleep }
				) {
					await sleep(1)
					return ++polls < 3 ? "pending" : "paid"
				}
				function save(/** @type {string} */ status) {
					saved.push(status)
					return status
				}
				assert.equal(
					await flow().add(poll)
						.add(save, poll)
						.edge(
							poll,
							{ paid: save, pending: poll }
						)
						.run(),
					"paid"
				)
				assert.deepEqual(saved, [ "paid" ])
				polls = 0
				saved.length = 0
				async function check() {
					if (++polls < 3) throw Error("pending")
					return "paid"
				}
				assert.equal(
					await flow().add(
						check,
						{
							catch: async (_, { goto, sleep }) => {
								await sleep(1)
								return goto(check)
							}
						}
					)
						.add(save, check)
						.run(),
					"paid"
				)
				assert.deepEqual(saved, [ "paid" ])
				polls = 0
				saved.length = 0
				await flow().add(poll)
					.add(save, poll)
					.edge(
						poll,
						[ poll ],
						status => status == "pending" ? poll : null
					)
					.run()
				assert.deepEqual(
					saved,
					[ "pending", "pending", "paid" ]
				)
			}
		)
		it(
			"loop limit",
			async () => {
				function again() {
					return 1
				}
				const error = await rejection(
					flow({ maxSteps: 5 })
						.add(again)
						.edge(again, again)
						.run()
				)
				assert.instanceOf(error, FlowError)
				assert.equal(
					/** @type {Error} */(error.cause)/**/.message,
					"The flow exceeded 5 steps"
				)
				/** @param {Context} context */
				function lost({ goto }) {
					return goto(missing)
				}
				function missing() {
					return 1
				}
				const undeclared = await rejection(
					flow()
						.add(lost)
						.run()
				)
				assert.instanceOf(undeclared, FlowError)
				assert.equal(
					/** @type {Error} */(undeclared.cause)/**/.message,
					"Flow node \"lost\" went to function \"missing\", which is not added"
				)
			}
		)
		it(
			"nested flows",
			async () => {
				/** @type {Record<string, number>} */
				const calls = {}
				/**
				 * @param {Record<string, number>} before
				 * @returns {Record<string, number>}
				 */
				function changes(before) {
					return Object.fromEntries(
						Object.entries(calls)
							.filter(
								([ key, value ]) => value != before[key]
							)
							.map(
								([ key, value ]) => [ key, value - (before[key] ?? 0) ]
							)
					)
				}
				/** @param {string} key */
				function count(key) {
					return calls[key] = (calls[key] ?? 0) + 1
				}
				let crash = true
				async function read(/** @type {string} */ url) {
					count("read " + url)
					await pause(1)
					return url.toUpperCase()
				}
				/** @param {Context<string>} context */
				async function search({ state }) {
					count("search " + state)
					await pause(1)
					return [ state + "/a", state + "/b" ]
				}
				/**
				 * @param {string[]} pages
				 * @param {Context<string>} context
				 */
				function summarize(pages, { state }) {
					count("summarize " + state)
					if (crash && state == "q1") throw Error("overloaded")
					return state + ":" + pages.length
				}
				const read_all = flow.each(read)
				const research = /** @type {import("async-lube").Flow<string>} */(flow())/**/
					.add(search)
					.add(read_all, search)
					.add(summarize, read_all)
				function judge(
					/** @type {string[]} */ summaries
				) {
					return summaries.length < 2 ? "more" : "done"
				}
				/** @param {Context<{ rounds: number }>} context */
				function plan({ state }) {
					return [ "q0", "q1" ].slice(0, ++state.rounds)
				}
				function report(
					/** @type {string[]} */ summaries
				) {
					return summaries.join(" ")
				}
				const research_all = flow.each(research)
				const agent = /** @type {import("async-lube").Flow<{ rounds: number }>} */(flow())/**/
					.add(plan)
					.add(
						research_all,
						plan,
						{ name: "research" }
					)
					.add(judge, research_all)
					.add(report, research_all)
					.edge(
						judge,
						{ done: report, more: plan }
					)
				const first = agent.run({ rounds: 0 })
				const first_error = await rejection(first)
				assert.instanceOf(first_error, FlowError)
				assert.equal(first_error.node, "research")
				assert.equal(
					first.nodes["research.1.summarize"],
					"failed"
				)
				assert.deepEqual(
					calls,
					{
						"read q0/a": 2,
						"read q0/b": 2,
						"read q1/a": 1,
						"read q1/b": 1,
						"search q0": 2,
						"search q1": 1,
						"summarize q0": 2,
						"summarize q1": 1
					}
				)
				const saved = JSON.parse(
					JSON.stringify(first.snapshot())
				)
				crash = false
				const before_resume = { ...calls }
				assert.equal(
					await agent.run(first.state, { snapshot: saved }),
					"q0:2 q1:2"
				)
				assert.deepEqual(
					changes(before_resume),
					{ "summarize q1": 1 }
				)
				crash = true
				const second = agent.run({ rounds: 1 })
				await rejection(second)
				crash = false
				const before_retry = { ...calls }
				second.retry()
				assert.equal(await second, "q0:2 q1:2")
				assert.deepEqual(
					changes(before_retry),
					{ "summarize q1": 1 }
				)
				let failures = 1
				function step_a() {
					return (count("a"), "a")
				}
				function step_b(/** @type {string} */ a) {
					count("b")
					if (failures-- > 0) throw Error("b")
					return a + "b"
				}
				const before_group = { ...calls }
				assert.equal(
					await flow()
						.add(
							flow()
								.add(step_a)
								.add(step_b, step_a),
							{ name: "group", retry: 1 }
						)
						.run(),
					"ab"
				)
				assert.deepEqual(
					changes(before_group),
					{ a: 1, b: 2 }
				)
				const approve = flow.input("approve")
				/** @param {Context<string>} context */
				function draft({ state }) {
					count("draft " + state)
					return "draft " + state
				}
				const review = /** @type {import("async-lube").Flow<string>} */(flow())/**/
					.add(draft)
					.add(approve, draft)
				function list_docs() {
					return [ "x", "y" ]
				}
				const top = flow()
					.add(list_docs)
					.add(
						flow.each(
							/** @type {import("async-lube").Flow<string>} */(flow())/**/.add(review, { name: "review" })
						),
						list_docs,
						{ name: "docs" }
					)
					.run()
				await pause(0)
				assert.equal(
					top.nodes["docs.1.review.approve"],
					"waiting"
				)
				top.reload("docs.1.review.draft")
				await pause(0)
				assert.equal(calls["draft y"], 2)
				top.send("docs.0.review.approve", true)
				top.send("docs.1.review.approve", false)
				assert.deepEqual(await top, [ true, false ])
				/** @type {AbortSignal[]} */
				const signals = []
				/** @param {Context} context */
				function hang({ signal }) {
					signals.push(signal)
					return new Promise(() => {})
				}
				const controller = new AbortController()
				const deep = flow()
					.add(
						flow().add(
							flow().add(hang),
							{ name: "inner" }
						),
						{ name: "middle" }
					)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				await pause(0)
				assert.equal(
					deep.nodes["middle.inner.hang"],
					"running"
				)
				controller.abort("shutdown")
				assert.isTrue(
					isCancel(await rejection(deep))
				)
				assert.isTrue(
					signals.length == 1 && signals.every(signal => signal.aborted)
				)
			}
		)
		it(
			"optional input",
			async () => {
				const confirm = flow.input("confirm")
				function proceed(
					/** @type {unknown} */ confirmed
				) {
					return [ confirmed ]
				}
				const run = flow()
					.add(
						confirm,
						{ optional: true, timeout: 5 }
					)
					.add(proceed, confirm)
					.run()
				assert.deepEqual(await run, [ void 0 ])
				assert.deepEqual(
					run.nodes,
					{
						confirm: "failed",
						proceed: "done"
					}
				)
				assert.instanceOf(
					run.errors["confirm"],
					TimeoutError
				)
			}
		)
		it(
			"overlap",
			async () => {
				/**
				 * @param {"ignore" | "queue" | "rerun" | "restart" | undefined} d_overlap
				 * @param {"ignore" | "queue" | "rerun" | "restart" | undefined} e_overlap
				 * @returns {Promise<[unknown, number, string[], string[]]>}
				 */
				async function update_while_running(d_overlap, e_overlap) {
					/** @type {string[]} */
					const done = []
					/** @type {string[]} */
					const received = []
					let loads = 0
					function a() {
						loads++
						return "a"
					}
					function b() {
						loads++
						return "b"
					}
					const c = flow.input("c")
					async function d(
						/** @type {string} */ x,
						/** @type {string} */ y,
						/** @type {unknown} */ z,
						/** @type {Context} */ { signal }
					) {
						await pause(80)
						if (!signal.aborted) done.push(String(z))
						return x + y + z
					}
					async function e(
						/** @type {string} */ value,
						/** @type {Context} */ { signal }
					) {
						await pause(120)
						if (!signal.aborted) received.push(value)
						return value
					}
					const run = flow()
						.add(a)
						.add(b)
						.add(c)
						.add(
							d,
							a,
							b,
							c,
							d_overlap ? { overlap: d_overlap } : {}
						)
						.add(
							e,
							d,
							e_overlap ? { overlap: e_overlap } : {}
						)
						.run()
					run.send(c, 1)
					await pause(5)
					run.send(c, 2)
					await pause(5)
					run.send(c, 3)
					return [ await run, loads, done, received ]
				}
				assert.deepEqual(
					await update_while_running(void 0, void 0),
					[ "ab3", 2, [ "3" ], [ "ab3" ] ]
				)
				assert.deepEqual(
					await update_while_running("restart", void 0),
					[ "ab3", 2, [ "3" ], [ "ab3" ] ]
				)
				assert.deepEqual(
					await update_while_running("ignore", void 0),
					[ "ab1", 2, [ "1" ], [ "ab1" ] ]
				)
				assert.deepEqual(
					await update_while_running("rerun", void 0),
					[ "ab3", 2, [ "1", "3" ], [ "ab3" ] ]
				)
				assert.deepEqual(
					await update_while_running("queue", void 0),
					[
						"ab3",
						2,
						[ "1", "2", "3" ],
						[ "ab3" ]
					]
				)
				assert.deepEqual(
					await update_while_running("queue", "queue"),
					[
						"ab3",
						2,
						[ "1", "2", "3" ],
						[ "ab1", "ab2", "ab3" ]
					]
				)
				function add_one(/** @type {number} */ x) {
					return x + 1
				}
				async function double(
					/** @type {Context<number>} */ { state }
				) {
					await pause(5)
					return state * 2
				}
				async function square(
					/** @type {Context<number>} */ { state }
				) {
					await pause(2)
					return state * state
				}
				const left = /** @type {import("async-lube").Flow<number>} */(flow())/**/.add(double)
					.add(add_one, double)
				const right = /** @type {import("async-lube").Flow<number>} */(flow())/**/.add(square)
				function combine(
					/** @type {number} */ x,
					/** @type {number} */ y
				) {
					return x + y
				}
				const region = /** @type {import("async-lube").Flow<number>} */(flow())/**/.add(left, { name: "left" })
					.add(right, { name: "right" })
					.add(combine, left, right)
				const value = /** @type {import("async-lube").Input<number>} */(flow.input("value"))/**/
				/** @type {number[]} */
				const collected = []
				function collect(/** @type {number} */ x) {
					collected.push(x)
					return x
				}
				const regions = flow()
					.add(value)
					.add(
						region,
						value,
						{ name: "region", overlap: "queue" }
					)
					.add(
						collect,
						region,
						{ overlap: "queue" }
					)
					.run()
				regions.send(value, 1)
				regions.send(value, 2)
				regions.send(value, 3)
				assert.equal(await regions, 16)
				assert.deepEqual(collected, [ 4, 9, 16 ])
				let starts = 0
				async function slow_task() {
					starts++
					await pause(20)
					return starts
				}
				const reloaded = flow().add(slow_task, { overlap: "ignore" })
					.run()
				await pause(5)
				reloaded.reload(slow_task)
				assert.equal(await reloaded, 2)
				const cancelled = flow.input("cancelled")
				async function cancelled_task(/** @type {unknown} */ x) {
					starts++
					await pause(10)
					return x
				}
				starts = 0
				const cancelling = flow().add(cancelled)
					.add(
						cancelled_task,
						cancelled,
						{ overlap: "queue" }
					)
					.run()
				cancelling.send(cancelled, 1)
				await pause(2)
				cancelling.send(cancelled, 2)
				cancelling.cancel()
				await rejection(cancelling)
				await pause(30)
				assert.equal(starts, 1)
				const entry = flow.input("entry")
				/** @type {unknown[]} */
				const written = []
				async function write(
					/** @type {unknown} */ x,
					/** @type {Context} */ { signal }
				) {
					await pause(20)
					if (!signal.aborted) written.push(x)
					return x
				}
				const writer = flow().add(entry)
					.add(write, entry, { overlap: "queue" })
				const writing = writer.run()
				writing.send(entry, 1)
				await pause(2)
				writing.send(entry, 2)
				writing.send(entry, 3)
				const saved = JSON.parse(
					JSON.stringify(writing.snapshot())
				)
				writing.cancel()
				await rejection(writing)
				assert.equal(
					await writer.run(void 0, { snapshot: saved }),
					3
				)
				assert.deepEqual(written, [ 1, 2, 3 ])
				assert.throws(
					() => flow().add(
						slow_task,
						/** @type {never} */({ overlap: "switch" })/**/
					),
					"must be \"restart\", \"ignore\", \"rerun\" or \"queue\""
				)
				assert.throws(
					() => flow().add(
						flow.input("x"),
						/** @type {never} */({ overlap: "queue" })/**/
					),
					"Unknown option \"overlap\""
				)
			}
		)
		it(
			"overlap after goto and fallback",
			async () => {
				/**
				 * @param {"queue" | "rerun"} overlap
				 * @param {boolean} throws
				 * @returns {Promise<unknown[]>}
				 */
				async function handle_all(overlap, throws) {
					const message = flow.input("message")
					/** @type {unknown[]} */
					const handled = []
					async function handle(
						/** @type {unknown} */ value,
						/** @type {Context} */ { goto, sleep }
					) {
						await sleep(10)
						handled.push(value)
						if (value != 1) return value
						if (throws) throw Error("first")
						return goto(other)
					}
					function other() {
						return "other"
					}
					const run = flow()
						.add(message)
						.add(other)
						.add(
							handle,
							message,
							throws ? { fallback: other, overlap } : { overlap }
						)
						.edge(handle, other)
						.run()
					run.send(message, 1)
					await pause(2)
					run.send(message, 2)
					run.send(message, 3)
					await run
					return handled
				}
				assert.deepEqual(
					await handle_all("queue", false),
					[ 1, 2, 3 ]
				)
				assert.deepEqual(
					await handle_all("queue", true),
					[ 1, 2, 3 ]
				)
				assert.deepEqual(
					await handle_all("rerun", false),
					[ 1, 3 ]
				)
			}
		)
		it(
			"queue limits",
			async () => {
				/** @type {unknown[]} */
				const handled = []
				const tick = flow.input("tick")
				async function work(
					/** @type {unknown} */ value,
					/** @type {Context} */ { sleep }
				) {
					await sleep(20)
					handled.push(value)
					return value
				}
				const run = flow().add(tick)
					.add(
						work,
						tick,
						{ limit: 2, overlap: "queue" }
					)
					.run()
				await pause(1)
				for (let i = 1; i <= 6; i++) run.send(tick, i)
				assert.equal(run.pending(work), 3)
				assert.deepEqual(
					internals(run).nodes["work"]?.backlog?.map(entry => entry.args[0]),
					[ 1, 5, 6 ]
				)
				await run
				assert.deepEqual(handled, [ 1, 5, 6 ])
				assert.equal(run.pending(work), 0)
				assert.throws(
					() => flow().add(
						() => 1,
						/** @type {never} */({ limit: 2 })/**/
					),
					/applies only to overlap/
				)
				assert.throws(
					() => flow().add(
						() => 1,
						{ limit: 0, overlap: "queue" }
					),
					/positive integer/
				)
			}
		)
		it(
			"race",
			async () => {
				const ok = flow.input("ok")
				const cancel = flow.input("cancel")
				function decide(
					/** @type {unknown} */ a,
					/** @type {unknown} */ b
				) {
					return a ?? b
				}
				const run = flow()
					.add(ok)
					.add(cancel)
					.add(decide, ok, cancel, { join: "race" })
					.run()
				run.send(ok, "yes")
				assert.equal(await run, "yes")
				assert.deepEqual(
					run.nodes,
					{
						cancel: "skipped",
						decide: "done",
						ok: "done"
					}
				)
				/** @type {AbortSignal | undefined} */
				let loser_signal
				async function fast() {
					await pause(1)
					return "fast"
				}
				function first(
					/** @type {string | undefined} */ a,
					/** @type {unknown} */ b
				) {
					return a ?? b
				}
				/** @param {Context} context */
				function slow({ signal }) {
					loser_signal = signal
					return new Promise(() => {})
				}
				assert.equal(
					await flow()
						.add(fast)
						.add(slow)
						.add(first, fast, slow, { join: "race" })
						.run(),
					"fast"
				)
				assert.isTrue(loser_signal?.aborted)
				function bad() {
					throw Error("bad")
				}
				function worse() {
					throw Error("worse")
				}
				const none = flow()
					.add(bad, { optional: true })
					.add(worse, { optional: true })
					.add(first, bad, worse, { join: "race" })
					.run()
				assert.isUndefined(await none)
				assert.equal(none.nodes["first"], "skipped")
			}
		)
		it(
			"race lets a node with finish finish",
			async () => {
				/** @type {string[]} */
				const ledger = []
				const accept = flow.input("accept")
				/** @type {unknown} */
				let charge_error = null
				async function charge(
					/** @type {unknown} */ _accepted,
					/** @type {Context} */ { signal, sleep }
				) {
					ledger.push("sent")
					await sleep(30)
					ledger.push(`answered ${signal.aborted}`)
					if (charge_error) throw charge_error
					return "pay_1"
				}
				const rider = flow.input("rider")
				function deliver(
					/** @type {unknown} */ _paid,
					/** @type {unknown} */ by
				) {
					return `delivered by ${by}`
				}
				const cancel = flow.input("cancel")
				function outcome(
					/** @type {string | undefined} */ delivered,
					/** @type {unknown} */ cancelled
				) {
					return delivered ?? `cancelled: ${cancelled}`
				}
				function refund(
					/** @type {string | undefined} */ result,
					/** @type {string | undefined} */ paid
				) {
					return result?.startsWith("cancelled") ? `refund ${paid ?? "nothing"}` : "no refund"
				}
				/** @type {string[]} */
				const after = []
				function next_step() {
					after.push("next")
				}
				const checkout = flow()
					.add(accept)
					.add(charge, accept, { finish: true })
					.add(rider, charge)
					.add(deliver, charge, rider)
					.add(cancel)
					.add(
						outcome,
						deliver,
						cancel,
						{ join: "race" }
					)
					.add(
						refund,
						outcome,
						charge,
						{ join: "any" }
					)
				const paid = checkout.run()
				paid.send(accept, true)
				await until(() => ledger.length == 1)
				paid.send(cancel, "customer")
				assert.equal(await paid, "refund pay_1")
				assert.deepEqual(
					ledger,
					[ "sent", "answered false" ]
				)
				assert.equal(paid.nodes["rider"], "skipped")
				const early = checkout.run()
				await pause(1)
				early.send(cancel, "customer")
				await pause(1)
				assert.equal(early.nodes["accept"], "waiting")
				assert.equal(early.nodes["rider"], "skipped")
				early.send(accept, true)
				assert.equal(await early, "refund pay_1")
				assert.isUndefined(early.errors["charge"])
				ledger.length = 0
				const abandoned = flow()
					.add(accept)
					.add(charge, accept, { finish: true })
					.add(rider, charge)
					.add(deliver, charge, rider)
					.add(next_step)
					.edge(charge, next_step)
					.add(cancel)
					.add(
						outcome,
						deliver,
						cancel,
						{ join: "race" }
					)
				const alone = abandoned.run()
				alone.send(accept, true)
				await until(() => ledger.length == 1)
				alone.send(cancel, "customer")
				assert.equal(
					await alone,
					"cancelled: customer"
				)
				assert.deepEqual(
					ledger,
					[ "sent", "answered false" ]
				)
				assert.equal(alone.get(charge), "pay_1")
				assert.equal(alone.nodes["charge"], "done")
				const cut = abandoned.run()
				cut.send(accept, true)
				await until(() => ledger.length == 3)
				cut.send(cancel, "customer")
				await pause(1)
				const snapshot = JSON.parse(JSON.stringify(cut.snapshot()))
				assert.isTrue(
					snapshot.nodes.charge.abandoned
				)
				cut.cancel()
				cut.catch(() => {})
				const resumed = abandoned.run(void 0, { snapshot })
				assert.equal(
					await resumed,
					"cancelled: customer"
				)
				assert.equal(resumed.get(charge), "pay_1")
				assert.equal(
					resumed.nodes["next_step"],
					"skipped"
				)
				resumed.send(rider, "late")
				assert.equal(
					resumed.nodes["deliver"],
					"skipped"
				)
				assert.equal(
					alone.nodes["next_step"],
					"skipped"
				)
				assert.deepEqual(after, [])
				charge_error = Error("declined")
				const failing = abandoned.run()
				failing.send(accept, true)
				await pause(5)
				failing.send(cancel, "customer")
				assert.equal(
					await failing,
					"cancelled: customer"
				)
				assert.equal(
					failing.nodes["charge"],
					"skipped"
				)
				assert.equal(
					failing.errors["charge"],
					charge_error
				)
				assert.deepEqual(after, [])
				const rethrown = Error("rethrown")
				/** @type {[(error: unknown, accepted: unknown, context: Context) => unknown, unknown][]} */
				const handlers = [
					[
						(
							/** @type {unknown} */ _error,
							/** @type {unknown} */ _accepted,
							/** @type {Context} */ { goto }
						) => goto(next_step),
						charge_error
					],
					[
						() => {
							throw rethrown
						},
						rethrown
					]
				]
				for (const [ handle, error ] of handlers) {
					const caught = flow()
						.add(accept)
						.add(
							charge,
							accept,
							{ catch: handle, finish: true }
						)
						.add(rider, charge)
						.add(deliver, charge, rider)
						.add(next_step)
						.edge(charge, next_step)
						.add(cancel)
						.add(
							outcome,
							deliver,
							cancel,
							{ join: "race" }
						)
						.run()
					caught.send(accept, true)
					await pause(5)
					caught.send(cancel, "customer")
					assert.equal(
						await caught,
						"cancelled: customer"
					)
					assert.equal(
						caught.nodes["charge"],
						"skipped"
					)
					assert.equal(caught.errors["charge"], error)
				}
				assert.deepEqual(after, [])
				assert.throws(
					() => flow().add(
						accept,
						/** @type {never} */({ finish: true })/**/
					),
					/Unknown option "finish"/
				)
			}
		)
		it(
			"race lets a node with finish that a dependent joining any still takes finish",
			async () => {
				vi.useFakeTimers()
				/** @type {unknown} */
				let charge_error = null
				/** @type {AbortSignal[]} */
				const signals = []
				async function charge(
					/** @type {Context} */ { signal, sleep }
				) {
					signals.push(signal)
					await sleep(20)
					if (charge_error) throw charge_error
					return "pay_1"
				}
				const rider = flow.input("rider")
				const cancel = flow.input("cancel")
				function deliver(
					/** @type {unknown} */ _paid,
					/** @type {unknown} */ by
				) {
					return `delivered by ${by}`
				}
				function outcome(
					/** @type {string | undefined} */ delivered
				) {
					return delivered ?? "cancelled"
				}
				function receipt(
					/** @type {string | undefined} */ paid
				) {
					return `receipt ${paid}`
				}
				function refund(
					/** @type {string | undefined} */ result,
					/** @type {string | undefined} */ paid
				) {
					return result == "cancelled" ? `refund ${paid ?? "nothing"}` : "no refund"
				}
				const checkout = flow()
					.add(
						charge,
						{ finish: true, name: "charge" }
					)
					.add(
						deliver,
						charge,
						rider,
						{ name: "deliver" }
					)
					.add(
						outcome,
						deliver,
						cancel,
						{ join: "race", name: "outcome" }
					)
					.add(
						refund,
						outcome,
						charge,
						{ join: "any", name: "refund" }
					)
				const paid = checkout.run()
				await vi.advanceTimersByTimeAsync(1)
				paid.send(cancel, "customer")
				await vi.advanceTimersByTimeAsync(1)
				assert.equal(paid.nodes["charge"], "running")
				assert.isTrue(
					internals(paid).nodes["charge"]?.abandoned
				)
				assert.equal(
					await settled(paid),
					"refund pay_1"
				)
				assert.isFalse(signals[0]?.aborted)
				charge_error = Error("declined")
				const declined = checkout.run()
				await vi.advanceTimersByTimeAsync(1)
				declined.send(cancel, "customer")
				assert.equal(
					await settled(declined),
					"refund nothing"
				)
				assert.equal(
					declined.nodes["charge"],
					"skipped"
				)
				assert.equal(
					declined.errors["charge"],
					charge_error
				)
				const saved = checkout.run()
				await vi.advanceTimersByTimeAsync(1)
				saved.send(cancel, "customer")
				await vi.advanceTimersByTimeAsync(1)
				const snapshot = JSON.parse(
					JSON.stringify(saved.snapshot())
				)
				saved.cancel()
				saved.catch(() => {})
				charge_error = null
				const resumed = checkout.run(void 0, { snapshot })
				assert.equal(
					await settled(resumed),
					"refund pay_1"
				)
				charge_error = Error("declined")
				const resumed_declined = checkout.run(void 0, { snapshot })
				assert.equal(
					await settled(resumed_declined),
					"refund nothing"
				)
				assert.equal(
					resumed_declined.errors["charge"],
					charge_error
				)
				const cancelled = checkout.run()
				await vi.advanceTimersByTimeAsync(1)
				cancelled.send(cancel, "customer")
				await vi.advanceTimersByTimeAsync(1)
				cancelled.cancel()
				assert.instanceOf(
					await rejection(cancelled),
					CancelError
				)
				assert.isTrue(signals.at(-1)?.aborted)
				const mailed = flow()
					.add(
						charge,
						{ finish: true, name: "charge" }
					)
					.add(
						deliver,
						charge,
						rider,
						{ name: "deliver" }
					)
					.add(
						outcome,
						deliver,
						cancel,
						{ join: "race", name: "outcome" }
					)
					.add(
						receipt,
						charge,
						{ name: "receipt" }
					)
					.run()
				await vi.advanceTimersByTimeAsync(1)
				mailed.send(cancel, "customer")
				await vi.advanceTimersByTimeAsync(1)
				assert.isUndefined(
					internals(mailed).nodes["charge"]?.abandoned
				)
				const failure = await rejection(settled(mailed))
				assert.instanceOf(failure, FlowError)
				assert.equal(
					mailed.errors["charge"],
					charge_error
				)
				charge_error = null
				const mailed_ok = flow()
					.add(
						charge,
						{ finish: true, name: "charge" }
					)
					.add(
						deliver,
						charge,
						rider,
						{ name: "deliver" }
					)
					.add(
						outcome,
						deliver,
						cancel,
						{ join: "race", name: "outcome" }
					)
					.add(
						receipt,
						charge,
						{ name: "receipt" }
					)
					.run()
				await vi.advanceTimersByTimeAsync(1)
				mailed_ok.send(cancel, "customer")
				assert.equal(
					await settled(mailed_ok),
					"receipt pay_1"
				)
				assert.equal(
					mailed_ok.nodes["outcome"],
					"done"
				)
			}
		)
		it(
			"race losers",
			async () => {
				function cache() {
					return "cached"
				}
				function decide() {
					return pause(10)
				}
				async function fetch_fresh(
					/** @type {Context} */ { signal }
				) {
					await pause(30)
					return signal.aborted ? "aborted" : "fresh"
				}
				function first(
					/** @type {unknown} */ cached,
					/** @type {unknown} */ fresh
				) {
					return cached ?? fresh
				}
				function store(/** @type {unknown} */ fresh) {
					return "stored " + fresh
				}
				assert.equal(
					await flow()
						.add(cache)
						.add(fetch_fresh)
						.add(
							first,
							cache,
							fetch_fresh,
							{ join: "race" }
						)
						.add(decide)
						.add(store, fetch_fresh)
						.edge(decide, store)
						.run(),
					"stored fresh"
				)
				let decisions = 0
				const confirm_button = flow.input("confirm")
				const close_button = flow.input("close")
				function choose(
					/** @type {unknown} */ confirmed
				) {
					decisions++
					return confirmed ? "confirmed" : "closed"
				}
				const dialog = flow()
					.add(confirm_button)
					.add(close_button)
					.add(
						choose,
						confirm_button,
						close_button,
						{ join: "race" }
					)
					.run()
				dialog.send(confirm_button, true)
				assert.equal(await dialog, "confirmed")
				dialog.send(close_button, true)
				assert.equal(await dialog, "confirmed")
				assert.equal(decisions, 1)
				dialog.reload()
				await dialog.idle()
				assert.deepEqual(
					dialog.nodes,
					{
						choose: "idle",
						close: "waiting",
						confirm: "waiting"
					}
				)
			}
		)
		it(
			"race rolls back the resources of the losers",
			async () => {
				/** @type {string[]} */
				const log = []
				function lock() {
					return "lock"
				}
				/**
				 * @param {string} value
				 * @param {unknown} error
				 */
				function release(value, error) {
					log.push(
						`${value} ${error instanceof CancelError ? "rolled back" : error ? "failed" : "committed"}`
					)
				}
				async function work(
					/** @type {string} */ held,
					/** @type {Context} */ { sleep }
				) {
					await sleep(100)
					return held
				}
				const stop = flow.input("stop")
				function end(
					/** @type {unknown} */ worked,
					/** @type {unknown} */ stopped
				) {
					return worked ?? stopped
				}
				const run = flow()
					.add(lock, { release })
					.add(work, lock)
					.add(stop)
					.add(end, work, stop, { join: "race" })
					.run()
				await until(
					() => run.nodes["work"] == "running"
				)
				run.send(stop, "stopped")
				assert.equal(await run, "stopped")
				await pause(1)
				assert.deepEqual(log, [ "lock rolled back" ])
				assert.equal(run.nodes["lock"], "idle")
				run.send(stop, "again")
				assert.equal(await run, "again")
				assert.deepEqual(log, [ "lock rolled back" ])
				log.length = 0
				function audit(/** @type {string} */ held) {
					return "audit " + held
				}
				const shared = flow()
					.add(lock, { release })
					.add(work, lock)
					.add(audit, lock)
					.add(stop)
					.add(end, work, stop, { join: "race" })
					.run()
				await until(
					() => shared.nodes["work"] == "running"
				)
				shared.send(stop, "stopped")
				assert.equal(await shared, "stopped")
				assert.deepEqual(log, [ "lock committed" ])
				log.length = 0
				const finished = flow()
					.add(lock, { release })
					.add(work, lock, { finish: true })
					.add(stop)
					.add(end, work, stop, { join: "race" })
					.run()
				await until(
					() => finished.nodes["work"] == "running"
				)
				finished.send(stop, "stopped")
				assert.equal(await finished, "stopped")
				assert.equal(finished.get(work), "lock")
				assert.deepEqual(log, [ "lock committed" ])
				log.length = 0
				async function broken(
					/** @type {string} */ _held,
					/** @type {Context} */ { sleep }
				) {
					await sleep(30)
					throw Error("broken")
				}
				const failed = flow()
					.add(lock, { release })
					.add(broken, lock, { finish: true })
					.add(stop)
					.add(end, broken, stop, { join: "race" })
					.run()
				await until(
					() => failed.nodes["broken"] == "running"
				)
				failed.send(stop, "stopped")
				assert.equal(await failed, "stopped")
				assert.deepEqual(log, [ "lock failed" ])
				assert.equal(failed.nodes["lock"], "idle")
			}
		)
		it(
			"race runs a node with finish that has not started as without it",
			async () => {
				const accept = flow.input("accept")
				const cancel = flow.input("cancel")
				function charge(
					/** @type {unknown} */ _accepted
				) {
					return "pay_1"
				}
				function deliver(/** @type {string} */ paid) {
					return "delivered " + paid
				}
				function outcome(
					/** @type {string | undefined} */ delivered,
					/** @type {unknown} */ cancelled
				) {
					return delivered ?? `cancelled: ${cancelled}`
				}
				function receipt(/** @type {string} */ paid) {
					return `receipt ${paid}`
				}
				/** @type {Record<string, string>[]} */
				const statuses = []
				for (const finish of [ false, true ]) {
					const run = flow()
						.add(accept)
						.add(charge, accept, { finish })
						.add(deliver, charge)
						.add(
							outcome,
							deliver,
							cancel,
							{ join: "race" }
						)
						.add(receipt, charge)
						.run()
					run.send(cancel, "customer")
					await pause(1)
					assert.equal(run.nodes["accept"], "waiting")
					assert.equal(run.nodes["deliver"], "skipped")
					run.send(accept, true)
					assert.equal(await run, "receipt pay_1")
					assert.equal(
						run.get(outcome),
						"cancelled: customer"
					)
					statuses.push(run.nodes)
				}
				assert.deepEqual(statuses[0], statuses[1])
			}
		)
		it(
			"race with shared dependencies",
			async () => {
				function fast() {
					return pause(1).then(() => "fast")
				}
				function first(
					/** @type {string | undefined} */ a,
					/** @type {string | undefined} */ b
				) {
					return a ?? b
				}
				function needs_slow(/** @type {string} */ value) {
					return "got " + value
				}
				function report(
					/** @type {string | undefined} */ a,
					/** @type {string} */ b
				) {
					return [ a, b ]
				}
				function slow() {
					return pause(10).then(() => "slow")
				}
				assert.deepEqual(
					await flow()
						.add(fast)
						.add(slow)
						.add(first, fast, slow, { join: "race" })
						.add(needs_slow, slow)
						.add(report, first, needs_slow)
						.run(),
					[ "fast", "got slow" ]
				)
			}
		)
		it(
			"releases resources",
			async () => {
				/** @type {string[]} */
				const log = []
				let opened = 0
				function insert(
					/** @type {{ id: number }} */ value
				) {
					log.push(`insert ${value.id}`)
					return value.id
				}
				function release(
					/** @type {{ id: number }} */ value,
					/** @type {unknown} */ error
				) {
					log.push(
						`${error ? "rollback" : "commit"} ${value.id}`
					)
				}
				async function tx() {
					const id = ++opened
					log.push(`open ${id}`)
					return { id }
				}
				const run = flow().add(tx, { release })
					.add(insert, tx)
					.run()
				assert.equal(await run, 1)
				assert.deepEqual(
					log,
					[ "open 1", "insert 1", "commit 1" ]
				)
				log.length = 0
				let broken = true
				function read(
					/** @type {{ id: number }} */ value
				) {
					log.push(`read ${value.id}`)
					return value.id
				}
				function write(
					/** @type {{ id: number }} */ value
				) {
					log.push(`write ${value.id}`)
					if (broken) throw Error("constraint")
					return value.id
				}
				const retried = flow().add(tx, { release })
					.add(read, tx)
					.add(write, tx, read)
					.run()
				await rejection(retried)
				assert.deepEqual(
					log,
					[
						"open 2",
						"read 2",
						"write 2",
						"rollback 2"
					]
				)
				log.length = 0
				broken = false
				retried.retry()
				assert.equal(await retried, 3)
				assert.deepEqual(
					log,
					[
						"open 3",
						"read 3",
						"write 3",
						"commit 3"
					]
				)
				const strict = flow().add(
					tx,
					{
						release: () => {
							throw Error("commit failed")
						}
					}
				)
					.add(insert, tx)
					.run()
				const error = /** @type {FlowError} */(await rejection(strict))/**/
				assert.instanceOf(error, FlowError)
				assert.equal(error.node, "tx")
				assert.equal(strict.nodes["tx"], "failed")
				log.length = 0
				const who = flow.input("who")
				async function session(/** @type {unknown} */ name) {
					const id = ++opened
					log.push(`open ${id} ${name}`)
					return { id }
				}
				async function work(
					/** @type {{ id: number }} */ value,
					/** @type {Context} */ { sleep }
				) {
					await sleep(30)
					return value.id
				}
				const live = flow().add(session, who, { release })
					.add(work, session)
					.run()
				live.send(who, "a")
				await pause(10)
				live.send(who, "b")
				const last = await live
				assert.deepEqual(
					log,
					[
						`open ${last - 1} a`,
						`rollback ${last - 1}`,
						`open ${last} b`,
						`commit ${last}`
					]
				)
				log.length = 0
				live.send(who, "c")
				assert.equal(await live, last + 1)
				assert.deepEqual(
					log,
					[
						`open ${last + 1} c`,
						`commit ${last + 1}`
					]
				)
				assert.equal(
					internals(live).nodes["session"]?.status,
					"idle"
				)
				const gate = Promise.withResolvers()
				const open = flow().add(tx, { release })
					.add(insert, tx)
					.add(
						() => gate.promise,
						insert,
						{ name: "later" }
					)
					.run()
				await pause(5)
				const unfinished = internals(open)
				assert.equal(
					unfinished.nodes["tx"]?.status,
					"idle"
				)
				assert.equal(
					unfinished.nodes["insert"]?.status,
					"idle"
				)
				gate.resolve(void 0)
				await open
				assert.equal(
					internals(open).nodes["insert"]?.status,
					"done"
				)
				log.length = 0
				const hanging = flow().add(tx, { release })
					.add(work, tx)
					.run()
				hanging.catch(() => {})
				await pause(5)
				hanging.cancel()
				await pause(1)
				assert.deepEqual(
					log,
					[
						`open ${opened}`,
						`rollback ${opened}`
					]
				)
				log.length = 0
				function invalid() {
					throw TypeError("Invalid cart")
				}
				async function slow_open() {
					await new Promise(
						resolve => setTimeout(resolve, 20)
					)
					const id = ++opened
					log.push(`open ${id}`)
					return { id }
				}
				const abandoned = flow().add(invalid)
					.add(slow_open, { release })
					.run()
				await rejection(abandoned)
				await pause(40)
				assert.deepEqual(
					log,
					[
						`open ${opened}`,
						`rollback ${opened}`
					]
				)
				log.length = 0
				const timed_out = flow().add(
					slow_open,
					{ release, timeout: 5 }
				)
					.run()
				await rejection(timed_out)
				await pause(40)
				assert.deepEqual(
					log,
					[
						`open ${opened}`,
						`rollback ${opened}`
					]
				)
				assert.throws(
					() => flow().add(
						tx,
						{
							release: /** @type {never} */(1)/**/
						}
					),
					"must be a function"
				)
			}
		)
		it(
			"reload",
			async () => {
				let version = 0
				/** @type {unknown[]} */
				const previous = []
				function chart(/** @type {number} */ value) {
					return "chart " + value
				}
				function config() {
					return "config"
				}
				/** @param {Context} context */
				function prices({ previous: last }) {
					previous.push(last)
					return ++version
				}
				const run = flow()
					.add(config)
					.add(prices)
					.add(chart, prices)
					.run()
				assert.equal(await run, "chart 1")
				run.reload(prices)
				assert.equal(run.status, "running")
				assert.equal(await run, "chart 2")
				assert.deepEqual(previous, [ void 0, 1 ])
				run.reload()
				assert.equal(await run, "chart 3")
				assert.equal(run.get(config), "config")
				assert.throws(
					() => run.reload(() => 1),
					"is not added to the flow"
				)
				function flaky() {
					if (!version++) throw Error("first")
					return "ok"
				}
				function page(
					/** @type {string} */ a,
					/** @type {string} */ b
				) {
					return a + " " + b
				}
				/** @param {Context} context */
				function slow({ sleep }) {
					return sleep(5).then(() => "slow")
				}
				const failed = flow()
					.add(flaky)
					.add(slow)
					.add(page, flaky, slow)
					.run()
				version = 0
				await rejection(failed)
				assert.equal(
					failed.nodes["slow"],
					"cancelled"
				)
				failed.reload(flaky)
				assert.equal(await failed, "ok slow")
			}
		)
		it(
			"reload selected branches",
			async () => {
				for (const resume of [ false, true ]) {
					/** @type {string[]} */
					const log = []
					const state = { plan: "premium" }
					function basic() {
						return log.push("basic")
					}
					function premium() {
						return log.push("premium")
					}
					function route(
						/** @type {Context<{ plan: string }>} */ context
					) {
						return context.state.plan
					}
					const plans = /** @type {import("async-lube").Flow<{ plan: string }>} */(flow())/**/.add(route)
						.add(premium)
						.add(basic)
						.edge(route, { basic, premium })
					const first = plans.run(state)
					await first
					const run = resume
						? plans.run(
							state,
							{
								snapshot: JSON.parse(
									JSON.stringify(first.snapshot())
								)
							}
						)
						: first
					await run
					if (!resume) {
						run.reload(premium)
						await run
					}
					state.plan = "basic"
					run.reload(route)
					await run
					assert.deepEqual(
						run.nodes,
						{
							basic: "done",
							premium: "skipped",
							route: "done"
						}
					)
					assert.deepEqual(
						log,
						resume ? [ "premium", "basic" ] : [ "premium", "premium", "basic" ]
					)
				}
			}
		)
		it(
			"resources wait for the other dependencies of their dependents",
			async () => {
				/** @type {string[]} */
				const log = []
				const otp = flow.input("otp")
				function begin() {
					log.push("begin")
					return { id: 1 }
				}
				function insert(
					/** @type {{ id: number }} */ tx,
					/** @type {unknown} */ code
				) {
					log.push(
						`insert ${tx.id} ${String(code)}`
					)
					return code
				}
				function release(
					/** @type {{ id: number }} */ _,
					/** @type {unknown} */ error
				) {
					log.push(error ? "rollback" : "commit")
				}
				const checkout = flow().add(otp, { timeout: 60000 })
					.add(begin, { release })
					.add(insert, begin, otp)
				const run = checkout.run()
				await run.idle()
				assert.equal(run.status, "waiting")
				assert.equal(run.nodes["begin"], "idle")
				assert.deepEqual(log, [])
				const snapshot = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				await rejection(run)
				const resumed = checkout.run(void 0, { snapshot })
				await resumed.idle()
				assert.equal(resumed.status, "waiting")
				assert.deepEqual(log, [])
				resumed.send(otp, "123")
				assert.equal(await resumed, "123")
				assert.deepEqual(
					log,
					[ "begin", "insert 1 123", "commit" ]
				)
				log.length = 0
				function valid() {
					return "ok"
				}
				const skipped = flow().add(valid, { when: () => false })
					.add(begin, { release })
					.add(insert, begin, valid)
					.run()
				await skipped
				assert.deepEqual(log, [])
				assert.equal(
					skipped.nodes["insert"],
					"skipped"
				)
				assert.equal(skipped.nodes["begin"], "idle")
			}
		)
		it(
			"retry and timeout",
			async () => {
				/** @type {number[]} */
				const delays = []
				/** @param {Context} context */
				function flaky({ attempt }) {
					if (attempt < 3) throw Error("again")
					return attempt
				}
				assert.equal(
					await flow()
						.add(
							flaky,
							{
								retry: {
									count: 2,
									delay: attempt => (delays.push(attempt), 1)
								}
							}
						)
						.run(),
					3
				)
				assert.deepEqual(delays, [ 1, 2 ])
				/** @param {Context} context */
				function hang_once({ attempt }) {
					return attempt == 1 ? new Promise(() => {}) : "second"
				}
				assert.equal(
					await flow()
						.add(
							hang_once,
							{ retry: 1, timeout: 10 }
						)
						.run(),
					"second"
				)
				function hang() {
					return new Promise(() => {})
				}
				const error = await rejection(
					flow()
						.add(hang, { timeout: 10 })
						.run()
				)
				assert.instanceOf(error, FlowError)
				assert.instanceOf(error.cause, TimeoutError)
			}
		)
		it(
			"retry conditions",
			async () => {
				class Invalid extends Error {}
				/** @type {[number, string][]} */
				const delays = []
				let calls = 0
				function save() {
					calls++
					throw calls == 1 ? Error("busy") : new Invalid("bad")
				}
				const error = await rejection(
					flow()
						.add(
							save,
							{
								retry: {
									count: 5,
									delay: (attempt, reason) => {
										delays.push(
											[
												attempt,
												/** @type {Error} */(reason)/**/.message
											]
										)
										return 0
									},
									when: reason => !(reason instanceof Invalid)
								}
							}
						)
						.run()
				)
				assert.equal(calls, 2)
				assert.deepEqual(delays, [ [ 1, "busy" ] ])
				assert.instanceOf(error, FlowError)
				assert.equal(
					/** @type {Error} */(error.cause)/**/.message,
					"bad"
				)
				let attempts = 0
				function flaky() {
					if (++attempts < 3) throw Error("flaky")
					return attempts
				}
				vi.useFakeTimers()
				try {
					assert.equal(
						await flow().add(flaky, { retry: 2 })
							.run(),
						3
					)
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"retry failed nodes and items",
			async () => {
				let broken = true
				const calls = { config: 0, save: 0 }
				function config() {
					return ++calls.config
				}
				function save(/** @type {number} */ value) {
					calls.save++
					if (broken) throw Error("disk")
					return "saved " + value
				}
				const job = flow()
					.add(config)
					.add(save, config)
					.run()
				const job_error = await rejection(job)
				assert.instanceOf(job_error, FlowError)
				assert.equal(job_error.node, "save")
				broken = false
				job.retry()
				assert.equal(await job, "saved 1")
				assert.deepEqual(calls, { config: 1, save: 2 })
				let bad = true
				/** @type {number[]} */
				const fetched = []
				function fetch_item(/** @type {number} */ id) {
					fetched.push(id)
					if (id == 2 && bad) throw Error("503")
					return id * 10
				}
				function ids() {
					return [ 1, 2, 3 ]
				}
				const batch = flow()
					.add(ids)
					.add(
						flow.each(fetch_item),
						ids,
						{ optional: true }
					)
					.run()
				assert.deepEqual(await batch, [ 10, void 0, 30 ])
				assert.deepEqual(
					Object.keys(batch.errors),
					[ "fetch_item.1" ]
				)
				bad = false
				batch.retry()
				assert.deepEqual(await batch, [ 10, 20, 30 ])
				assert.deepEqual(fetched, [ 1, 2, 3, 2 ])
				assert.deepEqual(batch.errors, {})
			}
		)
		it(
			"retry nested items",
			async () => {
				let down = true
				/** @type {Record<string, number>} */
				const calls = {}
				const upload = flow.each(
					(/** @type {string} */ name) => {
						calls[name] = (calls[name] ?? 0) + 1
						if (name == "f2" && down) throw Error("f2 down")
						return name.toUpperCase()
					}
				)
				function items(
					/** @type {Context<string[]>} */ { state }
				) {
					return state
				}
				const batch = /** @type {import("async-lube").Flow<string[]>} */(flow())/**/.add(items)
					.add(
						upload,
						items,
						{ name: "upload", optional: true }
					)
				function lists() {
					return [ [ "f1", "f2" ], [ "f3" ] ]
				}
				const batches = flow().add(lists)
					.add(
						flow.each(batch),
						lists,
						{ name: "batches" }
					)
				const run = batches.run()
				assert.deepEqual(
					await run,
					[ [ "F1", void 0 ], [ "F3" ] ]
				)
				assert.deepEqual(
					Object.keys(run.errors),
					[ "batches.0.upload.1" ]
				)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				assert.equal(
					saved.nodes.batches.subs["0"].errors["upload.1"].message,
					"f2 down"
				)
				down = false
				run.retry()
				assert.deepEqual(
					await run,
					[ [ "F1", "F2" ], [ "F3" ] ]
				)
				assert.deepEqual(calls, { f1: 1, f2: 2, f3: 1 })
				assert.deepEqual(run.errors, {})
				const resumed = batches.run(void 0, { snapshot: saved })
				await resumed
				resumed.retry()
				assert.deepEqual(
					await resumed,
					[ [ "F1", "F2" ], [ "F3" ] ]
				)
				assert.deepEqual(calls, { f1: 1, f2: 3, f3: 1 })
			}
		)
		it(
			"run promise methods",
			async () => {
				function fail() {
					throw Error("down")
				}
				/** @type {string[]} */
				const log = []
				await flow()
					.add(fail)
					.run()
					.catch(
						error => log.push(
							/** @type {Error} */(/** @type {FlowError} */(error)/**/.cause)/**/.message
						)
					)
					.finally(() => log.push("finally"))
				assert.deepEqual(log, [ "down", "finally" ])
				await flow()
					.add(() => "ok")
					.run()
					.finally(() => log.push("run finally"))
				assert.deepEqual(
					log,
					[ "down", "finally", "run finally" ]
				)
				const url = new URL(
					"../../packages/async-lube/src/index.js",
					import.meta.url
				).href
				const script = [
					`import { flow } from ${JSON.stringify(url)}`,
					"process.on(\"unhandledRejection\", error => console.log(\"unhandled\", error.name))",
					"flow().add(() => { throw Error(\"x\") }).run()",
					"flow().add(() => new Promise(() => {})).run().cancel()",
					"setTimeout(() => console.log(\"end\"), 20)"
				].join("\n")
				const output = execFileSync(
					process.execPath,
					[
						"--input-type=module",
						"-e",
						script
					],
					{ encoding: "utf8" }
				)
				assert.equal(
					output.replace(/\r/g, "").trim(),
					"unhandled FlowError\nend"
				)
			},
			30000
		)
		it(
			"run signal",
			async () => {
				const controller = new AbortController()
				for (let i = 0; i < 5; i++) {
					await flow()
						.add(() => i)
						.run(
							void 0,
							{ signal: controller.signal }
						)
				}
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
				const run = flow()
					.add(() => 1)
					.run(
						void 0,
						{ signal: controller.signal }
					)
				await run
				controller.abort()
				run.cancel()
				assert.equal(run.status, "done")
			}
		)
		it(
			"runs with an id",
			async () => {
				function read_key(/** @type {Context} */ { key }) {
					return key
				}
				const run = flow().add(read_key)
					.run(void 0, { id: "order-1" })
				assert.equal(await run, "order-1:read_key:1")
				assert.equal(run.snapshot().id, "order-1")
				/** @type {import("async-lube").FlowSnapshot} */
				const saved = {
					errors: {},
					id: "order-1",
					nodes: {},
					version: 1
				}
				const resumed = flow().add(read_key)
					.run(
						void 0,
						{ id: "order-1", snapshot: saved }
					)
				assert.equal(
					await resumed,
					"order-1:read_key:1"
				)
				assert.equal(
					await flow().add(read_key)
						.run(void 0, { snapshot: saved }),
					"order-1:read_key:1"
				)
				assert.throws(
					() => flow().add(read_key)
						.run(
							void 0,
							{ id: "order-2", snapshot: saved }
						),
					"The id \"order-2\" of the run is not the id \"order-1\" of its snapshot"
				)
				assert.throws(
					() => flow().add(read_key)
						.run(
							void 0,
							{
								snapshot: /** @type {never} */({ ...saved, version: 2 })/**/
							}
						),
					"Unknown flow snapshot version 2"
				)
				assert.throws(
					() => flow().add(read_key)
						.run(
							void 0,
							{
								snapshot: /** @type {never} */({ errors: {}, nodes: {} })/**/
							}
						),
					"Unknown flow snapshot version undefined"
				)
				assert.throws(
					() => flow().add(read_key)
						.run(
							void 0,
							/** @type {never} */({ ids: "order-1" })/**/
						),
					"Unknown run option \"ids\""
				)
				assert.throws(
					() => flow().add(read_key)
						.run(void 0, { id: "" }),
					"id"
				)
			}
		)
		it(
			"skip, when and join",
			async () => {
				function basic() {
					return "basic"
				}
				function home(
					/** @type {string | undefined} */ a,
					/** @type {string | undefined} */ b
				) {
					return a ?? b
				}
				function premium() {
					return "premium"
				}
				function shipping() {
					return "shipping"
				}
				/** @param {Context<{ plan: string }>} context */
				function user({ state }) {
					return state
				}
				const page = /** @type {import("async-lube").Flow<{ plan: string }>} */(flow())/**/
					.add(user)
					.add(
						premium,
						user,
						{
							when: value => value.plan == "premium"
						}
					)
					.add(
						basic,
						user,
						{
							when: value => value.plan != "premium"
						}
					)
					.add(shipping, basic)
					.add(
						home,
						premium,
						basic,
						{ join: "any" }
					)
				const premium_run = page.run({ plan: "premium" })
				assert.equal(await premium_run, "premium")
				assert.equal(
					premium_run.nodes["shipping"],
					"skipped"
				)
				const basic_run = page.run({ plan: "basic" })
				assert.equal(await basic_run, "basic")
				assert.equal(
					basic_run.nodes["premium"],
					"skipped"
				)
				assert.equal(
					basic_run.get(shipping),
					"shipping"
				)
				function after() {
					return "after"
				}
				/** @param {Context} context */
				function maybe({ skip }) {
					return skip()
				}
				const skipped = flow()
					.add(maybe)
					.add(after, maybe)
					.run()
				assert.isUndefined(await skipped)
				assert.deepEqual(
					skipped.nodes,
					{
						after: "skipped",
						maybe: "skipped"
					}
				)
			}
		)
		it(
			"snapshot and resume",
			async () => {
				/** @type {string[]} */
				const calls = []
				let crash = true
				function load() {
					calls.push("load")
					return 2
				}
				const approval = flow.input("approval")
				/**
				 * @param {number} value
				 * @param {unknown} approved
				 */
				async function handle(value, approved) {
					calls.push("item " + value)
					if (value == 1 && crash) {
						await pause(5)
						throw Error("crash")
					}
					return approved ? value * 100 : 0
				}
				function items(/** @type {number} */ count) {
					return Array.from({ length: count }, (_, i) => i)
				}
				const job = flow()
					.add(load)
					.add(approval, load)
					.add(items, load)
					.add(flow.each(handle), items, approval)
				const first = job.run()
				first.send(approval, true)
				await rejection(first)
				const saved = JSON.parse(
					JSON.stringify(first.snapshot())
				)
				assert.equal(
					saved.nodes.approval.status,
					"done"
				)
				assert.deepEqual(
					saved.nodes.handle.items,
					[ { value: 0 }, null ]
				)
				crash = false
				const second = job.run(void 0, { snapshot: saved })
				assert.deepEqual(await second, [ 0, 100 ])
				assert.deepEqual(
					calls,
					[ "load", "item 0", "item 1", "item 1" ]
				)
				assert.throws(
					() => flow().add(load, { name: "other" })
						.run(void 0, { snapshot: saved }),
					"The snapshot has unknown flow node \"load\""
				)
				const otp = flow.input("otp")
				function verify(/** @type {unknown} */ value) {
					return "verified " + value
				}
				const app = flow().add(
					flow()
						.add(otp)
						.add(verify, otp),
					{ name: "auth" }
				)
				const waiting = app.run()
				await pause(0)
				const saved_app = JSON.parse(
					JSON.stringify(waiting.snapshot())
				)
				waiting.cancel()
				const resumed = app.run(void 0, { snapshot: saved_app })
				await pause(0)
				assert.equal(
					resumed.nodes["auth.otp"],
					"waiting"
				)
				resumed.send("auth.otp", "42")
				assert.equal(await resumed, "verified 42")
			}
		)
		it(
			"snapshot errors and items",
			async () => {
				let broken = true
				function a() {
					if (broken) throw Error("a")
					return 1
				}
				const first = flow()
					.add(a)
					.run()
				await rejection(first)
				broken = false
				const resumed = flow()
					.add(a)
					.run(
						void 0,
						{
							snapshot: JSON.parse(
								JSON.stringify(first.snapshot())
							)
						}
					)
				assert.equal(await resumed, 1)
				assert.deepEqual(resumed.errors, {})
				let bad = true
				/** @type {number[]} */
				const calls = []
				function list() {
					return [ 1, 2, 3 ]
				}
				function once() {
					return new Set([ 1, 2, 3 ]).values()
				}
				function up(/** @type {number} */ value) {
					calls.push(value)
					if (value == 2 && bad) throw Error("bad")
					return value * 10
				}
				const optional = flow()
					.add(list)
					.add(
						flow.each(up),
						list,
						{ optional: true }
					)
				const partial = optional.run()
				assert.deepEqual(
					await partial,
					[ 10, void 0, 30 ]
				)
				const saved = JSON.parse(
					JSON.stringify(partial.snapshot())
				)
				bad = false
				const continued = optional.run(void 0, { snapshot: saved })
				await continued
				continued.retry()
				assert.deepEqual(await continued, [ 10, 20, 30 ])
				assert.deepEqual(calls, [ 1, 2, 3, 2 ])
				bad = true
				calls.length = 0
				const strict = flow()
					.add(once)
					.add(flow.each(up), once)
					.run()
				await rejection(strict)
				bad = false
				strict.retry()
				assert.deepEqual(await strict, [ 10, 20, 30 ])
				function odd(/** @type {number} */ value) {
					if (value % 2) throw Error("odd")
					return value
				}
				const caught = flow()
					.add(
						flow.each(odd),
						{ catch: () => -1, name: "odd" }
					)
					.run([ 0, 1 ])
				assert.deepEqual(await caught, [ 0, -1 ])
				const caught_snapshot = JSON.parse(
					JSON.stringify(caught.snapshot())
				)
				assert.deepEqual(
					Object.keys(caught_snapshot.errors),
					[ "odd.1" ]
				)
				assert.deepEqual(
					Object.keys(
						flow().add(
							flow.each(odd),
							{ catch: () => -1, name: "odd" }
						)
							.run(
								[ 0, 1 ],
								{ snapshot: caught_snapshot }
							)
							.errors
					),
					[ "odd.1" ]
				)
			}
		)
		it(
			"snapshot needs names that do not depend on the order",
			async () => {
				const gate = flow.input("gate")
				const numbers = channel()
				function cart() {
					return "cart"
				}
				function list() {
					return [ 1 ]
				}
				/**
				 * @param {import("async-lube").FlowRun<unknown, unknown>} run
				 * @param {string} message
				 * @returns {Promise<void>}
				 */
				async function refused(run, message) {
					await pause(0)
					assert.throws(() => run.snapshot(), message)
					run.cancel()
				}
				await refused(
					flow().add(() => 1)
						.add(gate)
						.run(),
					"Flow node \"node\" has no name of its own, so a snapshot cannot find it after the code changes: add it with a name option"
				)
				await refused(
					flow().add(list)
						.add(flow.each(() => 1), list)
						.run(),
					"Flow node \"node\" has no name of its own"
				)
				await refused(
					flow().add(flow.input())
						.run(),
					"Flow node \"input\" has no name of its own"
				)
				await refused(
					flow().add(flow.input("otp"))
						.add(flow.input("otp"))
						.run(),
					"Flow node \"otp_2\" has no name of its own"
				)
				await refused(
					flow().add(cart, numbers)
						.run(),
					"Flow node \"stream\" has no name of its own"
				)
				await refused(
					flow().add(
						flow().add(() => 1)
							.add(gate),
						{ name: "auth" }
					)
						.run(),
					"Flow node \"auth.node\" has no name of its own"
				)
				await refused(
					flow().add(flow().add(cart))
						.add(gate)
						.run(),
					"Flow node \"flow\" has no name of its own"
				)
				const run = flow()
					.add(list)
					.add(flow.each(cart), list)
					.add(() => "total", { name: "total" })
					.add(numbers, { name: "numbers" })
					.add(
						flow().add(cart)
							.add(flow.input("otp")),
						{ name: "auth" }
					)
					.add(flow.input("input"))
					.run()
				await pause(0)
				const saved = JSON.parse(JSON.stringify(run.snapshot()))
				run.cancel()
				assert.deepEqual(
					Object.keys(saved.nodes),
					[
						"list",
						"cart",
						"total",
						"numbers",
						"auth",
						"input"
					]
				)
			}
		)
		it(
			"status",
			async () => {
				const code = flow.input("code")
				function verify(/** @type {unknown} */ value) {
					return value == "1234"
				}
				const run = flow()
					.add(code)
					.add(verify, code)
					.run()
				assert.equal(run.status, "waiting")
				assert.deepEqual(
					run.nodes,
					{ code: "waiting", verify: "idle" }
				)
				run.send(code, "1234")
				assert.deepEqual(
					run.nodes,
					{ code: "done", verify: "running" }
				)
				assert.equal(run.status, "running")
				await run
				assert.equal(run.status, "done")
				assert.deepEqual(
					run.results,
					{ code: "1234", verify: true }
				)
			}
		)
		it(
			"status behind concurrency",
			async () => {
				const approve = flow.input("approve")
				function draft() {
					return "draft"
				}
				const review = flow().add(draft)
					.add(approve, draft)
				function join(
					/** @type {unknown} */ approved,
					/** @type {string} */ value
				) {
					return [ approved, value ]
				}
				function other() {
					return "other"
				}
				const run = flow({ concurrency: 1 })
					.add(review, { name: "review" })
					.add(other)
					.add(join, review, other)
					.run()
				await run.idle()
				assert.equal(run.status, "waiting")
				assert.deepEqual(
					run.nodes,
					{
						"join": "idle",
						"other": "pending",
						"review": "waiting",
						"review.approve": "waiting",
						"review.draft": "done"
					}
				)
				run.send("review.approve", true)
				assert.deepEqual(await run, [ true, "other" ])
			}
		)
		it(
			"status while retrying",
			async () => {
				let failures = 0
				function flaky(
					/** @type {Context<number>} */ { state }
				) {
					if (state == 1 && failures++ < 1) throw Error("flaky")
					return state
				}
				function list() {
					return [ 0, 1 ]
				}
				const approve = flow.input("approve")
				const review = /** @type {import("async-lube").Flow<number>} */(flow())/**/.add(flaky)
					.add(approve, flaky)
				const run = flow()
					.add(list)
					.add(
						flow.each(review),
						list,
						{
							name: "review",
							retry: { count: 1, delay: 100 }
						}
					)
					.run()
				await pause(20)
				assert.equal(run.status, "running")
				run.cancel()
				assert.instanceOf(
					await rejection(run),
					CancelError
				)
			}
		)
		it(
			"stream",
			async () => {
				const tick = flow.input("tick")
				function double(/** @type {unknown} */ value) {
					return Number(value) * 2
				}
				const run = flow().add(tick)
					.add(double, tick, { overlap: "queue" })
					.run()
				run.catch(() => {})
				/** @type {unknown[]} */
				const seen = []
				let ended = false
				void (async () => {
					for await (const value of run.stream(double)) seen.push(value)
					ended = true
				})()
				await pause(2)
				run.send(tick, 1)
				run.send(tick, 2)
				run.send(tick, 3)
				await pause(20)
				assert.deepEqual(seen, [ 2, 4, 6 ])
				assert.strictEqual(
					run.stream(double),
					run.stream(double)
				)
				run.cancel()
				await pause(5)
				assert.isTrue(ended)
				assert.throws(
					() => run.stream(
						/** @type {never} */("missing")/**/
					),
					"is not added"
				)
			}
		)
		it(
			"streams as dependencies",
			async () => {
				/** @type {import("async-lube").Channel<string>} */
				const breads = channel()
				/** @type {import("async-lube").Channel<string>} */
				const cabbages = channel()
				/** @type {import("async-lube").Channel<string>} */
				const patties = channel()
				/** @type {string[]} */
				const made = []
				function burger(
					/** @type {string} */ b,
					/** @type {string} */ p,
					/** @type {string} */ c
				) {
					made.push(`${b}+${p}+${c}`)
					return `${b}+${p}+${c}`
				}
				breads.send("early")
				const run = flow()
					.add(
						burger,
						flow.queue(breads),
						flow.restart(patties),
						flow.keep(cabbages)
					)
					.run()
				run.catch(() => {})
				assert.deepEqual(
					Object.keys(run.nodes),
					[
						"stream",
						"stream_2",
						"stream_3",
						"burger"
					]
				)
				patties.send("p")
				cabbages.send("c")
				breads.send("b1")
				breads.send("b2")
				assert.equal(await run, "b2+p+c")
				assert.deepEqual(made, [ "b1+p+c", "b2+p+c" ])
				run.cancel()
				breads.send("b3")
				await pause(5)
				assert.equal(run.status, "done")
				assert.deepEqual(made, [ "b1+p+c", "b2+p+c" ])
				/** @type {import("async-lube").Channel<number>} */
				const numbers = channel()
				function double(/** @type {number} */ value) {
					return value * 2
				}
				function triple(/** @type {number} */ value) {
					return value * 3
				}
				const shared = flow().add(double, numbers)
					.add(triple, numbers)
				const one = shared.run()
				const two = shared.run()
				assert.deepEqual(
					Object.keys(one.nodes),
					[ "stream", "double", "triple" ]
				)
				numbers.send(2)
				assert.deepEqual(
					await Promise.all([ one, two ]),
					[ 6, 6 ]
				)
				assert.deepEqual(
					one.results,
					{ double: 4, stream: 2, triple: 6 }
				)
				one.cancel()
				numbers.send(3)
				await pause(5)
				assert.equal(two.get(triple), 9)
				assert.equal(one.get(triple), 6)
				one.reload()
				await pause(5)
				assert.equal(one.status, "waiting")
				numbers.send(4)
				assert.equal(await one, 12)
				one.cancel()
				two.cancel()
			}
		)
		it(
			"streams of runs and sub-flows",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const numbers = channel()
				function double(/** @type {number} */ value) {
					return value * 2
				}
				const first = flow().add(double, numbers)
					.run()
				/** @type {number[]} */
				const logged = []
				function log(/** @type {number} */ value) {
					logged.push(value)
					return value
				}
				const second = flow().add(log, first.stream(double))
					.run()
				numbers.send(1)
				assert.equal(await second, 2)
				numbers.send(2)
				await pause(5)
				assert.deepEqual(logged, [ 2, 4 ])
				first.cancel()
				second.cancel()
				const inner = flow().add(double, numbers)
				const outer = flow().add(inner)
					.run()
				numbers.send(0)
				await pause(1)
				assert.equal(
					outer.nodes["flow.stream"],
					"waiting"
				)
				numbers.send(3)
				assert.equal(await outer, 6)
				numbers.send(4)
				await pause(5)
				assert.equal(outer.status, "done")
				assert.deepEqual(outer.results, { flow: 6 })
				const replay = flow().add(numbers, { name: "numbers" })
					.add(double, numbers)
					.run()
				numbers.send(7)
				assert.equal(await replay, 14)
				const saved = replay.snapshot()
				replay.cancel()
				const resumed = flow().add(numbers, { name: "numbers" })
					.add(double, numbers)
					.run(void 0, { snapshot: saved })
				assert.equal(await resumed, 14)
				numbers.send(8)
				await pause(5)
				assert.equal(resumed.get(double), 16)
				resumed.cancel()
				/** @type {import("async-lube").Channel<number[]>} */
				const batches = channel()
				/** @type {number[]} */
				const done = []
				async function upload(
					/** @type {number} */ file,
					/** @type {Context} */ { sleep }
				) {
					await sleep(10)
					done.push(file)
					return file
				}
				const upload_all = flow.each(upload)
				const uploads = flow().add(upload_all, flow.queue(batches))
					.run()
				batches.send([ 1, 2 ])
				batches.send([ 3 ])
				await pause(5)
				batches.send([ 4 ])
				await pause(100)
				assert.deepEqual(done, [ 1, 2, 3, 4 ])
				assert.deepEqual(uploads.get(upload_all), [ 4 ])
				uploads.cancel()
			}
		)
		it(
			"streams that end or fail",
			async () => {
				function double(/** @type {number} */ value) {
					return value * 2
				}
				/** @type {import("async-lube").Channel<number>} */
				const empty = channel()
				const skipped = flow().add(double, empty)
					.run()
				empty.close()
				assert.equal(await skipped, void 0)
				assert.deepEqual(
					skipped.nodes,
					{
						double: "skipped",
						stream: "skipped"
					}
				)
				/** @type {import("async-lube").Channel<number>} */
				const once = channel()
				const kept = flow().add(double, once)
					.run()
				once.send(5)
				once.close()
				assert.equal(await kept, 10)
				kept.reload(double)
				assert.equal(await kept, 10)
				kept.reload()
				assert.equal(await kept, void 0)
				assert.equal(kept.nodes["stream"], "skipped")
				const failure = Error("down")
				async function* broken() {
					yield* []
					throw failure
				}
				const feed = broken()
				const caught = flow().add(
					feed,
					{ catch: () => 1, name: "feed" }
				)
					.add(double, feed)
					.run()
				assert.equal(await caught, 2)
				const optional = flow().add(
					broken(),
					{ name: "feed", optional: true }
				)
					.run()
				assert.equal(await optional, void 0)
				const failed = flow().add(double, broken())
					.run()
				const error = /** @type {FlowError} */(await rejection(failed))/**/
				assert.instanceOf(error, FlowError)
				assert.equal(error.cause, failure)
				assert.deepEqual(
					failed.nodes,
					{ double: "idle", stream: "failed" }
				)
				const unreadable = {
					[Symbol.asyncIterator]() {
						throw failure
					}
				}
				const early = flow().add(
					unreadable,
					{
						catch: reason => reason,
						name: "feed"
					}
				)
					.run()
				assert.equal(await early, failure)
				const gate = flow.input("gate")
				const feed_later = broken()
				const late = flow().add(gate)
					.add(
						feed_later,
						gate,
						{ catch: () => 3, name: "feed" }
					)
					.add(double, feed_later)
					.run()
				await pause(5)
				assert.equal(late.nodes["feed"], "idle")
				late.send(gate, 1)
				assert.equal(await late, 6)
				/** @type {import("async-lube").Channel<number>} */
				const slow = channel()
				const timed = flow().add(
					slow,
					{
						catch: () => 0,
						name: "slow",
						timeout: 10
					}
				)
					.run()
				assert.equal(await timed, 0)
				timed.cancel()
				/** @type {import("async-lube").Channel<number>} */
				const live = channel()
				const watched = flow().add(double, live)
					.run()
				live.send(5)
				assert.equal(await watched, 10)
				const late_failure = new Promise(
					resolve => {
						const stop = watched.subscribe(
							() => {
								if (watched.status != "failed") return
								stop()
								resolve(rejection(watched))
							}
						)
					}
				)
				live.fail(failure)
				const late_error = /** @type {FlowError} */(await late_failure)/**/
				assert.equal(late_error.cause, failure)
				assert.deepEqual(
					watched.nodes,
					{ double: "idle", stream: "failed" }
				)
				/** @type {import("async-lube").Channel<number>} */
				const backup = channel()
				const recovered = flow().add(
					backup,
					{ catch: () => 0, name: "feed" }
				)
					.add(double, backup)
					.run()
				backup.send(5)
				assert.equal(await recovered, 10)
				backup.fail(failure)
				await pause(1)
				assert.equal(await recovered, 0)
				/** @type {import("async-lube").Channel<number>} */
				const ended = channel()
				const finished = flow().add(double, ended)
					.run()
				ended.send(2)
				ended.close()
				await pause(1)
				assert.equal(await finished, 4)
				assert.equal(finished.status, "done")
				assert.throws(
					() => {
						const stream = broken()
						flow().add(stream)
							.add(stream)
					},
					"a stream is already added as flow node \"stream\""
				)
			}
		)
		it(
			"streams wait for room",
			async () => {
				let produced = 0
				async function* numbers() {
					for (let value = 1; value <= 12; value++) {
						produced = value
						yield value
					}
				}
				/** @type {number[]} */
				const handled = []
				async function handle(
					/** @type {number} */ value,
					/** @type {Context} */ { sleep }
				) {
					await sleep(5)
					handled.push(value)
					return value
				}
				const queued = flow().add(
					handle,
					flow.queue(numbers()),
					{ limit: 2, overflow: "wait" }
				)
					.run()
				await pause(2)
				assert.isAtMost(produced, 4)
				await until(() => handled.length == 12)
				assert.deepEqual(
					handled,
					[ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ]
				)
				queued.cancel()
				handled.length = 0
				produced = 0
				const backlog = flow().add(
					handle,
					numbers(),
					{
						limit: 2,
						overflow: "wait",
						overlap: "queue"
					}
				)
					.run()
				await pause(2)
				assert.isAtMost(produced, 4)
				await until(() => handled.length == 12)
				assert.deepEqual(
					handled,
					[ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ]
				)
				backlog.cancel()
				let closed = false
				async function* endless() {
					try {
						for (let value = 1; ; value++) yield value
					} finally {
						closed = true
					}
				}
				const halted = flow().add(
					handle,
					flow.queue(endless()),
					{ limit: 1, overflow: "wait" }
				)
					.run()
				await pause(2)
				halted.cancel()
				await pause(20)
				assert.isTrue(closed)
				assert.throws(
					() => flow().add(
						handle,
						numbers(),
						{
							overflow: "wait",
							overlap: "queue"
						}
					),
					"needs a limit"
				)
				assert.throws(
					() => flow().add(
						handle,
						numbers(),
						{
							limit: 2,
							overflow: /** @type {never} */("block")/**/,
							overlap: "queue"
						}
					),
					"must be \"drop\" or \"wait\""
				)
			}
		)
		it(
			"streams with a current value",
			async () => {
				const models = channel({ initial: "small" })
				/** @type {import("async-lube").Channel<string>} */
				const questions = channel()
				/** @type {string[]} */
				const answered = []
				function answer(
					/** @type {string} */ question,
					/** @type {string} */ model
				) {
					answered.push(`${question}@${model}`)
					return `${question}@${model}`
				}
				const chat = flow().add(
					answer,
					flow.queue(questions),
					flow.keep(models)
				)
				const run = chat.run()
				await pause(1)
				assert.equal(run.nodes["stream_2"], "done")
				questions.send("q1")
				assert.equal(await run, "q1@small")
				models.send("large")
				await pause(1)
				assert.deepEqual(answered, [ "q1@small" ])
				questions.send("q2")
				await pause(1)
				assert.equal(await run, "q2@large")
				const other = chat.run()
				questions.send("q3")
				assert.equal(await other, "q3@large")
				run.cancel()
				other.cancel()
				const inner = flow().add(answer, questions, models)
				const outer = flow().add(inner)
					.run()
				await pause(1)
				questions.send("q4")
				assert.equal(await outer, "q4@large")
				models.send("tiny")
				await pause(1)
				assert.equal(outer.status, "done")
				models.close()
				questions.close()
			}
		)
		it(
			"sub flow",
			async () => {
				const otp = flow.input("otp")
				/**
				 * @param {unknown} code
				 * @param {Context<{ amount: number }>} context
				 */
				function pay(code, { state }) {
					return state.amount + "/" + code
				}
				const payment = /** @type {import("async-lube").Flow<{ amount: number }>} */(flow())/**/
					.add(otp)
					.add(pay, otp)
				function amount() {
					return { amount: 5 }
				}
				function receipt(/** @type {string} */ paid) {
					return "receipt " + paid
				}
				const checkout = flow()
					.add(amount)
					.add(
						payment,
						amount,
						{ name: "payment" }
					)
					.add(receipt, payment)
				const run = checkout.run()
				await pause(0)
				assert.equal(run.status, "waiting")
				assert.equal(
					run.nodes["payment.otp"],
					"waiting"
				)
				assert.throws(
					() => run.send("receipt.otp", 1),
					"Flow node \"receipt\" is not a flow"
				)
				run.send("payment.otp", "777")
				assert.equal(await run, "receipt 5/777")
			}
		)
		it(
			"sub flow paths",
			async () => {
				let count = 0
				async function step() {
					const current = ++count
					await pause(10)
					if (current == 1) throw Error("first")
					return current
				}
				const run = flow()
					.add(
						flow().add(step),
						{
							name: "group",
							retry: { count: 1, delay: 30 }
						}
					)
					.run()
				await pause(20)
				run.reload("group.step")
				assert.equal(run.pending("group.step"), 0)
				assert.throws(
					() => run.reload("group.missing"),
					"\"missing\" is not added to the flow"
				)
				assert.equal(await run, 2)
				assert.equal(count, 2)
				run.reload("group.step")
				assert.equal(run.pending("group.step"), 0)
				assert.equal(run.status, "done")
			}
		)
		it(
			"sub flow that lost a race",
			async () => {
				const decision = flow.input("decision")
				const hr_a = flow().add(decision)
				const hr_b = flow().add(flow.input("decision"))
				function pick(
					/** @type {unknown} */ a,
					/** @type {unknown} */ b
				) {
					return a ?? b
				}
				const approvals = flow()
					.add(hr_a, { name: "hr_a" })
					.add(hr_b, { name: "hr_b" })
					.add(
						pick,
						hr_a,
						hr_b,
						{ join: "race", name: "pick" }
					)
				const run = approvals.run(void 0, { id: "approvals" })
				await pause(1)
				assert.equal(
					run.nodes["hr_a.decision"],
					"waiting"
				)
				run.send("hr_b.decision", "b")
				await pause(1)
				run.send("hr_a.decision", "a")
				assert.equal(await run, "b")
				run.send("hr_a.decision", "a")
				assert.deepEqual(
					Object.keys(run.nodes).sort(),
					[ "hr_a", "hr_b", "pick" ]
				)
				assert.throws(
					() => run.send("hr_c.decision", "c"),
					"\"hr_c\" is not added to the flow"
				)
				run.send("hr_b.decision", "c")
				assert.equal(await run, "b")
				assert.equal(run.status, "done")
				const snapshot = JSON.parse(JSON.stringify(run.snapshot()))
				const resumed = approvals.run(void 0, { snapshot })
				resumed.send("hr_a.decision", "a")
				assert.throws(
					() => resumed.send("hr_a.missing", "a"),
					"\"missing\" is not added to the flow"
				)
				assert.equal(await resumed, "b")
			}
		)
		it(
			"sub flow waiting",
			async () => {
				const approve = flow.input("approve")
				const review = flow().add(approve)
				const run = flow().add(review, { name: "review" })
					.run()
				await run.idle()
				assert.equal(run.status, "waiting")
				assert.equal(run.nodes["review"], "waiting")
				assert.equal(
					run.nodes["review.approve"],
					"waiting"
				)
				run.send("review.approve", true)
				assert.equal(await run, true)
				assert.equal(run.nodes["review"], "done")
				function items() {
					return [ 1, 2 ]
				}
				async function slow(
					/** @type {Context} */ { sleep }
				) {
					await sleep(30)
				}
				const both = flow().add(items)
					.add(
						flow.each(
							flow().add(slow)
								.add(approve, slow)
						),
						items,
						{ name: "reviews" }
					)
					.run()
				await pause(5)
				assert.equal(both.status, "running")
				assert.equal(both.nodes["reviews"], "running")
				await both.idle()
				assert.equal(both.status, "waiting")
				assert.equal(both.nodes["reviews"], "waiting")
				both.cancel()
				await rejection(both)
			}
		)
		it(
			"subscribe",
			async () => {
				async function first() {
					await pause(2)
					return 1
				}
				async function second(/** @type {number} */ value) {
					await pause(2)
					return value + 1
				}
				const inner = flow().add(first, { name: "first" })
					.add(second, first, { name: "second" })
				const run = flow().add(inner, { name: "inner" })
					.run()
				/** @type {string[]} */
				const seen = []
				const stop = run.subscribe(
					() => seen.push(
						[
							run.status,
							run.nodes["inner.first"] ?? "-",
							run.nodes["inner.second"] ?? "-"
						].join(" ")
					)
				)
				assert.strictEqual(run.nodes, run.nodes)
				assert.strictEqual(run.results, run.results)
				assert.strictEqual(run.errors, run.errors)
				const before = run.nodes
				await run
				await pause(2)
				stop()
				assert.notStrictEqual(run.nodes, before)
				assert.includeMembers(
					seen,
					[
						"running done running",
						"running done done"
					]
				)
				const after = seen.length
				run.reload()
				await run
				await pause(2)
				assert.equal(seen.length, after)
				const failing = flow().add(
					() => {
						throw Error("boom")
					},
					{ name: "boom" }
				)
					.run()
				failing.catch(() => {})
				let hits = 0
				failing.subscribe(
					() => {
						hits++
						throw Error("the listener is broken")
					}
				)
				await rejection(failing)
				await pause(2)
				assert.isAbove(hits, 0)
			}
		)
		it(
			"sync throws and rejections",
			async () => {
				const attempts = { rejects: 0, throws: 0 }
				function both(
					/** @type {string} */ a,
					/** @type {string} */ b
				) {
					return a + b
				}
				function rejects() {
					return ++attempts.rejects < 3
						? Promise.reject(Error("rejected"))
						: Promise.resolve("ok")
				}
				function throws() {
					if (++attempts.throws < 3) throw Error("thrown")
					return "ok"
				}
				assert.equal(
					await flow()
						.add(throws, { retry: 2 })
						.add(rejects, { retry: 2 })
						.add(both, throws, rejects)
						.run(),
					"okok"
				)
				assert.deepEqual(
					attempts,
					{ rejects: 3, throws: 3 }
				)
				function items() {
					return [ 1, 2 ]
				}
				const parse = flow.each(
					(/** @type {number} */ x) => {
						if (x == 1) throw Error("sync item")
						return Promise.reject(Error("async item"))
					}
				)
				const run = flow()
					.add(items)
					.add(parse, items, { optional: true })
					.run()
				assert.deepEqual(await run, [ void 0, void 0 ])
				assert.deepEqual(
					Object.values(run.errors).map(
						error => /** @type {Error} */(error)/**/.message
					),
					[ "sync item", "async item" ]
				)
				function broken_when() {
					return "never"
				}
				const guarded = await rejection(
					flow()
						.add(
							broken_when,
							{
								when: () => {
									throw Error("when failed")
								}
							}
						)
						.run()
				)
				assert.instanceOf(guarded, FlowError)
				assert.equal(
					/** @type {Error} */(guarded.cause)/**/.message,
					"when failed"
				)
			}
		)
		it(
			"timers resume where they were",
			async () => {
				/** @type {[string, number][]} */
				const seen = []
				async function slow(
					/** @type {Context} */ { attempt, key, sleep }
				) {
					seen.push([ key, attempt ])
					await sleep(300)
					return key
				}
				const paused = flow().add(slow)
					.run()
				paused.catch(() => {})
				await pause(150)
				const saved = JSON.parse(
					JSON.stringify(paused.snapshot())
				)
				paused.cancel()
				assert.equal(saved.nodes.slow.status, "idle")
				assert.lengthOf(
					saved.nodes.slow.runs[""].waits,
					1
				)
				const started = Date.now()
				const resumed = flow().add(slow)
					.run(void 0, { snapshot: saved })
				assert.equal(await resumed, seen[0]?.[0])
				assert.isBelow(Date.now() - started, 250)
				let failures = 1
				async function flaky(
					/** @type {Context} */ { attempt }
				) {
					if (failures-- > 0) throw Error("flaky")
					return attempt
				}
				const retrying = flow().add(
					flaky,
					{
						retry: { count: 2, delay: 300 }
					}
				)
					.run()
				retrying.catch(() => {})
				await pause(150)
				const delayed = JSON.parse(
					JSON.stringify(retrying.snapshot())
				)
				retrying.cancel()
				const restarted = Date.now()
				assert.equal(
					await flow().add(
						flaky,
						{
							retry: { count: 2, delay: 300 }
						}
					)
						.run(void 0, { snapshot: delayed }),
					2
				)
				assert.isBelow(Date.now() - restarted, 250)
				assert.isAtLeast(Date.now() - restarted, 50)
				const approve = flow.input("approve")
				const approval = flow().add(
					approve,
					{
						catch: () => "expired",
						timeout: 300
					}
				)
				const asked = approval.run()
				asked.catch(() => {})
				await pause(150)
				const waiting = JSON.parse(
					JSON.stringify(asked.snapshot())
				)
				asked.cancel()
				assert.typeOf(
					waiting.nodes.approve.deadline,
					"number"
				)
				const reopened = Date.now()
				assert.equal(
					await approval.run(void 0, { snapshot: waiting }),
					"expired"
				)
				assert.isBelow(Date.now() - reopened, 250)
			}
		)
		it(
			"traces",
			async () => {
				/** @type {import("async-lube").TraceEvent[]} */
				const events = []
				let failures = 1
				function double(/** @type {number} */ value) {
					return value * 2
				}
				function flaky() {
					if (failures-- > 0) throw Error("busy")
					return [ 1, 2 ]
				}
				function never(
					/** @type {Context} */ { skip }
				) {
					return skip()
				}
				const sub = flow().add(
					(
						/** @type {Context} */ { state }
					) => state,
					{ name: "inner" }
				)
				const run = flow().add(flaky, { retry: 1 })
					.add(
						flow.each(double),
						flaky,
						{ name: "items" }
					)
					.add(never)
					.add(sub, flaky, { name: "sub" })
					.run(
						void 0,
						{
							trace: event => {
								events.push(event)
								throw Error("ignored")
							}
						}
					)
				await run
				const summary = events.map(
					event => `${event.type} ${event.node}${event.index == null ? "" : "#" + event.index}`
				)
				assert.includeMembers(
					summary,
					[
						"start flaky",
						"fail flaky",
						"done flaky",
						"start items#0",
						"done items#1",
						"skip never",
						"done sub.inner",
						"done sub"
					]
				)
				const fail = events.find(event => event.type == "fail")
				assert.isTrue(
					fail?.type == "fail" && fail.retry
				)
				assert.equal(fail?.attempt, 1)
				assert.equal(
					events.find(
						event => event.type == "done" && event.node == "flaky"
					)?.attempt,
					2
				)
				assert.isTrue(
					events.every(
						event => !("duration" in event) || event.duration >= 0
					)
				)
				assert.typeOf(events[0]?.time, "number")
				/** @type {string[]} */
				const cancelled = []
				const slow = flow().add(
					async (
						/** @type {Context} */ { sleep }
					) => sleep(1000),
					{ name: "slow" }
				)
					.run(
						void 0,
						{
							trace: event => void cancelled.push(event.type)
						}
					)
				slow.catch(() => {})
				await pause(5)
				slow.cancel()
				await pause(1)
				assert.deepEqual(cancelled, [ "start", "cancel" ])
				/** @type {string[]} */
				const raced = []
				async function late(
					/** @type {Context} */ { sleep }
				) {
					await sleep(1000)
					return "late"
				}
				function quick() {
					return "quick"
				}
				const confirm = flow.input("confirm")
				function winner(
					/** @type {unknown} */ a,
					/** @type {unknown} */ b,
					/** @type {unknown} */ c
				) {
					return a ?? b ?? c
				}
				assert.equal(
					await flow().add(late)
						.add(quick)
						.add(confirm)
						.add(
							winner,
							late,
							confirm,
							quick,
							{ join: "race" }
						)
						.run(
							void 0,
							{
								trace: event => void raced.push(`${event.type} ${event.node}`)
							}
						),
					"quick"
				)
				await pause(1)
				assert.sameMembers(
					raced.filter(
						event => !event.endsWith("winner")
					),
					[
						"start late",
						"cancel late",
						"start quick",
						"done quick",
						"skip confirm"
					]
				)
			}
		)
		it(
			"traces the index of sub-flow items",
			async () => {
				/** @type {string[]} */
				const events = []
				function leaf(
					/** @type {Context} */ { index, skip }
				) {
					return index ? skip() : index
				}
				const sub = flow().add(leaf)
				await flow()
					.add(flow.each(sub), { name: "subs" })
					.run(
						[ 10, 20 ],
						{
							trace: event => {
								if (event.type != "done") events.push(
									`${event.type} ${event.node}#${event.index}`
								)
							}
						}
					)
				assert.sameMembers(
					events,
					[
						"start subs#0",
						"start subs#1",
						"start subs.0.leaf#0",
						"start subs.1.leaf#1",
						"skip subs.1.leaf#1"
					]
				)
			}
		)
		it(
			"validation",
			async () => {
				function a() {
					return [ 1 ]
				}
				assert.throws(
					() => flow({ concurrency: 0 }),
					"positive integer"
				)
				assert.throws(
					() => flow({ maxSteps: -1 }),
					"positive integer"
				)
				assert.throws(
					() => flow().add(
						flow.each(a),
						a,
						{ concurrency: 0.5 }
					),
					"positive integer"
				)
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ catch: () => 0, optional: true })/**/
					),
					"cannot be optional with catch or fallback"
				)
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ fallback: a, optional: true })/**/
					),
					"cannot be optional with catch or fallback"
				)
				assert.throws(
					() => flow().add(a, { fallback: a }),
					"cannot be the node itself"
				)
				assert.throws(
					() => flow().add(a, { join: "any" }),
					"needs dependencies"
				)
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ retry: "2" })/**/
					),
					"must be a count"
				)
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ retry: { delay: 1 } })/**/
					),
					"must be a count"
				)
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ timeout: "1" })/**/
					),
					"must be a positive number of milliseconds"
				)
				for (const key of [ "finish", "optional" ]) {
					assert.throws(
						() => flow().add(
							a,
							/** @type {never} */({ [key]: "yes" })/**/
						),
						`The ${key} of flow node "a" must be a boolean`
					)
				}
				assert.throws(
					() => flow().add(
						a,
						/** @type {never} */({ when: true })/**/
					),
					"The when of flow node \"a\" must be a function"
				)
				const rows = channel()
				assert.throws(
					() => flow().add(a)
						.add(
							number,
							flow.queue(a),
							{ limit: 1, overflow: "wait" }
						),
					"The overflow \"wait\" of flow node \"number\" needs a stream dependency to stop reading"
				)
				assert.doesNotThrow(
					() => flow().add(
						number,
						flow.queue(rows),
						{ limit: 1, overflow: "wait" }
					)
				)
				assert.throws(
					() => flow().edge(/** @type {never} */(1)/**/, a),
					"An edge must start from a function, an input, a flow or a stream"
				)
				assert.throws(
					() => flow.queue(/** @type {never} */(1)/**/),
					"flow.queue() needs a function, an input, a flow or a stream"
				)
				function number() {
					return 5
				}
				const each_error = await rejection(
					flow()
						.add(number)
						.add(
							/** @type {never} */(flow.each(a))/**/,
							/** @type {never} */(number)/**/
						)
						.run()
				)
				assert.instanceOf(each_error, FlowError)
				assert.instanceOf(each_error.cause, TypeError)
				function constructor() {
					return "value"
				}
				function pick(
					/** @type {undefined} */ x,
					/** @type {string | undefined} */ y
				) {
					return [ typeof x, y ]
				}
				function skipped(
					/** @type {Context} */ { skip }
				) {
					return skip()
				}
				assert.throws(
					() => flow().add(
						constructor,
						{ name: "__proto__" }
					),
					"other than \"__proto__\""
				)
				assert.throws(
					() => flow().add(
						constructor,
						/** @type {never} */({ retries: 2 })/**/
					),
					"Unknown option \"retries\""
				)
				assert.throws(
					() => flow().add(
						constructor,
						/** @type {never} */([ skipped ])/**/
					),
					"not as an array"
				)
				const run = flow()
					.add(skipped, { name: "constructor" })
					.add(
						constructor,
						{ name: "toString" }
					)
					.add(
						pick,
						skipped,
						constructor,
						{ join: "any" }
					)
					.run()
				assert.deepEqual(
					await run,
					[ "undefined", "value" ]
				)
			}
		)
		it(
			"wait for input",
			async () => {
				const approve = flow.input("approve")
				const review = flow().add(approve)
				function draft() {
					return "draft"
				}
				function publish(
					/** @type {unknown} */ text,
					/** @type {unknown} */ ok
				) {
					return ok ? text : "rejected"
				}
				const run = flow().add(draft)
					.add(review, draft, { name: "review" })
					.add(publish, draft, review)
					.run()
				await run.idle()
				assert.equal(run.status, "waiting")
				run.send("review.approve", true)
				await run.idle()
				assert.equal(run.status, "done")
				assert.equal(await run, "draft")
				const failing = flow()
					.add(
						() => {
							throw Error("down")
						}
					)
					.run()
				failing.catch(() => {})
				await failing.idle()
				assert.equal(failing.status, "failed")
			}
		)
		it(
			"waits longer than a timer",
			async () => {
				vi.useFakeTimers()
				try {
					const day = 86400000
					let woke = false
					const run = flow().add(
						async (
							/** @type {Context} */ { sleep }
						) => {
							await sleep(30 * day)
							woke = true
						}
					)
						.run()
					await vi.advanceTimersByTimeAsync(25 * day)
					assert.isFalse(woke)
					await vi.advanceTimersByTimeAsync(5 * day)
					assert.isTrue(woke)
					await run
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"when that throws fails the node",
			async () => {
				const broken = Error("broken condition")
				let throws = 1
				function when() {
					if (throws-- > 0) throw broken
					return true
				}
				let runs = 0
				function after(/** @type {unknown} */ value) {
					return [ "after", value ]
				}
				function backup() {
					return "backup"
				}
				function work() {
					return ++runs
				}
				const plain = await rejection(
					flow().add(work, { when })
						.run()
				)
				assert.instanceOf(plain, FlowError)
				assert.equal(
					/** @type {FlowError} */(plain)/**/.node,
					"work"
				)
				assert.equal(
					/** @type {FlowError} */(plain)/**/.cause,
					broken
				)
				assert.equal(runs, 0)
				throws = 1
				const caught = flow().add(
					work,
					{
						catch: error => error == broken ? "caught" : "other",
						when
					}
				)
					.run()
				assert.equal(await caught, "caught")
				assert.equal(caught.errors["work"], broken)
				throws = 1
				const fallen = flow().add(work, { fallback: backup, when })
					.add(backup)
					.run()
				assert.equal(await fallen, "backup")
				assert.equal(fallen.nodes["work"], "skipped")
				throws = 1
				const optional = flow().add(work, { optional: true, when })
					.add(after, work)
					.run()
				assert.deepEqual(
					await optional,
					[ "after", void 0 ]
				)
				assert.equal(optional.nodes["work"], "failed")
				assert.equal(runs, 0)
				throws = 1
				const retried = flow().add(work, { retry: 1, when })
					.run()
				assert.equal(await retried, 1)
				throws = 2
				const exhausted = await rejection(
					flow().add(work, { retry: 1, when })
						.run()
				)
				assert.equal(
					/** @type {FlowError} */(exhausted)/**/.cause,
					broken
				)
				let answer = false
				throws = 1
				const skipped = flow().add(
					work,
					{
						retry: { count: 1, delay: 5 },
						when: () => {
							if (throws-- > 0) throw broken
							return answer
						}
					}
				)
					.add(after, work)
					.run()
				assert.isUndefined(await skipped)
				assert.equal(skipped.nodes["work"], "skipped")
				assert.equal(
					skipped.nodes["after"],
					"skipped"
				)
				assert.equal(runs, 1)
				answer = true
				function items() {
					return [ 1, 2 ]
				}
				const each = flow.each(
					(/** @type {number} */ item) => item * 2
				)
				throws = 1
				const optional_each = flow().add(items)
					.add(
						each,
						items,
						{ optional: true, when }
					)
					.run()
				assert.isUndefined(await optional_each)
				assert.equal(
					optional_each.nodes["node"],
					"failed"
				)
				assert.equal(
					optional_each.errors["node"],
					broken
				)
				const code = flow.input("code")
				throws = 1
				const input = flow().add(items)
					.add(
						code,
						items,
						{ catch: () => "no code", when }
					)
					.run()
				assert.equal(await input, "no code")
				const sub = flow().add(work, { name: "work" })
				throws = 1
				const retried_sub = flow().add(
					sub,
					{ name: "sub", retry: 1, when }
				)
					.run()
				assert.equal(await retried_sub, 2)
			}
		)
	}
)
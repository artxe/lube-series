/** @import { DurableWorker } from "../../private.js" */
/** @import { Durable, DurableContext, DurableJson, DurableOptions, DurableStore } from "../../public.js" */
import { CancelError } from "../errors.js"
import { random_key } from "../key.js"
import { check_options } from "../options.js"
import { LOST } from "./lease.js"
import { cancel, enter } from "./run.js"
import { send } from "./send.js"
import { serve } from "./serve.js"
import { load } from "./store.js"
import { settle } from "./watch.js"
export { dueAt } from "./state.js"
export { memory, sqlite } from "./store.js"
/**
 * Runs an async function once per key and keeps its progress in a store, so that it survives crashes, restarts and deploys.
 * Write it as plain code: `step` results are saved and never run twice, and `sleep` and `wait` can last for days.
 * The function runs again from its start after a crash, so it has to reach the same steps in the same order,
 * and everything that is not the same every time, e.g. `Date.now()` or a request, belongs in a step.
 * @example
 * const checkout = durable(sqlite(db), async (cart: Cart, { step, wait }) => {
 *     const order = await step("order", () => orders.insert(cart))
 *     await step("charge", ({ key }) => api.post("/charges", order, { idempotent: key }))
 *     const approved = await wait<boolean>("approve", { timeout: 3 * day })
 *     return approved ? step("ship", () => ship(order)) : "declined"
 * })
 * reply(await checkout.run(request.headers["idempotency-key"], cart))
 * @template I
 * @template R
 * @param {DurableStore} store
 * @param {((input: I, context: DurableContext) => R) & ([I] extends [DurableJson<I>] ? [Awaited<R>] extends [DurableJson<Awaited<R>>] ? unknown : "The result of a durable run must be a JSON value" : "The input of a durable run must be a JSON value")} fn
 * @param {DurableOptions=} options
 * @returns {Durable<I, Awaited<R>>}
 */
export function durable(store, fn, options = {}) {
	check_options(
		options,
		[
			"idle",
			"lease",
			"migrate",
			"owner",
			"poll",
			"revision"
		],
		"durable"
	)
	const idle_ms = options.idle ?? 1000
	const lease_ms = options.lease ?? 30000
	const poll_ms = options.poll ?? 500
	if (!(typeof idle_ms == "number" && idle_ms >= 0)) throw TypeError(
		"The idle of durable() must be a non-negative number of milliseconds"
	)
	if (!(Number.isFinite(lease_ms) && lease_ms > 0)) throw TypeError(
		"The lease of durable() must be a positive number of milliseconds"
	)
	if (!(Number.isFinite(poll_ms) && poll_ms > 0)) throw TypeError(
		"The poll of durable() must be a positive number of milliseconds"
	)
	/** @type {DurableWorker} */
	const d = {
		fn: /** @type {DurableWorker["fn"]} */(fn)/**/,
		halted: false,
		idle_ms,
		lease_ms,
		live: new Map(),
		migrate: options.migrate,
		owner: options.owner ?? random_key(),
		poll_cap: Math.max(poll_ms, 60000),
		poll_ms,
		pollers: new Map(),
		renew_ms: Math.max(1, Math.floor(lease_ms / 3)),
		reporters: new Set(),
		revision: options.revision,
		stoppers: new Set(),
		store,
		watchers: new Map()
	}
	return /** @type {Durable<I, Awaited<R>>} */({
		cancel: (
			/** @type {string} */ key,
			/** @type {unknown} */ reason
		) => cancel(d, key, reason),
		get: key => load(d.store, key),
		join: key => enter(d, key, void 0, "join"),
		run: (
			/** @type {string} */ key,
			/** @type {unknown} */ input
		) => enter(d, key, input, "run"),
		get running() {
			return d.live.size
		},
		send: (
			/** @type {string} */ key,
			/** @type {string} */ name,
			/** @type {unknown} */ value
		) => send(d, key, name, value),
		serve: serve_options => serve(d, serve_options),
		start: (
			/** @type {string} */ key,
			/** @type {unknown} */ input
		) => enter(d, key, input, "start"),
		stop() {
			d.halted = true
			for (const stop of [ ...d.stoppers ]) stop()
			for (const key of [ ...d.watchers.keys() ]) {
				settle(
					d,
					key,
					watcher => watcher.reject(
						new CancelError("The worker stopped")
					)
				)
			}
			for (const execution of [ ...d.live.values() ]) {
				execution.lost = true
				execution.controller.abort(
					new CancelError("The worker stopped")
				)
				execution.interrupt(LOST)
			}
			d.live.clear()
		}
	})/**/
}
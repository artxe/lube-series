/** @import { DurableExecution, DurableOutcome, DurableWorker } from "../../private.js" */
/** @import { SavedRun } from "../../public.js" */
import { CancelError } from "../errors.js"
import { noop } from "../signal.js"
import { context_of } from "./context.js"
import { error_of, saved_error, store_error } from "./error.js"
import { rewind } from "./journal.js"
import { copy, json_problem } from "./json.js"
import {
	DETACHED,
	LOST,
	SUSPENDED,
	check_halted,
	claim,
	expiring,
	is_due,
	lose
} from "./lease.js"
import { persist, save } from "./persist.js"
import { snapshot, unclaim } from "./state.js"
import { load } from "./store.js"
import { notify, outcome_of } from "./watch.js"
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {unknown=} reason
 * @returns {Promise<void>}
 */
export async function cancel(d, key, reason) {
	const error = new CancelError(reason ?? "Cancelled")
	const running = d.live.get(key)
	if (running && !running.finished) {
		running.finished = true
		running.saved.status = "cancelled"
		running.saved.error = saved_error(error)
		unclaim(running.saved)
		if (await persist(d, running)) {
			running.controller.abort(error)
			running.interrupt({ cancel: error })
			return
		}
		lose(running, error)
	}
	for (;;) {
		const saved = await load(d.store, key)
		if (!saved || saved.status == "cancelled" || saved.status == "done") return
		const next = snapshot(saved)
		delete next.inbox
		next.error = saved_error(error)
		next.status = "cancelled"
		unclaim(next)
		if (await d.store.put(key, next, saved.version)) {
			notify(d, key, { error })
			return
		}
	}
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {unknown} input
 * @param {"join" | "run" | "start"} mode
 * @returns {Promise<unknown>}
 */
export async function enter(d, key, input, mode) {
	if (mode != "join") {
		const problem = json_problem(input)
		if (problem) throw TypeError(
			`The input of run "${key}" is not a JSON value: ${problem}`
		)
	}
	for (;;) {
		check_halted(d)
		const running = d.live.get(key)
		if (running) return mode == "start" ? false : follow(d, key, running.outcome)
		const saved = await load(d.store, key)
		if (d.live.has(key)) continue
		if (!saved) {
			if (mode == "join") throw Error(`There is no run "${key}"`)
			/** @type {SavedRun} */
			const created = {
				input: copy(input),
				journal: [],
				lease: Date.now() + d.lease_ms,
				owner: d.owner,
				revision: d.revision,
				status: "running",
				version: 1
			}
			if (await d.store.put(key, created, void 0)) return launch(d, key, created, mode)
			continue
		}
		if (mode == "start" && saved.status != "pending") return false
		if (saved.status == "done") return saved.result
		if (saved.status == "cancelled" || mode == "join" && saved.status == "failed") throw error_of(saved)
		if (mode != "join" && (saved.status == "failed" || saved.status == "pending") || is_due(d, saved)) {
			const claimed = await claim(d, key, saved, input)
			if (!claimed) continue
			return launch(d, key, claimed, mode)
		}
		return outcome_of(d, key)
	}
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {SavedRun} saved
 * @returns {Promise<DurableOutcome>}
 */
function execute(d, key, saved) {
	/** @type {(reason: typeof LOST | typeof SUSPENDED | { cancel: unknown }) => void} */
	let interrupt = noop
	const interrupted = /** @type {Promise<typeof LOST | typeof SUSPENDED | { cancel: unknown }>} */(new Promise(resolve => interrupt = resolve))/**/
	/** @type {() => void} */
	let leave = noop
	/** @type {Promise<void>} */
	const gone = new Promise(resolve => leave = resolve)
	/** @type {DurableExecution} */
	const execution = {
		absorbed: 0,
		blocked: [],
		controller: new AbortController(),
		cursor: 0,
		dirty: false,
		failures: new Map(),
		fault: void 0,
		finished: false,
		flights: 0,
		gone,
		inbox_timer: void 0,
		interrupt: reason => interrupt(
			/** @type {never} */(reason)/**/
		),
		key,
		lease: saved.lease,
		lost: false,
		outcome: Promise.resolve(DETACHED),
		saved,
		suspending: false,
		taken: 0,
		tried: [],
		unsaved: new Set(),
		waiters: new Map(),
		writing: void 0,
		written: 0
	}
	d.live.set(key, execution)
	const renew = setInterval(
		() => {
			if (!execution.writing) void persist(d, execution)
			else if (expiring(d, execution)) lose(
				execution,
				store_error(execution.fault)
			)
		},
		d.renew_ms
	)
	execution.outcome = (async () => {
		try {
			if (saved.status == "failed") throw error_of(saved)
			const result = await Promise.race(
				[
					Promise.resolve()
						.then(
							() => d.fn(
								/** @type {never} */(copy(saved.input))/**/,
								context_of(d, execution)
							)
						)
						.then(value => ({ value })),
					interrupted
				]
			)
			if (result == LOST || result == SUSPENDED) return DETACHED
			if ("cancel" in result) throw result.cancel
			const problem = json_problem(result.value)
			if (problem) throw TypeError(
				`The result of run "${key}" is not a JSON value: ${problem}`
			)
			execution.finished = true
			saved.result = result.value
			saved.status = "done"
			unclaim(saved)
			if (!await save(d, execution)) return DETACHED
			return { value: result.value }
		} catch (error) {
			if (execution.lost) return DETACHED
			execution.finished = true
			if (saved.status != "cancelled") {
				rewind(execution, error)
				saved.error = saved_error(error)
				saved.status = "failed"
				unclaim(saved)
				if (!await save(d, execution)) return DETACHED
			}
			return { error }
		} finally {
			clearInterval(renew)
			clearInterval(execution.inbox_timer)
			for (const list of execution.waiters.values()) {
				for (const waiter of list) waiter.clear()
			}
			if (d.live.get(key) == execution) d.live.delete(key)
			leave()
		}
	})()
		.then(
			outcome => {
				if (!("detached" in outcome)) notify(d, key, outcome)
				return outcome
			}
		)
	return execution.outcome
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {Promise<DurableOutcome>} outcome
 * @returns {Promise<unknown>}
 */
async function follow(d, key, outcome) {
	const settled = await outcome
	if ("detached" in settled) return outcome_of(d, key)
	if ("error" in settled) throw settled.error
	return settled.value
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {SavedRun} saved
 * @param {"join" | "run" | "start"} mode
 * @returns {Promise<unknown> | true}
 */
function launch(d, key, saved, mode) {
	const outcome = execute(d, key, saved)
	if (mode != "start") return follow(d, key, outcome)
	void outcome.then(
		settled => report(d, key, saved, settled)
	)
	return true
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {SavedRun} saved
 * @param {DurableOutcome} outcome
 * @returns {void}
 */
function report(d, key, saved, outcome) {
	if (!("error" in outcome) || saved.status != "failed") return
	for (const reporter of d.reporters) reporter(outcome.error, key)
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function resume(d, key) {
	if (d.halted || d.live.has(key)) return
	const saved = await load(d.store, key)
	if (!saved || d.live.has(key) || !is_due(d, saved)) return
	if (d.halted) return
	const claimed = await claim(d, key, saved)
	if (claimed && !d.live.has(key) && !d.halted) void execute(d, key, claimed).then(
		outcome => report(d, key, claimed, outcome)
	)
}
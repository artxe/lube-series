/** @import { DurablePoller, DurableWorker, Deferred } from "../../private.js" */
import { CancelError } from "../errors.js"
import { clamp_delay, noop } from "../signal.js"
import { error_of } from "./error.js"
import { is_due } from "./lease.js"
import { resume } from "./run.js"
import { dueAt } from "./state.js"
import { load } from "./store.js"
const finished_statuses = new Set(
	[ "cancelled", "done", "failed" ]
)
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {DurablePoller} poller
 * @returns {Promise<void>}
 */
async function check(d, key, poller) {
	poller.timer = void 0
	if (d.live.has(key)) return
	poller.checking = true
	const saved = await load(d.store, key).catch(noop)
	if (saved && is_due(d, saved) && d.pollers.get(key) == poller) await resume(d, key).catch(noop)
	poller.checking = false
	if (d.pollers.get(key) != poller) return
	if (saved && finished_statuses.has(saved.status)) {
		settle(
			d,
			key,
			watcher => {
				if (saved.status == "done") watcher.resolve(saved.result)
				else watcher.reject(error_of(saved))
			}
		)
		return
	}
	if (d.live.has(key)) return
	const { delay } = poller
	poller.delay = Math.min(delay * 2, d.poll_cap)
	const left = (saved && dueAt(saved) || 0) - Date.now()
	poller.timer = setTimeout(
		() => void check(d, key, poller),
		clamp_delay(
			left > 0 ? Math.min(delay, left) : delay
		)
	)
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {{ error?: unknown, value?: unknown }} outcome
 * @returns {void}
 */
export function notify(d, key, outcome) {
	settle(
		d,
		key,
		watcher => {
			if ("error" in outcome) watcher.reject(outcome.error)
			else watcher.resolve(outcome.value)
		}
	)
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export function outcome_of(d, key) {
	return new Promise(
		(resolve, reject) => {
			if (d.halted) {
				reject(
					new CancelError("The worker stopped")
				)
				return
			}
			let set = d.watchers.get(key)
			if (!set) {
				set = new Set()
				d.watchers.set(key, set)
			}
			set.add({ reject, resolve })
			watch(d, key)
		}
	)
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {(watcher: Deferred) => void} each
 * @returns {void}
 */
export function settle(d, key, each) {
	const poller = d.pollers.get(key)
	if (poller) {
		clearTimeout(poller.timer)
		d.pollers.delete(key)
	}
	const waiting = d.watchers.get(key)
	if (!waiting) return
	d.watchers.delete(key)
	for (const watcher of waiting) each(watcher)
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @returns {void}
 */
function watch(d, key) {
	let poller = d.pollers.get(key)
	if (!poller) {
		poller = {
			checking: false,
			delay: d.poll_ms,
			timer: void 0
		}
		d.pollers.set(key, poller)
	}
	poller.delay = d.poll_ms
	if (poller.checking) return
	clearTimeout(poller.timer)
	void check(d, key, poller)
}
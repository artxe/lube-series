/** @import { DurableExecution, DurableWorker } from "../../private.js" */
/** @import { SavedRun } from "../../public.js" */
import { CancelError } from "../errors.js"
import { copy } from "./json.js"
import { absorb, snapshot, unclaim } from "./state.js"
/** @type {{ detached: true }} */
export const DETACHED = { detached: true }
export const LOST = Symbol("lost")
export const SUSPENDED = Symbol("suspended")
/**
 * @param {DurableWorker} d
 * @returns {void}
 */
export function check_halted(d) {
	if (d.halted) throw new CancelError("The worker stopped")
}
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {SavedRun} saved
 * @param {unknown=} input
 * @returns {Promise<SavedRun | undefined>}
 */
export async function claim(d, key, saved, input) {
	const stale = saved.status != "pending" && saved.revision !== d.revision
	const next = snapshot(
		stale && d.migrate ? await d.migrate(saved, saved.revision) : saved
	)
	next.version = saved.version + 1
	absorb(next)
	unclaim(next)
	delete next.error
	if (stale && !d.migrate) {
		next.error = {
			message: `The run was saved by revision ${saved.revision} of the function, not ${d.revision}`,
			name: "Error"
		}
		next.status = "failed"
	} else {
		if (next.status == "pending") next.input = copy(input)
		next.lease = Date.now() + d.lease_ms
		next.owner = d.owner
		next.revision = d.revision
		next.status = "running"
	}
	return await d.store.put(key, next, saved.version) ? next : void 0
}
/**
 * @param {DurableWorker} d
 * @param {DurableExecution} execution
 * @returns {boolean}
 */
export function expiring(d, execution) {
	return (execution.lease ?? 0) - Date.now() <= d.renew_ms
}
/**
 * @param {DurableWorker} d
 * @param {SavedRun} saved
 * @returns {boolean}
 */
export function is_due(d, saved) {
	if (saved.status == "running") return is_free(d, saved)
	return (saved.status == "sleeping" || saved.status == "waiting") && saved.wake != null && saved.wake <= Date.now()
}
/**
 * @param {DurableWorker} d
 * @param {SavedRun} saved
 * @returns {boolean}
 */
function is_free(d, saved) {
	return !saved.owner || saved.owner == d.owner || (saved.lease ?? 0) <= Date.now()
}
/**
 * @param {DurableExecution} execution
 * @param {unknown} reason
 * @returns {void}
 */
export function lose(execution, reason) {
	if (execution.lost) return
	execution.lost = true
	execution.controller.abort(reason)
	execution.interrupt(LOST)
}
/**
 * @param {DurableExecution} execution
 * @returns {Promise<never> | undefined}
 */
export function refuse(execution) {
	if (!execution.lost && !execution.finished) return
	const { signal } = execution.controller
	return Promise.reject(
		signal.aborted ? signal.reason : new CancelError("The run left this worker")
	)
}
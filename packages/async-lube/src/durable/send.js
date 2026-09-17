/** @import { DurableWorker } from "../../private.js" */
/** @import { SavedRun } from "../../public.js" */
import { noop } from "../signal.js"
import { copy, json_problem } from "./json.js"
import { check_halted, is_due } from "./lease.js"
import { persist } from "./persist.js"
import { resume } from "./run.js"
import {
	absorb,
	push_event,
	snapshot,
	unclaim
} from "./state.js"
import { load } from "./store.js"
/**
 * @param {DurableWorker} d
 * @param {string} key
 * @param {string} name
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function send(d, key, name, value) {
	const problem = value === void 0 ? "undefined" : json_problem(value)
	if (problem) throw TypeError(
		`The value sent to "${name}" of run "${key}" is not a JSON value: ${problem}`
	)
	const kept = copy(value)
	for (;;) {
		check_halted(d)
		const at = Date.now()
		const running = d.live.get(key)
		if (running) {
			if (running.finished || running.lost) {
				await running.gone
				continue
			}
			const event = push_event(running.saved, name, at, kept)
			running.unsaved.add(event)
			const needed = running.taken + 1
			await persist(d, running)
			if (running.written >= needed) return
			const list = running.saved.events?.[name]
			if (running.unsaved.delete(event) && list?.includes(event)) {
				list.splice(list.indexOf(event), 1)
				if (!list.length) delete running.saved.events?.[name]
			}
			if (running.fault !== void 0) throw running.fault
			continue
		}
		const saved = await load(d.store, key)
		if (d.live.has(key)) continue
		if (saved && (saved.status == "cancelled" || saved.status == "done")) throw Error(
			`The run "${key}" is ${saved.status}`
		)
		/** @type {SavedRun} */
		const next = saved
			? snapshot(saved)
			: {
				input: void 0,
				journal: [],
				status: "pending",
				version: 1
			}
		if (next.status == "running" && next.owner && next.owner != d.owner) {
			(next.inbox ??= []).push({ at, name, value: kept })
			if (await d.store.put(key, next, saved?.version)) {
				if (is_due(d, next)) void resume(d, key).catch(noop)
				return
			}
			continue
		}
		absorb(next)
		push_event(next, name, at, kept)
		const revive = next.status != "failed" && next.status != "pending" && next.journal.some(
			entry => entry.type == "wait" && entry.name == name && !entry.done
		)
		if (revive) {
			next.status = "running"
			unclaim(next)
		}
		if (await d.store.put(key, next, saved?.version)) {
			if (revive) void resume(d, key).catch(noop)
			return
		}
	}
}
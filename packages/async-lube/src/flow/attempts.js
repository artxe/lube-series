/** @import { Context, RawNodeOptions, NodeRecord, Outcome, RunContext, RunState, Task } from "../../private.js" */
import { TimeoutError } from "../errors.js"
import {
	clamp_delay,
	link_signal,
	noop,
	race_signal,
	sleep_until
} from "../signal.js"
import { args_of } from "./nodes.js"
import { goto, skip } from "./refs.js"
import { discard } from "./resources.js"
import { run_sub } from "./subflows.js"
/**
 * @param {RunContext} c
 * @param {import("../../public.js").TraceEvent} event
 * @returns {void}
 */
export function emit(c, event) {
	try {
		c.trace?.(event)
	} catch {}
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {AbortSignal | undefined} signal
 * @param {number} attempt
 * @param {number | undefined} index
 * @param {RunState=} run_state
 * @returns {Context}
 */
export function make_context(
	c,
	record,
	signal,
	attempt,
	index,
	run_state
) {
	return {
		attempt,
		goto,
		index: index ?? c.item_index,
		get key() {
			if (!run_state) return ""
			return `${c.run_id}:${record.node.name}${index == null ? "" : "#" + index}:${run_state.serial}`
		},
		name: record.node.name,
		previous: record.previous,
		signal: signal ?? new AbortController().signal,
		skip,
		/** @param {number} ms */
		sleep: ms => {
			if (!run_state) return sleep_until(Date.now() + ms, signal)
			const deadline = run_state.waits[run_state.wait++] ??= Date.now() + ms
			return sleep_until(deadline, signal)
		},
		state: c.state
	}
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {number} token
 * @param {AbortSignal} parent
 * @param {string} unit
 * @param {(signal: AbortSignal, run_state: RunState, first: boolean) => unknown} run_once
 * @returns {Promise<Outcome>}
 */
export async function run_attempts(c, record, token, parent, unit, run_once) {
	const { options } = record.node
	const retry = typeof options.retry == "number" ? { count: options.retry } : options.retry
	const timeout = options.timeout
	const run_state = take_run(record, unit)
	if (run_state.delay != null) {
		try {
			await sleep_until(run_state.delay, parent)
		} catch {
			return { kind: "stale" }
		}
		if (token != record.token) return { kind: "stale" }
		run_state.delay = void 0
	}
	const index = unit ? Number(unit) : c.item_index
	for (let attempt = run_state.attempt; ; attempt++) {
		const first = attempt == run_state.attempt
		run_state.attempt = attempt
		run_state.wait = 0
		const started = Date.now()
		/**
		 * @param {"cancel" | "done" | "fail"} type
		 * @param {unknown=} error
		 * @param {boolean=} again
		 * @returns {void}
		 */
		function end(type, error, again) {
			if (!c.trace) return
			const time = Date.now()
			const base = {
				attempt,
				duration: time - started,
				index,
				node: record.node.name,
				time
			}
			emit(
				c,
				type == "fail" ? { ...base, error, retry: !!again, type } : { ...base, type }
			)
		}
		if (c.trace) emit(
			c,
			{
				attempt,
				index,
				node: record.node.name,
				time: started,
				type: "start"
			}
		)
		const controller = timeout ? new AbortController() : void 0
		const signal = controller ? controller.signal : parent
		const unlink = controller ? link_signal(controller, parent) : noop
		const timer = controller
			? setTimeout(
				() => controller.abort(
					new TimeoutError(Number(timeout))
				),
				clamp_delay(Number(timeout))
			)
			: void 0
		const pending = Promise.resolve()
			.then(
				() => {
					if (signal.aborted) throw signal.reason
					return run_once(signal, run_state, first)
				}
			)
		try {
			const value = await race_signal(pending, signal)
			if (token != record.token) {
				discard(record, value)
				end("cancel")
				return { kind: "stale" }
			}
			record.runs.delete(unit)
			end("done")
			return { kind: "done", value }
		} catch (error) {
			if (signal.aborted && options.release) {
				void pending.then(
					value => discard(record, value),
					noop
				)
			}
			if (token != record.token || parent.aborted) {
				end("cancel")
				return { kind: "stale" }
			}
			/** @type {unknown} */
			const reason = signal.aborted ? signal.reason : error
			if (!retry || attempt > retry.count) {
				end("fail", reason)
				return { kind: "error", value: reason }
			}
			clearTimeout(timer)
			/** @type {number | undefined} */
			let delay
			try {
				if (retry.when && !await retry.when(reason, attempt)) {
					end("fail", reason)
					return { kind: "error", value: reason }
				}
				delay = typeof retry.delay == "function"
					? retry.delay(attempt, reason, 0)
					: retry.delay ?? 0
			} catch (retry_error) {
				end("fail", retry_error)
				return {
					kind: "error",
					value: retry_error
				}
			}
			if (delay == null) {
				end("fail", reason)
				return { kind: "error", value: reason }
			}
			if (token != record.token || parent.aborted) {
				end("cancel")
				return { kind: "stale" }
			}
			end("fail", reason, true)
			run_state.waits = []
			if (delay > 0) {
				run_state.attempt = attempt + 1
				run_state.delay = Date.now() + delay
				record.delaying++
				try {
					await sleep_until(run_state.delay, parent)
				} catch {
					return { kind: "stale" }
				} finally {
					record.delaying--
				}
				if (token != record.token) return { kind: "stale" }
				run_state.delay = void 0
			}
		} finally {
			clearTimeout(timer)
			unlink()
		}
	}
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {number} token
 * @returns {Promise<Outcome>}
 */
export function run_single(c, record, token) {
	const { node } = record
	const resume_subs = record.resume_subs
	record.resume_subs = void 0
	return run_attempts(
		c,
		record,
		token,
		/** @type {AbortController} */(record.controller)/**/.signal,
		"",
		(signal, run_state, first) => {
			const values = args_of(c, record)
			const gate = record.gate
			if (gate) {
				if (gate !== true) {
					record.gate = true
					throw gate.error
				}
				if (!/** @type {NonNullable<RawNodeOptions["when"]>} */(node.options.when)/**/(...values, { state: c.state })) {
					record.gate = void 0
					return skip()
				}
				record.gate = void 0
			}
			if (!node.sub) return /** @type {Task} */(node.run)/**/(
				...values,
				make_context(
					c,
					record,
					signal,
					run_state.attempt,
					void 0,
					run_state
				)
			)
			const sub_state = values.length > 1
				? values
				: values.length
					? values[0]
					: c.state
			return run_sub(
				c,
				record,
				"",
				sub_state,
				signal,
				first ? resume_subs?.[""] : record.sub_runs.get("")?.snapshot(),
				run_state.serial
			)
		}
	)
}
/**
 * @param {NodeRecord} record
 * @param {string} unit
 * @returns {RunState}
 */
function take_run(record, unit) {
	const current = record.runs.get(unit)
	if (current) return current
	const saved = record.resume_runs?.[unit]
	if (saved && record.resume_runs) delete record.resume_runs[unit]
	/** @type {RunState} */
	const run_state = {
		attempt: saved?.attempt ?? 1,
		delay: saved?.delay,
		serial: saved?.serial ?? ++record.serial,
		wait: 0,
		waits: saved ? [ ...saved.waits ] : []
	}
	record.runs.set(unit, run_state)
	return run_state
}
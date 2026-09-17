/** @import { FlowRef, ItemResult, NodeRecord, Outcome, RunContext, Task, TaskRef } from "../../private.js" */
import { CancelError } from "../errors.js"
import { link_signal, noop, race_signal } from "../signal.js"
import { make_context, run_attempts } from "./attempts.js"
import { args_of } from "./nodes.js"
import { DEFINITION, EACH, is_sentinel } from "./refs.js"
import { failed_sub_keys, run_sub } from "./subflows.js"
/**
 * @param {AsyncIterator<unknown>} iterator
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<unknown[]>}
 */
async function collect_items(iterator, signal) {
	/** @type {unknown[]} */
	const items = []
	try {
		for (;;) {
			const step = iterator.next()
			const { done, value } = signal ? await race_signal(step, signal) : await step
			if (done) return items
			items.push(value)
		}
	} finally {
		if (signal?.aborted) await iterator.return?.()
			.catch(noop)
	}
}
/**
 * @param {FlowRef | TaskRef} target
 * @returns {TaskRef}
 */
export function each(target) {
	const is_flow = !!target?.[DEFINITION]
	if (!is_flow && typeof target != "function") throw TypeError(
		"flow.each() needs a function or a flow"
	)
	/** @type {TaskRef} */
	const run_all = is_flow
		? async (/** @type {unknown} */ items) => Promise.all(
			(await to_items(items, void 0)).map(
				item => /** @type {FlowRef} */(target)/**/.run(item)
			)
		)
		: async (
			/** @type {unknown} */ items,
			/** @type {unknown[]} */ ...args
		) => Promise.all(
			(await to_items(items, void 0)).map(
				item => /** @type {TaskRef} */(target)/**/(item, ...args)
			)
		)
	Object.defineProperty(
		run_all,
		"name",
		{
			value: is_flow ? "flow" : target.name
		}
	)
	run_all[EACH] = target
	return run_all
}
/**
 * @param {RunContext} c
 * @param {NodeRecord} record
 * @param {number} token
 * @returns {Promise<Outcome>}
 */
export async function run_each(c, record, token) {
	const { node } = record
	const { name, options } = node
	const [ source, ...rest ] = node.deps.length ? args_of(c, record) : [ c.state ]
	const parent = /** @type {AbortController} */(record.controller)/**/.signal
	/** @type {unknown[]} */
	let items
	try {
		const is_one_shot = source != null && typeof /** @type {Partial<Iterator<unknown>>} */(source)/**/.next == "function"
		const collected = is_one_shot && record.item_source === source && record.item_list
			? record.item_list
			: to_items(source, parent)
		items = Array.isArray(collected) ? collected : await collected
	} catch (error) {
		if (token != record.token || parent.aborted) return { kind: "stale" }
		return { kind: "error", value: error }
	}
	if (token != record.token) return { kind: "stale" }
	record.item_list = items
	record.item_source = source
	const controller = new AbortController()
	const unlink = link_signal(controller, parent)
	/** @type {ItemResult[]} */
	const done = (record.resume_items ?? []).slice(0, items.length)
	done.length = items.length
	const resume_subs = record.resume_subs
	record.items = done
	record.resume_items = void 0
	record.resume_subs = void 0
	/** @type {{ error: unknown, index: number | undefined } | undefined} */
	let failure
	let next = 0
	/**
	 * @param {unknown} error
	 * @param {number | undefined} index
	 * @returns {void}
	 */
	function stop(error, index) {
		failure ??= { error, index }
		controller.abort(
			new CancelError("Another item failed")
		)
	}
	async function worker() {
		while (!failure && next < items.length) {
			const index = next++
			if (done[index]) continue
			const item = items[index]
			const key = String(index)
			const outcome = await run_attempts(
				c,
				record,
				token,
				controller.signal,
				key,
				(signal, run_state, first) => node.sub
					? run_sub(
						c,
						record,
						key,
						item,
						signal,
						first ? resume_subs?.[key] : record.sub_runs.get(key)?.snapshot(),
						run_state.serial
					)
					: /** @type {Task} */(node.run)/**/(
						item,
						...rest,
						make_context(
							c,
							record,
							signal,
							run_state.attempt,
							index,
							run_state
						)
					)
			)
			if (token != record.token || outcome.kind == "stale") return
			if (outcome.kind == "done") {
				if (is_sentinel(outcome.value)) {
					stop(
						TypeError(
							`Flow node "${name}" cannot return goto() or skip() for an item`
						),
						index
					)
					return
				}
				done[index] = { value: outcome.value }
				continue
			}
			if (options.catch) {
				try {
					const value = await options.catch(
						outcome.value,
						item,
						...rest,
						make_context(
							c,
							record,
							controller.signal,
							0,
							index,
							record.runs.get(key)
						)
					)
					if (token != record.token) return
					if (is_sentinel(value)) throw TypeError(
						`The catch of flow node "${name}" cannot return goto() or skip() for an item`
					)
					c.errors[name + "." + key] = outcome.value
					done[index] = { value }
				} catch (catch_error) {
					if (token == record.token) stop(catch_error, index)
					return
				}
			} else if (options.optional) {
				c.errors[name + "." + key] = outcome.value
				done[index] = { failed: true, value: void 0 }
			} else {
				stop(outcome.value, index)
				return
			}
		}
	}
	const workers = Math.min(
		options.concurrency ?? Infinity,
		items.length
	)
	try {
		await Promise.all(
			Array.from({ length: workers }, worker)
		)
	} finally {
		unlink()
	}
	if (token != record.token) return { kind: "stale" }
	if (failure) return {
		index: failure.index,
		items: true,
		kind: "error",
		value: failure.error
	}
	const values = items.map(
		(_, index) => done[index]?.value
	)
	if (!done.some(item => item?.failed) && !failed_sub_keys(record).length) record.items = void 0
	return { kind: "done", value: values }
}
/**
 * @param {unknown} source
 * @param {AbortSignal | undefined} signal
 * @returns {unknown[] | Promise<unknown[]>}
 */
export function to_items(source, signal) {
	if (source == null) return []
	if (typeof /** @type {Partial<Iterable<unknown>>} */(source)/**/[Symbol.iterator] == "function") return Array.from(
		/** @type {Iterable<unknown>} */(source)/**/
	)
	if (typeof /** @type {Partial<AsyncIterable<unknown>>} */(source)/**/[Symbol.asyncIterator] != "function") throw TypeError(
		"flow.each() needs an iterable or an async iterable as the first dependency"
	)
	return collect_items(
		/** @type {AsyncIterable<unknown>} */(source)/**/[Symbol.asyncIterator](),
		signal
	)
}
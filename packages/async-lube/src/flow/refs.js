/** @import { GotoResult, InputRef, RawNodeOptions, NodeRef, RefProbe } from "../../private.js" */
/** @type {typeof import("../../private.js").ARRIVE} */
export const ARRIVE = /** @type {typeof import("../../private.js").ARRIVE} */(/** @type {unknown} */(Symbol("flow arrive")))/**/
/** @type {typeof import("../../private.js").DEFINITION} */
export const DEFINITION = /** @type {typeof import("../../private.js").DEFINITION} */(/** @type {unknown} */(Symbol("flow definition")))/**/
/** @type {typeof import("../../private.js").EACH} */
export const EACH = /** @type {typeof import("../../private.js").EACH} */(/** @type {unknown} */(Symbol("flow each")))/**/
/** @type {typeof import("../../private.js").FAILURES} */
export const FAILURES = /** @type {typeof import("../../private.js").FAILURES} */(/** @type {unknown} */(Symbol("flow failures")))/**/
/** @type {typeof import("../../private.js").GOTO} */
export const GOTO = /** @type {typeof import("../../private.js").GOTO} */(/** @type {unknown} */(Symbol("goto")))/**/
/** @type {typeof import("../../private.js").INDEX} */
export const INDEX = /** @type {typeof import("../../private.js").INDEX} */(/** @type {unknown} */(Symbol("flow index")))/**/
/** @type {typeof import("../../private.js").INPUT} */
export const INPUT = /** @type {typeof import("../../private.js").INPUT} */(/** @type {unknown} */(Symbol("flow input")))/**/
/** @type {typeof import("../../private.js").ON_CHANGE} */
export const ON_CHANGE = /** @type {typeof import("../../private.js").ON_CHANGE} */(/** @type {unknown} */(Symbol("flow change")))/**/
/** @type {typeof import("../../private.js").RUN_ID} */
export const RUN_ID = /** @type {typeof import("../../private.js").RUN_ID} */(/** @type {unknown} */(Symbol("flow run id")))/**/
/** @type {typeof import("../../private.js").SKIP} */
export const SKIP = /** @type {typeof import("../../private.js").SKIP} */(/** @type {unknown} */(Symbol("skip")))/**/
/** @type {typeof import("../../private.js").STOP} */
export const STOP = /** @type {typeof import("../../private.js").STOP} */(/** @type {unknown} */(Symbol("flow stop")))/**/
export const active_statuses = new Set(
	[ "pending", "running", "waiting" ]
)
export const has_own = Object.prototype.hasOwnProperty
export const settled_statuses = new Set(
	[ "done", "failed", "skipped" ]
)
/**
 * @param {unknown} ref
 * @returns {string}
 */
export function describe(ref) {
	if (typeof ref == "string") return `"${ref}"`
	if (typeof ref == "function") return `function "${ref.name || "anonymous"}"`
	if (/** @type {RefProbe} */(ref)/**/?.[INPUT]) return `input "${/** @type {InputRef} */(ref)/**/.name}"`
	if (is_stream(ref)) return "a stream"
	return /** @type {RefProbe} */(ref)/**/?.[DEFINITION] ? "a flow" : String(ref)
}
/**
 * @param {unknown[]} targets
 * @returns {GotoResult}
 */
export function goto(...targets) {
	return { [GOTO]: targets.flat() }
}
/**
 * @param {string=} name
 * @returns {InputRef}
 */
export function input(name) {
	return {
		[INPUT]: name == null ? "unnamed" : "named",
		name: name ?? "input"
	}
}
/**
 * @param {number} value
 * @returns {boolean}
 */
export function is_count(value) {
	return value === Infinity || Number.isInteger(value) && value >= 1
}
/**
 * @param {unknown} value
 * @returns {value is NodeRef}
 */
export function is_ref(value) {
	return typeof value == "function" || !!/** @type {RefProbe} */(value)/**/?.[DEFINITION] || !!/** @type {RefProbe} */(value)/**/?.[INPUT] || is_stream(value)
}
/**
 * @param {RawNodeOptions["retry"]} value
 * @returns {boolean}
 */
export function is_retry(value) {
	if (typeof value == "number") return Number.isInteger(value) && value >= 0
	if (!value || typeof value != "object" || !Number.isInteger(value.count) || value.count < 0) return false
	if (value.when != null && typeof value.when != "function") return false
	return value.delay == null || typeof value.delay == "function" || typeof value.delay == "number" && value.delay >= 0
}
/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function is_sentinel(value) {
	return value === SKIP || !!/** @type {RefProbe} */(value)/**/?.[GOTO]
}
/**
 * @param {unknown} value
 * @returns {value is AsyncIterable<unknown>}
 */
export function is_stream(value) {
	return value != null
		&& typeof value == "object"
		&& !/** @type {RefProbe} */(value)/**/?.[DEFINITION]
		&& !/** @type {RefProbe} */(value)/**/?.[INPUT]
		&& typeof /** @type {Partial<AsyncIterable<unknown>>} */(value)/**/[Symbol.asyncIterator] == "function"
}
/**
 * @returns {typeof SKIP}
 */
export function skip() {
	return SKIP
}
/**
 * @param {RawNodeOptions["fallback"]} value
 * @returns {NodeRef[]}
 */
export function to_array(value) {
	return value == null
		? []
		: Array.isArray(value)
			? value
			: [ value ]
}
/**
 * @param {NodeRef} dependency
 * @param {"keep" | "queue" | "restart"} policy
 * @returns {NodeRef}
 */
export function to_arriving(dependency, policy) {
	if (!is_ref(to_ref(dependency))) throw TypeError(
		`flow.${policy}() needs a function, an input, a flow or a stream`
	)
	return /** @type {NodeRef} */(/** @type {unknown} */({
		[ARRIVE]: to_ref(dependency),
		policy
	}))/**/
}
/**
 * @param {unknown} dep
 * @returns {NodeRef}
 */
export function to_ref(dep) {
	return /** @type {NodeRef} */(/** @type {RefProbe} */(dep)/**/?.[ARRIVE] ?? dep)/**/
}
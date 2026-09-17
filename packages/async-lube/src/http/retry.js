import {
	HttpError,
	NetworkError,
	TimeoutError
} from "../errors.js"
import { check_options } from "../options.js"
const idempotent_methods = new Set(
	[
		"DELETE",
		"GET",
		"HEAD",
		"OPTIONS",
		"PUT",
		"TRACE"
	]
)
const max_delay = 30000
const max_retry_after = 60000
const retry_statuses = new Set(
	[ 408, 425, 429, 500, 502, 503, 504 ]
)
/**
 * @param {unknown} delay
 * @param {string} name
 * @returns {void}
 */
function check_delay(delay, name) {
	if (delay == null || typeof delay == "function" || typeof delay == "number" && delay >= 0) return
	throw TypeError(
		`${name} must be non-negative milliseconds or a function`
	)
}
/**
 * @param {unknown} reconnect
 * @param {string} kind
 * @returns {void}
 */
export function check_reconnect(reconnect, kind) {
	if (reconnect == null || typeof reconnect == "boolean") return
	if (typeof reconnect != "object") throw TypeError(
		`The reconnect of ${kind}() must be a boolean or { count, delay }`
	)
	check_options(
		reconnect,
		[ "count", "delay" ],
		kind,
		"reconnect."
	)
	const { count, delay } = /** @type {import("../../public.js").ReconnectOptions} */(reconnect)/**/
	if (count != null && !is_count(count)) throw TypeError(
		`The reconnect count of ${kind}() must be a non-negative integer or Infinity`
	)
	check_delay(
		delay,
		`The reconnect delay of ${kind}()`
	)
}
/**
 * @param {unknown} retry
 * @param {string} kind
 * @returns {void}
 */
export function check_retry(retry, kind) {
	if (retry == null) return
	if (typeof retry == "number") {
		if (!is_count(retry)) throw TypeError(
			`The retry count of ${kind}() must be a non-negative integer or Infinity`
		)
		return
	}
	if (typeof retry != "object") throw TypeError(
		`The retry of ${kind}() must be a non-negative integer or { count, delay, when }`
	)
	check_options(
		retry,
		[ "count", "delay", "when" ],
		kind,
		"retry."
	)
	const { count, delay, when } = /** @type {import("../../public.js").RetryOptions} */(retry)/**/
	if (!is_count(count)) throw TypeError(
		`The retry count of ${kind}() must be a non-negative integer or Infinity`
	)
	check_delay(
		delay,
		`The retry delay of ${kind}()`
	)
	if (when != null && typeof when != "function") throw TypeError(
		`The retry when of ${kind}() must be a function`
	)
}
/**
 * @param {number} attempt
 * @returns {number}
 */
function get_backoff(attempt) {
	const base = Math.min(
		500 * 2 ** (attempt - 1),
		max_delay
	)
	return base / 2 + Math.random() * base / 2
}
/**
 * @param {unknown} error
 * @param {number} failures
 * @returns {number}
 */
export function get_reconnect_delay(error, failures) {
	return Math.max(
		get_backoff(failures),
		read_retry_after(error) ?? 0
	)
}
/**
 * @param {import("../../public.js").ReconnectOptions | boolean | undefined} reconnect
 * @param {number} failures
 * @param {unknown} error
 * @returns {number | undefined}
 */
export function get_reconnect_wait(reconnect, failures, error) {
	const fallback = get_reconnect_delay(error, failures)
	const delay = typeof reconnect == "object" ? reconnect.delay : void 0
	return typeof delay == "function"
		? delay(failures, error, fallback)
		: delay ?? fallback
}
/**
 * @param {unknown} error
 * @param {number} attempt
 * @returns {number | undefined}
 */
export function get_retry_delay(error, attempt) {
	const ms = read_retry_after(error)
	if (ms == null) return get_backoff(attempt)
	return ms <= max_retry_after ? ms : void 0
}
/**
 * @param {import("../../public.js").RetryOptions} retry
 * @param {number} attempt
 * @param {unknown} error
 * @returns {number | undefined}
 */
export function get_retry_wait(retry, attempt, error) {
	if (typeof retry.delay == "number") return retry.delay
	const fallback = get_retry_delay(error, attempt)
	return retry.delay ? retry.delay(attempt, error, fallback) : fallback
}
/**
 * @param {unknown} value
 * @returns {boolean}
 */
function is_count(value) {
	return value === Infinity || Number.isInteger(value) && /** @type {number} */(value)/**/ >= 0
}
/**
 * @param {string} method
 * @returns {boolean}
 */
export function is_idempotent(method) {
	return idempotent_methods.has(method)
}
/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function is_retryable(error) {
	return error instanceof NetworkError
	|| error instanceof TimeoutError
	|| error instanceof HttpError && retry_statuses.has(error.status)
}
/**
 * @param {unknown} error
 * @returns {number | undefined}
 */
export function read_retry_after(error) {
	const retry_after = error instanceof HttpError ? error.headers.get("Retry-After") : null
	if (!retry_after) return
	const ms = /^\s*\d+\s*$/.test(retry_after)
		? Number(retry_after) * 1000
		: Date.parse(retry_after) - Date.now()
	return ms >= 0 ? ms : void 0
}
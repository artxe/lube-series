/** @import { JournalEntry, SavedError, SavedRun } from "../../public.js" */
import {
	CancelError,
	FlowError,
	HttpError,
	NetworkError,
	SocketError,
	TimeoutError
} from "../errors.js"
import { copy, json_problem } from "./json.js"
/** @type {Map<string, { prototype: Error }>} */
const error_types = new Map(
	/** @type {[string, { prototype: Error }][]} */([
		[ "CancelError", CancelError ],
		[ "Error", Error ],
		[ "EvalError", EvalError ],
		[ "FlowError", FlowError ],
		[ "HttpError", HttpError ],
		[ "NetworkError", NetworkError ],
		[ "RangeError", RangeError ],
		[ "ReferenceError", ReferenceError ],
		[ "SocketError", SocketError ],
		[ "SyntaxError", SyntaxError ],
		[ "TimeoutError", TimeoutError ],
		[ "TypeError", TypeError ],
		[ "URIError", URIError ]
	])/**/
)
/**
 * @param {SavedError} info
 * @returns {Error}
 */
export function error_from(info) {
	const error = /** @type {Error & Record<string, unknown>} */(Error(info.message))/**/
	const type = error_types.get(info.name)
	if (type) Object.setPrototypeOf(error, type.prototype)
	if (error.name != info.name) error.name = info.name
	for (const key of Object.keys(info)) {
		if (key != "cause" && key != "message" && key != "name") error[key] = copy(info[key])
	}
	if (info.cause) error.cause = error_from(info.cause)
	else if (info.name == "CancelError") error.cause = info.message
	if (info.name != "HttpError") return error
	const { headers: pairs, status, statusText } = info
	const headers = new Headers(
		/** @type {[string, string][]} */(pairs ?? [])/**/
	)
	/** @type {Response} */
	let response
	try {
		response = new Response(
			null,
			{
				headers,
				status: /** @type {number} */(status)/**/,
				statusText: /** @type {string} */(statusText)/**/
			}
		)
	} catch {
		response = new Response(null, { headers })
	}
	return Object.assign(error, { headers, response })
}
/**
 * @param {SavedRun} saved
 * @returns {unknown}
 */
export function error_of(saved) {
	if (saved.status == "cancelled" && !saved.error) return new CancelError("Cancelled")
	return error_from(
		saved.error ?? {
			message: "The run failed",
			name: "Error"
		}
	)
}
/**
 * @param {unknown} error
 * @param {unknown[]=} seen
 * @returns {SavedError}
 */
export function saved_error(error, seen = []) {
	if (!(error instanceof Error)) return {
		message: String(error),
		name: "Error"
	}
	seen.push(error)
	/** @type {SavedError} */
	const saved = {
		message: error.message,
		name: error.name
	}
	const fields = /** @type {Error & Record<string, unknown>} */(error)/**/
	for (const key of Object.keys(error)) {
		const value = fields[key]
		if (key == "cause" || key == "message" || key == "name" || key == "stack" || value === void 0) continue
		if (value instanceof Headers) saved[key] = [ ...value ]
		else if (!json_problem(value)) saved[key] = copy(value)
	}
	const { cause } = error
	if (cause instanceof Error && !seen.includes(cause)) saved.cause = saved_error(cause, seen)
	return saved
}
/**
 * @param {unknown} error
 * @returns {CancelError}
 */
export function store_error(error) {
	const reason = new CancelError(
		"The store failed, so the lease of the run could not be renewed"
	)
	reason.cause = error
	return reason
}
/**
 * @param {JournalEntry} entry
 * @param {{ timeout?: number | undefined, until?: number | undefined }} wait_options
 * @returns {TimeoutError}
 */
export function timeout_error(entry, wait_options) {
	const { timeout, until } = wait_options
	const error = new TimeoutError(timeout ?? 0)
	if (until != null && entry.until == until) error.message = `Timed out at ${new Date(until).toISOString()}`
	return error
}
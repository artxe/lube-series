/**
 * @param {unknown} data
 * @returns {string | undefined}
 */
function get_message(data) {
	if (!data || typeof data != "object") return
	for (const key of [
		"message",
		"error",
		"detail",
		"title"
	]) {
		const value = /** @type {Record<string, unknown>} */(data)/**/[key]
		if (typeof value == "string" && value) return value
		if (value && typeof value == "object" && typeof /** @type {{ message?: unknown }} */(value)/**/.message == "string") return /** @type {{ message: string }} */(value)/**/.message
	}
	return undefined
}
/**
 * The request or the flow was cancelled, superseded by a newer request or left by all its callers.
 */
export class CancelError extends Error {
	/**
	 * @param {unknown} reason
	 * @param {import("../public.js").RequestSummary=} request
	 */
	constructor(reason, request) {
		super(
			reason instanceof Error
				? reason.message
				: typeof reason == "string"
					? reason
					: "Cancelled"
		)
		/** @type {unknown} */
		this.cause = reason
		this.name = "CancelError"
		this.request = request
	}
}
/**
 * A flow node failed and the flow stopped.
 */
export class FlowError extends Error {
	/**
	 * @param {string} node
	 * @param {unknown} cause
	 */
	constructor(node, cause) {
		super(
			`Flow node "${node}" failed: ${cause instanceof Error ? cause.message : String(cause)}`
		)
		/** @type {unknown} */
		this.cause = cause
		this.name = "FlowError"
		this.node = node
	}
}
/**
 * The server responded with a status that is not accepted, 2xx by default.
 * Its `data` is the parsed body, unknown until it is checked.
 */
export class HttpError extends Error {
	/**
	 * @param {Response} response
	 * @param {unknown} data
	 * @param {import("../public.js").RequestSummary} request
	 */
	constructor(response, data, request) {
		super(
			get_message(data) ?? `Request failed with status ${response.status}`
		)
		/** @type {unknown} */
		this.data = data
		this.headers = response.headers
		this.name = "HttpError"
		this.request = request
		this.response = response
		this.status = response.status
		this.statusText = response.statusText
	}
}
/**
 * The request did not reach the server, e.g. offline, DNS failure or CORS.
 */
export class NetworkError extends Error {
	/**
	 * @param {unknown} cause
	 * @param {import("../public.js").RequestSummary} request
	 */
	constructor(cause, request) {
		super(
			cause instanceof Error ? cause.message : "Network request failed"
		)
		/** @type {unknown} */
		this.cause = cause
		this.name = "NetworkError"
		this.request = request
	}
}
/**
 * The WebSocket was closed with a code that is not reconnected, e.g. 1008 or an application code from 4000.
 */
export class SocketError extends Error {
	/**
	 * @param {number} code
	 * @param {string} reason
	 * @param {import("../public.js").RequestSummary} request
	 */
	constructor(code, reason, request) {
		super(
			reason || `The WebSocket was closed with code ${code}`
		)
		this.code = code
		this.name = "SocketError"
		this.reason = reason
		this.request = request
	}
}
/**
 * The request or the flow node took longer than its timeout.
 */
export class TimeoutError extends Error {
	/**
	 * @param {number} timeout
	 * @param {import("../public.js").RequestSummary=} request
	 */
	constructor(timeout, request) {
		super(`Timed out after ${timeout}ms`)
		this.name = "TimeoutError"
		this.request = request
		this.timeout = timeout
	}
}
/**
 * Returns whether the error only means that the work was cancelled, so it should not be shown to the user.
 * @param {unknown} error
 * @returns {error is CancelError}
 */
export function is_cancel(error) {
	return error instanceof CancelError
}
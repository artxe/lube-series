/** @import { StreamRecord } from "../../private.js" */
import { noop } from "../signal.js"
const byte_string_regex = /^[\0-\xff]*$/
/** @type {RegExp | undefined} */
let cp949_regex
const encoded_file_name_regex = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/i
const extended_value_regex = /^([^']*)'[^']*'(.*)$/
const high_byte_regex = /[\x80-\xff]/
const json_type_regex = /[/+]json(?:$|[;\s])/i
const line_break_regex = /\r\n|\r|\n/
const null_body_statuses = new Set([ 101, 103, 204, 205, 304 ])
const percent_regex = /%[\da-f]{2}/i
const percent_regex_global = /%[\da-f]{2}/gi
const plain_file_name_regex = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i
const quote_regex = /^"|"$/g
const text_type_regex = /^text\/|[/+]xml(?:$|[;\s])|javascript|jsonl|ndjson|x-www-form-urlencoded/i
/**
 * @param {(progress: import("../../public.js").Progress) => void} on_progress
 * @param {import("../../public.js").Progress} progress
 * @returns {void}
 */
export function call_progress(on_progress, progress) {
	try {
		on_progress(progress)
	} catch {}
}
/**
 * @param {string} bytes
 * @param {string} charset
 * @returns {string}
 */
function decode_bytes(bytes, charset) {
	return new TextDecoder(charset, { fatal: true }).decode(
		Uint8Array.from(
			bytes,
			char => char.charCodeAt(0)
		)
	)
}
/**
 * @param {string} bytes
 * @returns {string | undefined}
 */
function decode_korean(bytes) {
	if (!get_cp949_regex().test(bytes)) return
	let korean
	try {
		korean = decode_bytes(bytes, "euc-kr")
	} catch {
		return
	}
	for (let i = 0; i < korean.length; i++) {
		const code = korean.charCodeAt(i)
		if (code >= 0x80 && code < 0xa0) return
	}
	return reads_as_latin1(bytes) ? void 0 : korean
}
/**
 * @param {string} name
 * @returns {string}
 */
function decode_plain_name(name) {
	let decoded = name
	if (high_byte_regex.test(decoded) && byte_string_regex.test(decoded)) {
		try {
			decoded = decode_bytes(decoded, "utf-8")
		} catch {
			decoded = decode_korean(decoded) ?? decoded
		}
	}
	if (percent_regex.test(decoded)) {
		try {
			decoded = decodeURIComponent(decoded)
		} catch {}
	}
	return decoded
}
/**
 * @returns {RegExp}
 */
function get_cp949_regex() {
	if (cp949_regex) return cp949_regex
	let uhc = false
	try {
		uhc = decode_bytes("\x8c\x63", "euc-kr") == "똠"
	} catch {}
	cp949_regex = uhc
		? /^(?:[\0-\x7f]|[\x81-\xfe][\x41-\x5a\x61-\x7a\x81-\xfe])*$/
		: /^(?:[\0-\x7f]|[\xa1-\xfe][\xa1-\xfe])*$/
	return cp949_regex
}
/**
 * @param {Response} response
 * @param {string} url
 * @returns {string}
 */
export function get_file_name(response, url) {
	const disposition = response.headers.get("Content-Disposition") ?? ""
	const encoded = encoded_file_name_regex.exec(disposition)?.[1]
	if (encoded) {
		const value = encoded.trim().replace(quote_regex, "")
		const extended = extended_value_regex.exec(value)
		const bytes = (extended?.[2] ?? value).replace(
			percent_regex_global,
			hex => String.fromCharCode(parseInt(hex.slice(1), 16))
		)
		try {
			const decoded = byte_string_regex.test(bytes)
				? decode_bytes(bytes, extended?.[1] || "utf-8")
				: ""
			if (decoded) return decoded
		} catch {}
	}
	const plain = plain_file_name_regex.exec(disposition)
	const name = plain?.[1]?.replace(/\\(.)/g, "$1") ?? plain?.[2]?.trim()
	if (name) return decode_plain_name(name)
	const segment = new URL(url, "http://localhost").pathname.split("/").pop()
	try {
		return segment ? decodeURIComponent(segment) : "download"
	} catch {
		return segment || "download"
	}
}
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_ascii_letter(code) {
	const lower = code | 0x20
	return lower >= 0x61 && lower <= 0x7a
}
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_ascii_upper(code) {
	return code >= 0x41 && code <= 0x5a
}
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_latin1_letter(code) {
	return code >= 0xc0 && code != 0xd7 && code != 0xf7
}
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_latin1_lower(code) {
	return code >= 0xdf && code != 0xf7
}
/**
 * @param {string} text
 * @returns {unknown}
 */
function parse_json(text) {
	return text ? JSON.parse(text) : void 0
}
/**
 * @param {Response} response
 * @param {import("../../public.js").ResponseType | "events" | undefined} as
 * @param {string} method
 * @param {string} url
 * @returns {Promise<unknown>}
 */
export async function read_body(response, as, method, url) {
	switch (as) {
	case "arrayBuffer":
		return response.arrayBuffer()
	case "blob":
		return response.blob()
	case "events":
		return read_events(response)
	case "file":
		return {
			blob: await response.blob(),
			name: get_file_name(response, url)
		}
	case "formData":
		return response.formData()
	case "json":
		return parse_json(await response.text())
	case "ndjson":
		return read_lines(response)
	case "stream":
		return response.body
	case "text":
		return response.text()
	}
	if (method == "HEAD" || null_body_statuses.has(response.status)) return
	const type = response.headers.get("Content-Type") ?? ""
	if (json_type_regex.test(type)) return parse_json(await response.text())
	if (type && !text_type_regex.test(type)) return response.blob()
	const text = await response.text()
	return type || text ? text : void 0
}
/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
export async function read_error_data(response) {
	if (null_body_statuses.has(response.status)) return
	const type = response.headers.get("Content-Type") ?? ""
	try {
		if (type && !json_type_regex.test(type) && !text_type_regex.test(type)) return await response.blob()
		const text = await response.text()
		if (!json_type_regex.test(type)) return text || void 0
		try {
			return parse_json(text)
		} catch {
			return text
		}
	} catch {
		return void 0
	}
}
/**
 * @param {Response} response
 * @returns {AsyncGenerator<StreamRecord, void, undefined>}
 */
async function* read_events(response) {
	if (!response.body) return
	const reader = response.body.pipeThrough(new TextDecoderStream())
		.getReader()
	let buffer = ""
	/** @type {string[]} */
	let data = []
	let dispatched_id = ""
	let event = ""
	let id = ""
	let pending_cr = false
	/** @type {number | undefined} */
	let retry
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) return
			const text = pending_cr && value.startsWith("\n") ? value.slice(1) : value
			pending_cr = false
			if (!text) continue
			buffer += text
			pending_cr = buffer.endsWith("\r")
			const lines = buffer.split(line_break_regex)
			buffer = /** @type {string} */(lines.pop())/**/
			for (const line of lines) {
				if (!line) {
					if (data.length) {
						dispatched_id = id
						yield {
							event: {
								data: data.join("\n"),
								event: event || "message",
								id,
								retry
							},
							type: "event"
						}
					} else if (id != dispatched_id) {
						dispatched_id = id
						yield { id, type: "id" }
					}
					data = []
					event = ""
					retry = void 0
					continue
				}
				if (line.startsWith(":")) continue
				const colon = line.indexOf(":")
				const field = colon < 0 ? line : line.slice(0, colon)
				const field_value = colon < 0
					? ""
					: line.slice(
						line[colon + 1] == " " ? colon + 2 : colon + 1
					)
				if (field == "data") data.push(field_value)
				else if (field == "event") event = field_value
				else if (field == "id" && !field_value.includes("\0")) id = field_value
				else if (field == "retry" && /^\d+$/.test(field_value)) {
					retry = +field_value
					yield { retry, type: "retry" }
				}
			}
		}
	} finally {
		reader.cancel()
			.catch(noop)
	}
}
/**
 * @param {Response} response
 * @returns {AsyncGenerator<unknown, void, undefined>}
 */
async function* read_lines(response) {
	if (!response.body) return
	const reader = response.body.pipeThrough(new TextDecoderStream())
		.getReader()
	let buffer = ""
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += value
			const lines = buffer.split("\n")
			buffer = /** @type {string} */(lines.pop())/**/
			for (const line of lines) {
				if (line.trim()) yield JSON.parse(line)
			}
		}
		if (buffer.trim()) yield JSON.parse(buffer)
	} finally {
		reader.cancel()
			.catch(noop)
	}
}
/**
 * @param {string} bytes
 * @returns {boolean}
 */
function reads_as_latin1(bytes) {
	let in_word = false
	for (let i = 0; i < bytes.length; i++) {
		const first = bytes.charCodeAt(i)
		if (first < 0x80) continue
		if (first < 0xa0) return false
		const second = bytes.charCodeAt(i + 1)
		if (second < 0x80 || i + 1 == bytes.length) {
			in_word = true
			continue
		}
		if (bytes.charCodeAt(i + 2) >= 0x80 || !is_latin1_letter(first) || !is_latin1_letter(second)) return false
		if (is_latin1_lower(first)) {
			if (!is_latin1_lower(second)) return false
			if (is_ascii_letter(bytes.charCodeAt(i - 1)) || is_ascii_letter(bytes.charCodeAt(i + 2))) in_word = true
		} else {
			if (is_latin1_lower(second) && second != 0xdf) return false
			if (is_ascii_upper(bytes.charCodeAt(i - 1)) && is_ascii_upper(bytes.charCodeAt(i + 2))) in_word = true
		}
		i++
	}
	return in_word
}
/**
 * @param {number} loaded
 * @param {number | undefined} total
 * @returns {import("../../public.js").Progress}
 */
export function to_progress(loaded, total) {
	return {
		loaded,
		ratio: total ? Math.min(loaded / total, 1) : void 0,
		total
	}
}
/**
 * @param {Response} response
 * @param {((progress: import("../../public.js").Progress) => void)=} on_progress
 * @returns {Response}
 */
export function track_progress(response, on_progress) {
	if (!on_progress || response.status < 200 || response.status > 599) return response
	const notify = on_progress
	if (!response.body) {
		call_progress(
			notify,
			{ loaded: 0, ratio: 1, total: 0 }
		)
		return response
	}
	const encoding = response.headers.get("Content-Encoding")
	const length = response.headers.get("Content-Length")
	const size = length == null ? Number.NaN : Number(length)
	const total = (!encoding || encoding == "identity") && Number.isFinite(size) && size >= 0
		? size
		: void 0
	let loaded = 0
	let complete = false
	/** @param {import("../../public.js").Progress} progress */
	function report(progress) {
		complete = progress.ratio == 1
		call_progress(notify, progress)
	}
	report(to_progress(0, total))
	const body = response.body.pipeThrough(
		new TransformStream(
			{
				flush() {
					if (!complete) report(
						{ loaded, ratio: 1, total: loaded }
					)
				},
				transform(chunk, controller) {
					loaded += chunk.byteLength
					report(to_progress(loaded, total))
					controller.enqueue(chunk)
				}
			}
		)
	)
	return new Response(
		body,
		{
			headers: response.headers,
			status: response.status,
			statusText: response.statusText
		}
	)
}
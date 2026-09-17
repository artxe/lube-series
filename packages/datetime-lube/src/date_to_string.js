import time_of from "./time_of.js"
import { check_zone, fields_of } from "./zone.js"
/** @type {Map<string, (string | number[])[]>} */
const formats = new Map()
const token_regex = /DD|HH|MM|YYYY|mm|sss?/g
const year_token = [ 0, 4, 0 ]
/** @type {Record<string, number[]>} */
const tokens = {
	DD: [ 2, 2, 0 ],
	HH: [ 3, 2, 0 ],
	MM: [ 1, 2, 1 ],
	YYYY: year_token,
	mm: [ 4, 2, 0 ],
	ss: [ 5, 2, 0 ],
	sss: [ 6, 3, 0 ]
}
/**
 * @param {string} format
 * @returns {(string | number[])[]}
 */
function compile(format) {
	let parts = formats.get(format)
	if (parts) return parts
	parts = []
	let last = 0
	for (const { 0: token, index = 0 } of format.matchAll(token_regex)) {
		if (index > last) parts.push(format.slice(last, index))
		parts.push(
			/** @type {number[]} */(tokens[token])/**/
		)
		last = index + token.length
	}
	if (last < format.length) parts.push(format.slice(last))
	if (formats.size >= 1000) formats.clear()
	formats.set(format, parts)
	return parts
}
/**
 * @param {number} value
 * @param {number} length
 * @returns {string}
 */
function pad(value, length) {
	return String(value).padStart(length, "0")
}
/**
 * @param {number} year
 * @returns {string}
 */
function year_text(year) {
	return year >= 0 && year <= 9999
		? String(year).padStart(4, "0")
		: (year < 0 ? "-" : "+") + String(Math.abs(year)).padStart(6, "0")
}
/**
 * Converts a Date object to a formatted string representation.
 * Letters that are not a time unit are kept as they are, so `"HHhmm"` gives `"11h22"`.
 * A year before 0 or after 9999 is printed as an expanded year, such as `"+012345"`.
 * @param {Date} date
 * @param {string=} format
 * ```js
 * = "YYYY-MM-DDTHH:mm:ss.sss"
 * ```
 *
 * Supported time units:
 * - "YYYY": Years
 * - "MM": Months
 * - "DD": Days
 * - "HH": Hours
 * - "mm": Minutes
 * - "ss": Seconds
 * - "sss": Milliseconds
 * @param {import("../public.js").TimeZone=} zone
 * @returns {string}
 * @throws
 * ```
 * RangeError(`dateToString: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`dateToString: Expected a Date, got ${typeof date}`)
 * ```
 * @example dateToString(new Date, "YYYY-MM-DD HH:mm", "Asia/Seoul") //=> "2024-07-15 21:00"
 */
export default function(
	date,
	format = "YYYY-MM-DDTHH:mm:ss.sss",
	zone
) {
	const time = time_of("dateToString", date)
	check_zone("dateToString", zone)
	if (isNaN(time)) return "Invalid Date"
	const fields = fields_of(date, zone)
	const parts = compile(format)
	let result = ""
	for (const part of parts) {
		result += typeof part == "string"
			? part
			: part === year_token
				? year_text(
					/** @type {number} */(fields[0])/**/
				)
				: pad(
				/** @type {number} */(fields[/** @type {number} */(part[0])/**/])/**/ + /** @type {number} */(part[2])/**/,
					/** @type {number} */(part[1])/**/
				)
	}
	return result
}
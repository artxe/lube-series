import { fields_of_wall, last_day } from "./calendar.js"
import { check_zone, date_of, fields_of } from "./zone.js"
const comment_regex = /\([^)]*\)?/g
/** @type {Map<string, (number | number[])[]>} */
const formats = new Map()
const iso_regex = /^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?)?)?([^]*)$/
const token_regex = /DD|HH|MM|YYYY|mm|sss?/g
/** @type {Record<string, number[]>} */
const tokens = {
	DD: [ 2, 2, 1, 31 ],
	HH: [ 3, 2, 0, 23 ],
	MM: [ 1, 2, 1, 12 ],
	YYYY: [ 0, 4, 0, 275760 ],
	mm: [ 4, 2, 0, 59 ],
	ss: [ 5, 2, 0, 59 ],
	sss: [ 6, 3, 0, 999 ]
}
const zone_regex = /(?<![a-z])(?:[cemp][ds]t|gmt|utc?|z)(?![a-z])|(?:\s|[ap]m|\d:\d\d?(?::\d\d?(?:\.\d*)?)?)[+-]\d/i
/**
 * @param {string} format
 * @returns {(number | number[])[]}
 */
function compile(format) {
	let parts = formats.get(format)
	if (parts) return parts
	parts = []
	let last = 0
	for (const { 0: token, index = 0 } of format.matchAll(token_regex)) {
		if (index > last) parts.push(
			[ ...format.slice(last, index) ].length
		)
		parts.push(
			/** @type {number[]} */(tokens[token])/**/
		)
		last = index + token.length
	}
	if (last < format.length) parts.push(
		[ ...format.slice(last) ].length
	)
	if (formats.size >= 1000) formats.clear()
	formats.set(format, parts)
	return parts
}
/**
 * @param {RegExpExecArray} match
 * @returns {boolean}
 */
function out_of_range(match) {
	const [ , year, month, day, hour, minute, second ] = match
	if (month === undefined) return false
	const index = +month - 1
	return index < 0 || index > 11 || day !== undefined && (+day < 1 || +day > last_day(+(year ?? 0), index)) || +(hour ?? 0) > (+(minute ?? 0) || +(second ?? 0) || +(match[7] ?? 0)
		? 23
		: 24) || +(minute ?? 0) > 59 || +(second ?? 0) > 59
}
/**
 * Converts a date string to a Date object based on the provided format.
 * Without a format the platform parser reads the string, so an offset such as `"Z"` is applied,
 * while a date without a time is read as midnight. Out-of-range values give an invalid Date only in an
 * ECMAScript date string: V8 rolls `"2025/02/30"` over to March 2, so check user input with a format.
 * With a format, letters that are not a time unit only reserve their place, and a unit reads up to its own length of digits (`"sss"` reads them as a fraction, so `".5"` is 500 ms).
 * `"YYYY"` also reads an expanded year such as `"+012345"`, and text left after the format gives an invalid Date.
 * Missing units default to 0000-01-01T00:00:00.000, where a time zone is at its local mean time, so
 * read a time alone in `"UTC"`. An invalid value returns an invalid Date.
 * A wall clock inside a daylight saving gap moves forward, and one that occurs twice takes the
 * first occurrence, as `new Date(year, month, day, hour)` does.
 * @param {string} date
 * @param {string=} format
 * ```js
 * e.g. "YYYY-MM-DDTHH:mm:ss.sss"
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
 * @returns {Date}
 * @throws
 * ```
 * RangeError(`stringToDate: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`stringToDate: Expected a string, got ${typeof date}`)
 * ```
 * @example stringToDate("2024-07-15 09:00", "YYYY-MM-DD HH:mm", "Asia/Seoul")
 */
export default function(date, format, zone) {
	if (typeof date != "string") throw new TypeError(
		`stringToDate: Expected a string, got ${date === null ? "null" : typeof date}`
	)
	check_zone("stringToDate", zone)
	if (format === undefined) {
		const native = new Date(date)
		const valid = !isNaN(native.getTime())
		if (!valid && zone === undefined) return native
		const match = iso_regex.exec(date)
		if (match && out_of_range(match)) return new Date(NaN)
		const parsed = match?.[8] === ""
			? match
			: null
		if (parsed) {
			if (zone === undefined && parsed[4] !== undefined) return native
			if (!valid && isNaN(Date.parse(`${date}Z`))) return native
			const fraction = parsed[7]
			return date_of(
				[
					+(parsed[1] ?? NaN),
					+(parsed[2] ?? 1) - 1,
					+(parsed[3] ?? 1),
					+(parsed[4] ?? 0),
					+(parsed[5] ?? 0),
					+(parsed[6] ?? 0),
					fraction === undefined
						? 0
						: +fraction.slice(0, 3).padEnd(3, "0")
				],
				zone
			)
		}
		if (zone === undefined) return native
		const text = date.replace(comment_regex, "")
		if (zone_regex.test(text)) return native
		const wall = new Date(`${text} GMT`)
		if (!valid && isNaN(wall.getTime())) return native
		return date_of(
			isNaN(wall.getTime())
				? fields_of(native)
				: fields_of_wall(wall.getTime()),
			zone
		)
	}
	const fields = [ 0, 0, 1, 0, 0, 0, 0 ]
	let index = 0
	for (const part of compile(format)) {
		if (typeof part == "number") {
			for (let i = 0; i < part; i++) {
				const code = date.charCodeAt(index)
				index += code >= 0xd800 && code < 0xdc00 && date.charCodeAt(index + 1) >= 0xdc00 && date.charCodeAt(index + 1) < 0xe000
					? 2
					: 1
			}
			continue
		}
		let text = ""
		let length = /** @type {number} */(part[1])/**/
		let min = /** @type {number} */(part[2])/**/
		let sign = ""
		const code = date.charCodeAt(index)
		if (part[0] == 0 && (code == 43 || code == 45)) {
			sign = code == 45
				? "-"
				: "+"
			index++
			length = 6
			min = -271821
		}
		while (text.length < length && date.charCodeAt(index) > 47 && date.charCodeAt(index) < 58) text += date[index++]
		if (!text || sign && (text.length < 6 || sign == "-" && !+text)) return new Date(NaN)
		if (part[0] == 6) {
			while (date.charCodeAt(index) > 47 && date.charCodeAt(index) < 58) index++
		}
		const value = part[0] == 6
			? +text.padEnd(3, "0")
			: +(sign + text)
		if (value > /** @type {number} */(part[3])/**/ || value < min) return new Date(NaN)
		fields[/** @type {number} */(part[0])/**/] = /** @type {number} */(part[0])/**/ == 1
			? value - 1
			: value
	}
	if (index != date.length || /** @type {number} */(fields[2])/**/ > last_day(
		/** @type {number} */(fields[0])/**/,
		/** @type {number} */(fields[1])/**/
	)) return new Date(NaN)
	return date_of(fields, zone)
}
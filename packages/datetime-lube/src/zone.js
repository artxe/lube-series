import { fields_of_wall, wall_of_fields } from "./calendar.js"
const offset_regex = /GMT([+-])([0-9][0-9]):([0-9][0-9])(?::([0-9][0-9]))?/
/** @type {Map<string, Intl.DateTimeFormat>} */
const canonical = new Map()
/** @type {Map<string, Intl.DateTimeFormat>} */
const formatters = new Map()
/**
 * @param {string} name
 * @param {string=} zone
 */
function check_zone(name, zone) {
	if (zone === undefined || formatters.has(zone)) return
	try {
		formatter_of(zone)
	} catch (error) {
		throw new RangeError(
			`${name}: Invalid time zone "${String(zone)}"`,
			{ cause: error }
		)
	}
}
/**
 * @param {number[]} fields
 * @param {string=} zone
 * @returns {Date}
 */
function date_of(fields, zone) {
	if (zone !== undefined) return new Date(
		instant_of(wall_of_fields(fields), zone)
	)
	const year = /** @type {number} */(fields[0])/**/
	if (year >= 0 && year < 100) {
		const date = new Date(0)
		date.setFullYear(year, fields[1], fields[2])
		date.setHours(
			/** @type {number} */(fields[3])/**/,
			fields[4],
			fields[5],
			fields[6]
		)
		return date
	}
	return new Date(
		year,
		/** @type {number} */(fields[1])/**/,
		fields[2],
		fields[3],
		fields[4],
		fields[5],
		fields[6]
	)
}
/**
 * @param {number} wall
 * @param {number} end
 * @param {number} time
 * @param {string=} zone
 * @returns {number}
 */
function end_at(wall, end, time, zone) {
	if (end < time) return wall - offset_in(time, zone) - 1
	const next = end + 1
	const offset = offset_in(next, zone)
	if (next + offset == wall || offset_in(end, zone) != offset) return end
	const transition = transition_of(time, next, zone)
	return transition + offset_in(transition, zone) >= wall
		? transition - 1
		: end
}
/**
 * @param {Date} date
 * @param {string=} zone
 * @returns {number[]}
 */
function fields_of(date, zone) {
	if (zone === undefined) return [
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds(),
		date.getDay()
	]
	const time = date.getTime()
	return fields_of_wall(time + offset_of(time, zone))
}
/**
 * @param {string} zone
 * @returns {Intl.DateTimeFormat}
 */
function formatter_of(zone) {
	let formatter = formatters.get(zone)
	if (formatter) return formatter
	formatter = new Intl.DateTimeFormat(
		"en-US",
		{
			timeZone: zone,
			timeZoneName: "longOffset"
		}
	)
	const name = formatter.resolvedOptions().timeZone
	const known = canonical.get(name)
	if (known) {
		formatter = known
	} else {
		if (canonical.size >= 1000) canonical.clear()
		canonical.set(name, formatter)
	}
	if (formatters.size >= 1000) formatters.clear()
	formatters.set(zone, formatter)
	return formatter
}
/**
 * @param {number} wall
 * @param {string} zone
 * @param {boolean=} exact
 * @returns {number}
 */
function instant_of(wall, zone, exact) {
	const before = offset_of(wall - 86400000, zone)
	const guess = wall - before
	const offset = offset_of(guess, zone)
	if (offset == before) return guess
	const candidate = wall - offset
	return offset_of(candidate, zone) == offset
		? candidate
		: exact
			? NaN
			: guess
}
/**
 * @param {number} time
 * @param {string=} zone
 * @returns {number}
 */
function offset_in(time, zone) {
	return zone === undefined
		? wall_of_fields(fields_of(new Date(time))) - time
		: offset_of(time, zone)
}
/**
 * @param {number} time
 * @param {string} zone
 * @returns {number}
 */
function offset_of(time, zone) {
	const match = offset_regex.exec(
		formatter_of(zone).format(
			time < -8.64e15
				? -8.64e15
				: time <= 8.64e15
					? time
					: 8.64e15
		)
	)
	if (!match) return 0
	return (match[1] == "-" ? -1 : 1) * (
		(+(match[2] ?? 0) * 60 + +(match[3] ?? 0)) * 60000
		+ +(match[4] ?? 0) * 1000
	)
}
/**
 * @param {number} from
 * @param {number} to
 * @param {string=} zone
 * @returns {number}
 */
function transition_of(from, to, zone) {
	const offset = offset_in(to, zone)
	while (to - from > 1) {
		const middle = Math.floor((from + to) / 2)
		if (offset_in(middle, zone) == offset) to = middle
		else from = middle
	}
	return to
}
/**
 * @param {number} time
 * @param {number} ms
 * @param {string=} zone
 * @returns {number}
 */
function unit_end(time, ms, zone) {
	const bucket = Math.floor(
		(time + offset_in(time, zone)) / ms
	)
	let at = time
	for (;;) {
		const offset = offset_in(at, zone)
		const end = (bucket + 1) * ms - offset - 1
		if (!(end <= 8.64e15)) return NaN
		if (offset_in(end, zone) == offset) return end
		const transition = transition_of(at, end, zone)
		const wall = transition + offset_in(transition, zone)
		if (Math.floor(wall / ms) != bucket || wall <= transition - 1 + offset) return transition - 1
		at = transition
	}
}
/**
 * @param {number} time
 * @param {number} ms
 * @param {string=} zone
 * @returns {number}
 */
function unit_start(time, ms, zone) {
	const bucket = Math.floor(
		(time + offset_in(time, zone)) / ms
	)
	let at = time
	for (;;) {
		const offset = offset_in(at, zone)
		const start = bucket * ms - offset
		if (!(start >= -8.64e15)) return NaN
		if (offset_in(start, zone) == offset) return start
		const transition = transition_of(start, at, zone)
		const before = transition - 1
		const wall = before + offset_in(before, zone)
		if (Math.floor(wall / ms) != bucket || wall >= transition + offset) return transition
		at = before
	}
}
export {
	check_zone,
	date_of,
	end_at,
	fields_of,
	instant_of,
	offset_in,
	offset_of,
	transition_of,
	unit_end,
	unit_start
}
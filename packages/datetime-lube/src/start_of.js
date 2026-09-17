import { days_of, wall_of_fields } from "./calendar.js"
import time_of from "./time_of.js"
import {
	check_zone,
	fields_of,
	instant_of,
	offset_in,
	offset_of,
	transition_of,
	unit_start
} from "./zone.js"
/** @type {Record<string, number | undefined>} */
const unit_ms = { H: 3600000, m: 60000, s: 1000 }
/** @type {Record<string, number>} */
const units = { D: 3, M: 2, W: 3, Y: 1 }
const units_of = new Set(
	[ "D", "H", "M", "W", "Y", "m", "s" ]
)
/**
 * Returns a new Date at the start of the given unit, such as midnight of the same day.
 * A week starts on Monday, as in ISO 8601.
 * @param {Date} date
 * @param {Exclude<import("../public.js").Unit, "sss">} unit
 * ```
 * "Y" | "M" | "W" | "D" | "H" | "m" | "s"
 * ```
 * @param {import("../public.js").TimeZone=} zone
 * @returns {Date}
 * @throws
 * ```
 * RangeError(`startOf: Invalid unit "${unit}"`) // The unit is not one of the listed ones
 * RangeError(`startOf: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`startOf: Expected a Date, got ${typeof date}`)
 * ```
 * @example startOf(new Date, "D", "Asia/Seoul") //=> Date { midnight in Seoul }
 */
export default function(date, unit, zone) {
	const time = time_of("startOf", date)
	if (!units_of.has(unit)) throw new RangeError(
		`startOf: Invalid unit "${String(unit)}"`
	)
	check_zone("startOf", zone)
	if (isNaN(time)) return new Date(NaN)
	const ms = unit_ms[unit]
	if (ms) {
		if (zone !== undefined) {
			const offset = offset_of(time, zone)
			const rest = ((time + offset) % ms + ms) % ms
			return new Date(
				offset_of(time - rest, zone) == offset
					? time - rest
					: unit_start(time, ms, zone)
			)
		}
		const rest = ms > 60000
			? date.getMinutes() * 60000 + date.getSeconds() * 1000 + date.getMilliseconds()
			: ms > 1000
				? date.getSeconds() * 1000 + date.getMilliseconds()
				: date.getMilliseconds()
		const result = new Date(time - rest)
		if (
			result.getTimezoneOffset() == date.getTimezoneOffset()
			&& result.getSeconds() == (ms > 1000 ? 0 : date.getSeconds())
		) return result
		result.setTime(unit_start(time, ms))
		return result
	}
	const from = /** @type {number} */(units[unit])/**/
	if (zone === undefined) {
		const result = new Date(time)
		result.setHours(
			unit == "D"
				? 0
				: unit == "W"
					? -24 * ((result.getDay() + 6) % 7)
					: unit == "M"
						? 24 - 24 * result.getDate()
						: -24 * (days_of(
							result.getFullYear(),
							result.getMonth(),
							result.getDate()
						) - days_of(result.getFullYear(), 0, 1)),
			0,
			0,
			0
		)
		if (result.getTime() <= time && !(result.getHours() || result.getMinutes() || result.getSeconds())) return result
	}
	const fields = fields_of(date, zone)
	if (unit == "W") fields[2] = /** @type {number} */(fields[2])/**/ - (/** @type {number} */(fields[7])/**/ + 6) % 7
	for (let i = from; i < 7; i++) fields[i] = i == 2 ? 1 : 0
	const wall = wall_of_fields(fields)
	if (zone !== undefined) {
		const start = instant_of(wall, zone, true)
		if (start <= time) return new Date(start)
	}
	const before = offset_in(wall - 86400000, zone)
	const guess = wall - before
	const after = offset_in(guess, zone)
	const earliest = after == before
		? wall - offset_in(time, zone)
		: wall - after
	if (!(earliest >= -8.64e15)) return new Date(NaN)
	return new Date(
		transition_of(
			earliest,
			after == before || guess > time
				? time
				: guess,
			zone
		)
	)
}
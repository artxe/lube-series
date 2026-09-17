import {
	days_of,
	fields_of_wall,
	last_day,
	wall_of_fields
} from "./calendar.js"
import time_of from "./time_of.js"
import {
	check_zone,
	end_at,
	instant_of,
	offset_in,
	offset_of,
	unit_end
} from "./zone.js"
/** @type {Record<string, number | undefined>} */
const unit_ms = { H: 3600000, m: 60000, s: 1000 }
/** @type {Record<string, number>} */
const units = { D: 3, M: 2, W: 3, Y: 1 }
const units_of = new Set(
	[ "D", "H", "M", "W", "Y", "m", "s" ]
)
/**
 * Returns a new Date at the last millisecond of the given unit, such as 23:59:59.999 of the day.
 * A week ends on Sunday, as in ISO 8601.
 * @param {Date} date
 * @param {Exclude<import("../public.js").Unit, "sss">} unit
 * ```
 * "Y" | "M" | "W" | "D" | "H" | "m" | "s"
 * ```
 * @param {import("../public.js").TimeZone=} zone
 * @returns {Date}
 * @throws
 * ```
 * RangeError(`endOf: Invalid unit "${unit}"`) // The unit is not one of the listed ones
 * RangeError(`endOf: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`endOf: Expected a Date, got ${typeof date}`)
 * ```
 * @example endOf(new Date, "M") //=> Date { last millisecond of this month }
 */
export default function(date, unit, zone) {
	const time = time_of("endOf", date)
	if (!units_of.has(unit)) throw new RangeError(
		`endOf: Invalid unit "${String(unit)}"`
	)
	check_zone("endOf", zone)
	if (isNaN(time)) return new Date(NaN)
	const ms = unit_ms[unit]
	if (ms) {
		if (zone !== undefined) {
			const offset = offset_of(time, zone)
			const rest = ms - ((time + offset) % ms + ms) % ms
			return new Date(
				offset_of(time + rest - 1, zone) == offset
					? time + rest - 1
					: unit_end(time, ms, zone)
			)
		}
		const rest = ms - (
			ms > 60000
				? date.getMinutes() * 60000 + date.getSeconds() * 1000 + date.getMilliseconds()
				: ms > 1000
					? date.getSeconds() * 1000 + date.getMilliseconds()
					: date.getMilliseconds()
		)
		const result = new Date(time + rest - 1)
		if (
			result.getTimezoneOffset() == date.getTimezoneOffset()
			&& result.getSeconds() == (ms > 1000 ? 59 : date.getSeconds())
		) return result
		result.setTime(unit_end(time, ms))
		return result
	}
	const from = /** @type {number} */(units[unit])/**/
	let end = time
	if (zone === undefined) {
		const result = new Date(time)
		result.setHours(
			unit == "D"
				? 24
				: unit == "W"
					? 168 - 24 * ((result.getDay() + 6) % 7)
					: unit == "M"
						? 24 * (last_day(
							result.getFullYear(),
							result.getMonth()
						) - result.getDate() + 1)
						: 24 * (days_of(result.getFullYear() + 1, 0, 1) - days_of(
							result.getFullYear(),
							result.getMonth(),
							result.getDate()
						)),
			0,
			0,
			0
		)
		end = result.getTime() - 1
		if (end >= time && !(result.getHours() || result.getMinutes() || result.getSeconds())) {
			result.setTime(end)
			return result
		}
	}
	const offset = offset_in(time, zone)
	const fields = fields_of_wall(time + offset)
	if (unit == "W") fields[2] = /** @type {number} */(fields[2])/**/ + 7 - (/** @type {number} */(fields[7])/**/ + 6) % 7
	else fields[from - 1] = /** @type {number} */(fields[from - 1])/**/ + 1
	for (let i = from; i < 7; i++) fields[i] = i == 2 ? 1 : 0
	const wall = wall_of_fields(fields)
	if (zone !== undefined) {
		const next = offset_of(wall - offset, zone)
		if (
			next == offset
			|| wall - next > time && offset_of(wall - next, zone) == next
		) return new Date(wall - next - 1)
		end = instant_of(wall, zone) - 1
	}
	return new Date(end_at(wall, end, time, zone))
}
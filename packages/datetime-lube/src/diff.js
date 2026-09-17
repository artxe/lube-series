import { days_of, last_day, wall_of_fields } from "./calendar.js"
import time_of from "./time_of.js"
import { check_zone, date_of, fields_of } from "./zone.js"
/** @type {Record<string, number | undefined>} */
const unit_ms = {
	H: 3600000,
	m: 60000,
	s: 1000,
	sss: 1
}
const units_of = new Set(
	[ "D", "H", "M", "W", "Y", "m", "s", "sss" ]
)
/**
 * @param {number[]} from_fields
 * @param {number} months
 * @param {number} to_wall
 * @param {number} end
 * @param {string=} zone
 * @returns {number}
 */
function anchor_after(
	from_fields,
	months,
	to_wall,
	end,
	zone
) {
	const month = /** @type {number} */(from_fields[1])/**/ + months
	const year = /** @type {number} */(from_fields[0])/**/ + Math.floor(month / 12)
	const index = (month % 12 + 12) % 12
	const fields = [
		year,
		index,
		Math.min(
			/** @type {number} */(from_fields[2])/**/,
			last_day(year, index)
		),
		/** @type {number} */(from_fields[3])/**/,
		/** @type {number} */(from_fields[4])/**/,
		/** @type {number} */(from_fields[5])/**/,
		/** @type {number} */(from_fields[6])/**/
	]
	const distance = wall_of_fields(fields) - to_wall
	if (Math.abs(distance) >= 172800000) return distance
	const time = date_of(fields, zone).getTime()
	return isNaN(time)
		? distance
		: time - end
}
/**
 * Counts the whole units from one date to another, negative when the second date is earlier.
 * Years, months, weeks and days follow the clock, so a day over a daylight saving change still
 * counts as one day, while hours, minutes, seconds and milliseconds are elapsed time.
 * @param {Date} from
 * @param {Date} to
 * @param {import("../public.js").Unit} unit
 * ```
 * "Y" | "M" | "W" | "D" | "H" | "m" | "s" | "sss"
 * ```
 * @param {import("../public.js").TimeZone=} zone
 * @returns {number}
 * @throws
 * ```
 * RangeError(`diff: Invalid unit "${unit}"`) // The unit is not one of the listed ones
 * RangeError(`diff: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`diff: Expected a Date, got ${typeof from}`) // from or to is not a Date
 * ```
 * @example diff(start, end, "D") //=> 30
 */
export default function(from, to, unit, zone) {
	const start = time_of("diff", from)
	const end = time_of("diff", to)
	if (!units_of.has(unit)) throw new RangeError(
		`diff: Invalid unit "${String(unit)}"`
	)
	check_zone("diff", zone)
	if (isNaN(start) || isNaN(end)) return NaN
	const ms = unit_ms[unit]
	if (ms) return Math.trunc((end - start) / ms) + 0
	const from_fields = fields_of(from, zone)
	const to_fields = fields_of(to, zone)
	if (unit == "D" || unit == "W") {
		const days = days_of(
			/** @type {number} */(to_fields[0])/**/,
			/** @type {number} */(to_fields[1])/**/,
			/** @type {number} */(to_fields[2])/**/
		) - days_of(
			/** @type {number} */(from_fields[0])/**/,
			/** @type {number} */(from_fields[1])/**/,
			/** @type {number} */(from_fields[2])/**/
		)
		return unit == "D"
			? days
			: Math.trunc(days / 7) + 0
	}
	let months = (/** @type {number} */(to_fields[0])/**/ - /** @type {number} */(from_fields[0])/**/) * 12
		+ /** @type {number} */(to_fields[1])/**/ - /** @type {number} */(from_fields[1])/**/
	const to_day = /** @type {number} */(to_fields[2])/**/
	const from_day = /** @type {number} */(from_fields[2])/**/
	if (Math.abs(to_day - from_day) > 2 && to_day < 27 && from_day < 27) {
		if (months > 0 && to_day < from_day) months--
		else if (months < 0 && to_day > from_day) months++
	} else {
		const to_wall = wall_of_fields(to_fields)
		if (end >= start) {
			months = Math.max(months, 0)
			while (months && anchor_after(
				from_fields,
				months,
				to_wall,
				end,
				zone
			) > 0) months--
			if (anchor_after(
				from_fields,
				months + 1,
				to_wall,
				end,
				zone
			) <= 0) months++
		} else {
			months = Math.min(months, 0)
			while (months && anchor_after(
				from_fields,
				months,
				to_wall,
				end,
				zone
			) < 0) months++
			if (anchor_after(
				from_fields,
				months - 1,
				to_wall,
				end,
				zone
			) >= 0) months--
		}
	}
	return unit == "Y"
		? Math.trunc(months / 12) + 0
		: months
}
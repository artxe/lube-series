import { last_day } from "./calendar.js"
import time_of from "./time_of.js"
import { check_zone, date_of, fields_of } from "./zone.js"
/** @type {Map<string, (number | string)[]>} */
const durations = new Map()
const duration_regex = /([+-]?\d+)(sss|[YMWDHms])/g
/** @type {Record<string, number | undefined>} */
const unit_ms = {
	H: 3600000,
	m: 60000,
	s: 1000,
	sss: 1
}
/**
 * @param {Date} date
 * @param {number} months
 * @param {string=} zone
 * @returns {Date}
 */
function add_months(date, months, zone) {
	if (zone === undefined) {
		const month = date.getMonth() + months
		const year = date.getFullYear() + Math.floor(month / 12)
		const rest = (month % 12 + 12) % 12
		const result = new Date(date.getTime())
		result.setFullYear(
			year,
			rest,
			Math.min(
				date.getDate(),
				last_day(year, rest)
			)
		)
		return result
	}
	const fields = fields_of(date, zone)
	const month = /** @type {number} */(fields[1])/**/ + months
	const year = /** @type {number} */(fields[0])/**/ + Math.floor(month / 12)
	const rest = (month % 12 + 12) % 12
	fields[0] = year
	fields[1] = rest
	fields[2] = Math.min(
		/** @type {number} */(fields[2])/**/,
		last_day(year, rest)
	)
	return date_of(fields, zone)
}
/**
 * @param {string} sum
 * @returns {(number | string)[]}
 */
function compile(sum) {
	let steps = durations.get(sum)
	if (steps) return steps
	steps = []
	if (!/\S/.test(sum) || /\S/.test(
		sum.replace(duration_regex, "")
	)) throw new RangeError(
		`add: Invalid duration "${String(sum)}"`
	)
	for (const [ , value = "", unit = "" ] of sum.matchAll(duration_regex)) {
		if (!+value) continue
		if (unit == "W") steps.push("D", +value * 7)
		else steps.push(unit, +value)
	}
	if (durations.size >= 1000) durations.clear()
	durations.set(sum, steps)
	return steps
}
/**
 * Calculates and adds the specified time duration to the provided date and returns a new Date.
 * Years and months are clamped to the end of the month, e.g. Jan 31 + 1M is Feb 28 or 29.
 * Days follow the clock, so a day over a daylight saving change is 23 or 25 hours,
 * while hours, minutes, seconds and milliseconds are elapsed time.
 * A part of zero adds nothing; any other part of years, months, weeks or days lands on a clock time,
 * which moves forward out of a daylight saving gap and takes the first occurrence of an hour that repeats.
 * @param {Date} date
 * @param {string} sum
 * ```
 * e.g. "1Y2M 3D"
 * ```
 *
 * Supported time units:
 * - "Y": Years
 * - "M": Months
 * - "W": Weeks
 * - "D": Days
 * - "H": Hours
 * - "m": Minutes
 * - "s": Seconds
 * - "sss": Milliseconds
 * @param {import("../public.js").TimeZone=} zone
 * @returns {Date}
 * @throws
 * ```
 * RangeError(`add: Invalid duration "${sum}"`) // sum is empty, or a part of it is not a number followed by a unit
 * RangeError(`add: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`add: Expected a Date, got ${typeof date}`)
 * ```
 * @example add(new Date, "-1D") //=> Date { yesterday }
 */
export default function(date, sum, zone) {
	const time = time_of("add", date)
	const steps = compile(sum)
	check_zone("add", zone)
	const result = new Date(time)
	if (isNaN(time)) return result
	if (zone === undefined) {
		for (let i = 0; i < steps.length; i += 2) {
			const unit = /** @type {string} */(steps[i])/**/
			const value = /** @type {number} */(steps[i + 1])/**/
			const ms = unit_ms[unit]
			if (ms) result.setTime(result.getTime() + value * ms)
			else if (unit == "D") result.setDate(result.getDate() + value)
			else result.setTime(
				add_months(
					result,
					unit == "Y"
						? value * 12
						: value
				).getTime()
			)
		}
		return result
	}
	let shifted = result
	for (let i = 0; i < steps.length; i += 2) {
		const unit = /** @type {string} */(steps[i])/**/
		const value = /** @type {number} */(steps[i + 1])/**/
		const ms = unit_ms[unit]
		if (ms) {
			shifted = new Date(shifted.getTime() + value * ms)
		} else if (unit == "D") {
			const fields = fields_of(shifted, zone)
			fields[2] = /** @type {number} */(fields[2])/**/ + value
			shifted = date_of(fields, zone)
		} else {
			shifted = add_months(
				shifted,
				unit == "Y"
					? value * 12
					: value,
				zone
			)
		}
	}
	return shifted
}
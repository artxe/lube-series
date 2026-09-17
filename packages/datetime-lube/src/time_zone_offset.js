import time_of from "./time_of.js"
import { check_zone, offset_of } from "./zone.js"
/**
 * Returns the offset of the time zone at the given date in milliseconds, east of UTC positive.
 * Daylight saving time is taken from the given date, so a summer date gives the summer offset.
 * @param {Date} date
 * @param {import("../public.js").TimeZone} zone
 * @returns {number}
 * @throws
 * ```
 * RangeError(`timeZoneOffset: Invalid time zone "${zone}"`) // Intl.DateTimeFormat rejects the zone
 * TypeError(`timeZoneOffset: Expected a Date, got ${typeof date}`)
 * ```
 * @example timeZoneOffset(new Date, "Asia/Seoul") //=> 32400000
 */
export default function(date, zone) {
	const time = time_of("timeZoneOffset", date)
	check_zone("timeZoneOffset", zone)
	return isNaN(time)
		? NaN
		: offset_of(time, zone)
}
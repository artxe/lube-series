import { fuzz_seeds } from "../seeds.js"
import {
	add,
	dateToString,
	diff,
	endOf,
	startOf,
	stringToDate,
	timeZoneOffset
} from "datetime-lube"
import { createRequire } from "node:module"
import { assert, describe, it } from "vitest"
const { Temporal } = /** @type {{ Temporal: typeof globalThis.Temporal }} */(createRequire(import.meta.url)("@js-temporal/polyfill"))/**/
const zones = [
	"America/Chicago",
	"America/New_York",
	"America/Santiago",
	"Asia/Kolkata",
	"Asia/Seoul",
	"Australia/Adelaide",
	"Australia/Lord_Howe",
	"Europe/Berlin",
	""
]
const anchors = [
	"2024-01-31",
	"2024-02-29",
	"2024-12-31",
	"2025-01-31",
	"2025-02-28",
	"2025-03-09",
	"2025-03-30",
	"2025-04-06",
	"2025-05-31",
	"2025-08-31",
	"2025-09-07",
	"2025-10-05",
	"2025-10-26",
	"2025-11-02",
	"2025-12-31"
]
const units = /** @type {const} */([ "Y", "M", "W", "D", "H", "m", "s", "sss" ])/**/
/** @type {Record<string, number>} */
const limits = { D: 40, H: 50, M: 14, W: 6, Y: 3 }
/** @type {Record<string, string>} */
const temporal_units = {
	D: "days",
	H: "hours",
	M: "months",
	W: "weeks",
	Y: "years",
	m: "minutes",
	s: "seconds",
	sss: "milliseconds"
}
/**
 * @param {number} seed
 * @returns {() => number}
 */
function create_random(seed) {
	return () => {
		seed = seed + 0x6d2b79f5 | 0
		let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
		value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
		return ((value ^ value >>> 14) >>> 0) / 4294967296
	}
}
/**
 * @param {number} a
 * @param {number} b
 * @param {string} unit
 * @param {string} zone
 * @returns {number}
 */
function expected_diff(a, b, unit, zone) {
	if (unit == "sss") return b - a
	if (unit == "s") return Math.trunc((b - a) / 1000)
	if (unit == "m") return Math.trunc((b - a) / 60000)
	if (unit == "H") return Math.trunc((b - a) / 3600000)
	const days = zoned(a, zone).toPlainDate()
		.until(zoned(b, zone).toPlainDate()).days
	if (unit == "D") return days
	if (unit == "W") return Math.trunc(days / 7)
	const months = months_between(a, b, zone)
	return unit == "M" ? months : Math.trunc(months / 12)
}
/**
 * @param {number} ms
 * @param {string} zone
 * @returns {string}
 */
function iso(ms, zone) {
	return zoned(ms, zone).toString(
		{ smallestUnit: "millisecond" }
	)
}
/**
 * @param {number} a
 * @param {number} b
 * @param {string} zone
 * @returns {number}
 */
function months_between(a, b, zone) {
	const from = zoned(a, zone)
	const to = zoned(b, zone)
	const guess = (to.year - from.year) * 12 + to.month - from.month
	if (b >= a) {
		let months = Math.max(0, guess + 1)
		while (months > 0 && from.add({ months }).epochMilliseconds > b) months--
		return months
	}
	let months = Math.min(0, guess - 1)
	while (months < 0 && from.add({ months }).epochMilliseconds < b) months++
	return months
}
/**
 * @param {number} ms
 * @param {string} zone
 * @returns {Temporal.ZonedDateTime}
 */
function zoned(ms, zone) {
	return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zone)
}
/** @type {Record<string, number>} */
const clock_units = { H: 3600000, m: 60000, s: 1000 }
/**
 * @param {number} seed
 * @param {string} local
 */
function check(seed, local) {
	const random = create_random(seed)
	/**
	 * @param {number} count
	 * @returns {number}
	 */
	function int(count) {
		return Math.floor(random() * count)
	}
	/**
	 * @template T
	 * @param {readonly T[]} items
	 * @returns {T}
	 */
	function pick(items) {
		return /** @type {T} */(items[Math.floor(random() * items.length)])/**/
	}
	const picked = pick(zones)
	const zone = picked || local
	const arg = picked || undefined
	/** @returns {number} */
	function instant() {
		const base = Temporal.PlainDate.from(pick(anchors)).toZonedDateTime({ timeZone: zone }).epochMilliseconds
		const spread = random() < 0.5 ? 21600000 : 259200000
		const ms = base + Math.round((random() * 2 - 1) * spread)
		return random() < 0.5
			? Math.round(ms / 900000) * 900000 + pick([ 0, 0, 1, 999, 59999 ])
			: ms
	}
	const ms = instant()
	const date = new Date(ms)
	const at = `seed ${seed}: ${iso(ms, zone)} ${picked || `local ${local}`}`
	/** @type {[number, string][]} */
	const terms = []
	for (let count = 1 + int(3); count > 0; count--) {
		const unit = pick(units)
		const limit = limits[unit] ?? 200
		terms.push(
			[
				random() < 0.2 ? 0 : int(2 * limit + 1) - limit,
				unit
			]
		)
	}
	const sum = terms.map(
		([ value, unit ]) => `${value}${unit}`
	).join(random() < 0.5 ? " " : "")
	let reference = zoned(ms, zone)
	for (const [ value, unit ] of terms) {
		reference = reference.add(
			{
				[temporal_units[unit] ?? "days"]: value
			}
		)
	}
	const added = reference.epochMilliseconds
	assert.equal(
		iso(
			add(date, sum, arg).getTime(),
			zone
		),
		iso(added, zone),
		`add ${sum} ${at}`
	)
	assert.equal(date.getTime(), ms, at)
	for (const unit of units) {
		const other = random() < 0.5 ? added : instant()
		assert.equal(
			diff(date, new Date(other), unit, arg),
			expected_diff(ms, other, unit, zone),
			`diff ${unit} ${iso(other, zone)} ${at}`
		)
	}
	for (const [ value, unit ] of [
		[ int(25) - 12, "M" ],
		[ int(7) - 3, "Y" ]
	]) {
		assert.equal(
			diff(
				date,
				add(date, `${value}${unit}`, arg),
				/** @type {"M" | "Y"} */(unit)/**/,
				arg
			),
			value,
			`diff inverts add ${value}${unit} ${at}`
		)
	}
	const unit = pick(
		/** @type {Exclude<import("datetime-lube").Unit, "sss">[]} */(units.slice(0, -1))/**/
	)
	const start = startOf(date, unit, arg).getTime()
	const end = endOf(date, unit, arg).getTime()
	assert.equal(
		iso(start, zone),
		iso(
			expected_start(ms, unit, zone),
			zone
		),
		`startOf ${unit} ${at}`
	)
	assert.equal(
		iso(end, zone),
		iso(
			expected_end(ms, unit, zone),
			zone
		),
		`endOf ${unit} ${at}`
	)
	const time = zoned(ms, zone)
	const text = dateToString(date, undefined, arg)
	assert.equal(
		text,
		`${pad(time.year, 4)}-${pad(time.month, 2)}-${pad(time.day, 2)}T${pad(time.hour, 2)}:${pad(time.minute, 2)}:${pad(time.second, 2)}.${pad(time.millisecond, 3)}`,
		at
	)
	const parsed = expected_parse(time.toPlainDateTime(), zone)
	assert.equal(
		stringToDate(
			text,
			"YYYY-MM-DDTHH:mm:ss.sss",
			arg
		).getTime(),
		parsed,
		`stringToDate format ${text} ${at}`
	)
	assert.equal(
		stringToDate(text, undefined, arg).getTime(),
		parsed,
		`stringToDate ${text} ${at}`
	)
	const hour = int(24)
	const minute = pick([ 0, 15, 30, 45, 59 ])
	const wall = `${pad(time.year, 4)}-${pad(time.month, 2)}-${pad(time.day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}`
	assert.equal(
		iso(
			stringToDate(wall, "YYYY-MM-DD HH:mm", arg).getTime(),
			zone
		),
		iso(
			expected_parse(
				{
					day: time.day,
					hour,
					minute,
					month: time.month,
					year: time.year
				},
				zone
			),
			zone
		),
		`stringToDate wall ${wall} ${at}`
	)
	assert.equal(
		timeZoneOffset(date, zone),
		time.offsetNanoseconds / 1e6,
		at
	)
}
/**
 * @param {Temporal.ZonedDateTime} time
 * @param {string} unit
 * @returns {string}
 */
function clock_key(time, unit) {
	return time.toPlainDateTime().round(
		{
			roundingMode: "floor",
			smallestUnit: unit == "H"
				? "hour"
				: unit == "m"
					? "minute"
					: "second"
		}
	)
		.toString()
}
/**
 * @param {Temporal.ZonedDateTime} time
 * @param {number} length
 * @returns {number}
 */
function clock_offset(time, length) {
	return (time.minute * 60000 + time.second * 1000 + time.millisecond) % length
}
/**
 * @param {number} ms
 * @param {string} unit
 * @param {string} zone
 * @returns {number}
 */
function expected_end(ms, unit, zone) {
	const length = clock_units[unit]
	if (length) {
		let time = zoned(ms, zone)
		for (;;) {
			const ceiling = time.epochMilliseconds - clock_offset(time, length) + length - 1
			const transition = time.getTimeZoneTransition("next")
			if (!transition || transition.epochMilliseconds > ceiling) return ceiling
			if (transition.offsetNanoseconds < time.offsetNanoseconds || clock_key(transition, unit) != clock_key(time, unit)) return transition.epochMilliseconds - 1
			time = transition
		}
	}
	return zoned(
		expected_start(ms, unit, zone),
		zone
	).toPlainDate()
		.add(
			{
				[temporal_units[unit] ?? "days"]: 1
			}
		)
		.toZonedDateTime({ timeZone: zone }).epochMilliseconds - 1
}
/**
 * @param {Temporal.PlainDateTimeLike} fields
 * @param {string} zone
 * @returns {number}
 */
function expected_parse(fields, zone) {
	return Temporal.PlainDateTime.from(fields, { overflow: "reject" }).toZonedDateTime(zone).epochMilliseconds
}
/**
 * @param {number} ms
 * @param {string} unit
 * @param {string} zone
 * @returns {number}
 */
function expected_start(ms, unit, zone) {
	const length = clock_units[unit]
	if (length) {
		let time = zoned(ms, zone)
		for (;;) {
			const floor = time.epochMilliseconds - clock_offset(time, length)
			const transition = zoned(time.epochMilliseconds + 1, zone).getTimeZoneTransition("previous")
			if (!transition || transition.epochMilliseconds <= floor) return floor
			const before = zoned(
				transition.epochMilliseconds - 1,
				zone
			)
			if (transition.offsetNanoseconds < before.offsetNanoseconds || clock_key(before, unit) != clock_key(time, unit)) return transition.epochMilliseconds
			time = before
		}
	}
	let day = zoned(ms, zone).toPlainDate()
	if (unit == "W") day = day.subtract({ days: day.dayOfWeek - 1 })
	if (unit == "M") day = day.with({ day: 1 })
	if (unit == "Y") day = day.with({ day: 1, month: 1 })
	return day.toZonedDateTime({ timeZone: zone }).epochMilliseconds
}
/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function pad(value, width) {
	return String(value).padStart(width, "0")
}
describe(
	"temporal",
	() => {
		const seeds = fuzz_seeds(300)
		it(
			"agrees with @js-temporal/polyfill",
			() => {
				const local = new Intl.DateTimeFormat().resolvedOptions().timeZone
				for (const seed of seeds) check(seed, local)
			},
			60000 + seeds.length * 10
		)
	}
)
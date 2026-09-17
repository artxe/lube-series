import { timeUnit, timeZoneOffset } from "datetime-lube"
import { assert, describe, it } from "vitest"
describe(
	"time_zone_offset",
	() => {
		it(
			"daylight saving time",
			() => {
				assert.equal(
					timeZoneOffset(
						new Date("2024-01-15T12:00:00.000Z"),
						"America/New_York"
					),
					-5 * timeUnit.HH
				)
				assert.equal(
					timeZoneOffset(
						new Date("2024-07-15T12:00:00.000Z"),
						"America/New_York"
					),
					-4 * timeUnit.HH
				)
			}
		)
		it(
			"fixed and half hour offsets",
			() => {
				const date = new Date("2024-07-15T12:00:00.000Z")
				assert.equal(
					timeZoneOffset(date, "Asia/Seoul"),
					9 * timeUnit.HH
				)
				assert.equal(timeZoneOffset(date, "UTC"), 0)
				assert.equal(
					timeZoneOffset(date, "America/St_Johns"),
					-(2 * timeUnit.HH + 30 * timeUnit.mm)
				)
				assert.equal(
					timeZoneOffset(date, "Asia/Kathmandu"),
					5 * timeUnit.HH + 45 * timeUnit.mm
				)
			}
		)
		it(
			"historical offsets",
			() => {
				const old = new Date("1850-01-01T00:00:00.000Z")
				assert.equal(
					timeZoneOffset(old, "Asia/Seoul"),
					8 * timeUnit.HH + 27 * timeUnit.mm + 52 * timeUnit.ss
				)
				assert.equal(
					timeZoneOffset(old, "Europe/Amsterdam"),
					17 * timeUnit.mm + 30 * timeUnit.ss
				)
			}
		)
		it(
			"invalid date and time zone",
			() => {
				assert.isNaN(
					timeZoneOffset(new Date(NaN), "UTC")
				)
				assert.equal(
					timeZoneOffset(new Date(0), "+09:30"),
					34200000
				)
				assert.equal(
					timeZoneOffset(new Date(0), "asia/seoul"),
					32400000
				)
				assert.throws(
					() => timeZoneOffset(
						new Date(0),
						/** @type {never} */("Nowhere/Nothing")/**/
					),
					RangeError
				)
			}
		)
	}
)
import { dateToString, endOf, startOf } from "datetime-lube"
import { assert, describe, it } from "vitest"
const dst_dates = [
	"2024-03-10T06:30:00.000Z",
	"2024-03-10T07:30:00.000Z",
	"2024-11-03T05:30:00.000Z",
	"2024-11-03T06:30:00.000Z",
	"2024-03-31T00:30:00.000Z",
	"2024-10-27T01:30:00.000Z",
	"2024-09-07T15:00:00.000Z",
	"2024-09-08T04:30:00.000Z",
	"2024-09-08T15:00:00.000Z",
	"2024-04-07T02:30:00.000Z",
	"2011-12-29T12:00:00.000Z",
	"2011-12-30T22:00:00.000Z",
	"1950-01-01T13:30:00.000Z",
	"1950-04-08T17:23:11.310Z",
	"1911-12-31T16:30:00.000Z",
	"1908-03-31T15:00:00.000Z",
	"1916-07-01T04:59:30.000Z"
].map(iso => new Date(iso))
describe(
	"end_of",
	() => {
		it(
			"daylight saving gap at midnight",
			() => {
				assert.equal(
					endOf(
						new Date("2024-09-08T15:00:00.000Z"),
						"D",
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-09T02:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2024-09-07T15:00:00.000Z"),
						"D",
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-08T03:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1950-04-08T17:23:11.310Z"),
						"M",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1950-04-30T13:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1911-12-31T16:30:00.000Z"),
						"W",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1912-01-07T14:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1911-12-31T16:30:00.000Z"),
						"Y",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1912-12-31T14:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1950-01-01T13:30:00.000Z"),
						"D",
						"Pacific/Apia"
					).getTime(),
					Date.parse("1950-01-02T10:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2024-12-15T00:00:00.000Z"),
						"M",
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-12-31T14:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2024-12-30T00:00:00.000Z"),
						"W",
						"Asia/Seoul"
					).getTime(),
					Date.parse("2025-01-05T14:59:59.999Z")
				)
				for (const date of dst_dates) {
					const end = endOf(date, "D")
					assert.equal(
						dateToString(end, "YYYY-MM-DD"),
						dateToString(date, "YYYY-MM-DD")
					)
					assert.equal(
						dateToString(end, "HH:mm:ss.sss"),
						"23:59:59.999"
					)
					assert.notEqual(
						dateToString(
							new Date(end.getTime() + 1),
							"YYYY-MM-DD"
						),
						dateToString(date, "YYYY-MM-DD")
					)
					assert.equal(
						endOf(date, "M").getTime() + 1,
						startOf(
							new Date(endOf(date, "M").getTime() + 1),
							"M"
						).getTime()
					)
				}
			}
		)
		it(
			"daylight saving overlap keeps the hour",
			() => {
				const second = new Date("2024-11-03T06:30:00.500Z")
				assert.equal(
					endOf(second, "H", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:59:59.999Z")
				)
				assert.equal(
					endOf(second, "m", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:30:59.999Z")
				)
				assert.equal(
					endOf(second, "s", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:30:00.999Z")
				)
				assert.equal(
					endOf(
						new Date("1911-12-31T15:30:00.001Z"),
						"H",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1911-12-31T15:59:59.999Z")
				)
			}
		)
		it(
			"gap that crosses midnight in the local time zone",
			() => {
				const tz = process.env["TZ"]
				try {
					process.env["TZ"] = "Europe/Moscow"
					const day = new Date("1921-02-13T20:59:59.999Z")
					assert.equal(
						dateToString(endOf(day, "D")),
						"1921-02-13T23:59:59.999"
					)
					assert.equal(
						endOf(
							new Date("1921-02-07T20:59:59.999Z"),
							"W"
						).getTime(),
						Date.parse("1921-02-13T20:59:59.999Z")
					)
					assert.equal(
						endOf(day, "M").getTime(),
						Date.parse("1921-02-28T19:59:59.999Z")
					)
					assert.equal(
						endOf(day, "Y").getTime(),
						Date.parse("1921-12-31T20:59:59.999Z")
					)
					process.env["TZ"] = "America/Toronto"
					assert.equal(
						endOf(
							new Date("1919-03-30T17:00:00.000Z"),
							"D"
						).getTime(),
						Date.parse("1919-03-31T04:29:59.999Z")
					)
					process.env["TZ"] = "America/St_Johns"
					assert.equal(
						endOf(
							new Date("1987-10-25T02:31:00.000Z"),
							"D"
						).getTime(),
						Date.parse("1987-10-25T03:29:59.999Z")
					)
					process.env["TZ"] = "Asia/Gaza"
					assert.equal(
						endOf(
							new Date("2010-03-26T22:00:30.000Z"),
							"H"
						).getTime(),
						Date.parse("2010-03-26T22:00:59.999Z")
					)
					process.env["TZ"] = "Pacific/Chatham"
					assert.equal(
						endOf(
							new Date("1974-11-02T13:30:00.000Z"),
							"H"
						).getTime(),
						Date.parse("1974-11-02T13:59:59.999Z")
					)
				} finally {
					if (tz === undefined) delete process.env["TZ"]
					else process.env["TZ"] = tz
				}
			}
		)
		it(
			"invalid date",
			() => {
				assert.isNaN(
					endOf(new Date(NaN), "D").getTime()
				)
				for (const unit of [ "x", "sss", "d", "toString", "" ]) {
					assert.throws(
						() => endOf(
							new Date(0),
							/** @type {never} */(unit)/**/
						),
						RangeError,
						"Invalid unit"
					)
				}
				for (const date of dst_dates) {
					for (const [ unit, format, length ] of /** @type {const} */([
						[ "H", "YYYY-MM-DD HH", 3600000 ],
						[ "m", "YYYY-MM-DD HH:mm", 60000 ],
						[ "s", "YYYY-MM-DD HH:mm:ss", 1000 ]
					])/**/) {
						const end = endOf(date, unit)
						assert.isAtLeast(end.getTime(), date.getTime())
						assert.isBelow(
							end.getTime() - date.getTime(),
							length
						)
						assert.equal(
							dateToString(end, format),
							dateToString(date, format)
						)
						const next = new Date(end.getTime() + 1)
						assert.isTrue(
							dateToString(next, format) != dateToString(end, format)
							|| next.getTimezoneOffset() != end.getTimezoneOffset()
						)
					}
				}
			}
		)
		it(
			"time zone",
			() => {
				assert.equal(
					endOf(
						new Date("2024-07-15T12:00:00.000Z"),
						"D",
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-07-15T14:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2024-03-10T12:00:00.000Z"),
						"D",
						"America/New_York"
					).getTime(),
					Date.parse("2024-03-11T03:59:59.999Z")
				)
			}
		)
		it(
			"unit that ends inside a daylight saving gap or overlap",
			() => {
				assert.equal(
					endOf(
						new Date("1919-03-30T17:00:00.000Z"),
						"D",
						"America/Toronto"
					).getTime(),
					Date.parse("1919-03-31T04:29:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1974-11-02T13:30:00.000Z"),
						"H",
						"Pacific/Chatham"
					).getTime(),
					Date.parse("1974-11-02T13:59:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2010-03-26T22:00:30.000Z"),
						"H",
						"Asia/Gaza"
					).getTime(),
					Date.parse("2010-03-26T22:00:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("1987-10-25T02:31:00.000Z"),
						"D",
						"America/St_Johns"
					).getTime(),
					Date.parse("1987-10-25T03:29:59.999Z")
				)
				assert.equal(
					endOf(
						new Date("2009-11-01T02:31:00.000Z"),
						"M",
						"America/St_Johns"
					).getTime(),
					Date.parse("2009-11-01T03:29:59.999Z")
				)
			}
		)
		it(
			"units",
			() => {
				const date = new Date(2024, 1, 4, 11, 22, 33, 444)
				assert.equal(
					dateToString(endOf(date, "Y")),
					"2024-12-31T23:59:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "M")),
					"2024-02-29T23:59:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "W")),
					"2024-02-04T23:59:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "D")),
					"2024-02-04T23:59:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "H")),
					"2024-02-04T11:59:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "m")),
					"2024-02-04T11:22:59.999"
				)
				assert.equal(
					dateToString(endOf(date, "s")),
					"2024-02-04T11:22:33.999"
				)
			}
		)
	}
)
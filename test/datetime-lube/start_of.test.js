import { dateToString, endOf, startOf } from "datetime-lube"
import { assert, describe, it } from "vitest"
const dst_dates = [
	"2024-03-10T06:30:00.000Z",
	"2024-03-10T07:30:00.000Z",
	"2024-11-03T05:30:00.000Z",
	"2024-11-03T06:00:00.001Z",
	"2024-11-03T06:30:00.000Z",
	"2024-03-31T00:30:00.000Z",
	"2024-03-31T01:30:00.000Z",
	"2024-10-27T00:30:00.000Z",
	"2024-10-27T01:30:00.000Z",
	"2024-09-08T03:30:00.000Z",
	"2024-09-08T04:30:00.000Z",
	"2024-04-07T02:30:00.000Z",
	"2024-04-07T03:30:00.000Z",
	"2011-12-29T12:00:00.000Z",
	"2011-12-30T22:00:00.000Z",
	"1950-01-01T11:30:01.000Z",
	"1911-12-31T15:30:00.001Z",
	"1908-03-31T15:00:00.000Z",
	"1916-07-01T05:00:00.000Z"
].map(iso => new Date(iso))
describe(
	"start_of",
	() => {
		it(
			"daylight saving gap at midnight",
			() => {
				assert.equal(
					startOf(
						new Date("2024-09-08T15:00:00.000Z"),
						"D",
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-08T04:00:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1938-05-09T05:30:00.000Z"),
						"W",
						"America/St_Johns"
					).getTime(),
					Date.parse("1938-05-09T03:30:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1950-08-30T15:39:26.224Z"),
						"Y",
						"Pacific/Apia"
					).getTime(),
					Date.parse("1950-01-01T11:30:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1942-08-01T05:00:01.000Z"),
						"M",
						"America/Santiago"
					).getTime(),
					Date.parse("1942-08-01T05:00:00.000Z")
				)
			}
		)
		it(
			"daylight saving overlap keeps the hour",
			() => {
				const second = new Date("2024-11-03T06:30:00.500Z")
				assert.equal(
					startOf(second, "H", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:00:00.000Z")
				)
				assert.equal(
					startOf(second, "m", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:30:00.000Z")
				)
				assert.equal(
					startOf(second, "s", "America/New_York").getTime(),
					Date.parse("2024-11-03T06:30:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("2024-10-27T01:30:00.000Z"),
						"H",
						"Europe/London"
					).getTime(),
					Date.parse("2024-10-27T01:00:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1911-12-31T15:30:00.001Z"),
						"H",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1911-12-31T15:30:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1911-03-10T23:51:09.000Z"),
						"H",
						"Europe/Paris"
					).getTime(),
					Date.parse("1911-03-10T23:50:39.000Z")
				)
				for (const date of dst_dates) {
					for (const [ unit, format, length ] of /** @type {const} */([
						[ "H", "YYYY-MM-DD HH", 3600000 ],
						[ "m", "YYYY-MM-DD HH:mm", 60000 ],
						[ "s", "YYYY-MM-DD HH:mm:ss", 1000 ]
					])/**/) {
						const start = startOf(date, unit)
						assert.isAtMost(start.getTime(), date.getTime())
						assert.isBelow(
							date.getTime() - start.getTime(),
							length
						)
						assert.equal(
							dateToString(start, format),
							dateToString(date, format)
						)
						const previous = new Date(start.getTime() - 1)
						assert.isTrue(
							dateToString(previous, format) != dateToString(start, format)
							|| previous.getTimezoneOffset() != start.getTimezoneOffset()
						)
					}
				}
			}
		)
		it(
			"gap inside the first hour of a day",
			() => {
				const later = new Date("1919-03-31T06:00:00.000Z")
				assert.equal(
					startOf(later, "D", "America/Toronto").getTime(),
					Date.parse("1919-03-31T04:30:00.000Z")
				)
				assert.equal(
					startOf(later, "W", "America/Toronto").getTime(),
					Date.parse("1919-03-31T04:30:00.000Z")
				)
				const tz = process.env["TZ"]
				try {
					for (const [ text, unit, zone, start ] of /** @type {const} */([
						[
							"1919-03-31T06:00:00.000Z",
							"D",
							"America/Toronto",
							"1919-03-31T04:30:00.000Z"
						],
						[
							"1938-06-01T12:00:00.000Z",
							"Y",
							"America/Lima",
							"1938-01-01T05:00:00.000Z"
						],
						[
							"1949-05-28T12:00:00.000Z",
							"M",
							"Asia/Shanghai",
							"1949-04-30T16:00:00.000Z"
						],
						[
							"2004-06-01T00:00:00.000Z",
							"Y",
							"Asia/Khandyga",
							"2003-12-31T15:00:00.000Z"
						]
					])/**/) {
						process.env["TZ"] = zone
						const date = new Date(text)
						assert.equal(
							startOf(date, unit, zone).getTime(),
							Date.parse(start),
							zone
						)
						assert.equal(
							startOf(date, unit).getTime(),
							Date.parse(start),
							zone
						)
					}
				} finally {
					process.env["TZ"] = tz
				}
			}
		)
		it(
			"gap that crosses midnight in the local time zone",
			() => {
				const tz = process.env["TZ"]
				try {
					process.env["TZ"] = "America/St_Johns"
					const week = new Date("1919-05-12T02:30:51.999Z")
					assert.equal(
						dateToString(startOf(week, "W")),
						"1919-05-05T00:00:00.000"
					)
					assert.equal(
						dateToString(startOf(week, "M")),
						"1919-05-01T00:00:00.000"
					)
					assert.equal(
						dateToString(
							startOf(
								new Date("1921-06-01T02:30:51.999Z"),
								"M"
							)
						),
						"1921-05-01T00:00:00.000"
					)
					assert.equal(
						dateToString(
							startOf(
								new Date("1919-12-31T12:00:00.000Z"),
								"Y"
							)
						),
						"1919-01-01T00:00:00.000"
					)
					assert.equal(
						startOf(
							new Date("1987-04-05T03:31:00.000Z"),
							"H"
						).getTime(),
						Date.parse("1987-04-05T03:31:00.000Z")
					)
					process.env["TZ"] = "America/Toronto"
					assert.equal(
						startOf(
							new Date("1919-03-31T04:45:00.000Z"),
							"D"
						).getTime(),
						Date.parse("1919-03-31T04:30:00.000Z")
					)
					process.env["TZ"] = "Europe/Moscow"
					assert.equal(
						startOf(
							new Date("1921-02-14T20:30:00.000Z"),
							"D"
						).getTime(),
						Date.parse("1921-02-14T20:00:00.000Z")
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
					startOf(new Date(NaN), "D").getTime()
				)
				for (const unit of [ "x", "sss", "d", "toString", "" ]) {
					assert.throws(
						() => startOf(
							new Date(0),
							/** @type {never} */(unit)/**/
						),
						RangeError,
						"Invalid unit"
					)
				}
			}
		)
		it(
			"keeps the given date",
			() => {
				const date = new Date(2024, 2, 4, 11, 22, 33, 444)
				const start = startOf(date, "D")
				assert.equal(date.getHours(), 11)
				assert.notEqual(start, date)
			}
		)
		it(
			"offsets that change by seconds in the local time zone",
			() => {
				const tz = process.env["TZ"]
				try {
					for (const [ zone, text, unit ] of /** @type {const} */([
						[
							"America/St_Johns",
							"1935-03-30T03:31:00.000Z",
							"H"
						],
						[
							"America/Caracas",
							"1890-01-01T04:28:00.000Z",
							"m"
						],
						[
							"Asia/Kolkata",
							"1854-06-27T18:06:32.000Z",
							"H"
						]
					])/**/) {
						process.env["TZ"] = zone
						const date = new Date(text)
						assert.equal(
							startOf(date, unit).getTime(),
							startOf(date, unit, zone).getTime(),
							zone
						)
					}
					process.env["TZ"] = "Asia/Seoul"
					assert.isNaN(
						startOf(new Date(-8.64e15), "D").getTime()
					)
				} finally {
					process.env["TZ"] = tz
				}
			}
		)
		it(
			"time zone",
			() => {
				const date = new Date("2024-07-15T12:00:00.000Z")
				assert.equal(
					startOf(date, "D", "Asia/Seoul").getTime(),
					Date.parse("2024-07-14T15:00:00.000Z")
				)
				assert.equal(
					startOf(date, "D", "UTC").getTime(),
					Date.parse("2024-07-15T00:00:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("2024-03-10T12:00:00.000Z"),
						"D",
						"America/New_York"
					).getTime(),
					Date.parse("2024-03-10T05:00:00.000Z")
				)
				assert.equal(
					startOf(date, "M", "Asia/Seoul").getTime(),
					Date.parse("2024-06-30T15:00:00.000Z")
				)
				assert.equal(
					startOf(date, "W", "Asia/Seoul").getTime(),
					Date.parse("2024-07-14T15:00:00.000Z")
				)
				assert.equal(
					startOf(date, "Y", "UTC").getTime(),
					Date.parse("2024-01-01T00:00:00.000Z")
				)
			}
		)
		it(
			"unit that starts inside a daylight saving gap",
			() => {
				assert.equal(
					startOf(
						new Date("1919-03-31T04:45:00.000Z"),
						"D",
						"America/Toronto"
					).getTime(),
					Date.parse("1919-03-31T04:30:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1987-04-05T03:31:00.000Z"),
						"H",
						"America/St_Johns"
					).getTime(),
					Date.parse("1987-04-05T03:31:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1974-11-02T14:10:00.000Z"),
						"H",
						"Pacific/Chatham"
					).getTime(),
					Date.parse("1974-11-02T14:00:00.000Z")
				)
				assert.equal(
					startOf(
						new Date("1905-12-31T18:38:50.291Z"),
						"m",
						"Asia/Kolkata"
					).getTime(),
					Date.parse("1905-12-31T18:38:50.000Z")
				)
				assert.equal(
					startOf(
						new Date("1916-07-01T05:00:30.000Z"),
						"m",
						"America/Santiago"
					).getTime(),
					Date.parse("1916-07-01T05:00:00.000Z")
				)
			}
		)
		it(
			"units",
			() => {
				const date = new Date(2024, 2, 4, 11, 22, 33, 444)
				assert.equal(
					dateToString(startOf(date, "Y")),
					"2024-01-01T00:00:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "M")),
					"2024-03-01T00:00:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "W")),
					"2024-03-04T00:00:00.000"
				)
				assert.equal(
					dateToString(
						startOf(new Date(2024, 2, 3), "W")
					),
					"2024-02-26T00:00:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "D")),
					"2024-03-04T00:00:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "H")),
					"2024-03-04T11:00:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "m")),
					"2024-03-04T11:22:00.000"
				)
				assert.equal(
					dateToString(startOf(date, "s")),
					"2024-03-04T11:22:33.000"
				)
			}
		)
		it(
			"units stay within their occurrence around every transition",
			() => {
				const tz = process.env["TZ"]
				try {
					for (const zone of /** @type {const} */([
						"Australia/Lord_Howe",
						"Pacific/Chatham",
						"Europe/Paris",
						"America/St_Johns",
						"Asia/Kolkata",
						"America/New_York"
					])/**/) {
						const format = new Intl.DateTimeFormat(
							"en-US",
							{
								timeZone: zone,
								timeZoneName: "longOffset"
							}
						)
						/**
						 * @param {number} time
						 * @returns {string}
						 */
						function offset(time) {
							return format.format(time)
						}
						/** @type {number[]} */
						const transitions = []
						for (let time = Date.parse("1880-01-01T00:00:00Z"); time < Date.parse("2030-01-01T00:00:00Z"); time += 86400000) {
							if (offset(time).slice(-9) === offset(time + 86400000).slice(-9)) continue
							let low = time
							let high = time + 86400000
							while (high - low > 1) {
								const middle = Math.floor((low + high) / 2)
								if (offset(middle).slice(-9) === offset(high).slice(-9)) high = middle
								else low = middle
							}
							transitions.push(high)
						}
						process.env["TZ"] = zone
						for (const transition of transitions) {
							for (let step = -5400000; step <= 5400000; step += 900000) {
								const date = new Date(transition + step)
								for (const [ unit, length ] of /** @type {const} */([ [ "H", 3600000 ], [ "m", 60000 ] ])/**/) {
									for (const given of [ zone, undefined ]) {
										const start = startOf(date, unit, given).getTime()
										const end = endOf(date, unit, given).getTime()
										const label = `${zone} ${date.toISOString()} ${unit} ${given ?? "local"}`
										assert.isAtMost(start, date.getTime(), label)
										assert.isAtLeast(end, date.getTime(), label)
										assert.isBelow(end - start, length, label)
										assert.equal(
											startOf(new Date(end + 1), unit, given).getTime(),
											end + 1,
											label
										)
									}
								}
							}
						}
					}
				} finally {
					process.env["TZ"] = tz
				}
			},
			30000
		)
	}
)
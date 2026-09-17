import { dateToString, stringToDate } from "datetime-lube"
import { assert, describe, it } from "vitest"
describe(
	"string_to_date",
	() => {
		it(
			"daylight saving gap and overlap with a time zone",
			() => {
				assert.equal(
					stringToDate(
						"2024-03-10 02:30",
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					).getTime(),
					Date.parse("2024-03-10T07:30:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-03-31 01:30",
						"YYYY-MM-DD HH:mm",
						"Europe/London"
					).getTime(),
					Date.parse("2024-03-31T01:30:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-09-08 00:00",
						"YYYY-MM-DD HH:mm",
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-08T04:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-09-08",
						undefined,
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-08T04:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-10-27 01:30",
						"YYYY-MM-DD HH:mm",
						"Europe/London"
					).getTime(),
					Date.parse("2024-10-27T00:30:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-11-03 01:30",
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					).getTime(),
					Date.parse("2024-11-03T05:30:00.000Z")
				)
				assert.equal(
					stringToDate(
						"1912-01-01 00:00",
						"YYYY-MM-DD HH:mm",
						"Asia/Seoul"
					).getTime(),
					Date.parse("1911-12-31T15:30:00.000Z")
				)
			}
		)
		it(
			"formatted",
			() => {
				assert.equal(
					stringToDate(
						"11h22m33s444 _ 2222/03/04",
						"HH mm ss sss _ YYYY MM DD"
					).getTime(),
					new Date(2222, 2, 4, 11, 22, 33, 444).getTime()
				)
				assert.equal(
					stringToDate("2024-6-1", "YYYY-MM-DD").getTime(),
					new Date(2024, 5, 1).getTime()
				)
				const year_zero = new Date(0)
				year_zero.setFullYear(0, 0, 1)
				year_zero.setHours(11, 22, 0, 0)
				assert.equal(
					stringToDate("11:22", "HH:mm").getTime(),
					year_zero.getTime()
				)
				assert.equal(
					stringToDate("09:30", "HH:mm", "Asia/Seoul").getTime(),
					Date.parse("0000-01-01T09:30:00.000Z") - 30472000
				)
				assert.equal(
					dateToString(
						stringToDate("09:30", "HH:mm", "UTC"),
						"HH:mm",
						"UTC"
					),
					"09:30"
				)
				assert.equal(
					dateToString(
						stringToDate(
							"2024-07-15 09:30",
							"YYYY-MM-DD HH:mm",
							"Asia/Seoul"
						),
						undefined,
						"UTC"
					),
					"2024-07-15T00:30:00.000"
				)
				year_zero.setHours(0, 0, 33, 444)
				assert.equal(
					stringToDate("444 33", "sss ss").getTime(),
					year_zero.getTime()
				)
			}
		)
		it(
			"invalid values",
			() => {
				assert.isNaN(
					stringToDate("2222-02-30", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate(
						"2222-03-04T24:00",
						"YYYY-MM-DDTHH:mm"
					).getTime()
				)
				assert.isNaN(
					stringToDate("no", "YYYY").getTime()
				)
				assert.isNaN(stringToDate("").getTime())
				assert.isNaN(
					stringToDate("2024-13-01", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate("1900-02-29", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate("2100-02-29", "YYYY-MM-DD").getTime()
				)
				assert.equal(
					stringToDate("2000-02-29", "YYYY-MM-DD").getTime(),
					new Date(2000, 1, 29).getTime()
				)
				for (const text of [
					"2024-02-30",
					"2023-02-29",
					"2024-13-01",
					"2024-00-10",
					"2024-07-00",
					"2024-07-15T24:01",
					"2024-07-15T24:00:00.001",
					"2024-07-15T25:00",
					"2024-07-15T23:60",
					"2024-07-15T23:59:60",
					"2024-07-15T24:00:01Z"
				]) {
					assert.isNaN(
						stringToDate(text).getTime(),
						text
					)
					assert.isNaN(
						stringToDate(text, undefined, "Asia/Seoul").getTime(),
						text
					)
				}
				assert.isNaN(
					stringToDate("2024-07-15 junk", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate(
						"2024-07-15T09:00Z",
						"YYYY-MM-DDTHH:mm"
					).getTime()
				)
				assert.isNaN(
					stringToDate("2024", "YYYY년").getTime()
				)
				assert.equal(
					stringToDate("2024년", "YYYY년").getTime(),
					new Date(2024, 0, 1).getTime()
				)
				assert.equal(
					stringToDate(
						"2024-07-15T09:00:00.123456",
						"YYYY-MM-DDTHH:mm:ss.sss"
					).getTime(),
					new Date(2024, 6, 15, 9, 0, 0, 123).getTime()
				)
				assert.isNaN(
					stringToDate("-000000-01-01", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate("+12345-01-01", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate("+275761-01-01", "YYYY-MM-DD").getTime()
				)
				assert.isNaN(
					stringToDate("-", "YYYY").getTime()
				)
			}
		)
		it(
			"offsets after AM and PM, fractions and astral characters",
			() => {
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 PM-05:00",
						undefined,
						"Asia/Tokyo"
					).getTime(),
					Date.parse("2024-07-15T17:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:34:5+0900",
						undefined,
						"America/New_York"
					).getTime(),
					Date.parse("2024-07-15T03:34:05.000Z")
				)
				const tz = process.env["TZ"]
				try {
					for (const local of [
						"UTC",
						"Asia/Seoul",
						"America/Los_Angeles"
					]) {
						process.env["TZ"] = local
						assert.equal(
							stringToDate(
								"+275760-09-13T00:00",
								undefined,
								"Asia/Seoul"
							).getTime(),
							8639999967600000,
							local
						)
						assert.equal(
							stringToDate(
								"-271821-04-20T00:00",
								undefined,
								"America/New_York"
							).getTime(),
							-8639999982238000,
							local
						)
					}
				} finally {
					process.env["TZ"] = tz
				}
				assert.equal(
					stringToDate(
						"2024-07-15T12:00:00.5",
						"YYYY-MM-DDTHH:mm:ss.sss",
						"UTC"
					).getTime(),
					Date.parse("2024-07-15T12:00:00.500Z")
				)
				assert.equal(
					stringToDate(
						"2024-07-15T12:00:00.05",
						"YYYY-MM-DDTHH:mm:ss.sss",
						"UTC"
					).getTime(),
					Date.parse("2024-07-15T12:00:00.050Z")
				)
				assert.equal(
					stringToDate(
						"2024\u{1F600}07",
						"YYYY-MM",
						"UTC"
					).getTime(),
					Date.parse("2024-07-01T00:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-07",
						"YYYY\u{1F600}MM",
						"UTC"
					).getTime(),
					Date.parse("2024-07-01T00:00:00.000Z")
				)
			}
		)
		it(
			"platform parser keeps the wall clock of the string",
			() => {
				assert.equal(
					stringToDate(
						"2024-03-10T02:30:00",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-03-09T17:30:00.000Z")
				)
				assert.equal(
					stringToDate(
						"1908-04-01T00:00:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(1908, 3, 1)
				)
				assert.equal(
					stringToDate(
						"2024-07-15T24:00:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 16)
				)
				assert.equal(
					stringToDate(
						"2024-07-15T09:00:00.1",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 9, 0, 0, 100)
				)
				assert.equal(
					stringToDate(
						"2024-07-15 09:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 9)
				)
				assert.equal(
					stringToDate(
						"+002024-07-15T09:00:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 9)
				)
				assert.equal(
					stringToDate("-000001-07-15", undefined, "UTC").getTime(),
					Date.UTC(-1, 6, 15)
				)
				assert.equal(
					stringToDate(
						"2024-07-15T09:00:00+0900",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15)
				)
				assert.equal(
					stringToDate(
						"Mon, 15 Jul 2024 09:00:00 GMT",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.UTC(2024, 6, 15, 9)
				)
				assert.equal(
					stringToDate(
						"Mon Jul 15 2024 09:00:00 GMT+0900 (Korean Standard Time)",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15)
				)
				assert.equal(
					stringToDate(
						"July 15, 2024 09:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 9)
				)
				assert.equal(
					stringToDate("2024-07").getTime(),
					new Date(2024, 6, 1).getTime()
				)
				assert.equal(
					stringToDate("2024").getTime(),
					new Date(2024, 0, 1).getTime()
				)
				assert.equal(
					stringToDate("2024-07", undefined, "UTC").getTime(),
					Date.UTC(2024, 6, 1)
				)
				assert.equal(
					stringToDate("2024-07-15T24:00:00").getTime(),
					new Date(2024, 6, 16).getTime()
				)
				assert.isNaN(
					stringToDate("2024-13-01").getTime()
				)
				assert.isNaN(
					stringToDate("2024-13-01", undefined, "UTC").getTime()
				)
				assert.isNaN(
					stringToDate("2024-07-15T09", undefined, "UTC").getTime()
				)
			}
		)
		it(
			"platform parser reads offsets and wall clocks of other formats",
			() => {
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 EST",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.UTC(2024, 6, 15, 17)
				)
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 pdt",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.UTC(2024, 6, 15, 19)
				)
				assert.equal(
					stringToDate(
						"Thu, 01 Jan 1970 00:00:00 UT",
						undefined,
						"Asia/Seoul"
					).getTime(),
					0
				)
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 -05",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.UTC(2024, 6, 15, 17)
				)
				assert.equal(
					stringToDate(
						"07-15-2024",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.UTC(2024, 6, 14, 15)
				)
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 (EST)",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 12)
				)
				assert.equal(
					stringToDate(
						"Jul 15 2024 12:00 EST5EDT",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 16)
				)
				assert.equal(
					stringToDate(
						"2024-07-15t09:00",
						undefined,
						"UTC"
					).getTime(),
					Date.UTC(2024, 6, 15, 9)
				)
				const tz = process.env["TZ"]
				try {
					process.env["TZ"] = "America/Santiago"
					assert.equal(
						stringToDate("Sep 8 2024", undefined, "UTC").getTime(),
						Date.UTC(2024, 8, 8)
					)
					process.env["TZ"] = "America/New_York"
					assert.equal(
						stringToDate(
							"Mar 10 2024 02:30",
							undefined,
							"Asia/Seoul"
						).getTime(),
						Date.UTC(2024, 2, 9, 17, 30)
					)
					assert.equal(
						stringToDate(
							"Mar 10 2024 02:30 (",
							undefined,
							"UTC"
						).getTime(),
						Date.UTC(2024, 2, 10, 2, 30)
					)
				} finally {
					if (tz === undefined) delete process.env["TZ"]
					else process.env["TZ"] = tz
				}
			}
		)
		it(
			"platform parser without a format",
			() => {
				assert.equal(
					stringToDate("2222-03-04T11:22:33.444").getTime(),
					new Date(2222, 2, 4, 11, 22, 33, 444).getTime()
				)
				assert.equal(
					stringToDate("2024-07-15T12:00:00.000Z").getTime(),
					Date.parse("2024-07-15T12:00:00.000Z")
				)
				assert.equal(
					stringToDate("2024-07-15T12:00:00+09:00").getTime(),
					Date.parse("2024-07-15T03:00:00.000Z")
				)
				assert.equal(
					stringToDate("2024-07-15").getTime(),
					new Date(2024, 6, 15).getTime()
				)
				assert.equal(
					stringToDate("2024-07-15", undefined, "UTC").getTime(),
					Date.parse("2024-07-15T00:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-07-15T09:00:00",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-07-15T00:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-07-15T12:00:00.000Z",
						undefined,
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-07-15T12:00:00.000Z")
				)
				assert.isNaN(
					stringToDate(
						"no such date",
						undefined,
						"Asia/Seoul"
					).getTime()
				)
			}
		)
		it(
			"time zone",
			() => {
				assert.equal(
					stringToDate(
						"2024-07-15 09:00",
						"YYYY-MM-DD HH:mm",
						"Asia/Seoul"
					).getTime(),
					Date.parse("2024-07-15T00:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-01-15 07:00",
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					).getTime(),
					Date.parse("2024-01-15T12:00:00.000Z")
				)
				assert.equal(
					stringToDate(
						"2024-07-15T12:00:00.000",
						"YYYY-MM-DDTHH:mm:ss.sss",
						"UTC"
					).getTime(),
					Date.parse("2024-07-15T12:00:00.000Z")
				)
				assert.equal(
					dateToString(
						stringToDate(
							"2024-03-10 03:30",
							"YYYY-MM-DD HH:mm",
							"America/New_York"
						),
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					),
					"2024-03-10 03:30"
				)
			}
		)
	}
)
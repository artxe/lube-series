import { add, dateToString } from "datetime-lube"
import { assert, describe, it } from "vitest"
describe(
	"add",
	() => {
		it(
			"a zero part keeps the second occurrence",
			() => {
				const second = new Date("2025-11-02T07:30:00.000Z")
				const tz = process.env["TZ"]
				try {
					for (const zone of [ "America/Chicago", undefined ]) {
						process.env["TZ"] = "America/Chicago"
						for (const sum of [
							"0D",
							"0W",
							"0M",
							"0Y",
							"-0D",
							"0Y 0M 0D 0H"
						]) {
							assert.equal(
								add(second, sum, zone).getTime(),
								second.getTime(),
								sum
							)
						}
						for (const sum of [ "1D-1D", "12M-1Y" ]) {
							assert.equal(
								add(second, sum, zone).getTime(),
								Date.parse("2025-11-02T06:30:00.000Z"),
								sum
							)
						}
					}
				} finally {
					if (tz === undefined) delete process.env["TZ"]
					else process.env["TZ"] = tz
				}
			}
		)
		it(
			"clamps to the end of month",
			() => {
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 31), "1M")
					),
					"2024-02-29T00:00:00.000"
				)
				assert.equal(
					dateToString(
						add(new Date(2024, 2, 31), "-1M")
					),
					"2024-02-29T00:00:00.000"
				)
				assert.equal(
					dateToString(
						add(new Date(2024, 1, 29), "1Y")
					),
					"2025-02-28T00:00:00.000"
				)
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 31), "13M")
					),
					"2025-02-28T00:00:00.000"
				)
			}
		)
		it(
			"daylight saving gap moves forward",
			() => {
				assert.equal(
					add(
						new Date("2024-03-09T07:30:00.000Z"),
						"1D",
						"America/New_York"
					).getTime(),
					Date.parse("2024-03-10T07:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2024-09-07T04:30:00.000Z"),
						"1D",
						"America/Santiago"
					).getTime(),
					Date.parse("2024-09-08T04:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2024-03-30T01:30:00.000Z"),
						"1D",
						"Europe/London"
					).getTime(),
					Date.parse("2024-03-31T01:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2024-02-10T07:30:00.000Z"),
						"1M",
						"America/New_York"
					).getTime(),
					Date.parse("2024-03-10T07:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2024-03-09T07:30:00.000Z"),
						"1Y",
						"America/New_York"
					).getTime(),
					Date.parse("2025-03-09T07:30:00.000Z")
				)
			}
		)
		it(
			"daylight saving overlap takes the first occurrence",
			() => {
				assert.equal(
					add(
						new Date("2024-10-26T00:30:00.000Z"),
						"1D",
						"Europe/London"
					).getTime(),
					Date.parse("2024-10-27T00:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2024-11-02T05:30:00.000Z"),
						"1D",
						"America/New_York"
					).getTime(),
					Date.parse("2024-11-03T05:30:00.000Z")
				)
				assert.equal(
					add(
						new Date("2016-09-29T23:14:41.050Z"),
						"1M",
						"Antarctica/Troll"
					).getTime(),
					Date.parse("2016-10-29T23:14:41.050Z")
				)
			}
		)
		it(
			"elapsed time units",
			() => {
				const date = add(new Date(0), "1H 2m 3s 4sss")
				assert.equal(date.getTime(), 3723004)
				assert.equal(
					add(new Date(0), "-1sss").getTime(),
					-1
				)
			}
		)
		it(
			"invalid date",
			() => {
				assert.isNaN(
					add(new Date(NaN), "1D").getTime()
				)
				assert.isNaN(
					add(new Date(NaN), "1D", "UTC").getTime()
				)
				assert.isNaN(
					add(new Date(8.64e15), "1D", "UTC").getTime()
				)
				assert.isNaN(
					add(
						new Date(-8.64e15),
						"-1D",
						"Asia/Seoul"
					).getTime()
				)
				assert.isNaN(
					add(new Date(8.64e15), "1sss1D", "UTC").getTime()
				)
				assert.isNaN(
					add(
						new Date(0),
						`${"9".repeat(400)}M`,
						"UTC"
					).getTime()
				)
				assert.isNaN(
					add(new Date(8.64e15), "1sss1D").getTime()
				)
			}
		)
		it(
			"keeps the given date",
			() => {
				const date = new Date(0)
				const next = add(date, "1D")
				assert.equal(date.getTime(), 0)
				assert.notEqual(next, date)
				assert.equal(
					next.getTime() - date.getTime(),
					86400000
				)
			}
		)
		it(
			"many distinct sums",
			() => {
				for (let i = 0; i < 2500; i++) {
					assert.equal(
						add(new Date(0), `${i}m`).getTime(),
						i * 60000
					)
				}
				assert.equal(
					add(new Date(0), "7m").getTime(),
					420000
				)
			}
		)
		it(
			"order of units",
			() => {
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 30), "1M-1D")
					),
					"2024-02-28T00:00:00.000"
				)
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 30), "-1D1M")
					),
					"2024-02-29T00:00:00.000"
				)
			}
		)
		it(
			"rejects a malformed sum",
			() => {
				for (const sum of [
					"1.5D",
					"1d",
					"1 D",
					"D",
					"1",
					"--1D",
					"1D x",
					"",
					"  "
				]) {
					assert.throws(
						() => add(new Date(0), sum),
						RangeError,
						sum
					)
				}
				assert.equal(
					add(new Date(0), " +1D  2H ").getTime(),
					93600000
				)
			}
		)
		it(
			"time zone",
			() => {
				const date = new Date("2024-03-10T06:30:00.000Z")
				assert.equal(
					dateToString(
						add(date, "1D", "America/New_York"),
						"YYYY-MM-DDTHH:mm:ss.sss",
						"America/New_York"
					),
					"2024-03-11T01:30:00.000"
				)
				assert.equal(
					add(date, "1D", "America/New_York").getTime() - date.getTime(),
					82800000
				)
				assert.equal(
					add(date, "24H", "America/New_York").getTime() - date.getTime(),
					86400000
				)
				assert.equal(
					dateToString(
						add(
							new Date("2024-01-31T12:00:00.000Z"),
							"1M",
							"Asia/Seoul"
						),
						"YYYY-MM-DD HH:mm",
						"Asia/Seoul"
					),
					"2024-02-29 21:00"
				)
				assert.equal(
					dateToString(
						add(
							new Date("2024-02-29T12:00:00.000Z"),
							"1Y",
							"Asia/Seoul"
						),
						"YYYY-MM-DD HH:mm",
						"Asia/Seoul"
					),
					"2025-02-28 21:00"
				)
			}
		)
		it(
			"weeks follow the clock",
			() => {
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 31), "1W")
					),
					"2024-02-07T00:00:00.000"
				)
				assert.equal(
					dateToString(
						add(new Date(2024, 0, 8), "-1W")
					),
					"2024-01-01T00:00:00.000"
				)
				const date = new Date("2024-03-09T06:30:00.000Z")
				assert.equal(
					add(date, "1W", "America/New_York").getTime() - date.getTime(),
					7 * 86400000 - 3600000
				)
			}
		)
	}
)
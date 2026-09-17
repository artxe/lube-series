import {
	add,
	dateToString,
	diff,
	stringToDate
} from "datetime-lube"
import { assert, describe, it } from "vitest"
const dst_dates = [
	"2011-12-29T12:00:00.000Z",
	"2011-12-30T22:00:00.000Z",
	"2012-01-02T12:00:00.000Z",
	"2024-03-10T06:30:00.000Z",
	"2024-11-03T06:30:00.000Z",
	"2024-09-08T04:30:00.000Z",
	"1950-01-01T13:30:00.000Z",
	"1908-03-31T15:00:00.000Z"
].map(iso => new Date(iso))
/**
 * @param {Date} date
 * @returns {number}
 */
function utc_day(date) {
	const [ year = 0, month = 0, day = 0 ] = dateToString(date, "YYYY MM DD").split(" ")
		.map(Number)
	return Date.UTC(year, month - 1, day)
}
describe(
	"diff",
	() => {
		it(
			"calendar days over a skipped day",
			() => {
				const before = new Date("2011-12-29T12:00:00.000Z")
				const after = new Date("2011-12-30T22:00:00.000Z")
				assert.equal(
					diff(before, after, "D", "Pacific/Apia"),
					2
				)
				assert.equal(
					diff(after, before, "D", "Pacific/Apia"),
					-2
				)
				assert.equal(
					diff(
						new Date("2011-12-26T12:00:00.000Z"),
						new Date("2012-01-02T12:00:00.000Z"),
						"W",
						"Pacific/Apia"
					),
					1
				)
				for (const from of dst_dates) {
					for (const to of dst_dates) {
						assert.equal(
							diff(from, to, "D"),
							Math.round(
								(utc_day(to) - utc_day(from)) / 86400000
							)
						)
					}
				}
			}
		)
		it(
			"calendar units",
			() => {
				assert.equal(
					diff(
						new Date(2024, 0, 31),
						new Date(2024, 2, 1),
						"M"
					),
					1
				)
				assert.equal(
					diff(
						new Date(2024, 0, 31),
						new Date(2024, 1, 29),
						"M"
					),
					1
				)
				assert.equal(
					diff(
						new Date(2024, 0, 31, 12),
						new Date(2024, 1, 29, 11),
						"M"
					),
					0
				)
				assert.equal(
					diff(
						new Date(2024, 1, 29),
						new Date(2025, 1, 28),
						"Y"
					),
					1
				)
				assert.equal(
					diff(
						new Date(2024, 1, 29),
						new Date(2025, 1, 27, 23),
						"Y"
					),
					0
				)
				assert.equal(
					diff(
						new Date(2024, 2, 31),
						new Date(2024, 3, 30),
						"M"
					),
					1
				)
				assert.equal(
					diff(
						new Date(2024, 2, 31),
						new Date(2024, 1, 29),
						"M"
					),
					-1
				)
				assert.equal(
					diff(
						new Date(2024, 1, 29),
						new Date(2023, 1, 28),
						"Y"
					),
					-1
				)
				assert.equal(
					diff(
						new Date(2024, 2, 1),
						new Date(2024, 0, 31),
						"M"
					),
					-1
				)
				assert.equal(
					diff(
						new Date(2024, 2, 1),
						new Date(2024, 1, 1),
						"M"
					),
					-1
				)
				assert.equal(
					diff(
						new Date(2024, 0, 1),
						new Date(2024, 0, 31),
						"D"
					),
					30
				)
				assert.equal(
					diff(
						new Date(2024, 0, 1, 23),
						new Date(2024, 0, 2, 1),
						"D"
					),
					1
				)
				assert.equal(
					diff(
						new Date(2024, 0, 1),
						new Date(2024, 0, 15),
						"W"
					),
					2
				)
			}
		)
		it(
			"elapsed units",
			() => {
				const from = new Date(0)
				assert.equal(
					diff(from, new Date(3723004), "H"),
					1
				)
				assert.equal(
					diff(from, new Date(3723004), "m"),
					62
				)
				assert.equal(
					diff(from, new Date(3723004), "s"),
					3723
				)
				assert.equal(
					diff(from, new Date(3723004), "sss"),
					3723004
				)
				assert.equal(
					diff(new Date(3723004), from, "m"),
					-62
				)
			}
		)
		it(
			"invalid date",
			() => {
				assert.isNaN(
					diff(new Date(NaN), new Date(0), "D")
				)
				assert.isNaN(
					diff(new Date(0), new Date(NaN), "D")
				)
			}
		)
		it(
			"invalid unit",
			() => {
				for (const unit of [ "x", "d", "toString", "SSS", "" ]) {
					assert.throws(
						() => diff(
							new Date(0),
							new Date(1e10),
							/** @type {never} */(unit)/**/
						),
						RangeError,
						"Invalid unit"
					)
				}
			}
		)
		it(
			"inverts add at the end of a month",
			() => {
				for (const zone of /** @type {const} */([
					undefined,
					"UTC",
					"America/New_York"
				])/**/) {
					for (let month = 0; month < 12; month++) {
						for (let day = 28; day <= 31; day++) {
							const from = stringToDate(
								`2024-${String(month + 1).padStart(2, "0")}-${day} 12:34`,
								"YYYY-MM-DD HH:mm",
								zone
							)
							if (isNaN(from.getTime())) continue
							for (let months = -14; months <= 14; months++) {
								const to = add(from, `${months}M`, zone)
								assert.equal(
									diff(from, to, "M", zone),
									months,
									`${dateToString(from)} ${months}`
								)
								assert.equal(
									diff(from, to, "Y", zone),
									Math.trunc(months / 12) + 0
								)
								assert.equal(
									diff(
										from,
										add(
											to,
											months < 0 ? "1sss" : "-1sss"
										),
										"M",
										zone
									),
									months - Math.sign(months)
								)
							}
						}
					}
				}
			}
		)
		it(
			"months reached in a repeated hour and no negative zero",
			() => {
				const from = new Date("2024-10-03T05:30:00.000Z")
				const to = new Date("2024-11-03T06:10:00.000Z")
				assert.equal(
					diff(from, to, "M", "America/New_York"),
					1
				)
				/**
				 * @param {string} text
				 * @param {import("datetime-lube").TimeZone} zone
				 * @returns {Date}
				 */
				function wall(text, zone) {
					return stringToDate(text, "YYYY-MM-DD HH:mm:ss", zone)
				}
				const johns = wall(
					"2009-10-01 00:00:00",
					"America/St_Johns"
				)
				assert.deepEqual(
					[
						"2009-11-01T02:29:59.999Z",
						"2009-11-01T02:30:00.000Z",
						"2009-11-01T03:00:00.000Z",
						"2009-11-01T03:31:00.000Z"
					].map(
						text => diff(
							johns,
							new Date(text),
							"M",
							"America/St_Johns"
						)
					),
					[ 0, 1, 1, 1 ]
				)
				assert.equal(
					diff(
						wall(
							"2009-12-01 00:00:00",
							"America/St_Johns"
						),
						new Date("2009-11-01T03:00:00.000Z"),
						"M",
						"America/St_Johns"
					),
					0
				)
				assert.equal(
					diff(
						wall(
							"1979-01-31 23:30:00",
							"Europe/Sofia"
						),
						wall(
							"1979-04-01 00:10:00",
							"Europe/Sofia"
						),
						"M",
						"Europe/Sofia"
					),
					1
				)
				assert.equal(
					diff(
						wall(
							"1844-10-31 12:00:00",
							"Asia/Manila"
						),
						wall(
							"1845-01-01 01:00:00",
							"Asia/Manila"
						),
						"M",
						"Asia/Manila"
					),
					1
				)
				assert.equal(
					diff(
						new Date("+275760-08-13T12:00:00.000Z"),
						new Date(8.64e15),
						"M",
						"UTC"
					),
					0
				)
				const now = new Date("2024-07-15T12:00:00.000Z")
				const earlier = new Date("2024-07-15T11:30:00.000Z")
				for (const unit of /** @type {const} */([ "H", "W", "Y" ])/**/) {
					assert.isTrue(
						Object.is(
							diff(now, earlier, unit, "UTC"),
							0
						),
						unit
					)
				}
			}
		)
		it(
			"time zone",
			() => {
				const from = new Date("2024-03-10T04:30:00.000Z")
				const to = new Date("2024-03-11T04:30:00.000Z")
				assert.equal(
					diff(from, to, "D", "America/New_York"),
					2
				)
				assert.equal(
					diff(from, to, "H", "America/New_York"),
					24
				)
				assert.equal(
					diff(
						new Date("2024-01-31T12:00:00.000Z"),
						new Date("2024-03-01T12:00:00.000Z"),
						"M",
						"Asia/Seoul"
					),
					1
				)
				assert.equal(
					diff(
						new Date("2024-03-10T06:00:00.000Z"),
						new Date("2024-03-10T07:30:00.000Z"),
						"D",
						"America/New_York"
					),
					0
				)
			}
		)
	}
)
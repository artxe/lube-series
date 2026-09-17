import { dateToString, stringToDate } from "datetime-lube"
import { assert, describe, it } from "vitest"
describe(
	"date_to_string",
	() => {
		it(
			"default format",
			() => {
				assert.equal(
					dateToString(
						new Date(2222, 2, 4, 11, 22, 33, 444)
					),
					"2222-03-04T11:22:33.444"
				)
			}
		)
		it(
			"expanded years",
			() => {
				const late = new Date(2000, 0, 1)
				late.setFullYear(12345)
				assert.equal(
					dateToString(late),
					"+012345-01-01T00:00:00.000"
				)
				const early = new Date(2000, 0, 1)
				early.setFullYear(-5)
				assert.equal(
					dateToString(early),
					"-000005-01-01T00:00:00.000"
				)
				assert.equal(
					dateToString(early, "YYYY/MM"),
					"-000005/01"
				)
				for (let i = 0; i < 1500; i++) {
					assert.equal(
						dateToString(late, `YYYY ${i}`),
						`+012345 ${i}`
					)
					assert.equal(
						stringToDate(`+012345 ${i}`, `YYYY ${i}`).getTime(),
						late.getTime()
					)
				}
				const first = new Date(2000, 0, 1)
				first.setFullYear(0)
				assert.equal(
					dateToString(first, "YYYY"),
					"0000"
				)
				first.setFullYear(9999)
				assert.equal(
					dateToString(first, "YYYY"),
					"9999"
				)
				for (const date of [ late, early ]) {
					assert.equal(
						stringToDate(dateToString(date)).getTime(),
						date.getTime()
					)
					assert.equal(
						stringToDate(
							dateToString(date, "YYYY-MM-DD HH:mm"),
							"YYYY-MM-DD HH:mm"
						).getTime(),
						date.getTime()
					)
					assert.equal(
						stringToDate(
							dateToString(date, undefined, "Asia/Seoul"),
							undefined,
							"Asia/Seoul"
						).getTime(),
						date.getTime()
					)
				}
				assert.equal(
					dateToString(
						new Date(-8.64e15),
						undefined,
						"UTC"
					),
					"-271821-04-20T00:00:00.000"
				)
			}
		)
		it(
			"invalid date",
			() => {
				assert.equal(
					dateToString(new Date(NaN)),
					"Invalid Date"
				)
				assert.equal(
					dateToString(new Date(NaN), "YYYY", "UTC"),
					"Invalid Date"
				)
			}
		)
		it(
			"keeps a bounded number of time zone formatters",
			() => {
				const date = new Date("2024-07-15T12:00:00.000Z")
				const native = Intl.DateTimeFormat
				let created = 0
				Intl.DateTimeFormat = /** @type {typeof Intl.DateTimeFormat} */(/** @type {unknown} */(class extends native {
					/**
					 * @param {ConstructorParameters<typeof Intl.DateTimeFormat>} args
					 */
					constructor(...args) {
						super(...args)
						created++
					}
				}))/**/
				try {
					const zone = "America/New_York"
					/**
					 * @param {number} bits
					 * @returns {import("datetime-lube").TimeZone}
					 */
					function spell(bits) {
						let rest = bits
						return [ ...zone ].map(
							letter => {
								if (letter.toUpperCase() == letter.toLowerCase()) return letter
								const upper = rest & 1
								rest >>= 1
								return upper
									? letter.toUpperCase()
									: letter.toLowerCase()
							}
						).join("")
					}
					for (let bits = 0; bits < 1100; bits++) {
						assert.equal(
							dateToString(date, "HH", spell(bits)),
							"08"
						)
					}
					const before = created
					dateToString(date, "HH", spell(0))
					assert.equal(created, before + 1)
					dateToString(date, "HH", spell(0))
					assert.equal(created, before + 1)
				} finally {
					Intl.DateTimeFormat = native
				}
			}
		)
		it(
			"literal text and repeated tokens",
			() => {
				const date = new Date(2222, 2, 4, 11, 22, 33, 444)
				assert.equal(
					dateToString(
						date,
						"HHhmmmssSsss _ YYYY/MM/DD"
					),
					"11h22m33S444 _ 2222/03/04"
				)
				assert.equal(
					dateToString(date, "DD.MM.DD"),
					"04.03.04"
				)
				assert.equal(
					dateToString(date, "sss ss"),
					"444 33"
				)
				assert.equal(
					dateToString(date, "[YYYY]"),
					"[2222]"
				)
			}
		)
		it(
			"padding",
			() => {
				assert.equal(
					dateToString(
						new Date(-1, 0, 2, 3, 4, 5, 6),
						"YYYY-MM-DDTHH:mm:ss.sss"
					),
					"-000001-01-02T03:04:05.006"
				)
				const year_7 = new Date(2024, 0, 1)
				year_7.setFullYear(7)
				assert.equal(
					dateToString(year_7, "YYYY"),
					"0007"
				)
			}
		)
		it(
			"range edges with a time zone",
			() => {
				assert.equal(
					dateToString(
						new Date(8.64e15),
						undefined,
						"Asia/Seoul"
					),
					"+275760-09-13T09:00:00.000"
				)
				assert.equal(
					dateToString(
						new Date(-8.64e15),
						undefined,
						"America/New_York"
					),
					"-271821-04-19T19:03:58.000"
				)
				assert.equal(
					dateToString(
						new Date(-1),
						"YYYY-MM-DD HH:mm:ss.sss",
						"UTC"
					),
					"1969-12-31 23:59:59.999"
				)
			}
		)
		it(
			"time zone",
			() => {
				const date = new Date("2024-07-15T12:00:00.000Z")
				assert.equal(
					dateToString(
						date,
						"YYYY-MM-DDTHH:mm:ss.sss",
						"UTC"
					),
					"2024-07-15T12:00:00.000"
				)
				assert.equal(
					dateToString(
						date,
						"YYYY-MM-DD HH:mm",
						"Asia/Seoul"
					),
					"2024-07-15 21:00"
				)
				assert.equal(
					dateToString(
						date,
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					),
					"2024-07-15 08:00"
				)
				assert.equal(
					dateToString(
						new Date("2024-01-15T12:00:00.000Z"),
						"YYYY-MM-DD HH:mm",
						"America/New_York"
					),
					"2024-01-15 07:00"
				)
			}
		)
		it(
			"wall clock of a time zone",
			() => {
				for (const [ iso, zone, wall ] of /** @type {const} */([
					[
						"2024-01-15T12:00:00.000Z",
						"America/New_York",
						"2024-01-15T07:00:00.000"
					],
					[
						"2024-07-15T12:00:00.000Z",
						"America/New_York",
						"2024-07-15T08:00:00.000"
					],
					[
						"2024-01-15T12:00:00.000Z",
						"Europe/London",
						"2024-01-15T12:00:00.000"
					],
					[
						"2024-07-15T12:00:00.000Z",
						"Europe/London",
						"2024-07-15T13:00:00.000"
					],
					[
						"1900-01-01T00:00:00.000Z",
						"Asia/Seoul",
						"1900-01-01T08:27:52.000"
					],
					[
						"2024-01-15T12:00:00.123Z",
						"America/St_Johns",
						"2024-01-15T08:30:00.123"
					],
					[
						"2024-01-15T12:00:00.000Z",
						"Asia/Kolkata",
						"2024-01-15T17:30:00.000"
					],
					[
						"2024-01-15T12:00:00.000Z",
						"Pacific/Chatham",
						"2024-01-16T01:45:00.000"
					]
				])/**/) {
					assert.equal(
						dateToString(new Date(iso), undefined, zone),
						wall
					)
				}
				const early = new Date(0)
				early.setUTCFullYear(-100, 0, 15)
				early.setUTCHours(12, 0, 0, 0)
				assert.equal(
					dateToString(early, undefined, "UTC"),
					"-000100-01-15T12:00:00.000"
				)
			}
		)
	}
)
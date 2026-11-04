import {
	add,
	dateToString,
	diff,
	endOf,
	startOf,
	stringToDate,
	timeZoneOffset
} from "datetime-lube"
import { assert, describe, it } from "vitest"
const invalid = new Date(NaN)
const zone = /** @type {never} */("Nowhere/Nothing")/**/
/**
 * @param {() => unknown} call
 * @param {ErrorConstructor | RangeErrorConstructor | TypeErrorConstructor} type
 */
function throws(call, type) {
	assert.throws(call, type)
}
describe(
	"errors",
	() => {
		it(
			"accepts a Date of another realm",
			async () => {
				const { runInNewContext } = await import("node:vm")
				/** @type {Date} */
				const date = runInNewContext("new Date(86400000)")
				assert.equal(
					add(date, "1D", "UTC").getTime(),
					172800000
				)
				assert.equal(
					dateToString(date, "YYYY-MM-DD", "UTC"),
					"1970-01-02"
				)
			}
		)
		it(
			"checks the time zone of an invalid date",
			() => {
				for (const call of /** @type {(() => unknown)[]} */([
					() => add(invalid, "1D", zone),
					() => dateToString(invalid, undefined, zone),
					() => diff(invalid, invalid, "D", zone),
					() => endOf(invalid, "D", zone),
					() => startOf(invalid, "D", zone),
					() => stringToDate("x", undefined, zone),
					() => stringToDate("x", "YYYY", zone),
					() => stringToDate("2024-02-30", undefined, zone),
					() => timeZoneOffset(invalid, zone)
				])/**/) {
					throws(call, RangeError)
				}
				throws(
					() => add(invalid, "1d"),
					RangeError
				)
			}
		)
		it(
			"keeps the cause",
			() => {
				try {
					timeZoneOffset(new Date(0), zone)
					assert.fail("no error")
				} catch (error) {
					assert.instanceOf(
						/** @type {Error} */(error)/**/.cause,
						RangeError
					)
				}
			}
		)
		it(
			"rejects what is not a Date",
			() => {
				const values = /** @type {never[]} */([
					"2024-01-01",
					0,
					null,
					undefined,
					{},
					Object.create(Date.prototype)
				])/**/
				for (const value of values) {
					throws(
						() => add(value, "1D"),
						TypeError
					)
					throws(
						() => dateToString(value),
						TypeError
					)
					throws(
						() => diff(new Date(0), value, "D"),
						TypeError
					)
					throws(
						() => diff(value, new Date(0), "D"),
						TypeError
					)
					throws(
						() => endOf(value, "D"),
						TypeError
					)
					throws(
						() => startOf(value, "D"),
						TypeError
					)
					throws(
						() => timeZoneOffset(value, "UTC"),
						TypeError
					)
				}
				throws(
					() => stringToDate(/** @type {never} */(0)/**/),
					TypeError
				)
			}
		)
	}
)
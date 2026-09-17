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
 * @param {string} message
 */
function throws(call, type, message) {
	try {
		call()
	} catch (error) {
		assert.instanceOf(error, type)
		assert.equal(
			/** @type {Error} */(error)/**/.message,
			message
		)
		return
	}
	assert.fail(`${message} was not thrown`)
}
describe(
	"errors",
	() => {
		it(
			"accepts a Date of another realm",
			async () => {
				const { runInNewContext } = await import("node:vm")
				const date = /** @type {Date} */(runInNewContext("new Date(86400000)"))/**/
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
				for (const [ name, call ] of /** @type {[string, () => unknown][]} */([
					[
						"add",
						() => add(invalid, "1D", zone)
					],
					[
						"dateToString",
						() => dateToString(invalid, undefined, zone)
					],
					[
						"diff",
						() => diff(invalid, invalid, "D", zone)
					],
					[
						"endOf",
						() => endOf(invalid, "D", zone)
					],
					[
						"startOf",
						() => startOf(invalid, "D", zone)
					],
					[
						"stringToDate",
						() => stringToDate("x", undefined, zone)
					],
					[
						"stringToDate",
						() => stringToDate("x", "YYYY", zone)
					],
					[
						"stringToDate",
						() => stringToDate("2024-02-30", undefined, zone)
					],
					[
						"timeZoneOffset",
						() => timeZoneOffset(invalid, zone)
					]
				])/**/) {
					throws(
						call,
						RangeError,
						`${name}: Invalid time zone "Nowhere/Nothing"`
					)
				}
				throws(
					() => add(invalid, "1d"),
					RangeError,
					"add: Invalid duration \"1d\""
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
			"names the function and the value",
			() => {
				throws(
					() => add(new Date(0), "1d"),
					RangeError,
					"add: Invalid duration \"1d\""
				)
				throws(
					() => diff(
						new Date(0),
						new Date(0),
						/** @type {never} */("x")/**/
					),
					RangeError,
					"diff: Invalid unit \"x\""
				)
				throws(
					() => startOf(
						new Date(0),
						/** @type {never} */("sss")/**/
					),
					RangeError,
					"startOf: Invalid unit \"sss\""
				)
				throws(
					() => endOf(
						new Date(0),
						/** @type {never} */("Q")/**/
					),
					RangeError,
					"endOf: Invalid unit \"Q\""
				)
				throws(
					() => dateToString(new Date(0), undefined, zone),
					RangeError,
					"dateToString: Invalid time zone \"Nowhere/Nothing\""
				)
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
				const types = [
					"string",
					"number",
					"null",
					"undefined",
					"object",
					"object"
				]
				for (const [ index, value ] of values.entries()) {
					const type = types[index]
					throws(
						() => add(value, "1D"),
						TypeError,
						`add: Expected a Date, got ${type}`
					)
					throws(
						() => dateToString(value),
						TypeError,
						`dateToString: Expected a Date, got ${type}`
					)
					throws(
						() => diff(new Date(0), value, "D"),
						TypeError,
						`diff: Expected a Date, got ${type}`
					)
					throws(
						() => diff(value, new Date(0), "D"),
						TypeError,
						`diff: Expected a Date, got ${type}`
					)
					throws(
						() => endOf(value, "D"),
						TypeError,
						`endOf: Expected a Date, got ${type}`
					)
					throws(
						() => startOf(value, "D"),
						TypeError,
						`startOf: Expected a Date, got ${type}`
					)
					throws(
						() => timeZoneOffset(value, "UTC"),
						TypeError,
						`timeZoneOffset: Expected a Date, got ${type}`
					)
				}
				throws(
					() => stringToDate(/** @type {never} */(0)/**/),
					TypeError,
					"stringToDate: Expected a string, got number"
				)
			}
		)
	}
)
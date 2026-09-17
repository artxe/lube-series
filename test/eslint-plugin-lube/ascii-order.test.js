import ascii_order from "../../packages/eslint-plugin-lube/src/rules/ascii-order.js"
import { cases as comments_cases } from "./ascii-order/comments.js"
import { cases as declarations_cases } from "./ascii-order/declarations.js"
import { cases as imports_cases } from "./ascii-order/imports.js"
import { cases as keys_cases } from "./ascii-order/keys.js"
import { cases as tests_cases } from "./ascii-order/tests.js"
import { cases as typescript_cases } from "./ascii-order/typescript.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
comments_cases(valid, invalid)
declarations_cases(valid, invalid)
imports_cases(valid, invalid)
keys_cases(valid, invalid)
tests_cases(valid, invalid)
typescript_cases(valid, invalid)
new RuleTester().run(
	"ascii-order",
	ascii_order,
	{ invalid, valid }
)
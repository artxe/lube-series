import pretty_jsdoc_casting from "../../packages/eslint-plugin-lube/src/rules/pretty-jsdoc-casting.js"
import {
	cases as case_by_expression_cases
} from "./pretty-jsdoc-casting/case_by_expression.js"
import { cases as nested_casting_cases } from "./pretty-jsdoc-casting/nested_casting.js"
import {
	cases as various_situations_cases
} from "./pretty-jsdoc-casting/various_situations.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
case_by_expression_cases(valid, invalid)
nested_casting_cases(valid, invalid)
various_situations_cases(valid, invalid)
new RuleTester().run(
	"pretty-jsdoc-casting",
	pretty_jsdoc_casting,
	{ invalid, valid }
)
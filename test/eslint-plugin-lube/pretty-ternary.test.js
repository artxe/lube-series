import pretty_ternary from "../../packages/eslint-plugin-lube/src/rules/pretty-ternary.js"
import { cases as case_by_option_cases } from "./pretty-ternary/case_by_option.js"
import {
	cases as comments_and_literals_cases
} from "./pretty-ternary/comments_and_literals.js"
import { cases as nested_ternary_cases } from "./pretty-ternary/nested_ternary.js"
import { cases as typescript_cases } from "./pretty-ternary/typescript.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
case_by_option_cases(valid, invalid)
comments_and_literals_cases(valid, invalid)
nested_ternary_cases(valid, invalid)
typescript_cases(valid, invalid)
new RuleTester().run(
	"pretty-ternary",
	pretty_ternary,
	{ invalid, valid }
)
import pretty_sequence from "../../packages/eslint-plugin-lube/src/rules/pretty-sequence.js"
import {
	cases as case_by_node_type_cases
} from "./pretty-sequence/case_by_node_type.js"
import { cases as case_by_option_cases } from "./pretty-sequence/case_by_option.js"
import {
	cases as comments_and_literals_cases
} from "./pretty-sequence/comments_and_literals.js"
import { cases as typescript_cases } from "./pretty-sequence/typescript.js"
import {
	cases as various_situations_cases
} from "./pretty-sequence/various_situations.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
case_by_node_type_cases(valid, invalid)
case_by_option_cases(valid, invalid)
comments_and_literals_cases(valid, invalid)
typescript_cases(valid, invalid)
various_situations_cases(valid, invalid)
new RuleTester().run(
	"pretty-sequence",
	pretty_sequence,
	{ invalid, valid }
)
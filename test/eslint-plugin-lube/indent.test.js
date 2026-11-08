import indent from "../../packages/eslint-plugin-lube/src/rules/indent.js"
import { cases as case_by_option_cases } from "./indent/case_by_option.js"
import {
	cases as comments_and_literals_cases
} from "./indent/comments_and_literals.js"
import { cases as jsx_and_svelte_cases } from "./indent/jsx_and_svelte.js"
import { cases as statements_cases } from "./indent/statements.js"
import { cases as typescript_cases } from "./indent/typescript.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = (text, method) => describe(text, method)
RuleTester.it = (text, method) => it(text, method)
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
case_by_option_cases(valid, invalid)
comments_and_literals_cases(valid, invalid)
jsx_and_svelte_cases(valid, invalid)
statements_cases(valid, invalid)
typescript_cases(valid, invalid)
new RuleTester().run(
	"indent",
	indent,
	{ invalid, valid }
)
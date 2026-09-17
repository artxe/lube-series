import pretty_imports from "../../packages/eslint-plugin-lube/src/rules/pretty-imports.js"
import { cases as declarations_cases } from "./pretty-imports/declarations.js"
import {
	cases as various_situations_cases
} from "./pretty-imports/various_situations.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
declarations_cases(valid, invalid)
various_situations_cases(valid, invalid)
new RuleTester().run(
	"pretty-imports",
	pretty_imports,
	{ invalid, valid }
)
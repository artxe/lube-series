import svelte_naming_convention from "../../packages/eslint-plugin-lube/src/rules/svelte-naming-convention.js"
import {
	cases as basic_snake_case_cases
} from "./svelte-naming-convention/basic_snake_case.js"
import {
	cases as case_by_identifier_cases
} from "./svelte-naming-convention/case_by_identifier.js"
import {
	cases as snake_case_with_symbols_cases
} from "./svelte-naming-convention/snake_case_with_symbols.js"
import {
	cases as store_subscription_cases
} from "./svelte-naming-convention/store_subscription.js"
import { cases as svelte_template_cases } from "./svelte-naming-convention/svelte_template.js"
import {
	cases as usage_or_declaration_cases
} from "./svelte-naming-convention/usage_or_declaration.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
basic_snake_case_cases(valid, invalid)
case_by_identifier_cases(valid, invalid)
snake_case_with_symbols_cases(valid, invalid)
store_subscription_cases(valid, invalid)
svelte_template_cases(valid, invalid)
usage_or_declaration_cases(valid, invalid)
new RuleTester().run(
	"svelte-naming-convention",
	svelte_naming_convention,
	{ invalid, valid }
)
import { RuleTester } from "eslint"
import lube from "eslint-plugin-lube"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
const rules = /** @type {Record<string, import("eslint").Rule.RuleModule>} */(lube.configs.strict.plugins["@stylistic"]?.rules)/**/
/**
 * @param {string} name
 * @returns {import("eslint").Rule.RuleModule}
 */
function rule_of(name) {
	return /** @type {import("eslint").Rule.RuleModule} */(rules[name])/**/
}
new RuleTester().run(
	"@stylistic/comma-dangle of the configs, whose fix removes a token",
	rule_of("comma-dangle"),
	{
		invalid: [
			{
				code: "var a = [ 1, 2, ]\r\nvar b = 1",
				errors: [ { messageId: "unexpected" } ],
				options: [ "never" ],
				output: "var a = [ 1, 2 ]\r\nvar b = 1"
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"@stylistic/comma-style of the configs, which leaves the comma of an array hole",
	rule_of("comma-style"),
	{
		invalid: [
			{
				code: "var a = [ 1\n, 2 ]",
				errors: [
					{ messageId: "expectedCommaLast" }
				],
				options: [ "last" ],
				output: "var a = [ 1,\n 2 ]"
			}
		],
		valid: [
			{
				code: "var a = [ 1,\n,\n2 ]",
				options: [ "last" ]
			}
		]
	}
)
new RuleTester().run(
	"@stylistic/indent of the configs, which drops a fix that would change nothing",
	rule_of("indent"),
	{
		invalid: [],
		valid: [
			{
				code: "var a = <div>\n\t&#9;x\n</div>",
				languageOptions: {
					parserOptions: { ecmaFeatures: { jsx: true } }
				},
				options: [ "tab", { SwitchCase: 0 } ]
			}
		]
	}
)
new RuleTester().run(
	"@stylistic/lines-around-comment of the configs, whose fix inserts before a range",
	rule_of("lines-around-comment"),
	{
		invalid: [
			{
				code: "var a = 1\r\n/* c */\r\nvar b = 2",
				errors: [ { messageId: "before" } ],
				options: [ { beforeBlockComment: true } ],
				output: "var a = 1\r\n\r\n/* c */\r\nvar b = 2"
			}
		],
		valid: []
	}
)
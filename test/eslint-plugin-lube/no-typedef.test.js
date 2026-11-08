import no_typedef from "../../packages/eslint-plugin-lube/src/rules/no-typedef.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"no-typedef",
	no_typedef,
	{
		invalid: [
			{
				code: "/** @typedef {string} Name */",
				errors: [
					{
						data: { tag: "@typedef" },
						messageId: "typedef"
					}
				]
			},
			{
				code: "/**\n * @callback Run\n * @returns {void}\n */",
				errors: [
					{
						data: { tag: "@callback" },
						messageId: "typedef"
					}
				]
			},
			{
				code: "/**\n * @typedef {string} A\n * @typedef {number} B\n */",
				errors: [
					{ messageId: "typedef" },
					{ messageId: "typedef" }
				]
			}
		],
		valid: [
			"/** @type {string} */\nlet a",
			"/* @typedef {string} Name */",
			"// @typedef {string} Name",
			"const s = \"@typedef {string} Name\"",
			"/** @typedefs */"
		]
	}
)
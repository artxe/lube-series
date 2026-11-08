import no_loose_types from "../../packages/eslint-plugin-lube/src/rules/no-loose-types.js"
import ts_parser from "@typescript-eslint/parser"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"no-loose-types",
	no_loose_types,
	{
		invalid: [
			{
				code: "/** @type {any} */\nlet a",
				errors: [
					{
						data: { type: "any" },
						messageId: "loose"
					}
				]
			},
			{
				code: "/** @type {*} */\nlet a",
				errors: [
					{
						data: { type: "*" },
						messageId: "loose"
					}
				]
			},
			{
				code: "/** @type {object} */\nlet a",
				errors: [
					{
						data: { type: "object" },
						messageId: "loose"
					}
				]
			},
			{
				code: "/** @type {Object} */\nlet a",
				errors: [
					{
						data: { type: "Object" },
						messageId: "loose"
					}
				]
			},
			{
				code: "/** @type {Array<any>} */\nlet a",
				errors: [ { messageId: "loose" } ]
			},
			{
				code: "/**\n * @param {*} a\n * @returns {Promise<object>}\n */\nfunction f(a) {}",
				errors: [
					{ messageId: "loose" },
					{ messageId: "loose" }
				]
			},
			{
				code: "/** @type {(a: string) => any} */\nlet a",
				errors: [ { messageId: "loose" } ]
			}
		],
		valid: [
			"/** @type {unknown} */\nlet a",
			"/**\n * @type {{\n *   a: string,\n *   b: number\n * }}\n */\nlet a",
			"/** @type {Record<string, unknown>} */\nlet a",
			"/** @type {{ object: string, any: number }} */\nlet a",
			"/** @type {import(\"x\").any} */\nlet a",
			"/** @type {\"any\"} */\nlet a",
			"/** @param {string} any */\nfunction f(any) {}",
			"/* @type {any} */\nlet a",
			"/** any object * */\nlet a",
			"const o = { any: 1 }\no.any = 2",
			"const s = \"@type {any}\""
		]
	}
)
new RuleTester(
	{
		languageOptions: { parser: ts_parser }
	}
).run(
	"no-loose-types in TypeScript",
	no_loose_types,
	{
		invalid: [
			{
				code: "let a: any",
				errors: [
					{
						data: { type: "any" },
						messageId: "loose"
					}
				]
			},
			{
				code: "let a: object",
				errors: [
					{
						data: { type: "object" },
						messageId: "loose"
					}
				]
			},
			{
				code: "let a: Object",
				errors: [
					{
						data: { type: "Object" },
						messageId: "loose"
					}
				]
			}
		],
		valid: [
			"let a: unknown",
			"let a: { object: string }"
		]
	}
)
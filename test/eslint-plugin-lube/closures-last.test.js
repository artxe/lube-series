import closures_last from "../../packages/eslint-plugin-lube/src/rules/closures-last.js"
import ts_parser from "@typescript-eslint/parser"
import { Linter, RuleTester } from "eslint"
import lube from "eslint-plugin-lube"
import { assert, describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"closures-last",
	closures_last,
	{
		invalid: [
			{
				code: "function outer() {\n\tfunction inner() {}\n\treturn inner\n}",
				errors: [
					{
						data: { name: "inner" },
						messageId: "last"
					}
				],
				output: "function outer() {\n\treturn inner\n\tfunction inner() {}\n}"
			},
			{
				code: "function outer() {\n\tfunction a() {}\n\tconst b = 1\n\tb++\n}",
				errors: [ { messageId: "last" } ],
				output: "function outer() {\n\tconst b = 1\n\tb++\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tfunction a() {}\n\tconst x = 1\n\tfunction b() {}\n\treturn x\n}",
				errors: [
					{ messageId: "last" },
					{ messageId: "last" }
				],
				output: "function f() {\n\tconst x = 1\n\treturn x\n\tfunction a() {}\n\tfunction b() {}\n}"
			},
			{
				code: "function f() {\n\t/**\n\t * Does it.\n\t */\n\t// @ts-ignore\n\tfunction g() {} // end\n\treturn 1\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\treturn 1\n\t/**\n\t * Does it.\n\t */\n\t// @ts-ignore\n\tfunction g() {} // end\n}"
			},
			{
				code: "function f() {\n\tfunction g() {}\n\t// @ts-ignore\n\treturn 1\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\t// @ts-ignore\n\treturn 1\n\tfunction g() {}\n}"
			},
			{
				code: "function f() {\n\tfunction g(a: string): void\n\tfunction g(a: number): void\n\tfunction g(a: string | number) {}\n\treturn g\n}",
				errors: [
					{ messageId: "last" },
					{ messageId: "last" },
					{ messageId: "last" }
				],
				languageOptions: { parser: ts_parser },
				output: "function f() {\n\treturn g\n\tfunction g(a: string): void\n\tfunction g(a: number): void\n\tfunction g(a: string | number) {}\n}"
			},
			{
				code: "const f = () => {\n\tfunction a() {}\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "const f = () => {\n\treturn a\n\tfunction a() {}\n}"
			},
			{
				code: "const f = function () {\n\tfunction a() {}\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "const f = function () {\n\treturn a\n\tfunction a() {}\n}"
			},
			{
				code: "function f() { function a() {} return a }",
				errors: [ { messageId: "last" } ],
				output: null
			},
			{
				code: "function f() {\r\n\t/** Does it. */\r\n\tfunction a() {}\r\n\tconst b = 1\r\n\treturn b\r\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\r\n\tconst b = 1\r\n\treturn b\r\n\t/** Does it. */\r\n\tfunction a() {}\r\n}"
			},
			{
				code: "function a() {\n\tfunction b() {\n\t\tfunction c() {}\n\t\treturn c\n\t}\n\treturn b\n}",
				errors: [
					{ messageId: "last" },
					{ messageId: "last" }
				],
				output: "function a() {\n\treturn b\n\tfunction b() {\n\t\treturn c\n\t\tfunction c() {}\n\t}\n}"
			},
			{
				code: "function f() {\n\t\"use strict\"\n\t;function a() {}\n\tconst b = 1\n\treturn a(b)\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\t\"use strict\"\n\tconst b = 1\n\treturn a(b)\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tfunction a() {}\n\tconst b = 1\n\t;[ b ].map(a)\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tconst b = 1\n\t;[ b ].map(a)\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tconst b = 1\n\tfunction a() {}\n\t;[ b ].map(a)\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tconst b = 1\n\t;[ b ].map(a)\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tconst b = 1\n\t// c\n\t;function a() {}\n\t;(b)\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tconst b = 1\n\t;(b)\n\t// c\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tvar x = 1\n\tfunction a() {}\n\t(x)\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tvar x = 1\n\t;(x)\n\treturn a\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tconst b = 1\n\tfunction a() {}\n\t// c\n\t[ b ].map(a)\n\tfunction d() {}\n\t`${b}`.at(0)\n}",
				errors: [
					{ messageId: "last" },
					{ messageId: "last" }
				],
				output: "function f() {\n\tconst b = 1\n\t// c\n\t;[ b ].map(a)\n\t;`${b}`.at(0)\n\tfunction a() {}\n\tfunction d() {}\n}"
			},
			{
				code: "function f() {\n\tvar g = function () {}\n\tfunction a() {}\n\t(g)\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tvar g = function () {}\n\t;(g)\n\treturn a\n\tfunction a() {}\n}"
			},
			{
				code: "function f() {\n\tvar x = 1;\n\tfunction a() {}\n\t(x);\n\treturn a;\n}",
				errors: [ { messageId: "last" } ],
				output: "function f() {\n\tvar x = 1;\n\t(x);\n\treturn a;\n\tfunction a() {}\n}"
			},
			{
				code: "function f(x) {\n\tif (x) {}\n\tfunction a() {}\n\t(x)\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "function f(x) {\n\tif (x) {}\n\t(x)\n\treturn a\n\tfunction a() {}\n}"
			},
			{
				code: "function f(x) {\n\tfunction a() {}\n\t(x)\n\treturn a\n}",
				errors: [ { messageId: "last" } ],
				output: "function f(x) {\n\t(x)\n\treturn a\n\tfunction a() {}\n}"
			}
		],
		valid: [
			"function f() {\n\treturn a\n\tfunction a() {}\n}",
			"function f() {\n\tconst a = () => 1\n\treturn a\n}",
			"function f() {\n\tconst a = function () {}\n\treturn a\n}",
			"function a() {}\nconst b = 1",
			"function f() {\n\tif (x) {\n\t\tfunction a() {}\n\t\treturn a\n\t}\n}",
			"function f() {\n\tfor (const x of y) {\n\t\tfunction a() {}\n\t\tx()\n\t}\n}",
			"class A {\n\tstatic {\n\t\tfunction a() {}\n\t\tb()\n\t}\n}",
			"function f() {\n\tfunction a() {}\n\tfunction b() {}\n}"
		]
	}
)
/**
 * @param {string} code
 * @param {import("eslint").Linter.RulesRecord} rules
 * @returns {string}
 */
function fix_closures_last(code, rules) {
	const messages = new Linter().verify(
		code,
		{
			languageOptions: { parser: ts_parser },
			plugins: { lube },
			rules: {
				"lube/closures-last": "error",
				...rules
			}
		}
	)
		.filter(
			message => message.ruleId == "lube/closures-last"
		)
	const fix = /** @type {NonNullable<(typeof messages)[number]["fix"]>} */(messages[0]?.fix)/**/
	return code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1])
}
describe(
	"closures-last with ascii-order",
	() => {
		const code = "function f() {\n\tfunction b() {}\n\tfunction a() {}\n\tx()\n}"
		it(
			"keeps an overload group together while sorting",
			() => {
				assert.equal(
					fix_closures_last(
						"function f() {\n\tfunction b(): void\n\tfunction b() {}\n\tfunction a() {}\n\tx()\n}",
						{ "lube/ascii-order": "error" }
					),
					"function f() {\n\tx()\n\tfunction a() {}\n\tfunction b(): void\n\tfunction b() {}\n}"
				)
			}
		)
		it(
			"keeps the source order when ascii-order is off",
			() => {
				assert.equal(
					fix_closures_last(code, {}),
					"function f() {\n\tx()\n\tfunction b() {}\n\tfunction a() {}\n}"
				)
			}
		)
		it(
			"keeps the source order when ascii-order skips declarations",
			() => {
				assert.equal(
					fix_closures_last(
						code,
						{
							"lube/ascii-order": [
								"error",
								{ checkDeclarations: false }
							]
						}
					),
					"function f() {\n\tx()\n\tfunction b() {}\n\tfunction a() {}\n}"
				)
			}
		)
		it(
			"moves functions in ascii-order's order when it checks declarations",
			() => {
				assert.equal(
					fix_closures_last(
						code,
						{ "lube/ascii-order": "error" }
					),
					"function f() {\n\tx()\n\tfunction a() {}\n\tfunction b() {}\n}"
				)
			}
		)
	}
)
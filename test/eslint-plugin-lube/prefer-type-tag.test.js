import prefer_type_tag from "../../packages/eslint-plugin-lube/src/rules/prefer-type-tag.js"
import ts_parser from "@typescript-eslint/parser"
import { RuleTester } from "eslint"
import { fileURLToPath } from "node:url"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
const filename = fileURLToPath(
	new URL(
		"prefer-type-tag/file.js",
		import.meta.url
	)
)
const tsconfig_root_dir = fileURLToPath(
	new URL(
		"prefer-type-tag",
		import.meta.url
	)
)
new RuleTester(
	{
		languageOptions: {
			parser: ts_parser,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: tsconfig_root_dir
			}
		}
	}
).run(
	"prefer-type-tag",
	prefer_type_tag,
	{
		invalid: [
			{
				code: "export const own = /** @type {string[]} */(JSON.parse(\"[]\"))/**/",
				errors: [
					{
						message: "Write `/** @type {string[]} */` in front of the declaration instead of casting its value, since its type `any` is assignable to it"
					}
				],
				filename,
				output: "/** @type {string[]} */\nexport const own = JSON.parse(\"[]\")"
			},
			{
				code: "export function f() {\n\tlet current = /** @type {number | null} */(JSON.parse(\"1\"))/**/\n\treturn current\n}",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "export function f() {\n\t/** @type {number | null} */\n\tlet current = JSON.parse(\"1\")\n\treturn current\n}"
			},
			{
				code: "export function f() {\r\n\tconst a = /** @type {number} */(1)\r\n\treturn a\r\n}",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "export function f() {\r\n\t/** @type {number} */\r\n\tconst a = 1\r\n\treturn a\r\n}"
			},
			{
				code: "export const a = /** @type {number} */(f(), 1)/**/\nfunction f() {}",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "/** @type {number} */\nexport const a = (f(), 1)\nfunction f() {}"
			},
			{
				code: "export const a = /** @type {number} */(Math.random() > 0.5\n\t? 1\n\t: 2)/**/",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "/** @type {number} */\nexport const a = Math.random() > 0.5\n\t? 1\n\t: 2"
			},
			{
				code: "export const { a } = /** @type {{ a: number }} */({ a: 1 })/**/",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "/** @type {{ a: number }} */\nexport const { a } = { a: 1 }"
			},
			{
				code: "// note\n// eslint-disable-next-line no-var\nexport var a = /** @type {number} */(1)/**/",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "// note\n/** @type {number} */\n// eslint-disable-next-line no-var\nexport var a = 1"
			},
			{
				code: "f(); const a = /** @type {number} */(1)/**/\nfunction f() {}\nexport { a }",
				errors: [ { messageId: "tag" } ],
				filename,
				output: "f(); /** @type {number} */ const a = 1\nfunction f() {}\nexport { a }"
			},
			{
				code: "/** @deprecated */\nexport const a = /** @type {number} */(1)/**/",
				errors: [
					{
						message: "Type the declaration with `/** @type {number} */` instead of casting its value, since its type `1` is assignable to it; it is not fixed automatically because the declaration already has a JSDoc comment, so add the type to it by hand"
					}
				],
				filename,
				output: null
			}
		],
		valid: [
			{
				code: "const list = [ 1 ]\nexport const first = /** @type {number} */(list[0])/**/",
				filename
			},
			{
				code: "export const units = /** @type {const} */([ \"a\" ])/**/",
				filename
			},
			{
				code: "export const value = /** @type {string} */(/** @type {unknown} */(1))/**/",
				filename
			},
			{
				code: "export const point = /** @type {{ x: number }} */({ x: 1, y: 2 })/**/",
				filename
			},
			{
				code: "export const size = /** @type {string[]} */(JSON.parse(\"[]\"))/**/.length",
				filename
			},
			{
				code: "for (let i = /** @type {number} */(JSON.parse(\"1\"))/**/; i < 1; i++) {}",
				filename
			},
			{
				code: "export let a = /** @type {number} */(JSON.parse(\"1\"))/**/, b = 1",
				filename
			},
			{
				code: "/** @type {number} */\nexport const a = JSON.parse(\"1\")",
				filename
			},
			{
				code: "/** @type {number | string} */\nexport let a = /** @type {number} */(1)/**/",
				filename
			},
			{
				code: "let done = /** @type {boolean} */(false)/**/\nsetTimeout(() => {\n\tdone = true\n})\nexport const late = done === true",
				filename
			},
			{
				code: "export let found = /** @type {{ id: number } | null} */(null)/**/",
				filename
			},
			{
				code: "const node = /** @type {{ type: \"a\" } | { type: \"b\" }} */({ type: \"a\" })/**/\nexport const b = node.type == \"b\"",
				filename
			}
		]
	}
)
new RuleTester(
	{
		languageOptions: {
			parser: {
				parseForESLint(
					/** @type {string} */ code,
					/** @type {import("@typescript-eslint/parser").ParserOptions} */ options
				) {
					const result = ts_parser.parseForESLint(code, options)
					return {
						...result,
						services: {
							...result.services,
							esTreeNodeToTSNodeMap: new WeakMap()
						}
					}
				}
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: tsconfig_root_dir
			}
		}
	}
).run(
	"prefer-type-tag with a parser that maps no TypeScript node",
	prefer_type_tag,
	{
		invalid: [],
		valid: [
			{
				code: "export const a = /** @type {number} */(JSON.parse(\"1\"))/**/",
				filename
			}
		]
	}
)
new RuleTester().run(
	"prefer-type-tag without type information",
	prefer_type_tag,
	{
		invalid: [],
		valid: [
			"const a = /** @type {number} */(JSON.parse(\"1\"))/**/"
		]
	}
)
import ts_parser from "@typescript-eslint/parser"
import { Linter } from "eslint"
import lube from "eslint-plugin-lube"
import assert from "node:assert"
import { describe, it } from "vitest"
describe(
	"fixes of the recommended config",
	() => {
		const linter = new Linter()
		/**
		 * @param {string} code
		 * @param {string} output
		 * @returns {void}
		 */
		function assert_converges(code, output) {
			const result = linter.verifyAndFix(
				code,
				[ lube.configs.recommended ]
			)
			assert.strictEqual(result.output, output)
			assert.deepStrictEqual(result.messages, [])
			assert.strictEqual(
				linter.verifyAndFix(
					output,
					[ lube.configs.recommended ]
				).output,
				output
			)
		}
		it(
			"ends a file with a line break and keeps one blank line",
			() => {
				assert_converges(
					"import a from \"a\"\n\n\n\nconst b = a\n\nexport { b }",
					"import a from \"a\"\n\nconst b = a\n\nexport { b }\n"
				)
				assert_converges(
					"\n\nvar a = 1\n\n\n",
					"var a = 1\n"
				)
			}
		)
		it(
			"formats TypeScript",
			() => {
				const config = [
					lube.configs.recommended,
					{
						files: [ "**/*.ts" ],
						languageOptions: { parser: ts_parser }
					}
				]
				const result = linter.verifyAndFix(
					"type Shape = {kind:'a'}\n\n\nexport function area(shape: Shape): number{\n  return shape.kind=='a'?1:2\n}",
					config,
					"a.ts"
				)
				assert.strictEqual(
					result.output,
					"type Shape = { kind: \"a\" }\n\nexport function area(shape: Shape): number {\n\treturn shape.kind == \"a\" ? 1 : 2\n}\n"
				)
				assert.deepStrictEqual(result.messages, [])
			}
		)
		it(
			"formats spacing, quotes and semicolons",
			() => {
				assert_converges(
					"function f(a,b){\n  return a?b:'c';\n}\n",
					"function f(a, b) {\n\treturn a ? b : \"c\"\n}\n"
				)
			}
		)
		it(
			"keeps CRLF line breaks",
			() => {
				assert_converges(
					"var a = [1,2]\r\n\r\n\r\nvar b = 'c'",
					"var a = [ 1, 2 ]\r\n\r\nvar b = \"c\"\r\n"
				)
			}
		)
		it(
			"keeps names, key order, import order and arrow functions",
			() => {
				const code = "import z from \"z\"\nimport a from \"a\"\n\nconst fooBar = () => z(a)\nconst config = { zeta: 1, alpha: fooBar() }\nlet count = 0\nconsole.log(config, count)\n"
				assert_converges(code, code)
			}
		)
		it(
			"sorts the names inside import and export braces",
			() => {
				assert_converges(
					"import { b, a } from \"m\"\nexport { b, a }\n",
					"import { a, b } from \"m\"\nexport { a, b }\n"
				)
			}
		)
		it(
			"writes items on one line up to 80 characters",
			() => {
				assert_converges(
					"const value = call(\n\tfirstArgument,\n\tsecondArgument,\n\tthirdArgument\n)\n",
					"const value = call(firstArgument, secondArgument, thirdArgument)\n"
				)
				assert_converges(
					"const value = call(firstArgumentThatIsQuiteLong, secondArgumentThatIsQuiteLong, thirdArgumentThatIsQuiteLong)\n",
					"const value = call(\n\tfirstArgumentThatIsQuiteLong,\n\tsecondArgumentThatIsQuiteLong,\n\tthirdArgumentThatIsQuiteLong\n)\n"
				)
			}
		)
	}
)
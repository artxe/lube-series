import pretty_jsdoc_lines from "../../packages/eslint-plugin-lube/src/rules/pretty-jsdoc-lines.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"pretty-jsdoc-lines",
	pretty_jsdoc_lines,
	{
		invalid: [
			{
				code: "/**\n * @param {number} count\n */\nfunction f(count) {}",
				errors: [ { messageId: "one" } ],
				output: "/** @param {number} count */\nfunction f(count) {}"
			},
			{
				code: "/** @param {number} count @returns {void} */\nfunction f(count) {}",
				errors: [ { messageId: "many" } ],
				output: "/**\n * @param {number} count\n * @returns {void}\n */\nfunction f(count) {}"
			},
			{
				code: "function outer() {\n\t/** @param {A} a @returns {B} */\n\tfunction f(a) {}\n}",
				errors: [ { messageId: "many" } ],
				output: "function outer() {\n\t/**\n\t * @param {A} a\n\t * @returns {B}\n\t */\n\tfunction f(a) {}\n}"
			},
			{
				code: "/** Counts. @returns {number} @throws {Error} */\nfunction f() {}",
				errors: [ { messageId: "many" } ],
				output: "/**\n * Counts.\n * @returns {number}\n * @throws {Error}\n */\nfunction f() {}"
			},
			{
				code: "a(); /** @param {A} a @returns {B} */ function f(a) {}",
				errors: [ { messageId: "many" } ],
				output: null
			}
		],
		valid: [
			"/** @returns {void} */\nfunction f() {}",
			"/**\n * @param {number} count\n * @returns {void}\n */\nfunction f(count) {}",
			"/**\n * Counts.\n * @returns {number}\n */\nfunction f() {}",
			"/** Counts. */\nfunction f() {}",
			"/** @type {{ a: number, b: string }} */\nlet a",
			"/** {@link A} and @see B */\nlet a",
			"/**\n * @param {{\n * a: number\n * b: string\n * }} total\n */\nfunction f(total) {}",
			"/**\n * @type {{\n *   plugins: A\n *   rules: B\n * }}\n */\nconst plugin = {}",
			"/**\n * @example\n * f()\n */\nfunction f() {}",
			"const a = /** @type {A} */(b)/**/",
			"const a = /** @type {const} */([\n\t\"a\",\n\t\"b\"\n])/**/"
		]
	}
)
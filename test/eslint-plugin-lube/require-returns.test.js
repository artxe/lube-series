import require_returns from "../../packages/eslint-plugin-lube/src/rules/require-returns.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"require-returns",
	require_returns,
	{
		invalid: [
			{
				code: "function f() {}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {void} */\nfunction f() {}"
			},
			{
				code: "export function f() {\n\treturn\n}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {void} */\nexport function f() {\n\treturn\n}"
			},
			{
				code: "async function f() {}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {Promise<void>} */\nasync function f() {}"
			},
			{
				code: "const f = () => {}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {void} */\nconst f = () => {}"
			},
			{
				code: "const f = function(a) {}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {void} */\nconst f = function(a) {}"
			},
			{
				code: "function outer() {\n\tfunction f() {}\n}",
				errors: [
					{ messageId: "missing" },
					{ messageId: "missing" }
				],
				output: "/** @returns {void} */\nfunction outer() {\n\t/** @returns {void} */\n\tfunction f() {}\n}"
			},
			{
				code: "/** @param {number} a */\nfunction f(a) {}",
				errors: [ { messageId: "missing" } ],
				output: "/**\n * @param {number} a\n * @returns {void}\n */\nfunction f(a) {}"
			},
			{
				code: "/**\n * Counts.\n */\nfunction f() {}",
				errors: [ { messageId: "missing" } ],
				output: "/**\n * Counts.\n * @returns {void}\n */\nfunction f() {}"
			},
			{
				code: "/** Counts. */\nfunction f() {}",
				errors: [ { messageId: "missing" } ],
				output: "/**\n * Counts.\n *\n * @returns {void}\n */\nfunction f() {}"
			},
			{
				code: "/**\n * @param {number} a\n */\nconst f = a => {}",
				errors: [ { messageId: "missing" } ],
				output: "/**\n * @param {number} a\n * @returns {void}\n */\nconst f = a => {}"
			},
			{
				code: "// eslint-disable-next-line no-console\nfunction f() {}",
				errors: [ { messageId: "missing" } ],
				output: "/** @returns {void} */\n// eslint-disable-next-line no-console\nfunction f() {}"
			},
			{
				code: "function f() {\n\treturn 1\n}",
				errors: [ { messageId: "missing" } ],
				output: null
			},
			{
				code: "const f = () => 1",
				errors: [ { messageId: "missing" } ],
				output: null
			},
			{
				code: "async function f() {\n\treturn await g()\n}",
				errors: [ { messageId: "missing" } ],
				output: null
			},
			{
				code: "function* f() {}",
				errors: [ { messageId: "missing" } ],
				output: null
			},
			{
				code: "a(); function f() {}",
				errors: [ { messageId: "missing" } ],
				output: null
			},
			{
				code: "/** @returns {void} */\nfunction outer() {\n\tconst inner = () => 1\n}",
				errors: [ { messageId: "missing" } ],
				output: null
			}
		],
		valid: [
			"/** @returns {void} */\nfunction f() {}",
			"/** @returns {void} */\nexport function f() {}",
			"/** @returns {number} */\nconst f = () => 1",
			"/**\n * @param {number} a\n * @returns {void}\n */\nfunction f(a) {}",
			"/** @return {void} */\nfunction f() {}",
			"/** @returns {void} */\n// eslint-disable-next-line no-console\nfunction f() {}",
			"[ 1 ].map(a => a)",
			"let f = () => 1",
			"const o = { m() {} }",
			"class A { m() {} }"
		]
	}
)
import prefer_param_tag from "../../packages/eslint-plugin-lube/src/rules/prefer-param-tag.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"prefer-param-tag",
	prefer_param_tag,
	{
		invalid: [
			{
				code: "function use(/** @type {string} */ tx) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {string} tx\n */\nfunction use(tx) {}"
			},
			{
				code: "async function source(/** @type {unknown} */ n, /** @type {number} */ m = 1) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {unknown} n\n * @param {number} m\n */\nasync function source(n, m = 1) {}"
			},
			{
				code: "function outer() {\n\tfunction inner(/** @type {A} */ a) {}\n}",
				errors: [ { messageId: "tag" } ],
				output: "function outer() {\n\t/**\n\t * @param {A} a\n\t */\n\tfunction inner(a) {}\n}"
			},
			{
				code: "export function f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n */\nexport function f(a) {}"
			},
			{
				code: "export default function (/** @type {A} */ a) {}",
				errors: [
					{
						message: "Type the parameters of `default` with `@param` tags on the declaration instead of inline `@type` comments"
					}
				],
				output: "/**\n * @param {A} a\n */\nexport default function (a) {}"
			},
			{
				code: "/**\n * Does it.\n */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * Does it.\n *\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "/**\n * @param {A} a\n * @returns {void}\n */\nfunction f(a, /** @type {B} */ b) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {B} b\n * @returns {void}\n */\nfunction f(a, b) {}"
			},
			{
				code: "/**\n * @returns {void}\n */\nfunction f(/** @type {B} */ b) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {B} b\n * @returns {void}\n */\nfunction f(b) {}"
			},
			{
				code: "/** Does it. */\nfunction f(/** @type {B} */ b) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * Does it.\n *\n * @param {B} b\n */\nfunction f(b) {}"
			},
			{
				code: "/**\n * @param {A} a\n */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "/**\n * @param {A} [$a=1]\n */\nfunction f(/** @type {A} */ $a = 1, /** @type {B} */ $b) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} [$a=1]\n * @param {B} $b\n */\nfunction f($a = 1, $b) {}"
			},
			{
				code: "/**\n * @param {O} [options]\n */\nfunction f(/** @type {A} */ a, { b } = {}) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {O} [options]\n */\nfunction f(a, { b } = {}) {}"
			},
			{
				code: "/**\n * @param {A} a\n * @param {C} c\n * @returns {void}\n */\nfunction f(a, /** @type {B} */ b, c) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {B} b\n * @param {C} c\n * @returns {void}\n */\nfunction f(a, b, c) {}"
			},
			{
				code: "/**\n * @param {O} o\n */\nfunction f(/** @type {A} */ a, { b }, /** @type {C} */ c) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {O} o\n * @param {C} c\n */\nfunction f(a, { b }, c) {}"
			},
			{
				code: "/**\n * @param {A} a\n */\nfunction f(a, x, /** @type {C} */ c) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {C} c\n */\nfunction f(a, x, c) {}"
			},
			{
				code: "function f(\n\t/** @type {A} */\n\ta,\n\t/** @type {B} */ b\n) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n * @param {B} b\n */\nfunction f(\n\ta,\n\tb\n) {}"
			},
			{
				code: "function f(/** @type {A} */ a) {}\r\nfoo()",
				errors: [ { messageId: "tag" } ],
				output: "/**\r\n * @param {A} a\r\n */\r\nfunction f(a) {}\r\nfoo()"
			},
			{
				code: "// eslint-disable-next-line no-console\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n */\n// eslint-disable-next-line no-console\nfunction f(a) {}"
			},
			{
				code: "/**\n * Text.\n */\n// eslint-disable-next-line no-console\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * Text.\n *\n * @param {A} a\n */\n// eslint-disable-next-line no-console\nfunction f(a) {}"
			},
			{
				code: "a() // eslint-disable-next-line no-console\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "a() // eslint-disable-next-line no-console\n/**\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "/* note */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/* note */\n/**\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "function f(/** @type {{\n\ta: number\n}} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {{ a: number }} a\n */\nfunction f(a) {}"
			},
			{
				code: "/** Does it.\n * More. */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * Does it.\n * More.\n *\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "\t/**\n\t * Does it. */\n\tfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "\t/**\n\t * Does it.\n\t *\n\t * @param {A} a\n\t */\n\tfunction f(a) {}"
			},
			{
				code: "/**\n * a */\nfunction f(/** @type {A} */ x) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * a\n *\n * @param {A} x\n */\nfunction f(x) {}"
			},
			{
				code: "/** a\n */\nfunction f(/** @type {A} */ x) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * a\n *\n * @param {A} x\n */\nfunction f(x) {}"
			},
			{
				code: "/**\n * @param {A} a\n *   text\n *\n * more\n */\nfunction f(a, /** @type {B} */ b) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n *   text\n * @param {B} b\n *\n * more\n */\nfunction f(a, b) {}"
			},
			{
				code: "/**\n * @template T\n */\nfunction f(/** @type {T} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @template T\n * @param {T} a\n */\nfunction f(a) {}"
			},
			{
				code: "/**\n */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "/**\n * Text.\n *\n */\nfunction f(/** @type {A} */ a) {}",
				errors: [ { messageId: "tag" } ],
				output: "/**\n * Text.\n *\n * @param {A} a\n */\nfunction f(a) {}"
			},
			{
				code: "function f(/** @type {A} */ { a }) {}",
				errors: [
					{
						message: "Type this parameter of `f` with a `@param` tag on the declaration instead of an inline comment; it is not fixed automatically because the parameter has no simple name to write in the tag, so document it by hand"
					}
				],
				output: null
			},
			{
				code: "function f(/** @type {A[]} */ ...rest) {}",
				errors: [ { messageId: "name" } ],
				output: null
			},
			{
				code: "function f(/** @type {A} */ a, /** @type {B} */ { b }) {}",
				errors: [
					{ messageId: "tag" },
					{ messageId: "name" }
				],
				output: "/**\n * @param {A} a\n */\nfunction f(a, /** @type {B} */ { b }) {}"
			},
			{
				code: "a(); function f(/** @type {A} */ a) {}",
				errors: [
					{
						message: "Type the parameters of `f` with `@param` tags on the declaration instead of inline comments; it is not fixed automatically because the declaration or its JSDoc comment does not start its line, so write the tags by hand"
					}
				],
				output: null
			},
			{
				code: "a(); /** d */ function f(/** @type {A} */ a) {}",
				errors: [ { messageId: "hand" } ],
				output: null
			}
		],
		valid: [
			"/**\n * @param {string} tx\n */\nfunction use(tx) {}",
			"function f(a) {}",
			"items.map((/** @type {string} */ x) => x)",
			"const f = function (/** @type {string} */ x) {}",
			"function f(a) {\n\treturn /** @type {string} */(a)/**/\n}",
			"function f(/* @type {string} */ a) {}",
			"function f(/** string */ a) {}",
			"function f(/** @type {string} extra */ a) {}",
			"function f(// @type {string}\n\ta) {}"
		]
	}
)
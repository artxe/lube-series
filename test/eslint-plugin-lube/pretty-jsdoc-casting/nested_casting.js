/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "var v = /** @type {A} */(a)/**//**/"
		},
		{
			code: "var v = /** @type {X} */(/** @type {A} */(a)/**/.b)/**/"
		},
		{ code: "var v = (a)" },
		{
			code: "var v = /** @type {A} */(/** @type {B} */(a))/**/"
		},
		{
			code: "var v = (/** @type {A} */(a)/**/)"
		}
	)
	invalid.push(
		{
			code: "var v = /** @type {A} */ (a)",
			errors: [ { messageId: "format" } ],
			output: "var v = /** @type {A} */(a)/**/"
		},
		{
			code: "var v = /** @type {A} */\n\t(a)",
			errors: [ { messageId: "format" } ],
			output: "var v = /** @type {A} */(a)/**/"
		},
		{
			code: "var v = /** @type {X} */(/** @type {A} */(a).b)",
			errors: [
				{ messageId: "marker" },
				{ messageId: "marker" }
			],
			output: "var v = /** @type {X} */(/** @type {A} */(a)/**/.b)/**/"
		},
		{
			code: "var v = /** @type {A} */(/** @type {B} */(a)/**/)/**/",
			errors: [ { messageId: "marker" } ],
			output: "var v = /** @type {A} */(/** @type {B} */(a))/**/"
		},
		{
			code: "var v = /** @type {X} */(a + /** @type {B} */(b))",
			errors: [
				{ messageId: "marker" },
				{ messageId: "marker" }
			],
			output: "var v = /** @type {X} */(a + /** @type {B} */(b)/**/)/**/"
		}
	)
}
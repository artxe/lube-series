/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{ code: "var _ = 'Hello'" },
		{ code: "var __ = 'Hello'" },
		{
			code: "var _snake_case = 'Hello'"
		},
		{ code: "var $ = 'Hello'" },
		{ code: "var $$ = 'Hello'" },
		{
			code: "var $snake_case$ = 'Hello'"
		},
		{
			code: "var __snake_case$$ = 'Hello'"
		},
		{
			code: "var $$snake_case$$ = 'Hello'"
		}
	)
	invalid.push(
		{
			code: "var __camelCase$$ = 'Hello'",
			errors: [
				{
					column: 5,
					line: 1,
					messageId: "rename"
				}
			],
			output: "var __camel_case$$ = 'Hello'"
		},
		{
			code: "var ___ = 'Hello'",
			errors: [
				{
					column: 5,
					line: 1,
					messageId: "case"
				}
			]
		},
		{
			code: "var $$$ = 'Hello'",
			errors: [
				{
					column: 5,
					line: 1,
					messageId: "case"
				}
			]
		},
		{
			code: "var $snake$case$ = 'Hello'",
			errors: [
				{
					column: 5,
					line: 1,
					messageId: "case"
				}
			]
		}
	)
}
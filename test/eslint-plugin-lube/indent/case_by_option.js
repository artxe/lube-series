/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "function f() {\n\treturn 1\n}"
		},
		{
			code: "switch (a) {\ncase 1:\n\tb()\n}",
			options: [ "tab", { SwitchCase: 0 } ]
		},
		{ code: "const a = b\n\t|| c" },
		{
			code: "const a = b\n\t\t|| c",
			options: [ "tab", { binaryOperator: 2 } ]
		},
		{
			code: "const a = b\n|| c",
			options: [ "tab", { binaryOperator: 0 } ]
		},
		{ code: "f(\n\ta\n\t\t|| b\n)" },
		{
			code: "const a = (\n\tb\n\t\t+ c\n\t\t+ d\n)"
		},
		{
			code: "if (\n\ta\n\t\t&& b\n) {\n\tc()\n}"
		},
		{
			code: "const a = [\n\tb\n\t\t?? c\n]"
		}
	)
	invalid.push(
		{
			code: "function f() {\n\treturn 1\n}",
			errors: [
				{
					data: {
						actual: "1 tab",
						expected: "2 spaces"
					},
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			options: [ 2 ],
			output: "function f() {\n  return 1\n}"
		},
		{
			code: "function f() {\n    return 1\n}",
			errors: [
				{
					data: {
						actual: "4 spaces",
						expected: "1 tab"
					},
					messageId: "wrongIndentation"
				}
			],
			output: "function f() {\n\treturn 1\n}"
		},
		{
			code: "switch (a) {\ncase 1:\n\tb()\n}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			output: "switch (a) {\n\tcase 1:\n\t\tb()\n}"
		},
		{
			code: "const a = b\n|| c",
			errors: [
				{ messageId: "wrongIndentation" }
			],
			output: "const a = b\n\t|| c"
		},
		{
			code: "f(\n\ta\n\t|| b\n)",
			errors: [
				{ messageId: "wrongIndentation" }
			],
			output: "f(\n\ta\n\t\t|| b\n)"
		},
		{
			code: "const a = b\n\t+ c\n\t\t+ d",
			errors: [
				{ messageId: "wrongIndentation" }
			],
			output: "const a = b\n\t+ c\n\t+ d"
		},
		{
			code: "if (a) {\r\n  b()\r\n}",
			errors: [
				{ messageId: "wrongIndentation" }
			],
			output: "if (a) {\r\n\tb()\r\n}"
		}
	)
}
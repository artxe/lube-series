/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "foo(\"a\\\nb\", cccccccccccccccccccccccccccccc)"
		},
		{
			code: "foo(`a\nb`, cccccccccccccccccccccccccccccc)"
		},
		{
			code: "foo(`a b`, cccccccccccccccccccccccccccccc)"
		},
		{
			code: "foo(\"a b\", cccccccccccccccccccccccccccccc)"
		},
		{
			code: "foo(...`a${1}b c${2}`, ...[ 1, 2 ], ccccccccccccccccccc)"
		},
		{
			code: "foo(<a title=\"a\n  b\" />, cccccccccccccccccccccccccccccc)",
			languageOptions: {
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		},
		{ code: "f(\n\ta, // a\n\tb\n)" },
		{ code: "f(/* a */)" },
		{
			code: "var value = [\n\ta\n\t// b,\n]"
		},
		{ code: "var value = [,]" },
		{
			code: "var value = new (foo())"
		},
		{ code: "value = (a, (b))" }
	)
	invalid.push(
		{
			code: "f(\n\ta,\n\t// a\n)",
			errors: [ { messageId: "multiline" } ],
			output: "f(\n\ta\n\t// a\n)"
		},
		{
			code: "f(a, b)",
			errors: [ { messageId: "single_line" } ],
			output: "f(a, b)"
		},
		{
			code: "var value = [ b, c // note\n]",
			errors: [ { messageId: "multiline" } ],
			output: "var value = [\n\tb,\n\tc // note\n]"
		},
		{
			code: "f(a, // a\nb)",
			errors: [ { messageId: "multiline" } ],
			output: "f(\n\ta, // a\n\tb\n)"
		},
		{
			code: "f(a // a\n, b)",
			errors: [ { messageId: "multiline" } ],
			output: "f(\n\ta, // a\n\tb\n)"
		},
		{
			code: "var value = { a: 1, // one\n}",
			errors: [ { messageId: "multiline" } ],
			output: "var value = {\n\ta: 1 // one\n}"
		},
		{
			code: "f(a, /* a */)",
			errors: [ { messageId: "single_line" } ],
			output: "f(a /* a */)"
		},
		{
			code: "var value = [a, ,]",
			errors: [ { messageId: "single_line" } ],
			output: "var value = [ a, , ]"
		},
		{
			code: "var value = [\n\t,\n\taaaaaaaaaaaaaaaaaaaa, // a\n\t, ,\n\tbbbbbbbbbbbbbbbbbbbb\n]",
			errors: [ { messageId: "multiline" } ],
			output: "var value = [\n\t,\n\taaaaaaaaaaaaaaaaaaaa, // a\n\t,\n\t,\n\tbbbbbbbbbbbbbbbbbbbb\n]"
		},
		{
			code: "var value = [a,b]\r\nf(aaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbb)\r\n",
			errors: [
				{
					line: 1,
					messageId: "single_line"
				},
				{ line: 2, messageId: "multiline" }
			],
			output: "var value = [ a, b ]\r\nf(\r\n\taaaaaaaaaaaaaaaa,\r\n\tbbbbbbbbbbbbbbbbbbb\r\n)\r\n"
		},
		{
			code: "var value = [a,b]\rf(aaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbb)\r",
			errors: [
				{
					line: 1,
					messageId: "single_line"
				},
				{ line: 2, messageId: "multiline" }
			],
			output: "var value = [ a, b ]\rf(\r\taaaaaaaaaaaaaaaa,\r\tbbbbbbbbbbbbbbbbbbb\r)\r"
		},
		{
			code: "var value = [a,b] f(aaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbb) ",
			errors: [
				{
					line: 1,
					messageId: "single_line"
				},
				{ line: 2, messageId: "multiline" }
			],
			output: "var value = [ a, b ] f( \taaaaaaaaaaaaaaaa, \tbbbbbbbbbbbbbbbbbbb ) "
		}
	)
}
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{ code: "var value = a ? b : c" },
		{
			code: "var value = a\n? b\n: c\n? d\n: e"
		},
		{
			code: "var value = a ? (b ? c : d) : e"
		},
		{
			code: "var value = (a ? b : c) ? d : e"
		},
		{
			code: "var value = a\n\t? b\n\t: c\n\t\t? d\n\t\t: e"
		},
		{
			code: "function f() {\n\treturn a\n\t\t? b\n\t\t\t? c\n\t\t\t: d\n\t\t: e\n}"
		},
		{
			code: "var value = a ? f(b ? c : d) : e"
		}
	)
	invalid.push(
		{
			code: "var value = a ? b : c ? d : e",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\n\t? b\n\t: c\n\t\t? d\n\t\t: e"
		},
		{
			code: "var value = a ? b ? c : d : e",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\n\t? b\n\t\t? c\n\t\t: d\n\t: e"
		},
		{
			code: "var value = a ?\n\tb :\n\tc",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\n\t? b\n\t: c"
		},
		{
			code: "var value = a ? b : c ? d : e,\n\tother = 1",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\n\t\t? b\n\t\t: c\n\t\t\t? d\n\t\t\t: e,\n\tother = 1"
		},
		{
			code: "var value = a?b:c",
			errors: [ { messageId: "spacing" } ],
			output: "var value = a ? b : c"
		},
		{
			code: "if (x) {\n\tvalue = a ? b : c ? d : e\n}",
			errors: [ { messageId: "multiline" } ],
			output: "if (x) {\n\tvalue = a\n\t\t? b\n\t\t: c\n\t\t\t? d\n\t\t\t: e\n}"
		},
		{
			code: "var value = a ? f(b ? c : d ? e : g) : h",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a ? f(b\n\t? c\n\t: d\n\t\t? e\n\t\t: g) : h"
		}
	)
}
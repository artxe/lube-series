/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "var value = a ? // b\n\tb : c ? d : e"
		},
		{
			code: "var value = `${a ? b : c ? d : e}`"
		},
		{
			code: "var value = a\n\t? `b\nc`\n\t: d"
		}
	)
	invalid.push(
		{
			code: "var value = a /* a */ ? /** @type {B} */(b)/**/ : c ? d : e",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a /* a */\n\t? /** @type {B} */(b)/**/\n\t: c\n\t\t? d\n\t\t: e"
		},
		{
			code: "var value = a // a\n? b : c",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a // a\n? b\n\t: c"
		},
		{
			code: "var value = a ? `b\nc` : d",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\n\t? `b\nc`\n\t: d"
		},
		{
			code: "var value = a ? b : c ? d : e\r\n",
			errors: [ { messageId: "multiline" } ],
			output: "var value = a\r\n\t? b\r\n\t: c\r\n\t\t? d\r\n\t\t: e\r\n"
		}
	)
}
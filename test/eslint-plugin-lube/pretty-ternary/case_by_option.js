/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "var value = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ? yyyyyyyyyyyyyyyyyyy : zzzzzzzzzzzzzzzzzzz"
		},
		{
			code: "var value = a ? b : c",
			options: [ { maxLength: 9 } ]
		},
		{
			code: "var value = `${a ? b : c ? d : e}`",
			options: [
				{ ignoreTemplateLiteral: true }
			]
		}
	)
	invalid.push(
		{
			code: "var value = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ? yyyyyyyyyyyyyyyyyyy : zzzzzzzzzzzzzzzzzzz",
			errors: [ { messageId: "multiline" } ],
			output: "var value = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n\t? yyyyyyyyyyyyyyyyyyy\n\t: zzzzzzzzzzzzzzzzzzz"
		},
		{
			code: "var value = a ? b : c",
			errors: [ { messageId: "multiline" } ],
			options: [ { maxLength: 8 } ],
			output: "var value = a\n\t? b\n\t: c"
		},
		{
			code: "var value = a ? b : c ? d : e",
			errors: [ { messageId: "multiline" } ],
			options: [ { indent: "  " } ],
			output: "var value = a\n  ? b\n  : c\n    ? d\n    : e"
		},
		{
			code: "var value = `${a ? b : c ? d : e}`",
			errors: [ { messageId: "multiline" } ],
			options: [
				{ ignoreTemplateLiteral: false }
			],
			output: "var value = `${a\n\t? b\n\t: c\n\t\t? d\n\t\t: e}`"
		}
	)
}
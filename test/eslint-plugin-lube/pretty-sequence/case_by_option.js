/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: `
			var value = [a,b,c]
			var value = (a,b,c) => {}
			var value = {a,b,c}
			a,b,c
			`,
			options: [
				{
					checkArray: false,
					checkCall: false,
					checkObject: false,
					checkSequence: false
				}
			]
		},
		{
			code: `
			var value = {
			    aaaaaaaaaa_aaaaaaaaaa_aaaaaaaaaa
			}
			`,
			options: [ { indent: "    " } ]
		},
		{
			code: `
			var value = { aaaaaaaaaa_aaaaaaaaaa_aaaaaaaaaa }
			`,
			options: [ { maxLength: 40 } ]
		}
	)
	invalid.push(
		{
			code: `
			var value = [a,b,c]
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { arrayBracketSpacing: true } ],
			output: `
			var value = [ a, b, c ]
			`
		},
		{
			code: `
			var value = [a,b,c]
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { arrayBracketSpacing: false } ],
			output: `
			var value = [a, b, c]
			`
		}
	)
	invalid.push(
		{
			code: `
			var value = (a,b,c) => {}
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { funcCallSpacing: true } ],
			output: `
			var value = ( a, b, c ) => {}
			`
		},
		{
			code: `
			var value = (a,b,c) => {}
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { funcCallSpacing: false } ],
			output: `
			var value = (a, b, c) => {}
			`
		}
	)
	invalid.push(
		{
			code: `
			var value = {a,b,c}
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { objectCurlySpacing: true } ],
			output: `
			var value = { a, b, c }
			`
		},
		{
			code: `
			var value = {a,b,c}
			`,
			errors: [ { messageId: "single_line" } ],
			options: [ { objectCurlySpacing: false } ],
			output: `
			var value = {a, b, c}
			`
		}
	)
	invalid.push(
		{
			code: `
			var value = \`\${[a,b,c]}\`
			`,
			errors: [ { messageId: "single_line" } ],
			options: [
				{ ignoreTemplateLiteral: false }
			],
			output: `
			var value = \`\${[ a, b, c ]}\`
			`
		},
		{
			code: "call(\n\taaaaaaaaaa,\n\tbbbbbbbbbb,\n\tcccccccccc,\n\tdddddddddd\n)",
			errors: [ { messageId: "single_line" } ],
			options: [ { maxLength: 80 } ],
			output: "call(aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd)"
		}
	)
}
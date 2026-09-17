/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	push_cases("export", valid, invalid)
	push_cases("import", valid, invalid)
	valid.push(
		{
			code: `
			var a, b, c
			export { a, b, c };
			`,
			options: [ { semicolon: true } ]
		},
		{
			code: `
import {
	aaaaa_bbbbb,
	aaaaa_ccccc,
	aaaaa_ddddd
} from "module";`,
			options: [ { semicolon: true } ]
		}
	)
}
/**
 * @param {"export" | "import"} keyword
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
function push_cases(keyword, valid, invalid) {
	valid.push(
		{
			code: `

			${keyword} { a, b as c, d } from 'module'
			${keyword} { fff, ggg, hhh, iii, jjj, kkk, lll } from 'module/2'
			`,
			options: [ { maxLength: 30 } ]
		}
	)
	invalid.push(
		{
			code: `

			${keyword} { a, b as c, d } from 'module'
		    ${keyword} { fff, ggg, hhh, iii, jjj, kkk, lll } from 'module/2'
			`,
			errors: [
				{
					column: 4,
					line: 3,
					messageId: "semicolon"
				},
				{
					column: 7,
					line: 4,
					messageId: "multiline"
				}
			],
			options: [
				{ maxLength: 10, semicolon: true }
			],
			output: `

			${keyword} { a, b as c, d } from 'module';
		    ${keyword} {
		    	fff,
		    	ggg,
		    	hhh,
		    	iii,
		    	jjj,
		    	kkk,
		    	lll
		    } from 'module/2';
			`
		},
		{
			code: `

			${keyword} { a, b as c, d } from 'module'  ;
		    ${keyword} { fff, ggg, hhh, iii, jjj, kkk, lll } from 'module/2'
			`,
			errors: [
				{
					column: 4,
					line: 3,
					messageId: "no_semicolon"
				},
				{
					column: 7,
					line: 4,
					messageId: "multiline"
				}
			],
			options: [
				{ indent: "  ", maxLength: 10 }
			],
			output: `

			${keyword} { a, b as c, d } from 'module'
		    ${keyword} {
		      fff,
		      ggg,
		      hhh,
		      iii,
		      jjj,
		      kkk,
		      lll
		    } from 'module/2'
			`
		}
	)
}
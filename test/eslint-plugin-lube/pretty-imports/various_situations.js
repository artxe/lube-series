import ts_parser from "@typescript-eslint/parser"
/** @type {import("eslint").Linter.LanguageOptions} */
const typescript = {
	parser: ts_parser,
	parserOptions: { sourceType: "module" }
}
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "import { a,// comment\n b } from \"module\""
		},
		{
			code: "import def, * as all from \"module\""
		},
		{
			code: "import { d, c } from \"b\"\nimport a from \"a\""
		}
	)
	invalid.push(
		{
			code: "import def, {a,b} from \"module\"",
			errors: [ { messageId: "single_line" } ],
			output: "import def, { a, b } from \"module\""
		},
		{
			code: "import def,{aaaaaaaaaaaa,bbbbbbbbbbbbbbbb,ccccccccccccccccc} from \"module\"",
			errors: [ { messageId: "multiline" } ],
			output: "import def, {\n\taaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbb,\n\tccccccccccccccccc\n} from \"module\""
		},
		{
			code: "import {aaaaaaaaaaaa,bbbbbbbbbbbbbbbb,ccccccccccccccccc} from \"module\"\r\nvar a\r\n",
			errors: [ { messageId: "multiline" } ],
			output: "import {\r\n\taaaaaaaaaaaa,\r\n\tbbbbbbbbbbbbbbbb,\r\n\tccccccccccccccccc\r\n} from \"module\"\r\nvar a\r\n"
		},
		{
			code: "import {a,b,} from \"module\"",
			errors: [ { messageId: "single_line" } ],
			output: "import { a, b } from \"module\""
		},
		{
			code: "import {a,b} from \"module\";var value = 1",
			errors: [ { messageId: "single_line" } ],
			output: "import { a, b } from \"module\";var value = 1"
		},
		{
			code: "var a, b\nexport {a,b};var value = 1",
			errors: [ { messageId: "single_line" } ],
			output: "var a, b\nexport { a, b };var value = 1"
		},
		{
			code: "import {a,b} from \"module\"\n;[a, b].map(f)",
			errors: [ { messageId: "single_line" } ],
			output: "import { a, b } from \"module\"\n;[a, b].map(f)"
		},
		{
			code: "import {a,b} from \"module\"\n;[a, b].map(f)",
			errors: [ { messageId: "single_line" } ],
			options: [ { semicolon: true } ],
			output: "import { a, b } from \"module\"\n;[a, b].map(f)"
		},
		{
			code: "declare namespace N { export {a,b}; }",
			errors: [ { messageId: "single_line" } ],
			languageOptions: typescript,
			output: "declare namespace N { export { a, b } }"
		},
		{
			code: "declare namespace N { export {a,b} }",
			errors: [ { messageId: "single_line" } ],
			languageOptions: typescript,
			options: [ { semicolon: true } ],
			output: "declare namespace N { export { a, b }; }"
		},
		{
			code: "import {a,b} from \"module\" with { type: \"json\" };",
			errors: [ { messageId: "single_line" } ],
			output: "import { a, b } from \"module\" with { type: \"json\" }"
		},
		{
			code: "import type {A,B} from \"module\"\nimport {type C,D} from \"module\"\nexport type {E,F} from \"module\"",
			errors: [
				{
					line: 1,
					messageId: "single_line"
				},
				{
					line: 2,
					messageId: "single_line"
				},
				{
					line: 3,
					messageId: "single_line"
				}
			],
			languageOptions: typescript,
			output: "import type { A, B } from \"module\"\nimport { type C, D } from \"module\"\nexport type { E, F } from \"module\""
		}
	)
}
import ts_parser from "@typescript-eslint/parser"
/** @type {import("eslint").Linter.LanguageOptions} */
const language_options = {
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
			code: "class A { method(@Inject() aaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbb: number) {} }",
			languageOptions: language_options
		},
		{
			code: "const f = ({ a }: P, [ c ]: T) => a",
			languageOptions: language_options
		}
	)
	invalid.push(
		{
			code: "const f = ({a,b}: Props) => a",
			errors: [ { messageId: "single_line" } ],
			languageOptions: language_options,
			output: "const f = ({ a, b }: Props) => a"
		},
		{
			code: "const f = ([a,b]: [number, number]) => a",
			errors: [ { messageId: "single_line" } ],
			languageOptions: language_options,
			output: "const f = ([ a, b ]: [number, number]) => a"
		},
		{
			code: "f<(x: number) => void>( a )",
			errors: [ { messageId: "single_line" } ],
			languageOptions: language_options,
			output: "f<(x: number) => void>(a)"
		},
		{
			code: "function f<T extends (x: number) => void>( a: T ) {}",
			errors: [ { messageId: "single_line" } ],
			languageOptions: language_options,
			output: "function f<T extends (x: number) => void>(a: T) {}"
		},
		{
			code: "new Foo<(x: number) => void>( a )",
			errors: [ { messageId: "single_line" } ],
			languageOptions: language_options,
			output: "new Foo<(x: number) => void>(a)"
		}
	)
}
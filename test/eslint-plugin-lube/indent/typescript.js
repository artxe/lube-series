import ts_parser from "@typescript-eslint/parser"
/** @type {import("eslint").Linter.LanguageOptions} */
const typescript = { parser: ts_parser }
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "interface A {\n\tb: string\n\tc(): void\n}",
			languageOptions: typescript
		},
		{
			code: "type Lower = \"a\"\n\t| \"b\"\n\t| \"c\"",
			languageOptions: typescript
		},
		{
			code: "type A<T> = T extends string\n\t? 1\n\t: 2",
			languageOptions: typescript
		},
		{
			code: "enum A {\n\tB,\n\tC\n}",
			languageOptions: typescript
		},
		{
			code: "function f(\n\ta: string\n): Promise<\n\tvoid\n> {}",
			languageOptions: typescript
		}
	)
	invalid.push(
		{
			code: "type A = {\nb: string\n}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			languageOptions: typescript,
			output: "type A = {\n\tb: string\n}"
		},
		{
			code: "if (a) {\n error satisfies B\n}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			languageOptions: typescript,
			output: "if (a) {\n\terror satisfies B\n}"
		},
		{
			code: "type A = B\n| C",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			languageOptions: typescript,
			output: "type A = B\n\t| C"
		}
	)
}
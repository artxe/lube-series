import ts_parser from "@typescript-eslint/parser"
/** @type {import("eslint").Linter.LanguageOptions} */
const typescript = { parser: ts_parser }
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "type MergeValue<A, B> = B extends NotPlain | Primitive\n\t? B\n\t: B extends WeakKey\n\t\t? A extends NotPlain | Primitive\n\t\t\t? B\n\t\t\t: A extends WeakKey\n\t\t\t\t? MergeObject<A, B>\n\t\t\t\t: B\n\t\t: B",
			languageOptions: typescript
		},
		{
			code: "type M<A> = A extends string\n\t? 1\n\t: A extends number\n\t? 2\n\t: 3",
			languageOptions: typescript
		},
		{
			code: "type A<T> = T extends { a?: string } ? T[\"a\"] : never",
			languageOptions: typescript
		}
	)
	invalid.push(
		{
			code: "type MergeValue<A, B> = B extends NotPlain | Primitive ? B : B extends WeakKey ? A extends NotPlain | Primitive ? B : A extends WeakKey ? MergeObject<A, B> : B : B",
			errors: [ { messageId: "multiline" } ],
			languageOptions: typescript,
			output: "type MergeValue<A, B> = B extends NotPlain | Primitive\n\t? B\n\t: B extends WeakKey\n\t\t? A extends NotPlain | Primitive\n\t\t\t? B\n\t\t\t: A extends WeakKey\n\t\t\t\t? MergeObject<A, B>\n\t\t\t\t: B\n\t\t: B"
		},
		{
			code: "var value = (a as boolean) ? <T>(b) : c ? d! : e satisfies F",
			errors: [ { messageId: "multiline" } ],
			languageOptions: typescript,
			output: "var value = (a as boolean)\n\t? <T>(b)\n\t: c\n\t\t? d!\n\t\t: e satisfies F"
		}
	)
}
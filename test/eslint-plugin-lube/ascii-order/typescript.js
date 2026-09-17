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
			code: "type T = { b: 1, [k: string]: 1, a: 1 }",
			languageOptions: language_options
		},
		{
			code: "interface I { b(): void; (): void; a: 1 }",
			languageOptions: language_options
		},
		{
			code: "import { type B, a } from \"m\"",
			languageOptions: language_options
		},
		{
			code: "var o = { b: [ \"x\" ] as const, a: f() }",
			languageOptions: language_options,
			options: [ { checkKeys: false } ]
		}
	)
	invalid.push(
		{
			code: "var o = { b: new Map<string, number>(), a: new Set([ 1 ] as const) }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "var o = { a: new Set([ 1 ] as const), b: new Map<string, number>() }"
		},
		{
			code: "declare class Map {}\nvar o = { b: new Map(), a: y }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: null
		},
		{
			code: "type T = { b: 1; a: 2 }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "type T = { a: 2; b: 1 }"
		},
		{
			code: "type T = { c: 1, b: 2, a: 3, }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "type T = { a: 3, b: 2, c: 1, }"
		},
		{
			code: "interface I {\n\tb: string\n\ta(): void\n}",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "interface I {\n\ta(): void\n\tb: string\n}"
		},
		{
			code: "type T = { b: 1 /* b */; a: 2 }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "type T = { a: 2; b: 1 /* b */ }"
		},
		{
			code: "var o = { b: [ \"x\" ] as const, a: y! }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "var o = { a: y!, b: [ \"x\" ] as const }"
		},
		{
			code: "var o = { b: x as X, a: f() }",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: null
		},
		{
			code: "const f = ({ b, a }: P) => a",
			errors: [ { messageId: "keys" } ],
			languageOptions: language_options,
			output: "const f = ({ a, b }: P) => a"
		},
		{
			code: "import { type b, a } from \"m\"",
			errors: [ { messageId: "names" } ],
			languageOptions: language_options,
			output: "import { a, type b } from \"m\""
		},
		{
			code: "import type { B } from \"b\"\nimport x = require(\"x\")\nimport type { C } from \"c\"\nimport { a } from \"a\"",
			errors: [ { messageId: "imports" } ],
			languageOptions: language_options,
			output: "import type { B } from \"b\"\nimport x = require(\"x\")\nimport { a } from \"a\"\nimport type { C } from \"c\""
		},
		{
			code: "declare module \"m\" {\n\timport b from \"b\"\n\timport a from \"a\"\n}",
			errors: [ { messageId: "imports" } ],
			languageOptions: language_options,
			output: "declare module \"m\" {\n\timport a from \"a\"\n\timport b from \"b\"\n}"
		},
		{
			code: "function b(x: string): void\nfunction b(x) {}\nfunction a() {}",
			errors: [ { messageId: "declarations" } ],
			languageOptions: language_options,
			output: "function a() {}\nfunction b(x: string): void\nfunction b(x) {}"
		},
		{
			code: "export declare function b(): void\nexport declare function a(): void",
			errors: [ { messageId: "declarations" } ],
			languageOptions: language_options,
			output: "export declare function a(): void\nexport declare function b(): void"
		},
		{
			code: "declare module \"m\" {\n\tfunction b(): void\n\tfunction a(): void\n}",
			errors: [ { messageId: "declarations" } ],
			languageOptions: language_options,
			output: "declare module \"m\" {\n\tfunction a(): void\n\tfunction b(): void\n}"
		},
		{
			code: "declare module \"m\" { function b(): void; function a(): void }",
			errors: [ { messageId: "declarations" } ],
			languageOptions: language_options,
			output: null
		}
	)
}
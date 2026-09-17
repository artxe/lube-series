/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "describe(\"a\", () => {})\nit(\"b\", () => {})"
		},
		{
			code: "it(\"b\", f)\nbeforeEach(f)\nit(\"a\", f)"
		},
		{
			code: "it(name, f)\nit(\"a\", f)"
		},
		{
			code: "it(`b${x}`, f)\nit(\"a\", f)"
		},
		{ code: "it(1, f)\nit(\"0\", f)" },
		{
			code: "it.each([])(\"b\", f)\nit(\"a\", f)"
		},
		{
			code: "it[x](\"b\", f)\nit(\"a\", f)"
		},
		{
			code: "check(\"b\")\ncheck(\"a\")"
		},
		{
			code: "it(\"b\", f)\nfunction a() {}"
		},
		{
			code: "it(\"b\", f)\nit(\"a\", f)",
			options: [ { checkTests: false } ]
		},
		{
			code: "function b() {}\nfunction a() {}\nimport y from \"y\"\nimport x from \"x\"\nit(\"b\", f)\nit(\"a\", f)",
			options: [
				{
					checkDeclarations: false,
					checkImports: false,
					checkTests: false
				}
			]
		}
	)
	invalid.push(
		{
			code: "it(\"b\", () => {})\nit(\"a\", () => {})",
			errors: [
				{
					column: 4,
					data: {
						name: "a",
						previous: "b",
						reason: ""
					},
					line: 2,
					messageId: "tests"
				}
			],
			output: "it(\"a\", () => {})\nit(\"b\", () => {})"
		},
		{
			code: "describe(\"x\", () => {\n\ttest.skip(\"b\", f)\n\ttest.concurrent.only(`a`, f)\n})",
			errors: [ { messageId: "tests" } ],
			output: "describe(\"x\", () => {\n\ttest.concurrent.only(`a`, f)\n\ttest.skip(\"b\", f)\n})"
		},
		{
			code: "describe(\"b\", f);\nit(\"a\", f);\n(g)()",
			errors: [ { messageId: "tests" } ],
			output: "it(\"a\", f);\ndescribe(\"b\", f);\n(g)()"
		},
		{
			code: "it(\"b\", f);\nit(\"a\", f)",
			errors: [ { messageId: "tests" } ],
			output: "it(\"a\", f)\nit(\"b\", f);"
		},
		{
			code: "it(\"b\", f)\nit(\"a\", f);\n(g)()",
			errors: [ { messageId: "tests" } ],
			output: null
		},
		{
			code: "it(\"b\", f); it(\"a\", f)",
			errors: [ { messageId: "tests" } ],
			output: null
		},
		{
			code: "it(\"c\", f); it(\"b\", f); it(\"a\", f);",
			errors: [ { messageId: "tests" } ],
			output: "it(\"a\", f); it(\"b\", f); it(\"c\", f);"
		},
		{
			code: "function b() {}\nfunction a() {}\nit(\"b\", f)\nit(\"a\", f)",
			errors: [ { messageId: "tests" } ],
			options: [
				{
					checkDeclarations: false,
					checkImports: false
				}
			],
			output: "function b() {}\nfunction a() {}\nit(\"a\", f)\nit(\"b\", f)"
		}
	)
}
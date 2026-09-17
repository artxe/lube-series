/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "function a() {}\nfunction b() {}"
		},
		{
			code: "function b() {}\nvar x\nfunction a() {}"
		},
		{ code: "class B {}\nclass A {}" },
		{
			code: "var b = function() {}\nvar a = function() {}"
		},
		{
			code: "function b() {}\nexport default function a() {}"
		},
		{
			code: "function a() {}\nexport function b() {}"
		},
		{
			code: "function c() {}\nfunction _default() {}\nfunction a() {}\nexport default _default"
		},
		{
			code: "function b() {}\nfunction a() {}\nexport { a as default }"
		},
		{
			code: "function b() {}\nfunction a() {}",
			options: [ { checkDeclarations: false } ]
		}
	)
	invalid.push(
		{
			code: "function b() {}\nfunction a() {}",
			errors: [
				{
					column: 10,
					data: {
						name: "a",
						previous: "b",
						reason: ""
					},
					line: 2,
					messageId: "declarations"
				}
			],
			output: "function a() {}\nfunction b() {}"
		},
		{
			code: "export function c() {}\nasync function b() {}\nfunction* a() {}",
			errors: [ { messageId: "declarations" } ],
			output: "function* a() {}\nasync function b() {}\nexport function c() {}"
		},
		{
			code: "export function c() {} function b() {} function a() {}",
			errors: [ { messageId: "declarations" } ],
			output: "function a() {} function b() {} export function c() {}"
		},
		{
			code: "function c() {}\nfunction b() {}\nfunction _default() {}\nexport default _default",
			errors: [ { messageId: "declarations" } ],
			output: "function b() {}\nfunction c() {}\nfunction _default() {}\nexport default _default"
		},
		{
			code: "function main() {\n\tfunction z() {}\n\tfunction main() {}\n}\nexport default main",
			errors: [ { messageId: "declarations" } ],
			output: "function main() {\n\tfunction main() {}\n\tfunction z() {}\n}\nexport default main"
		},
		{
			code: "function f() {\n\tfunction b() {}\n\tfunction a() {}\n\treturn a\n}",
			errors: [ { messageId: "declarations" } ],
			output: "function f() {\n\tfunction a() {}\n\tfunction b() {}\n\treturn a\n}"
		},
		{
			code: "class C {\n\tstatic {\n\t\tfunction b() {}\n\t\tfunction a() {}\n\t}\n}",
			errors: [ { messageId: "declarations" } ],
			output: "class C {\n\tstatic {\n\t\tfunction a() {}\n\t\tfunction b() {}\n\t}\n}"
		},
		{
			code: "var x\nfunction b() {}\nfunction b() {}\nfunction a() {}",
			errors: [ { messageId: "declarations" } ],
			languageOptions: { sourceType: "script" },
			output: "var x\nfunction a() {}\nfunction b() {}\nfunction b() {}"
		}
	)
}
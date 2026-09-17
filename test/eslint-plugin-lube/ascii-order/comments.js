/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "var o = {\n\t// a\n\ta: 1,\n\tb: 2 // b\n}"
		}
	)
	invalid.push(
		{
			code: "var o = {\n\t// b\n\tb: 1,\n\t/* a */\n\ta: 2\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\t/* a */\n\ta: 2,\n\t// b\n\tb: 1\n}"
		},
		{
			code: "var o = {\n\tb: 1, // b\n\ta: 2 // a\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\ta: 2, // a\n\tb: 1 // b\n}"
		},
		{
			code: "var o = {\n\tc: 1, /* c */ // c\n\tb: 2,\n\ta: 3, // a\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\ta: 3, // a\n\tb: 2,\n\tc: 1, /* c */ // c\n}"
		},
		{
			code: "var o = {\n\t/**\n\t * @returns {number}\n\t */\n\tb() {\n\t\treturn 1\n\t},\n\t/**\n\t * @returns {number}\n\t */\n\ta() {\n\t\treturn 2\n\t}\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\t/**\n\t * @returns {number}\n\t */\n\ta() {\n\t\treturn 2\n\t},\n\t/**\n\t * @returns {number}\n\t */\n\tb() {\n\t\treturn 1\n\t}\n}"
		},
		{
			code: "var o = { b: /** @type {B} */(x)/**/, a: 1 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: 1, b: /** @type {B} */(x)/**/ }"
		},
		{
			code: "var o = {\n\tb: 1, // b\n\ta: 2 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: 1 /* b */, a: 2/**/ }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: 2/**/, b: 1 /* b */ }"
		},
		{
			code: "var o = { b: 1 // b\n, a: 2 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: 1, /* a */ a: 2 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { /* b */ b: 1, a: 2 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: 1, a: 2 /* a */ }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: 1, c: 2, // c\n\ta: 3 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = {\n\tb: 1,\n\t// a\n\ta: 2 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\t// a\n\ta: 2,\n\tb: 1 }"
		},
		{
			code: "var o = { b: 1,\n\t// a\n\ta: 2 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "\"use strict\"\n/**\n * @returns {void}\n */\nfunction b() {}\n/**\n * @returns {void}\n */\nfunction a() {} // a",
			errors: [ { messageId: "declarations" } ],
			output: "\"use strict\"\n/**\n * @returns {void}\n */\nfunction a() {} // a\n/**\n * @returns {void}\n */\nfunction b() {}"
		},
		{
			code: "// @ts-check\nfunction b() {}\nfunction a() {}",
			errors: [ { messageId: "declarations" } ],
			output: null
		},
		{
			code: "// @ts-check\nfunction a() {}\nfunction c() {}\nfunction b() {}",
			errors: [ { messageId: "declarations" } ],
			output: "// @ts-check\nfunction a() {}\nfunction b() {}\nfunction c() {}"
		},
		{
			code: "function b() {}\nfunction a() {} /* a */ function c() {}",
			errors: [ { messageId: "declarations" } ],
			output: null
		},
		{
			code: "function b() {}\nfunction a() {} /* a */ var x",
			errors: [ { messageId: "declarations" } ],
			output: null
		}
	)
}
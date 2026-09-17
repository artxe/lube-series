import ts_parser from "@typescript-eslint/parser"
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "{\n\t\"exports\": {\n\t\t\".\": {\n\t\t\t\"types\": \"./a.d.ts\",\n\t\t\t\"default\": \"./a.js\"\n\t\t}\n\t},\n\t\"imports\": {\n\t\t\"#a\": {\n\t\t\t\"node\": \"./a.js\",\n\t\t\t\"default\": \"./b.js\"\n\t\t}\n\t}\n}",
			filename: "package.json",
			languageOptions: { parser: ts_parser }
		},
		{
			code: "var o = { a: 1, b: 2, c: 3 }"
		},
		{
			code: "var o = { B: 1, a: 2, b: 3 }"
		},
		{
			code: "var o = { \"@x\": 1, \"a-b\": 2, a_b: 3 }"
		},
		{
			code: "var o = { 10: 1, 9: 2 }"
		},
		{
			code: "var o = { b: 1, ...a, a: 2 }"
		},
		{
			code: "var o = { a: 1, a: 2, b: 3 }"
		},
		{
			code: "var o = { b: 1, [a]: 2, a: 3 }"
		},
		{
			code: "var o = { b: 1, [`a`]: 2, a: 3 }"
		},
		{
			code: "var o = { get a() { return 1 }, set a(v) {}, b: 2 }"
		},
		{ code: "var { b, ...a } = o" },
		{ code: "var o = {}" },
		{
			code: "var o = { b: 1, a: 2 }",
			options: [ { checkKeys: false } ]
		}
	)
	invalid.push(
		{
			code: "{\n\t\"version\": \"1.0.0\",\n\t\"name\": \"a\"\n}",
			errors: [ { messageId: "keys" } ],
			filename: "package.json",
			languageOptions: { parser: ts_parser },
			output: "{\n\t\"name\": \"a\",\n\t\"version\": \"1.0.0\"\n}"
		},
		{
			code: "{\n\t\"exports\": {\n\t\t\".\": {\n\t\t\t\"default\": \"./a.js\",\n\t\t\t\"require\": \"./a.cjs\",\n\t\t\t\"import\": \"./a.mjs\",\n\t\t\t\"types\": \"./a.d.ts\"\n\t\t}\n\t}\n}",
			errors: [ { messageId: "conditions" } ],
			filename: "packages/a/package.json",
			languageOptions: { parser: ts_parser },
			output: "{\n\t\"exports\": {\n\t\t\".\": {\n\t\t\t\"types\": \"./a.d.ts\",\n\t\t\t\"import\": \"./a.mjs\",\n\t\t\t\"require\": \"./a.cjs\",\n\t\t\t\"default\": \"./a.js\"\n\t\t}\n\t}\n}"
		},
		{
			code: "{\n\t\"exports\": {\n\t\t\"types\": \"./a.d.ts\",\n\t\t\"default\": \"./a.js\"\n\t}\n}",
			errors: [ { messageId: "keys" } ],
			filename: "config.json",
			languageOptions: { parser: ts_parser },
			output: "{\n\t\"exports\": {\n\t\t\"default\": \"./a.js\",\n\t\t\"types\": \"./a.d.ts\"\n\t}\n}"
		},
		{
			code: "var o = { b: 1, a: 2 }",
			errors: [
				{
					column: 17,
					data: {
						name: "a",
						previous: "b",
						reason: ""
					},
					line: 1,
					messageId: "keys"
				}
			],
			output: "var o = { a: 2, b: 1 }"
		},
		{
			code: "var o = { b: 1, a: 2, b: 3 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: 2, b: 1, b: 3 }"
		},
		{
			code: "var o = {\n\tc: 3,\n\tb: 2,\n\ta: 1,\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\n\ta: 1,\n\tb: 2,\n\tc: 3,\n}"
		},
		{
			code: "var o = {\r\n\tb: 1,\r\n\ta: 2\r\n}",
			errors: [ { messageId: "keys" } ],
			output: "var o = {\r\n\ta: 2,\r\n\tb: 1\r\n}"
		},
		{
			code: "var o = { d, c, ...x, b, a }",
			errors: [
				{ column: 14, messageId: "keys" },
				{ column: 26, messageId: "keys" }
			],
			output: "var o = { c, d, ...x, a, b }"
		},
		{
			code: "var o = { \"b\": 1, a: 2, 1: 3 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { 1: 3, a: 2, \"b\": 1 }"
		},
		{
			code: "var o = { b() { return 1 }, get a() { return 2 } }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { get a() { return 2 }, b() { return 1 } }"
		},
		{
			code: "var o = { b: { d: 1, c: 2 }, a: 1 }",
			errors: [
				{ messageId: "keys" },
				{ messageId: "keys" }
			],
			output: "var o = { a: 1, b: { c: 2, d: 1 } }"
		},
		{
			code: "var { b, a } = o",
			errors: [ { messageId: "keys" } ],
			output: "var { a, b } = o"
		},
		{
			code: "function f({ c: { e, d }, b = 1, a }) {}",
			errors: [
				{ messageId: "keys" },
				{ messageId: "keys" }
			],
			output: "function f({ a, b = 1, c: { d, e } }) {}"
		},
		{
			code: "var o = { b: f(), a: g() }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { c: f(), b: g(), a: 1 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: f(), c: g(), a: 1 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: 1, b: f(), c: g() }"
		},
		{
			code: "var o = { b: x.y, a: () => f(), c: [ 1, `s` ] }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: () => f(), b: x.y, c: [ 1, `s` ] }"
		},
		{
			code: "var o = { b: i++, a: i }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: delete x.y, a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: -x, a: { c: typeof y } }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: { c: typeof y }, b: -x }"
		},
		{
			code: "var { b, a = b } = o",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var { b = x, a } = o",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var { b: x, a: x } = o",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "({ b: [ x ], a: { c: x = 1 } } = o)",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "({ b: this.b, a: this.a } = o)",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "({ c: z, b: [ x ], a: { d: y } } = o)",
			errors: [ { messageId: "keys" } ],
			output: "({ a: { d: y }, b: [ x ], c: z } = o)"
		},
		{
			code: "var { b: [ c = f() ], a } = o",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: { [f()]: 1 }, a: 1 }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: 1, b: { [f()]: 1 } }"
		},
		{
			code: "var o = { b: { [f()]: 1 }, a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: x = 1, a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "async function f() { var o = { b: await x, a: y } }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { updatedAt: new Date(), createdAt: new Date() }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { createdAt: new Date(), updatedAt: new Date() }"
		},
		{
			code: "var o = { s: new Set([ 1 ]), m: new Map() }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { m: new Map(), s: new Set([ 1 ]) }"
		},
		{
			code: "var o = { c: new Map([ [ \"a\", 1 ], [ `b`, -2n ] ]), b: new WeakMap, a: new WeakSet([]) }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: new WeakSet([]), b: new WeakMap, c: new Map([ [ \"a\", 1 ], [ `b`, -2n ] ]) }"
		},
		{
			code: "var o = { d: new Error(\"e\", { cause: null }), c: new TypeError(), b: new RegExp(\"a\", \"g\"), a: new Date(0) }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: new Date(0), b: new RegExp(\"a\", \"g\"), c: new TypeError(), d: new Error(\"e\", { cause: null }) }"
		},
		{
			code: "var o = { c: new Uint8Array([ 1, , 2 ]), b: new ArrayBuffer(8), a: new Array(3) }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: new Array(3), b: new ArrayBuffer(8), c: new Uint8Array([ 1, , 2 ]) }"
		},
		{
			code: "var o = { b: new Set([ new Date(), /a/ ]), a: x }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: x, b: new Set([ new Date(), /a/ ]) }"
		},
		{
			code: "var o = { b: f(), a: new Date() }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Set(x), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Set([ ...x ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Date(`${x}`), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Error(\"e\", { cause }), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Error(\"e\", { [k]: 1 }), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Map(f()), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Date(-x), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Foo(), a: new Date() }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new globalThis.Date(), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "class Date {}\nvar o = { b: new Date(), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "function f(Map) { return { b: new Map(), a: y } }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var { b = new Date(), a } = o",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = 1\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: "const x = 1\nvar o = { a: x, b: f() }"
		},
		{
			code: "function x() {}\nclass Y {}\nvar o = { c: f(), b: Y, a: x }",
			errors: [ { messageId: "keys" } ],
			output: "function x() {}\nclass Y {}\nvar o = { a: x, b: Y, c: f() }"
		},
		{
			code: "import * as x from \"m\"\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: "import * as x from \"m\"\nvar o = { a: x, b: f() }"
		},
		{
			code: "const x = 1\nvar o = { b: f(), a: [ x, typeof x, x === 1, !x, x ? x : x || x ] }",
			errors: [ { messageId: "keys" } ],
			output: "const x = 1\nvar o = { a: [ x, typeof x, x === 1, !x, x ? x : x || x ], b: f() }"
		},
		{
			code: "const x = 1\nvar o = { b: f(), a: x as number, c: x! }",
			errors: [ { messageId: "keys" } ],
			languageOptions: { parser: ts_parser },
			output: "const x = 1\nvar o = { a: x as number, b: f(), c: x! }"
		},
		{
			code: "var o = { b: f(), a: undefined }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: undefined, b: f() }"
		},
		{
			code: "function x() {}\nx = 1\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var x = 1\nvar x = 2\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: f(), a: this }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "let x = 1\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "function g(x) { return { b: f(), a: x } }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "function g(undefined) { return { b: f(), a: undefined } }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "import { x } from \"m\"\nvar o = { b: f(), a: x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = {}\nvar o = { b: f(), a: x.y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = {}\nvar o = { b: f(), a: `${x}` }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = []\nvar o = { b: f(), a: [ ...x ] }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = {}\nvar o = { b: f(), a: -x }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const x = {}\nvar o = { b: f(), a: x + 1 }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Set([ undefined, NaN, Infinity ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new Set([ undefined, NaN, Infinity ]) }"
		},
		{
			code: "function g(NaN) { return { b: new Set([ NaN ]), a: y } }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { c: new URL(\"https://example.com/a\"), b: new URL(\"a\", \"https://example.com\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new URL(\"a\", \"https://example.com\"), c: new URL(\"https://example.com/a\") }"
		},
		{
			code: "var o = { b: new URL(\"/a\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new URL(x), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new URL(\"https://example.com\", 1, 2), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new DataView(new ArrayBuffer(8)), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new DataView(new ArrayBuffer(8)) }"
		},
		{
			code: "var o = { b: new DataView(new ArrayBuffer(8), 9), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new DataView(x), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"(\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"a\", \"gg\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Array(-1), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Array(1.5), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new ArrayBuffer(-1), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new ArrayBuffer(1e9), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Uint8Array(-1), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Float64Array(2 ** 40), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Set(1), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Map([ 1 ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new WeakSet([ 1 ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new WeakMap([ [ 1, 2 ] ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"a\", \"v\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"a\", \"d\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(/a/v), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"(?i:a)\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new RegExp(\"(?<x>a)|(?<x>b)\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { c: new RegExp(\"(?<x>a)(?<=b)(?:c)\\\\p{L}\", \"gimsuy\"), b: new RegExp(/a/g), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new RegExp(/a/g), c: new RegExp(\"(?<x>a)(?<=b)(?:c)\\\\p{L}\", \"gimsuy\") }"
		},
		{
			code: "var o = { b: new Set(new Array(1e8)), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Array(65537), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new ArrayBuffer(\"1e9\"), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new ArrayBuffer(8, { maxByteLength: 1e9 }), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Uint8Array({ length: 1e9 }), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Uint8Array({ length: [ 1e9 ] }), a: y }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: new Uint8Array({ length: 2 }), a: new Array(65536) }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: new Array(65536), b: new Uint8Array({ length: 2 }) }"
		},
		{
			code: "try {\n\tvar o = { b: f(), a: X }\n} catch {}\nconst X = 1",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "var o = { b: f(), a: Y }\nclass Y {}",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const X = { b: f(), a: X }",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "const X = 1\nfunction g() {\n\treturn { b: f(), a: X }\n}",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "class Y {\n\tm() {\n\t\treturn { b: f(), a: Y }\n\t}\n}",
			errors: [ { messageId: "keys" } ],
			output: null
		},
		{
			code: "switch (k) {\n\tcase 0: const X = 1\n\tcase 1: o = { b: f(), a: X }\n}\nswitch (k) {\n\tcase 0: class Y {}\n\tcase 1: o = { d: f(), c: Y }\n}",
			errors: [
				{ messageId: "keys" },
				{ messageId: "keys" }
			],
			output: null
		},
		{
			code: "const X = 1\nvar g = () => ({ b: f(), a: X })\nclass Y {}\nvar h = { m() {\n\treturn { b: f(), a: Y }\n} }",
			errors: [
				{ messageId: "keys" },
				{ messageId: "keys" }
			],
			output: "const X = 1\nvar g = () => ({ a: X, b: f() })\nclass Y {}\nvar h = { m() {\n\treturn { a: Y, b: f() }\n} }"
		},
		{
			code: "var o = { b: f(), a: x }\nfunction x() {}",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: x, b: f() }\nfunction x() {}"
		},
		{
			code: "var o = { b: new Array(-0), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new Array(-0) }"
		},
		{
			code: "var o = { b: new WeakSet([ {} ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new WeakSet([ {} ]) }"
		},
		{
			code: "var o = { b: new WeakMap([ [ {}, 1 ] ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new WeakMap([ [ {}, 1 ] ]) }"
		},
		{
			code: "var o = { b: new Map([ [ 1, 2 ] ]), a: y }",
			errors: [ { messageId: "keys" } ],
			output: "var o = { a: y, b: new Map([ [ 1, 2 ] ]) }"
		}
	)
}
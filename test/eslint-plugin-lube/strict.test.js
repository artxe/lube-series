import ascii_order from "../../packages/eslint-plugin-lube/src/rules/ascii-order.js"
import ts_parser from "@typescript-eslint/parser"
import { Linter, RuleTester } from "eslint"
import lube from "eslint-plugin-lube"
import { builtinRules } from "eslint/use-at-your-own-risk"
import assert from "node:assert"
import svelte_parser from "svelte-eslint-parser"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
const ascii_order_options = /** @type {[ import("eslint").Linter.RuleSeverity, NonNullable<import("../../packages/eslint-plugin-lube/private.js").RuleOptions["ascii-order"]> ]} */(lube.configs.strict.rules["lube/ascii-order"])/**/.slice(1)
const options = /** @type {[ import("eslint").Linter.RuleSeverity, "declaration" ]} */(lube.configs.strict.rules["func-style"])/**/.slice(1)
new RuleTester().run(
	"ascii-order in the strict config",
	ascii_order,
	{
		invalid: [
			{
				code: "function b() {}\nfunction a() {}",
				errors: [ { messageId: "declarations" } ],
				options: ascii_order_options,
				output: "function a() {}\nfunction b() {}"
			},
			{
				code: "import b from \"b\"\nimport a from \"a\"",
				errors: [ { messageId: "imports" } ],
				options: ascii_order_options,
				output: "import a from \"a\"\nimport b from \"b\""
			},
			{
				code: "var o = { b: 1, a: 2 }",
				errors: [ { messageId: "keys" } ],
				options: ascii_order_options,
				output: "var o = { a: 2, b: 1 }"
			},
			{
				code: "import { b, a } from \"m\"",
				errors: [ { messageId: "names" } ],
				options: ascii_order_options,
				output: "import { a, b } from \"m\""
			},
			{
				code: "it(\"b\", f)\nit(\"a\", f)",
				errors: [ { messageId: "tests" } ],
				options: ascii_order_options,
				output: "it(\"a\", f)\nit(\"b\", f)"
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"func-style in the strict config",
	/** @type {import("eslint").Rule.RuleModule} */(builtinRules.get("func-style"))/**/,
	{
		invalid: [
			{
				code: "const f = () => 1",
				errors: [ { messageId: "declaration" } ],
				options
			},
			{
				code: "let f = function() {}",
				errors: [ { messageId: "declaration" } ],
				options
			}
		],
		valid: [
			{ code: "function f() {}", options },
			{ code: "[].map(x => x)", options },
			{
				code: "const o = { m() { const g = () => this } }",
				options
			}
		]
	}
)
describe(
	"fixes of the strict config",
	() => {
		const linter = new Linter()
		/**
		 * @param {string} code
		 * @param {string} output
		 * @returns {void}
		 */
		function assert_converges(code, output) {
			const config = [
				lube.configs.strict,
				{
					languageOptions: {
						parserOptions: { ecmaFeatures: { jsx: true } }
					}
				}
			]
			const result = linter.verifyAndFix(code, config)
			assert.strictEqual(result.output, output)
			assert.deepStrictEqual(
				result.messages.filter(message => message.fix),
				[]
			)
		}
		/**
		 * @param {string} code
		 * @returns {string}
		 */
		function fix(code) {
			return linter.verifyAndFix(code, [ lube.configs.strict ]).output
		}
		it(
			"allows a separate import of types from a module",
			() => {
				const config = [
					lube.configs.strict,
					{
						files: [ "**/*.ts" ],
						languageOptions: { parser: ts_parser }
					}
				]
				const result = linter.verify(
					"import type { A } from \"m\"\nimport { b } from \"m\"\nimport { c } from \"m\"\nexport const d: A = b + c",
					config,
					"a.ts"
				)
				assert.deepStrictEqual(
					result.map(
						message => message.ruleId + ":" + message.line
					),
					[ "no-duplicate-imports:3" ]
				)
			}
		)
		it(
			"breaks a nested ternary inside reformatted arguments",
			() => {
				assert.strictEqual(
					fix(
						"function f() {\n\treturn call(a,b ? c : d ? e : g)\n}"
					),
					"function f() {\n\treturn call(\n\t\ta,\n\t\tb\n\t\t\t? c\n\t\t\t: d\n\t\t\t\t? e\n\t\t\t\t: g\n\t)\n}"
				)
			}
		)
		it(
			"breaks an object of a statement that starts after the end of a deeper line",
			() => {
				assert_converges(
					"function f() {\n\tconst o = a\n\t\t? s\n\t\t: {\n\t\t\tllllllllllllllllll: 2,\n\t\t\tssssssssssss: 1\n\t\t}; u = { mmmmmmmmmmmmmm: 1, rrrrrrrrrrrrrrrrr: 2 }\n}",
					"function f() {\n\tconst o = a\n\t\t? s\n\t\t: {\n\t\t\tllllllllllllllllll: 2,\n\t\t\tssssssssssss: 1\n\t\t}; u = {\n\t\tmmmmmmmmmmmmmm: 1,\n\t\trrrrrrrrrrrrrrrrr: 2\n\t}\n}"
				)
			}
		)
		it(
			"breaks arguments in a JSX child on its own line",
			() => {
				assert_converges(
					"var a = <div>\n\t{f(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)}\n</div>",
					"var a = <div>\n\t{f(\n\t\taaaaaaaaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t)}\n</div>"
				)
			}
		)
		it(
			"breaks arguments in a Svelte expression on its own line",
			() => {
				const config = [
					lube.configs.strict,
					{
						files: [ "**/*.svelte" ],
						languageOptions: { parser: svelte_parser }
					}
				]
				const result = linter.verifyAndFix(
					"<div>\n\t{await new Promise(r => { setTimeout(r, 10) })}\n</div>",
					config,
					"a.svelte"
				)
				assert.strictEqual(
					result.output,
					"<div>\n\t{await new Promise(\n\t\tr => {\n\t\t\tsetTimeout(r, 10)\n\t\t}\n\t)}\n</div>"
				)
				assert.deepStrictEqual(
					result.messages.filter(message => message.fix),
					[]
				)
			}
		)
		it(
			"breaks arguments on a line of a for header that starts after the previous part",
			() => {
				assert_converges(
					"for (let i = foo(\n\taaaaaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n); i < bar(aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbb); i++) {}",
					"for (let i = foo(\n\taaaaaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n); i < bar(\n\t\taaaaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t); i++) {}"
				)
			}
		)
		it(
			"indents a flat ternary chain one level per ternary",
			() => {
				assert.strictEqual(
					fix(
						"var value = a\n? b\n: c\n? d\n: e"
					),
					"var value = a\n\t? b\n\t: c\n\t\t? d\n\t\t: e"
				)
			}
		)
		it(
			"indents a sequence on a line that starts inside a block comment from its bracket",
			() => {
				assert_converges(
					"g(x, /* a\nb */ { aaaaaaaaaaaaaaaaaaaaaa: s, bbbbbbbbbbbbbbbbbbbbbbbb: a })",
					"g(\n\tx,\n\t/* a\nb */ {\n\t\taaaaaaaaaaaaaaaaaaaaaa: s,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbb: a\n\t}\n)"
				)
				assert_converges(
					"function f() {\n\tconst o = /* a\nb */ { aaaaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbb: 2 }\n}",
					"function f() {\n\tconst o = /* a\nb */ {\n\t\t\taaaaaaaaaaaaaaaaaaaaaa: 1,\n\t\t\tbbbbbbbbbbbbbbbbbbbbbb: 2\n\t\t}\n}"
				)
				assert_converges(
					"/* a\nb */ const x = [ 111111111111, 222222222222, 3333333333333 ]",
					"/* a\nb */ const x = [\n\t111111111111,\n\t222222222222,\n\t3333333333333\n]"
				)
			}
		)
		it(
			"indents a statement that starts after a comment from the block it is in",
			() => {
				assert_converges(
					"for (;;) {\n/**/(1(aaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbb))\n}",
					"for (;;) {\n/**/(1(\n\t\taaaaaaaaaaaaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t))\n}"
				)
				assert_converges(
					"function f() {\n\t/* c */ foo(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbb)\n}",
					"function f() {\n\t/* c */ foo(\n\t\taaaaaaaaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbb\n\t)\n}"
				)
			}
		)
		it(
			"indents a statement that starts after a multiline statement like that statement",
			() => {
				assert_converges(
					"{ const e = 1; const n = new i([ [ \"ac\", \"align-content\" ], [ \"column-reverse\", \"flex-direction:column-reverse\" ] ]); const a = new i([ [ \"block\", \"display:block\" ], [ \"column-reverse\", \"flex-direction:column-reverse\" ] ]) }",
					"{ const e = 1; const n = new i(\n\t[\n\t\t[ \"ac\", \"align-content\" ],\n\t\t[\n\t\t\t\"column-reverse\",\n\t\t\t\"flex-direction:column-reverse\"\n\t\t]\n\t]\n); const a = new i(\n\t[\n\t\t[ \"block\", \"display:block\" ],\n\t\t[\n\t\t\t\"column-reverse\",\n\t\t\t\"flex-direction:column-reverse\"\n\t\t]\n\t]\n) }"
				)
			}
		)
		it(
			"indents arguments after an operator whose expression starts on an earlier line from that line",
			() => {
				assert_converges(
					"function f() {\n\treturn aaaaaaaaaa\n\t\t|| bbbbbbbbbbb || foo(cccccccccccccccccccc, dddddddddddddddddddddddd)\n}",
					"function f() {\n\treturn aaaaaaaaaa\n\t\t|| bbbbbbbbbbb || foo(\n\t\tcccccccccccccccccccc,\n\t\tdddddddddddddddddddddddd\n\t)\n}"
				)
				assert_converges(
					"function f() {\n\tconst x = aaaaaaaaaaaaaaaa\n\t\t.bar() || foo(cccccccccccccccccccc, dddddddddddddddddddddddd)\n}",
					"function f() {\n\tconst x = aaaaaaaaaaaaaaaa\n\t\t.bar() || foo(\n\t\tcccccccccccccccccccc,\n\t\tdddddddddddddddddddddddd\n\t)\n}"
				)
				assert_converges(
					"function f() {\n\treturn aaaaaaaaaa\n\t\t|| foo(cccccccccccccccccccc, dddddddddddddddddddddddd)\n}",
					"function f() {\n\treturn aaaaaaaaaa\n\t\t|| foo(\n\t\t\tcccccccccccccccccccc,\n\t\t\tdddddddddddddddddddddddd\n\t\t)\n}"
				)
			}
		)
		it(
			"indents arguments of a cast that continues the previous line after its type comment",
			() => {
				assert_converges(
					"function f() {\n\tlet ast =\n\t/** @type {A} */(foo(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb))/**/\n}",
					"function f() {\n\tconst ast =\n\t/** @type {A} */(foo(\n\t\t\taaaaaaaaaaaaaaaaaaaaaaaaa,\n\t\t\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t\t))/**/\n}"
				)
				assert_converges(
					"export const x =\n/** @type {A} */(foo({ aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb }))/**/",
					"export const x =\n/** @type {A} */(foo(\n\t\t{\n\t\t\taaaaaaaaaaaaaaaaaaaaaaaaa,\n\t\t\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t\t}\n\t))/**/"
				)
			}
		)
		it(
			"keeps CRLF line breaks in the fixes of stylistic rules",
			() => {
				assert.strictEqual(
					fix(
						"\"use strict\";\r\n[a].map(f)\r\nfunction g() { return h }\r\nvar i = j ? k :\r\n\tl\r\nvar m = n.o().p().q()\r\n"
					),
					"\"use strict\"\r\n;[ a ].map(f)\r\nfunction g() {\r\n\treturn h\r\n}\r\nvar i = j\r\n\t? k\r\n\t: l\r\nvar m = n.o().p()\r\n\t.q()"
				)
			}
		)
		it(
			"keeps a call whose parentheses follow a type comment on the previous line",
			() => {
				assert_converges(
					"var x = 1\n/** @type {A} */(f(aaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbb))/**/",
					"var x = 1\n/** @type {A} */(\n\tf(\n\t\taaaaaaaaaaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t)\n)/**/"
				)
			}
		)
		it(
			"keeps a line comment before the colon of a key",
			() => {
				const code = "var o = {\n\ta // note\n\t: 1\n}"
				assert.strictEqual(fix(code), code)
			}
		)
		it(
			"keeps a ternary that starts after a closing parenthesis where the indent rule puts it",
			() => {
				const code = "function f() {\n\treturn p + (e\n\t\t? j\n\t\t: n) + (t\n\t\t? o.cccccccccccccccccccccccccccccccc(\n\t\t\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\t\t)\n\t\t: \"\")\n}"
				assert.strictEqual(fix(code), code)
			}
		)
		it(
			"keeps a type cast after a unary operator",
			() => {
				assert.strictEqual(
					fix(
						"var a = !!/** @type {A} */(b)/**/?.[c]\nvar d = -/** @type {A} */(b)/**/\nvar e = ! /* note */ b"
					),
					"var a = !!/** @type {A} */(b)/**/?.[c]\nvar d = -/** @type {A} */(b)/**/\nvar e = ! /* note */ b"
				)
			}
		)
		it(
			"keeps an operator on its side of a comment",
			() => {
				assert.strictEqual(
					fix(
						"var x = a &&\n\t/** @type {A} */(b)/**/.c\nvar y = d ||\n\t/* note */ e"
					),
					"var x = a &&\n/** @type {A} */(b)/**/.c\nvar y = d ||\n/* note */ e"
				)
				assert.strictEqual(
					fix(
						"var z = f\n\t// note\n\t+ g\nvar w = h +\n\ti"
					),
					"var z = f\n\t// note\n\t+ g\nvar w = h\n\t+ i"
				)
			}
		)
		it(
			"keeps comments in spaces that stylistic rules remove",
			() => {
				const code = "function* g() {\n\tyield/* a */ * f(.../* b */ c)\n}\nfor (let i = 0 /* d */ ; i < 1; i++) {}\nvar h = function/* e */ * () {}"
				assert.strictEqual(fix(code), code)
			}
		)
		it(
			"keeps holes of a broken array on their own lines",
			() => {
				assert_converges(
					"var value = [aaaaaaaaaaaaaaaaaaaa, // a\n,bbbbbbbbbbbbbbbbbbbb,,]",
					"var value = [\n\taaaaaaaaaaaaaaaaaaaa, // a\n\t,\n\tbbbbbbbbbbbbbbbbbbbb,\n\t,\n]"
				)
			}
		)
		it(
			"keeps the question mark of an optional destructured parameter next to its brace",
			() => {
				const config = [
					lube.configs.strict,
					{
						files: [ "**/*.ts" ],
						languageOptions: { parser: ts_parser }
					}
				]
				const result = linter.verifyAndFix(
					"function f({a}?: A) {}\nfunction g({\n\taaaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n}?: A) {}",
					config,
					"a.ts"
				)
				assert.strictEqual(
					result.output,
					"function f({ a }?: A) {}\nfunction g(\n\t{\n\t\taaaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t}?: A\n) {}"
				)
				assert.deepStrictEqual(
					result.messages.filter(message => message.fix),
					[]
				)
			}
		)
		it(
			"renames a Svelte store and its subscriptions in the markup",
			() => {
				const config = [
					lube.configs.strict,
					{
						files: [ "**/*.svelte" ],
						languageOptions: { parser: svelte_parser }
					}
				]
				const result = linter.verifyAndFix(
					"<script>\n\tconst userName = writable(\"a\")\n</script>\n<p>{$userName}</p>\n<Comp {userName} />",
					config,
					"a.svelte"
				)
				assert.strictEqual(
					result.output,
					"<script>\n\tconst user_name = writable(\"a\")\n</script>\n<p>{$user_name}</p>\n<Comp userName={user_name} />"
				)
				assert.deepStrictEqual(
					result.messages.filter(message => message.fix),
					[]
				)
			}
		)
		it(
			"renames a default export with its declaration, which keeps its place",
			() => {
				assert_converges(
					"function skipTag() {}\nfunction parseTag() {\n\tskipTag()\n}\nexport default parseTag",
					"function skip_tag() {}\nfunction parse_tag() {\n\tskip_tag()\n}\nexport default parse_tag"
				)
			}
		)
		it(
			"renames a parameter that shadows an import in a reformatted declaration",
			() => {
				assert.strictEqual(
					fix(
						"import { fooBar } from \"m\"\nfunction f(a,fooBar) {}"
					),
					"import { fooBar } from \"m\"\nfunction f(a, foo_bar) {}"
				)
			}
		)
		it(
			"renames a reassigned variable without making it a constant",
			() => {
				assert_converges(
					"let lastBid = 1\nfunction bump() {\n\tlastBid += 1\n}\nbump()\nlog(lastBid)",
					"let last_bid = 1\nfunction bump() {\n\tlast_bid += 1\n}\nbump()\nlog(last_bid)"
				)
				assert_converges(
					"var itemCount = 0\nconst f = () => itemCount++\nf()\nlog(itemCount)",
					"var item_count = 0\nconst f = () => item_count++\nf()\nlog(item_count)"
				)
				assert_converges(
					"let [ itemCount, lastBid ] = value\nitemCount++\nlog(itemCount, lastBid)",
					"let [ item_count, last_bid ] = value\nitem_count++\nlog(item_count, last_bid)"
				)
				assert_converges(
					"for (let rowIndex = 0; rowIndex < 2; rowIndex++) log(rowIndex)\nfor (let rowKey in value) {\n\trowKey = rowKey.trim()\n\tlog(rowKey)\n}",
					"for (let row_index = 0; row_index < 2; row_index++) log(row_index)\nfor (let row_key in value) {\n\trow_key = row_key.trim()\n\tlog(row_key)\n}"
				)
				assert_converges(
					"export let lastBid = 1\nlet pageCount = 1\nexport { pageCount }\nexport function bump() {\n\tlastBid += 1\n\tpageCount += 1\n}",
					"export let lastBid = 1\nlet page_count = 1\nexport { page_count as pageCount }\nexport function bump() {\n\tlastBid += 1\n\tpage_count += 1\n}"
				)
				const result = linter.verifyAndFix(
					"<script>\n\tlet clickCount = 0\n\t$: doubleCount = clickCount * 2\n</script>\n<button on:click={() => clickCount++}>{clickCount} {doubleCount}</button>",
					[
						lube.configs.strict,
						{
							files: [ "**/*.svelte" ],
							languageOptions: { parser: svelte_parser }
						}
					],
					"a.svelte"
				)
				assert.strictEqual(
					result.output,
					"<script>\n\tlet click_count = 0\n\t$: doubleCount = click_count * 2\n</script>\n<button on:click={() => click_count++}>{click_count} {doubleCount}</button>"
				)
			}
		)
		it(
			"renames a usage inside a reformatted sequence with its declaration",
			() => {
				assert.strictEqual(
					fix(
						"function fooBar() {}\ncall(a,fooBar)"
					),
					"function foo_bar() {}\ncall(a, foo_bar)"
				)
			}
		)
		it(
			"renames an exported declaration and its export specifier together",
			() => {
				assert.strictEqual(
					fix(
						"var fooBar = [a,b]\nexport { fooBar }"
					),
					"var foo_bar = [ a, b ]\nexport { foo_bar as fooBar }"
				)
			}
		)
		it(
			"splits declarations that one-var separates onto lines of their own",
			() => {
				const code = "const x = 1, y = 2\nfunction f() {\n\tlet a = 1, b = [\n\t\t1\n\t], c\n\treturn a + b + c\n}"
				const result = linter.verifyAndFix(code, [ lube.configs.strict ])
				assert.strictEqual(
					result.output,
					"const x = 1\nconst y = 2\nfunction f() {\n\tconst a = 1\n\tconst b = [ 1 ]\n\tlet c\n\treturn a + b + c\n}"
				)
				assert.deepStrictEqual(result.messages, [])
				assert.strictEqual(
					fix("const x = 1, y = 2\r\nf()"),
					"const x = 1\r\nconst y = 2\r\nf()"
				)
			}
		)
		it(
			"still removes the space after a unary operator",
			() => {
				assert.strictEqual(
					fix("var a = ! b\nvar c = - d"),
					"var a = !b\nvar c = -d"
				)
			}
		)
	}
)
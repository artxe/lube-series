import no_ambiguous_start from "../../packages/eslint-plugin-lube/src/rules/no-ambiguous-start.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"no-ambiguous-start",
	no_ambiguous_start,
	{
		invalid: [
			{
				code: "foo();\n[1, 2]",
				errors: [ { messageId: "start" } ]
			},
			{
				code: "foo();\n(a || b).run()",
				errors: [
					{
						data: { kind: "`(`" },
						messageId: "start"
					}
				]
			},
			{
				code: "let a, b\n;[a, b] = [b, a]",
				errors: [
					{
						data: { kind: "`[`" },
						messageId: "start"
					}
				]
			},
			{
				code: "foo();\n`x`.trim()",
				errors: [
					{
						data: { kind: "a template literal" },
						messageId: "start"
					}
				]
			},
			{
				code: "let x\n/** @type {T} */(x).y = 1",
				errors: [ { messageId: "start" } ]
			},
			{
				code: "function f() {\n\t(async () => {})()\n}",
				errors: [ { messageId: "start" } ]
			}
		],
		valid: [
			"[1, 2]",
			"[\n\t{ \"a\": 1 },\n\t{ \"b\": [ 2 ] }\n]",
			"// c\n/* d */\n[1]",
			"(a || b).run()",
			"foo()",
			"const [a] = b",
			"a.b = [1, 2]",
			"const x = (a || b).run()",
			"x = `x`",
			"void (a || b).run()",
			"\"use strict\"",
			"return_value\n++a"
		]
	}
)
import pretty_parens from "../../packages/eslint-plugin-lube/src/rules/pretty-parens.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
/** @type {[string, (inner: string) => string][]} */
const kinds = [
	[
		"grouping",
		inner => "var a = (" + inner + ");"
	],
	[
		"member",
		inner => "var a = (" + inner + ").x"
	],
	[
		"if",
		inner => `if (${inner}) {\n}`
	],
	[
		"while",
		inner => `while (${inner}) {\n}`
	],
	[
		"do-while",
		inner => `do {\n} while (${inner})`
	],
	[
		"switch",
		inner => `switch (${inner}) {\n}`
	],
	[
		"with",
		inner => `with (${inner}) {\n}`
	],
	[
		"template",
		inner => `var a = \`\${${inner}}\``
	]
]
/** @type {RuleTester.InvalidTestCase[]} */
const invalid = []
/** @type {RuleTester.ValidTestCase[]} */
const valid = []
for (const [ kind, wrap ] of kinds) {
	const form_1 = wrap("b\n\t|| c")
	const form_2 = wrap("\n\tb\n\t|| c\n")
	const closer_alone = wrap("b\n\t|| c\n")
	const opener_alone = wrap("\n\tb\n\t|| c")
	const language_options = {
		sourceType: /** @type {const} */("script")/**/
	}
	valid.push(
		{
			code: form_1,
			languageOptions: language_options,
			name: `${kind}: opener followed by content, closer after the last token`
		},
		{
			code: form_2,
			languageOptions: language_options,
			name: `${kind}: opener ends its line, closer on its own line`
		},
		{
			code: wrap("b || c"),
			languageOptions: language_options,
			name: `${kind}: one line`
		}
	)
	invalid.push(
		{
			code: closer_alone,
			errors: [ { messageId: "join" } ],
			languageOptions: language_options,
			name: `${kind}: closer alone after content`,
			output: form_1
		},
		{
			code: opener_alone,
			errors: [ { messageId: "break" } ],
			languageOptions: language_options,
			name: `${kind}: closer after last token while the opener ends its line`,
			output: form_2
		}
	)
}
valid.push(
	{
		code: "for (var i = 0;\n\ti < 1;\n\ti++) {\n}"
	},
	{
		code: "for (\n\tvar i = 0;\n\ti < 1;\n\ti++\n) {\n}"
	},
	{
		code: "for (var a of b\n\t.c) {\n}"
	},
	{
		code: "for (var a in b\n\t.c) {\n}"
	},
	{
		code: "try {\n} catch (e) {\n}"
	},
	{ code: "f(a\n\t|| b)" },
	{ code: "f(\n\ta\n\t|| b\n)" },
	{ code: "new F(a\n\t|| b\n)" },
	{
		code: "function f(a = b\n\t|| c\n) {\n}"
	},
	{ code: "var a = ((b\n\t|| c))" },
	{
		code: "var a = (\n\t(b\n\t\t|| c)\n)"
	},
	{ code: "var a = (b\n\t|| c)()" },
	{
		code: "var a = /** @type {T} */(b\n\t|| c\n)/**/"
	},
	{
		code: "var a = /** @type {T} */(\n\tb\n\t|| c)/**/"
	},
	{
		code: "var a = (\n\tb // b\n\t|| c\n)"
	},
	{
		code: "var a = (// b\n\tb\n\t|| c\n)"
	},
	{
		code: "var a = (b ||\n\tc /* c */)"
	},
	{ code: "var a = (`b\nc`)" },
	{
		code: "var a = `${b\n\t? c\n\t: d}`"
	},
	{ code: "var a = (b ||\r\n\tc)" },
	{
		code: "var a = (\r\n\tb ||\r\n\tc\r\n)"
	}
)
invalid.push(
	{
		code: "for (var i = 0;\n\ti < 1;\n\ti++\n) {\n}",
		errors: [ { messageId: "join" } ],
		output: "for (var i = 0;\n\ti < 1;\n\ti++) {\n}"
	},
	{
		code: "for (\n\tvar i = 0;\n\ti < 1;\n\ti++) {\n}",
		errors: [ { messageId: "break" } ],
		output: "for (\n\tvar i = 0;\n\ti < 1;\n\ti++\n) {\n}"
	},
	{
		code: "for (var a of b\n\t.c\n) {\n}",
		errors: [ { messageId: "join" } ],
		output: "for (var a of b\n\t.c) {\n}"
	},
	{
		code: "for (\n\tvar a in b\n\t.c) {\n}",
		errors: [ { messageId: "break" } ],
		output: "for (\n\tvar a in b\n\t.c\n) {\n}"
	},
	{
		code: "for await (\n\tvar a of b\n\t.c) {\n}",
		errors: [ { messageId: "break" } ],
		output: "for await (\n\tvar a of b\n\t.c\n) {\n}"
	},
	{
		code: "try {\n} catch (e /* a\n\t*/\n) {\n}",
		errors: [ { messageId: "join" } ],
		output: "try {\n} catch (e /* a\n\t*/) {\n}"
	},
	{
		code: "do {\n} while (a\n\t|| b\n)",
		errors: [ { messageId: "join" } ],
		output: "do {\n} while (a\n\t|| b)"
	},
	{
		code: "do {\n} while (a\n\t|| b\n);",
		errors: [ { messageId: "join" } ],
		output: "do {\n} while (a\n\t|| b);"
	},
	{
		code: "var a = (b\n\t|| c\n).d",
		errors: [ { messageId: "join" } ],
		output: "var a = (b\n\t|| c).d"
	},
	{
		code: "var a = ((b\n\t|| c\n))",
		errors: [ { messageId: "join" } ],
		output: "var a = ((b\n\t|| c))"
	},
	{
		code: "var a = (\n\t(\n\t\tb\n\t\t|| c)\n)",
		errors: [ { messageId: "break" } ],
		output: "var a = (\n\t(\n\t\tb\n\t\t|| c\n\t)\n)"
	},
	{
		code: "f(function () {\n\tvar a = (b ||\n\t\tc\n\t)\n})",
		errors: [ { messageId: "join" } ],
		output: "f(function () {\n\tvar a = (b ||\n\t\tc)\n})"
	},
	{
		code: "function f() {\n\tvar a = (\n\t\tb ||\n\t\tc)\n}",
		errors: [ { messageId: "break" } ],
		output: "function f() {\n\tvar a = (\n\t\tb ||\n\t\tc\n\t)\n}"
	},
	{
		code: "var a = (b ||\n\tc // c\n)",
		errors: [ { messageId: "comment" } ],
		output: "var a = (\n\tb ||\n\tc // c\n)"
	},
	{
		code: "var a = ( // a\n\tb ||\n\tc)",
		errors: [ { messageId: "break" } ],
		output: "var a = ( // a\n\tb ||\n\tc\n)"
	},
	{
		code: "var a = (b ||\n\tc /* c */\n)",
		errors: [ { messageId: "join" } ],
		output: "var a = (b ||\n\tc /* c */)"
	},
	{
		code: "var a = (b ||\r\n\tc\r\n)\r\n",
		errors: [ { messageId: "join" } ],
		output: "var a = (b ||\r\n\tc)\r\n"
	},
	{
		code: "var a = (\r\n\tb ||\r\n\tc)\r\n",
		errors: [ { messageId: "break" } ],
		output: "var a = (\r\n\tb ||\r\n\tc\r\n)\r\n"
	},
	{
		code: "var a = (b ||\r\n\tc // c\r\n)\r\n",
		errors: [ { messageId: "comment" } ],
		output: "var a = (\r\n\tb ||\r\n\tc // c\r\n)\r\n"
	},
	{
		code: "var a = (b ||\n    c\n)",
		errors: [ { messageId: "join" } ],
		options: [ { indent: "    " } ],
		output: "var a = (b ||\n    c)"
	},
	{
		code: "var a = (b ||\n    c // c\n)",
		errors: [ { messageId: "comment" } ],
		options: [ { indent: "    " } ],
		output: "var a = (\n    b ||\n    c // c\n)"
	},
	{
		code: "var a = `${\n\tb\n\t? c\n\t: d}`",
		errors: [ { messageId: "break" } ],
		output: "var a = `${\n\tb\n\t? c\n\t: d\n}`"
	},
	{
		code: "var a = `x${b\n\t? c\n\t: d\n}y${e\n\t|| f\n}`",
		errors: [
			{ messageId: "join" },
			{ messageId: "join" }
		],
		output: "var a = `x${b\n\t? c\n\t: d}y${e\n\t|| f}`"
	},
	{
		code: "var a = (\n\t<div>\n\t</div>)",
		errors: [ { messageId: "break" } ],
		languageOptions: {
			parserOptions: { ecmaFeatures: { jsx: true } }
		},
		output: "var a = (\n\t<div>\n\t</div>\n)"
	},
	{
		code: "var a = (<div>\n\t</div>\n)",
		errors: [ { messageId: "join" } ],
		languageOptions: {
			parserOptions: { ecmaFeatures: { jsx: true } }
		},
		output: "var a = (<div>\n\t</div>)"
	}
)
new RuleTester().run(
	"pretty-parens",
	pretty_parens,
	{ invalid, valid }
)
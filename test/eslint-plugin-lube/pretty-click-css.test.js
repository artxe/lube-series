import pretty_click_css from "../../packages/eslint-plugin-lube/src/rules/pretty-click-css.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
const jsx = {
	parserOptions: { ecmaFeatures: { jsx: true } }
}
/**
 * @param {string} code
 * @param {string} output
 * @param {string} message_id
 * @param {Partial<import("eslint").RuleTester.InvalidTestCase>=} extra
 * @returns {import("eslint").RuleTester.InvalidTestCase}
 */
function fixed(code, output, message_id, extra) {
	return {
		code,
		errors: [ { messageId: message_id } ],
		output,
		...extra
	}
}
new RuleTester().run(
	"pretty-click-css",
	pretty_click_css,
	{
		invalid: [
			fixed(
				"a.className = \"color=red\"",
				"a.className = \"c=red\"",
				"shorthand"
			),
			fixed(
				"a.className = \"margin-top=4;color:red\"",
				"a.className = \"c:red;mt=4\"",
				"shorthand"
			),
			fixed(
				"a.className = \"display=flex\"",
				"a.className = \"flex\"",
				"shorthand"
			),
			fixed(
				"a.className = \"d=flex!\"",
				"a.className = \"flex!\"",
				"shorthand"
			),
			fixed(
				"a.className = \"display=flex;gap=8\"",
				"a.className = \"flex;g=8\"",
				"shorthand"
			),
			fixed(
				"a.className = \"w=1 c=red\"",
				"a.className = \"c=red w=1\"",
				"order"
			),
			fixed(
				"a.className = \"w=1;c=red\"",
				"a.className = \"c=red;w=1\"",
				"order"
			),
			fixed(
				"a.className = \"card w=1 btn\"",
				"a.className = \"btn card w=1\"",
				"order"
			),
			fixed(
				"a.className = \"w=1 c=red card\"",
				"a.className = \"c=red card w=1\"",
				"order"
			),
			fixed(
				"a.className = \"@sm@w=1 c=red\"",
				"a.className = \"c=red @sm@w=1\"",
				"order"
			),
			fixed(
				"a.className = \"c=red  w=1\"",
				"a.className = \"c=red w=1\"",
				"layout"
			),
			fixed(
				"a.className = \" c=red;w=1 \"",
				"a.className = \"c=red;w=1\"",
				"layout"
			),
			fixed(
				"a.className = '>li/w=1;c=red'",
				"a.className = '>li/c=red;w=1'",
				"order"
			),
			fixed(
				"a.className = \"c=red >li/w=1\"",
				"a.className = `c=red\n\t>li/w=1`",
				"layout"
			),
			fixed(
				"a.className = \">li/w=1\\n>b/c=red\"",
				"a.className = `>b/c=red\n\t>li/w=1`",
				"order"
			),
			fixed(
				"a.className = `c=red\n\t>li:hover/w=1\n\t>li/w=1`",
				"a.className = `c=red\n\t>li/w=1\n\t>li:hover/w=1`",
				"order"
			),
			fixed(
				"a.className = `c=red >li/w=1 [x]/c=blue`",
				"a.className = `c=red\n\t>li/w=1\n\t[x]/c=blue`",
				"layout"
			),
			fixed(
				"a.className = \"@sm@>li/w=1 c=red\"",
				"a.className = `c=red\n\t@sm@>li/w=1`",
				"order"
			),
			fixed(
				"function f() {\n\tbox.className = \"c=red >li/w=1\"\n}",
				"function f() {\n\tbox.className = `c=red\n\t\t>li/w=1`\n}",
				"layout"
			),
			fixed(
				"a.className = \"c=red >li/w=1\"",
				"a.className = `c=red\n  >li/w=1`",
				"layout",
				{ options: [ { indent: "  " } ] }
			),
			fixed(
				"a.className = \"c=red bg=url(a\\\\_b.png)\"",
				"a.className = \"bg=url(a\\\\_b.png) c=red\"",
				"order"
			),
			fixed(
				"<div className=\"w=1 c=red\" />",
				"<div className=\"c=red w=1\" />",
				"order",
				{ languageOptions: jsx }
			),
			fixed(
				"<div class=\"w=1 c=red\" />",
				"<div class=\"c=red w=1\" />",
				"order",
				{ languageOptions: jsx }
			),
			fixed(
				"<div className={\"w=1 c=red\"} />",
				"<div className={\"c=red w=1\"} />",
				"order",
				{ languageOptions: jsx }
			),
			fixed(
				"<div className=\"c=red >li/w=1\" />",
				"<div className=\"c=red\n\t>li/w=1\" />",
				"layout",
				{ languageOptions: jsx }
			),
			fixed(
				"<div className={on ? \"w=1 c=red\" : \"h=1 c=blue\"} />",
				"<div className={on ? \"c=red w=1\" : \"c=blue h=1\"} />",
				"order",
				{
					errors: [
						{ messageId: "order" },
						{ messageId: "order" }
					],
					languageOptions: jsx
				}
			),
			fixed(
				"<div styleName=\"w=1 c=red\" />",
				"<div styleName=\"c=red w=1\" />",
				"order",
				{
					languageOptions: jsx,
					options: [
						{ attributes: [ "styleName" ] }
					]
				}
			),
			fixed(
				"a.box = \"w=1 c=red\"",
				"a.box = \"c=red w=1\"",
				"order",
				{
					options: [ { properties: [ "box" ] } ]
				}
			),
			fixed(
				"a.setAttribute(\"class\", \"w=1 c=red\")",
				"a.setAttribute(\"class\", \"c=red w=1\")",
				"order"
			),
			fixed(
				"cx(\"w=1 c=red\", flag && \"h=1 c=blue\")",
				"cx(\"c=red w=1\", flag && \"c=blue h=1\")",
				"order",
				{
					errors: [
						{ messageId: "order" },
						{ messageId: "order" }
					],
					options: [ { functions: [ "cx" ] } ]
				}
			),
			{
				code: "a.className = \"colr=red\"",
				errors: [
					{
						data: { name: "colr" },
						messageId: "unknown"
					}
				],
				output: null
			},
			{
				code: "a.className = \">li/colr=red\"",
				errors: [ { messageId: "unknown" } ],
				output: null
			},
			{
				code: "a.className = \"c=blue c=red\"",
				errors: [
					{
						data: { name: "color" },
						messageId: "duplicate"
					}
				],
				output: null
			},
			{
				code: "a.className = \"w=1;width=2\"",
				errors: [
					{ messageId: "duplicate" },
					{ messageId: "shorthand" }
				],
				output: "a.className = \"w=1;w=2\""
			},
			{
				code: "a.className = \"@sm@c=blue @sm@c=red\"",
				errors: [ { messageId: "duplicate" } ],
				output: null
			},
			{
				code: "a.className = `>li/c=blue\n\t>li/c=red`",
				errors: [ { messageId: "duplicate" } ],
				output: null
			}
		],
		valid: [
			"a.className = \"c=red\"",
			"a.className = \"btn c=red card w=1\"",
			"a.className = \"flex g=8 @sm@c=red\"",
			"a.className = \"c=red;w=1\"",
			"a.className = \">li/c=red;w=1\"",
			"a.className = \"--gap=12;p=--gap\"",
			"a.className = \"-webkit-box-orient=vertical\"",
			"a.className = \"mt=4;m=0\"",
			"a.className = \"c=blue! c=red\"",
			"a.className = \"c=red @sm@c=blue\"",
			"a.className = `c=red\n\t>li/w=1\n\t>li:hover/w=1`",
			"a.className = `>li/w=1\n\t>li:hover/w=1`",
			"function f() {\n\tbox.className = `c=red\n\t\t>li/w=1`\n}",
			"a.className = `w=1 ${b}`",
			"a.className = b",
			"a.title = \"w=1 c=red\"",
			"a.className = \"colr=red\".length",
			"a.className = \"\"",
			"a.className = \"   \"",
			"a.className = \"bg=url(/a/b.png)\"",
			"a.className = \"card\"",
			"a.className = \"c=\"",
			"a.className = \"c=(\"",
			"a.className = \"display=\"",
			"a.className = \"wrapper\"",
			"a.setAttribute(\"title\", \"w=1 c=red\")",
			"cx(\"w=1 c=red\")",
			{
				code: "<div className={`w=1 ${a}`} />",
				languageOptions: jsx
			},
			{
				code: "<div id=\"w=1 c=red\" />",
				languageOptions: jsx
			},
			{
				code: "<div className=\"c=red\n\t>li/w=1\" />",
				languageOptions: jsx
			}
		]
	}
)
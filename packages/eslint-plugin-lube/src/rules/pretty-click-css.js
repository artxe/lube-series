import { analyze_class } from "../utils/click_css_tokens.js"
const backslash_regex = /\\/g
const backtick_regex = /`/g
const interpolation_regex = /\$\{/g
const line_indent_regex = /^[ \t]*/
/**
 * @param {string} value
 * @param {string} quote
 * @returns {string}
 */
function encode_string(value, quote) {
	return quote + value.replace(backslash_regex, "\\\\").split(quote)
		.join("\\" + quote) + quote
}
/**
 * @param {string} value
 * @returns {string}
 */
function encode_template(value) {
	return "`" + value.replace(backslash_regex, "\\\\").replace(backtick_regex, "\\`")
		.replace(interpolation_regex, "\\${") + "`"
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["pretty-click-css"]} */
		const option = context.options[0]
		const attributes = new Set(
			option?.attributes ?? [ "class", "className" ]
		)
		const functions = new Set(option?.functions ?? [])
		const indent = option?.indent ?? "\t"
		const properties = new Set(
			option?.properties ?? [ "className" ]
		)
		const text = context.sourceCode.text
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */({
			AssignmentExpression(
				/** @type {import("estree").AssignmentExpression} */ node
			) {
				const left = node.left
				if (
					node.operator == "=" && left.type == "MemberExpression" && !left.computed && left.property.type == "Identifier" && properties.has(left.property.name)
				) {
					check(node.right)
				}
			},
			CallExpression(
				/** @type {import("estree").CallExpression} */ node
			) {
				const callee = node.callee
				const name = callee.type == "Identifier"
					? callee.name
					: callee.type == "MemberExpression" && !callee.computed && callee.property.type == "Identifier"
						? callee.property.name
						: ""
				const first = node.arguments[0]
				if (name == "setAttribute" && first?.type == "Literal" && first.value == "class" && node.arguments[1]) {
					check(node.arguments[1])
				}
				if (functions.has(name)) {
					for (const argument of node.arguments) {
						check(argument)
					}
				}
			},
			JSXAttribute(
				/** @type {import("../../private.js").ClickJsxAttribute} */ node
			) {
				const value = node.value
				if (node.name.type != "JSXIdentifier" || !attributes.has(String(node.name.name)) || !value) {
					return
				}
				if (value.type == "JSXExpressionContainer") {
					check(
						/** @type {import("estree").Node} */(value.expression)/**/
					)
				} else if (value.type == "Literal" && typeof value.value == "string") {
					verify(
						/** @type {import("estree").Literal} */(value)/**/,
						value.raw.slice(1, -1),
						true
					)
				}
			}
		}))/**/
		/**
		 * @param {import("estree").Node} node
		 * @returns {void}
		 */
		function check(node) {
			switch (node.type) {
			case "ConditionalExpression":
				check(node.consequent)
				check(node.alternate)
				break
			case "Literal":
				if (typeof node.value == "string") {
					verify(node, node.value, false)
				}
				break
			case "LogicalExpression":
				check(node.right)
				break
			case "TemplateLiteral":
				if (!node.expressions.length) {
					verify(
						node,
						/** @type {string} */(node.quasis[0]?.value.cooked)/**/,
						false
					)
				}
				break
			}
		}
		/**
		 * @param {import("estree").Literal | import("estree").TemplateLiteral} node
		 * @param {string} value
		 * @param {boolean} verbatim
		 * @returns {void}
		 */
		function verify(node, value, verbatim) {
			const range = /** @type {import("eslint").AST.Range} */(node.range)/**/
			const line_start = text.lastIndexOf("\n", range[0] - 1) + 1
			const base = /** @type {string} */(line_indent_regex.exec(text.slice(line_start))?.[0])/**/
			const report = analyze_class(value, base + indent)
			if (!report) {
				return
			}
			for (const name of report.unknown) {
				context.report(
					{
						data: { name },
						messageId: "unknown",
						node
					}
				)
			}
			for (const name of report.duplicates) {
				context.report(
					{
						data: { name },
						messageId: "duplicate",
						node
					}
				)
			}
			const formatted = report.formatted
			if (formatted == value) {
				return
			}
			const quote = /** @type {string} */(text[range[0]])/**/
			const encoded = verbatim
				? quote + formatted + quote
				: node.type == "TemplateLiteral" || formatted.includes("\n")
					? encode_template(formatted)
					: encode_string(formatted, quote)
			context.report(
				{
					data: {
						changes: report.changes.join(", ")
					},
					fix: verbatim && formatted.includes(quote)
						? null
						: fixer => fixer.replaceTextRange(range, encoded),
					messageId: report.changes.length
						? "shorthand"
						: report.reordered
							? "order"
							: "layout",
					node
				}
			)
		}
	},
	meta: {
		docs: {
			description: "Enforces the layout of click-css class tokens: base tokens first, one selector per line, everything in ASCII order and written with the shorthands click-css has, and reports unknown and repeated properties.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-click-css.md"
		},
		fixable: "code",
		messages: {
			duplicate: "Property \"{{name}}\" is set by more than one class token in the same selector and media query; keep one",
			layout: "Write the base tokens on the first line, one selector token on each line after it, separated by single spaces",
			order: "Put the class tokens in click-css order: base tokens, then media tokens, then one selector per line, each token and each token's declarations in ASCII order",
			shorthand: "Use the click-css shorthand: {{changes}}",
			unknown: "Unknown CSS property \"{{name}}\" in a click-css class token"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					attributes: {
						default: [ "class", "className" ],
						items: { type: "string" },
						type: "array"
					},
					functions: {
						default: [],
						items: { type: "string" },
						type: "array"
					},
					indent: { default: "\t", type: "string" },
					properties: {
						default: [ "className" ],
						items: { type: "string" },
						type: "array"
					}
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
import { create_source_text } from "../utils/source_text.js"
const line_break_regex = /[\n\r\u2028\u2029]/
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["pretty-ternary"]} */
		const option = context.options[0]
		const ignore_template_literal = option?.ignoreTemplateLiteral ?? true
		const indent = option?.indent ?? "\t"
		const max_length = option?.maxLength ?? 80
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const text = source.text
		const eol = source.eol
		/** @type {import("../../private.js").TernaryNode[]} */
		const nodes = []
		let template_end = -1
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @param {number} depth
		 * @param {import("../../private.js").TernaryGap[]} gaps
		 * @returns {boolean}
		 */
		function collect(node, depth, gaps) {
			const parts = get_parts(node)
			const question = source_code.getTokenAfter(
				/** @type {import("estree").Node} */(/** @type {unknown} */(parts.test))/**/,
				{
					filter: token => token.value == "?"
				}
			)
			const colon = question && source_code.getTokenAfter(
				/** @type {import("estree").Node} */(/** @type {unknown} */(parts.consequent))/**/,
				{
					filter: token => token.value == ":"
				}
			)
			if (
				!question
				|| !colon
				|| question.range[1] > parts.consequent.range[0]
				|| colon.range[1] > parts.alternate.range[0]
			) return false
			for (const operator of [ question, colon ]) {
				const before = /** @type {import("eslint").AST.Token | import("estree").Comment} */(source_code.getTokenBefore(
					operator,
					{ includeComments: true }
				))/**/
				const after = /** @type {import("eslint").AST.Token | import("estree").Comment} */(source_code.getTokenAfter(
					operator,
					{ includeComments: true }
				))/**/
				if (after.type == "Line") return false
				gaps.push(
					{
						depth,
						end: operator.range[0],
						line_break: true,
						start: /** @type {[number, number]} */(before.range)/**/[1]
					},
					{
						depth,
						end: /** @type {[number, number]} */(after.range)/**/[0],
						line_break: false,
						start: operator.range[1]
					}
				)
			}
			for (const branch of [
				parts.consequent,
				parts.alternate
			]) {
				if (is_chained(branch) && !collect(branch, depth + 1, gaps)) return false
			}
			return true
		}
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @returns {{ alternate: import("../../private.js").TernaryNode, consequent: import("../../private.js").TernaryNode, test: import("../../private.js").TernaryNode }}
		 */
		function get_parts(node) {
			return node.type == "TSConditionalType"
				? {
					alternate: node.falseType,
					consequent: node.trueType,
					test: node.extendsType
				}
				: {
					alternate: node.alternate,
					consequent: node.consequent,
					test: node.test
				}
		}
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @returns {boolean}
		 */
		function is_chained(node) {
			const parent = node.parent
			if (!parent || !is_ternary(node) || parent.type != node.type) return false
			const parts = get_parts(parent)
			if (node != parts.consequent && node != parts.alternate) return false
			const before = source_code.getTokenBefore(
				/** @type {import("estree").Node} */(/** @type {unknown} */(node))/**/
			)
			return before?.value == "?" || before?.value == ":"
		}
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @returns {boolean}
		 */
		function is_ternary(node) {
			return node.type == "ConditionalExpression" || node.type == "TSConditionalType"
		}
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @returns {void}
		 */
		function push(node) {
			if (!ignore_template_literal || node.range[0] >= template_end) nodes.push(node)
		}
		/**
		 * @param {import("../../private.js").TernaryNode} node
		 * @returns {void}
		 */
		function verify(node) {
			if (is_chained(node)) return
			/** @type {import("../../private.js").TernaryGap[]} */
			const gaps = []
			if (!collect(node, 0, gaps)) return
			let length = node.range[1] - node.range[0]
			for (const gap of gaps) length -= gap.end - gap.start - 1
			const reason = gaps.length > 4
				? "a branch is another ternary"
				: length > max_length
					? `it is longer than ${max_length} characters`
					: line_break_regex.test(
						text.slice(node.range[0], node.range[1])
					)
						? "it spans lines"
						: ""
			const multiline = reason != ""
			const line_indent = source.get_line_indent(
				/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(node))/**/,
				node.range[0],
				indent
			)
			/** @type {import("eslint").AST.Range[]} */
			const ranges = []
			/** @type {string[]} */
			const values = []
			for (const gap of gaps) {
				const current = text.slice(gap.start, gap.end)
				const breaks = multiline && gap.line_break
				if (breaks && line_break_regex.test(current)) continue
				const value = breaks
					? eol + line_indent + indent.repeat(gap.depth + 1)
					: " "
				if (current == value) continue
				ranges.push([ gap.start, gap.end ])
				values.push(value)
			}
			if (!ranges.length) return
			context.report(
				{
					data: { reason },
					fix(fixer) {
						return ranges.map(
							(range, index) => fixer.replaceTextRange(
								range,
								/** @type {string} */(values[index])/**/
							)
						)
					},
					messageId: values.some(value => value != " ") ? "multiline" : "spacing",
					node: /** @type {import("estree").Node} */(/** @type {unknown} */(node))/**/
				}
			)
		}
		return {
			/** @param {import("estree").ConditionalExpression} node */
			ConditionalExpression(node) {
				push(
					/** @type {import("../../private.js").TernaryNode} */(/** @type {unknown} */(node))/**/
				)
			},
			"Program:exit": () => {
				for (const node of nodes) verify(node)
			},
			/** @param {import("estree").Node} node */
			TSConditionalType(node) {
				push(
					/** @type {import("../../private.js").TernaryNode} */(/** @type {unknown} */(node))/**/
				)
			},
			/** @param {import("estree").TemplateLiteral} node */
			TemplateLiteral(node) {
				const end = /** @type {[number, number]} */(node.range)/**/[1]
				if (end > template_end) template_end = end
			}
		}
	},
	meta: {
		docs: {
			description: "Enforces nested and long ternaries to break before `?` and `:` with one more indent per level.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-ternary.md"
		},
		fixable: "code",
		messages: {
			multiline: "Break this ternary before `?` and `:`, since {{reason}}",
			spacing: "Put one space before and after `?` and `:` of this ternary"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					ignoreTemplateLiteral: { default: true, type: "boolean" },
					indent: { default: "\t", type: "string" },
					maxLength: { default: 80, type: "number" }
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
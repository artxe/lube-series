import { create_source_text } from "../utils/source_text.js"
const type_comment_regex = /^\*[^]*@type\s*\{[^]*\}/
const typescript_expressions = new Set(
	[
		"TSAsExpression",
		"TSInstantiationExpression",
		"TSNonNullExpression",
		"TSSatisfiesExpression",
		"TSTypeAssertion"
	]
)
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["pretty-parens"]} */
		const option = context.options[0]
		const indent = option?.indent ?? "\t"
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const eol = source.eol
		/** @type {Set<number>} */
		const seen = new Set()
		const listener = {
			/** @param {import("../../private.js").ParenNode} node */
			"*": node => {
				verify_grouping(node)
			},
			/** @param {import("../../private.js").ParenNode} node */
			CatchClause(node) {
				if (node.param) {
					verify_header(find_open(node), node.body)
				}
			},
			/** @param {import("../../private.js").ParenNode} node */
			DoWhileStatement(node) {
				const keyword = /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(
					as_node(
						/** @type {import("../../private.js").ParenNode} */(node.body)/**/
					)
				))/**/
				const open = /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(keyword))/**/
				let close = /** @type {import("eslint").AST.Token} */(source_code.getLastToken(as_node(node)))/**/
				if (close.value == ";") {
					close = /** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(close))/**/
				}
				verify(open, close)
			},
			/** @param {import("../../private.js").ParenNode} node */
			ForInStatement(node) {
				verify_header(find_open(node), node.body)
			},
			/** @param {import("../../private.js").ParenNode} node */
			ForOfStatement(node) {
				verify_header(find_open(node), node.body)
			},
			/** @param {import("../../private.js").ParenNode} node */
			ForStatement(node) {
				verify_header(find_open(node), node.body)
			},
			/** @param {import("../../private.js").ParenNode} node */
			IfStatement(node) {
				verify_header(find_open(node), node.consequent)
			},
			/** @param {import("../../private.js").ParenNode} node */
			SwitchStatement(node) {
				const brace = /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(
					as_node(
						/** @type {import("../../private.js").ParenNode} */(node.discriminant)/**/
					),
					{
						filter: token => token.value == "{"
					}
				))/**/
				verify(
					find_open(node),
					/** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(brace))/**/
				)
			},
			/** @param {import("../../private.js").ParenNode} node */
			TemplateLiteral(node) {
				const quasis = node.quasis ?? []
				for (let index = 1; index < quasis.length; index++) {
					const close = source_code.getTokenByRangeStart(
						/** @type {import("../../private.js").ParenNode} */(quasis[index])/**/.range[0]
					)
					const open = close && source_code.getTokenBefore(
						as_node(
							/** @type {import("../../private.js").ParenNode} */(node.expressions?.[index - 1])/**/
						),
						{
							filter: token => token.type == "Template"
						}
					)
					if (open && close && open.type == "Template" && close.type == "Template") {
						verify(open, close)
					}
				}
			},
			/** @param {import("../../private.js").ParenNode} node */
			WhileStatement(node) {
				verify_header(find_open(node), node.body)
			},
			/** @param {import("../../private.js").ParenNode} node */
			WithStatement(node) {
				verify_header(find_open(node), node.body)
			}
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
		/**
		 * @param {import("../../private.js").ParenNode} node
		 * @returns {import("estree").Node}
		 */
		function as_node(node) {
			return /** @type {import("estree").Node} */(/** @type {unknown} */(node))/**/
		}
		/**
		 * @param {import("../../private.js").ParenNode} node
		 * @returns {import("eslint").AST.Token}
		 */
		function find_open(node) {
			return /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(
				/** @type {import("eslint").AST.Token} */(source_code.getFirstToken(as_node(node)))/**/,
				{
					filter: token => token.value == "("
				}
			))/**/
		}
		/**
		 * @param {import("../../private.js").ParenNode} node
		 * @returns {boolean}
		 */
		function owns_parens(node) {
			const parent = node.parent
			if (!parent) {
				return false
			}
			switch (parent.type) {
			case "CallExpression":
			case "NewExpression":
				return parent.arguments?.length == 1 && parent.arguments[0] == node
			case "CatchClause":
				return parent.param == node
			case "DoWhileStatement":
			case "IfStatement":
			case "WhileStatement":
				return parent.test == node
			case "ImportExpression":
				return parent.source == node && !parent.options
			case "SwitchStatement":
				return parent.discriminant == node
			case "WithStatement":
				return parent.object == node
			default:
				return !!parent.params?.includes(node)
			}
		}
		/**
		 * @param {import("eslint").AST.Token} open
		 * @param {import("eslint").AST.Token} close
		 * @returns {void}
		 */
		function verify(open, close) {
			if (seen.has(open.range[0])) {
				return
			}
			seen.add(open.range[0])
			const first = /** @type {import("../../private.js").Item} */(/** @type {unknown} */(source_code.getTokenAfter(open, { includeComments: true })))/**/
			const last = /** @type {import("../../private.js").Item} */(/** @type {unknown} */(source_code.getTokenBefore(close, { includeComments: true })))/**/
			if (first.range[0] >= close.range[0] || first.loc.start.line == last.loc.end.line) {
				return
			}
			if (open.value == "(") {
				const previous = source_code.getTokenBefore(open, { includeComments: true })
				if (previous?.type == "Block" && type_comment_regex.test(previous.value)) {
					return
				}
			}
			const ends_line = first.loc.start.line != open.loc.end.line || first.type == "Line"
			const closes_line = last.loc.end.line != close.loc.start.line
			if (ends_line == closes_line) {
				return
			}
			const base = source.get_token_indent(open.range[0], indent)
			/** @type {import("eslint").AST.Range} */
			let range
			let message_id
			let value
			if (ends_line) {
				message_id = "break"
				range = [ last.range[1], close.range[0] ]
				value = eol + base
			} else if (last.type == "Line") {
				message_id = "comment"
				range = [ open.range[1], first.range[0] ]
				value = eol + base + indent
			} else {
				message_id = "join"
				range = [ last.range[1], close.range[0] ]
				value = ""
			}
			context.report(
				{
					fix: fixer => fixer.replaceTextRange(range, value),
					loc: {
						end: close.loc.end,
						start: open.loc.start
					},
					messageId: message_id
				}
			)
		}
		/**
		 * @param {import("../../private.js").ParenNode} node
		 * @returns {void}
		 */
		function verify_grouping(node) {
			if (node.type.startsWith("TS") && !typescript_expressions.has(node.type)) {
				return
			}
			const target = as_node(node)
			let before = source_code.getTokenBefore(target)
			let after = source_code.getTokenAfter(target)
			/** @type {[import("eslint").AST.Token, import("eslint").AST.Token][]} */
			const pairs = []
			while (
				before && after
					&& before.type == "Punctuator" && before.value == "("
					&& after.type == "Punctuator" && after.value == ")"
			) {
				pairs.push([ before, after ])
				before = source_code.getTokenBefore(before)
				after = source_code.getTokenAfter(after)
			}
			if (pairs.length && owns_parens(node)) {
				pairs.pop()
			}
			for (const [ open, close ] of pairs) {
				verify(open, close)
			}
		}
		/**
		 * @param {import("eslint").AST.Token} open
		 * @param {import("../../private.js").ParenNode | null | undefined} body
		 * @returns {void}
		 */
		function verify_header(open, body) {
			verify(
				open,
				/** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(
					as_node(
						/** @type {import("../../private.js").ParenNode} */(body)/**/
					)
				))/**/
			)
		}
	},
	meta: {
		docs: {
			description: "Enforces a bracket that holds a multi-line expression to be written with its closing bracket right after the last token, or on its own line when the opening bracket ends its line.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-parens.md"
		},
		fixable: "code",
		messages: {
			break: "Put the closing bracket on its own line, since the opening bracket ends its line",
			comment: "Break after the opening bracket, since a line comment keeps the closing bracket off the last token",
			join: "Put the closing bracket right after the last token, since the opening bracket is followed by content on its line"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					indent: { default: "\t", type: "string" }
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
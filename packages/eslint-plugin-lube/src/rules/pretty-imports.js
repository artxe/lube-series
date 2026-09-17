import { create_source_text } from "../utils/source_text.js"
import text_width from "../utils/text_width.js"
const lf_regex = /\n/g
const line_indent_regex = /\n[\t ]*/g
const semicolon_regex = /\s*;$/
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["pretty-imports"]} */
		const option = context.options[0]
		const check_exports = option?.checkExports ?? true
		const check_imports = option?.checkImports ?? true
		const fix_indent = option?.fixIndent ?? false
		const indent = option?.indent ?? "\t"
		const max_length = option?.maxLength ?? 30
		const semicolon = option?.semicolon ?? false
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const text = source.text
		const eol = source.eol
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {string}
		 */
		function get_text(start, end) {
			return source.to_lf(text.slice(start, end))
		}
		/**
		 * @param {string} value
		 * @returns {string}
		 */
		function to_structure(value) {
			return value.replace(line_indent_regex, "\n")
		}
		/**
		 * @param {import("../../private.js").AstNode & import("../../private.js").ModuleDeclaration} node
		 * @param {"ExportSpecifier" | "ImportSpecifier"} specifier_type
		 * @param {"export" | "import"} kind
		 * @returns {void}
		 */
		function verify(node, specifier_type, kind) {
			const specifiers = /** @type {import("../../private.js").AstNode[]} */(node.specifiers)/**/.filter(
				specifier => specifier.type == specifier_type
			)
			const first = specifiers[0]
			const last = specifiers[specifiers.length - 1]
			if (first?.type != specifier_type || !last || source_code.getCommentsInside(node).length) return
			const tokens = source_code.getTokens(node)
			const open_index = tokens.findIndex(
				token => token.range[0] == first.range[0]
			) - 1
			if (tokens[open_index]?.value != "{") return
			const head = tokens.slice(0, open_index)
				.map(token => token.value)
				.join(" ")
				.replace(" ,", ",")
			const last_token = /** @type {import("eslint").AST.Token} */(tokens[tokens.length - 1])/**/
			const end_token = last_token.value == ";"
				? /** @type {import("eslint").AST.Token} */(tokens[tokens.length - 2])/**/
				: last_token
			const tail_end = end_token.range[1]
			const tail = node.source ? " from " + get_text(node.source.range[0], tail_end) : ""
			const next_token = source_code.getTokenAfter(
				/** @type {import("estree").Node} */(node)/**/
			)
			const detached = last_token != end_token && last_token.loc.start.line != end_token.loc.end.line
			const end = detached ? tail_end : node.range[1]
			const keeps_semicolon = !detached && (
				semicolon
				|| next_token?.value != "}" && next_token?.loc.start.line == end_token.loc.end.line
			)
			let length = 0
			for (const specifier of specifiers) {
				length += text_width(
					get_text(
						specifier.range[0],
						specifier.range[1]
					)
				)
			}
			const specifier_texts = specifiers.map(
				specifier => get_text(
					specifier.range[0],
					specifier.range[1]
				)
			)
			const line_indent = source.get_indent(node.range[0])
			const item_indent = line_indent + indent
			const names = `{ ${specifier_texts.join(", ")} }`
			const corrected_text = (
				length > max_length
					? `${head} {\n${item_indent}${specifier_texts.join(",\n" + item_indent)}\n${line_indent}}`
					: `${head} ${names}`
			) + tail + (keeps_semicolon ? ";" : "")
			const current = get_text(node.range[0], end)
			if (corrected_text == current) return
			const same_structure = to_structure(current) == to_structure(corrected_text)
			if (!fix_indent && same_structure) return
			context.report(
				{
					data: {
						kind,
						length: String(length),
						max_length: String(max_length),
						names
					},
					fix(fixer) {
						return fixer.replaceTextRange(
							[ node.range[0], end ],
							eol == "\n" ? corrected_text : corrected_text.replace(lf_regex, eol)
						)
					},
					messageId: current.replace(semicolon_regex, "") == corrected_text.replace(semicolon_regex, "")
						? keeps_semicolon
							? "semicolon"
							: "no_semicolon"
						: same_structure
							? "indent"
							: length > max_length
								? "multiline"
								: "single_line",
					node: /** @type {import("estree").Node} */(node)/**/
				}
			)
		}
		/** @type {import("../../private.js").RuleListener} */
		const listener = {
			ExportNamedDeclaration: node => {
				if (check_exports) verify(
					/** @type {import("../../private.js").AstNode & import("estree").ExportNamedDeclaration} */(node)/**/,
					"ExportSpecifier",
					"export"
				)
			},
			ImportDeclaration: node => {
				if (check_imports) verify(
					/** @type {import("../../private.js").AstNode & import("estree").ImportDeclaration} */(node)/**/,
					"ImportSpecifier",
					"import"
				)
			}
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
	},
	meta: {
		docs: {
			description: "Enforces proper indentation for import and export statements.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-imports.md"
		},
		fixable: "code",
		messages: {
			indent: "Indent each name of this {{kind}} one level deeper than the statement",
			multiline: "Put each name of this {{kind}} on a line of its own, since the names are longer than {{max_length}} characters together",
			no_semicolon: "Remove the semicolon at the end of this {{kind}}",
			semicolon: "Add a semicolon at the end of this {{kind}}",
			single_line: "Write the names of this {{kind}} on one line as `{{names}}`, since the names are {{length}} characters together, within the {{max_length}} allowed"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					checkExports: { default: true, type: "boolean" },
					checkImports: { default: true, type: "boolean" },
					fixIndent: { default: false, type: "boolean" },
					indent: { default: "\t", type: "string" },
					maxLength: { default: 30, type: "number" },
					semicolon: { default: false, type: "boolean" }
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
import { create_source_text } from "../utils/source_text.js"
import text_width from "../utils/text_width.js"
const lf_regex = /\n/g
const newline_regex = /(?<=\n)(?=[^\n])/g
const line_indent_regex = /\n[\t ]*/g
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["pretty-sequence"]} */
		const option = context.options[0]
		const array_bracket_spacing = option?.arrayBracketSpacing ?? true
		const check_array = option?.checkArray ?? true
		const check_call = option?.checkCall ?? true
		const check_object = option?.checkObject ?? true
		const check_sequence = option?.checkSequence ?? true
		const fix_indent = option?.fixIndent ?? false
		const func_call_spacing = option?.funcCallSpacing ?? false
		const ignore_template_literal = option?.ignoreTemplateLiteral ?? true
		const indent = option?.indent ?? "\t"
		const max_length = option?.maxLength ?? 30
		const object_curly_spacing = option?.objectCurlySpacing ?? true
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const text = source.text
		const eol = source.eol
		/** @type {import("../../private.js").AstNode[]} */
		const nodes = []
		let template_end = -1
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @param {string} opener
		 * @param {string} closer
		 * @param {(import("../../private.js").AstNode | null)[]} items
		 * @param {boolean} spacing
		 * @returns {import("../../private.js").Sequence | undefined}
		 */
		function get_bracket_sequence(node, opener, closer, items, spacing) {
			const end = node.typeAnnotation
				? source_code.getTokenBefore(
					node.typeAnnotation,
					{
						filter: token => token.value == closer
					}
				)?.range[0]
				: node.range[1] - 1
			if (end == null || text[node.range[0]] != opener || text[end] != closer) return
			return {
				end,
				items,
				line_indent: source.get_line_indent(
					node,
					source.get_anchor(node.range[0]),
					indent
				),
				spacing,
				start: node.range[0] + 1
			}
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @param {number} start
		 * @param {number} end
		 * @returns {import("../../private.js").SequenceItem}
		 */
		function get_item(node, start, end) {
			let code_start = node.range[0]
			let code_end = node.range[1]
			let left = code_start
			for (;;) {
				left = source.skip_left(code_start, start)
				if (left <= start || text[left - 1] != "(") break
				const right = source.skip_right(code_end, end)
				if (right >= end || text[right] != ")") break
				code_start = left - 1
				code_end = right + 1
			}
			const right = source.skip_right(code_end, end)
			let last = right
			while (last > code_end && source.is_space(text.charCodeAt(last - 1))) last--
			return {
				after_comma: "",
				after_comma_comments: 0,
				after_comma_line_comment: false,
				after_comma_newline: false,
				code_end,
				code_start,
				left,
				node,
				right,
				text: render(left, right).trim(),
				trailing_line_comment: last > code_end && source.comment_by_end.get(last)?.type == "Line"
			}
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {import("../../private.js").Sequence | undefined}
		 */
		function get_sequence(node) {
			switch (node.type) {
			case "ArrayExpression":
			case "ArrayPattern":
				return get_bracket_sequence(
					node,
					"[",
					"]",
					node.elements,
					array_bracket_spacing
				)
			case "ArrowFunctionExpression":
			case "FunctionDeclaration":
			case "FunctionExpression": {
				const params = node.params
				const first = params[0]
				const last = params[params.length - 1]
				let open
				let close
				if (first && last) {
					open = source_code.getTokenBefore(first)
					close = source_code.getTokenAfter(last)
					if (close?.value == ",") close = source_code.getTokenAfter(close)
				} else {
					const before = node.typeParameters ?? (node.type == "ArrowFunctionExpression" ? void 0 : node.id)
					open = before
						? source_code.getTokenAfter(before)
						: source_code.getFirstToken(
							node,
							{
								filter: token => token.value == "("
							}
						)
					close = open && source_code.getTokenAfter(open)
				}
				if (
					open?.value != "("
					|| close?.value != ")"
					|| open.range[0] < node.range[0]
					|| close.range[1] > node.range[1]
				) return
				return {
					end: close.range[0],
					items: params,
					line_indent: source.get_line_indent(
						node,
						source.get_anchor(node.range[0]),
						indent
					),
					spacing: func_call_spacing,
					start: open.range[1]
				}
			}
			case "CallExpression":
			case "NewExpression": {
				const close = source_code.getLastToken(node)
				let open = source_code.getTokenAfter(
					node.typeArguments ?? node.typeParameters ?? node.callee
				)
				while (open && open.value != "(" && open.range[0] < node.range[1]) {
					open = source_code.getTokenAfter(open)
				}
				if (
					close?.value != ")"
					|| open?.value != "("
					|| open.range[0] >= close.range[0]
				) return
				return {
					end: close.range[0],
					items: node.arguments,
					line_indent: source.get_line_indent(
						node,
						source.get_anchor(node.callee.range[1]),
						indent
					),
					spacing: func_call_spacing,
					start: open.range[1]
				}
			}
			case "ObjectExpression":
			case "ObjectPattern":
				return get_bracket_sequence(
					node,
					"{",
					"}",
					node.properties,
					object_curly_spacing
				)
			case "SequenceExpression":
				return {
					end: node.range[1],
					items: node.expressions,
					line_indent: source.get_line_indent(
						node,
						source.get_anchor(node.range[0]),
						indent
					),
					spacing: false,
					start: node.range[0]
				}
			}
			return undefined
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {void}
		 */
		function push(node) {
			if (!ignore_template_literal || node.range[0] >= template_end) nodes.push(node)
		}
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {string}
		 */
		function render(start, end) {
			const rendered = source.render(start, end)
			return eol == "\n" ? rendered : source.to_lf(rendered)
		}
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {string}
		 */
		function render_comments(start, end) {
			/** @type {string[]} */
			const texts = []
			for (let index = start; index < end; index++) {
				const comment = source.comment_by_start.get(index)
				if (!comment) continue
				texts.push(
					render(
						comment.range[0],
						comment.range[1]
					)
				)
				index = comment.range[1] - 1
			}
			return texts.join(" ")
		}
		/**
		 * @param {number} position
		 * @param {number} limit
		 * @param {number} holes
		 * @returns {number}
		 */
		function take_same_line_comments(position, limit, holes) {
			let index = position
			for (;;) {
				while (index < limit && (text[index] == " " || text[index] == "\t" || text[index] == "," && holes-- > 0)) index++
				const comment = source.comment_by_start.get(index)
				if (!comment || comment.range[1] > limit || comment.loc?.start.line != comment.loc?.end.line) {
					return position
				}
				if (comment.type == "Line") return comment.range[1]
				index = comment.range[1]
			}
		}
		/**
		 * @param {string} value
		 * @returns {string}
		 */
		function to_structure(value) {
			return value.replace(line_indent_regex, "\n")
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {void}
		 */
		function verify(node) {
			const sequence = get_sequence(node)
			if (!sequence) return
			const { end, line_indent, start } = sequence
			const is_sequence_expression = node.type == "SequenceExpression"
			const items = sequence.items.map(
				item_node => item_node && get_item(item_node, start, end)
			)
			const last_index = items.length - 1
			items.forEach(
				(before, i) => {
					if (!before || i == last_index || before.trailing_line_comment || text[before.right] != ",") return
					let next = i + 1
					while (next <= last_index && !items[next]) next++
					const item = items[i + 1]
					const comma_end = before.right + 1
					const taken = take_same_line_comments(
						comma_end,
						items[next]?.code_start ?? end,
						next - i - 1
					)
					if (taken == comma_end) return
					before.after_comma = item ? render(comma_end, taken).trim() : render_comments(comma_end, taken)
					before.after_comma_comments = source.count_comments(comma_end, taken)
					before.after_comma_line_comment = true
					if (!item) return
					item.left = source.skip_left(item.code_start, taken)
					item.text = render(item.left, item.right).trim()
				}
			)
			const last = items[last_index]
			if (last && !last.trailing_line_comment && text[last.right] == ",") {
				const comma_end = last.right + 1
				const comments = source.count_comments(comma_end, end)
				if (comments && source.skip_right(comma_end, end) == end) {
					const after_comma = render(comma_end, end).trimEnd()
					let comment_end = end
					while (source.is_space(
						text.charCodeAt(comment_end - 1)
					)) comment_end--
					last.after_comma = after_comma.trimStart()
					last.after_comma_comments = comments
					last.after_comma_line_comment = source.comment_by_end.get(comment_end)?.type == "Line"
					last.after_comma_newline = after_comma.slice(
						0,
						after_comma.length - last.after_comma.length
					).includes("\n")
				}
			}
			let covered_comments = 0
			let length = 0
			let multiline = false
			for (const item of items) {
				if (!item) continue
				covered_comments += source.count_comments(item.left, item.right) + item.after_comma_comments
				length += text_width(item.text) + item.after_comma.length
				if (
					item.after_comma_line_comment
					|| item.after_comma_newline
					|| item.after_comma.includes("\n")
					|| item.text.includes("\n")
					|| item.trailing_line_comment
				) multiline = true
			}
			if (covered_comments != source.count_comments(start, end)) return
			const too_long = length > max_length
			if (too_long) multiline = true
			let corrected_text = ""
			if (multiline) {
				const item_indent = is_sequence_expression ? line_indent : line_indent + indent
				for (let i = 0; i <= last_index; i++) {
					const item = items[i]
					if (!item) {
						corrected_text += i < last_index ? ",\n" + item_indent : ","
						continue
					}
					const add_indent = !is_sequence_expression && source.get_line_start(start) == source.get_line_start(item.node.range[0])
					if (add_indent && source.has_multiline_literal(item.left, item.right)) return
					/**
					 * @param {string} value
					 * @returns {string}
					 */
					function indented(value) {
						return add_indent ? value.replace(newline_regex, indent) : value
					}
					if (i == last_index) {
						corrected_text += indented(item.text)
						if (item.after_comma) {
							const separator = item.after_comma_newline ? "\n" + item_indent : " "
							corrected_text += separator + indented(item.after_comma)
						}
					} else if (item.trailing_line_comment) {
						const code = render(item.left, item.code_end).trim()
						const comment = render(item.code_end, item.right).trim()
						corrected_text += indented(code) + ", " + indented(comment) + "\n" + item_indent
					} else {
						const comment = item.after_comma ? " " + indented(item.after_comma) : ""
						corrected_text += indented(item.text) + "," + comment + "\n" + item_indent
					}
				}
				if (!is_sequence_expression) corrected_text = "\n" + item_indent + corrected_text + "\n" + line_indent
			} else {
				corrected_text = items.map(item => item ? item.text : "").join(", ")
				if (last?.after_comma) corrected_text += " " + last.after_comma
				else if (items[last_index] === null) corrected_text += ","
				if (length && sequence.spacing) corrected_text = " " + corrected_text + " "
			}
			const current = render(start, end)
			const same_structure = to_structure(current) == to_structure(corrected_text)
			if (current != corrected_text && (fix_indent || !same_structure)) {
				source.edit(start, end, corrected_text)
				context.report(
					{
						data: {
							expected: is_sequence_expression
								? corrected_text
								: text[start - 1] + corrected_text + text[end],
							length: String(length),
							max_length: String(max_length),
							reason: too_long
								? `the items are longer than ${max_length} characters together`
								: "an item spans lines or is followed by a line comment",
							target: is_sequence_expression ? "each item" : "each item and the closing bracket"
						},
						fix(fixer) {
							return fixer.replaceTextRange(
								[ start, end ],
								eol == "\n" ? corrected_text : corrected_text.replace(lf_regex, eol)
							)
						},
						loc: {
							end: source_code.getLocFromIndex(end),
							start: source_code.getLocFromIndex(start)
						},
						messageId: same_structure
							? "indent"
							: multiline
								? "multiline"
								: "single_line",
						node: /** @type {import("estree").Node} */(node)/**/
					}
				)
			}
		}
		/** @type {import("../../private.js").RuleListener} */
		const listener = {
			ArrayExpression: node => {
				if (check_array) push(node)
			},
			ArrayPattern: node => {
				if (check_array) push(node)
			},
			ArrowFunctionExpression: node => {
				if (check_call) push(node)
			},
			CallExpression: node => {
				if (check_call) push(node)
			},
			FunctionDeclaration: node => {
				if (check_call) push(node)
			},
			FunctionExpression: node => {
				if (check_call) push(node)
			},
			NewExpression: node => {
				if (check_call) push(node)
			},
			ObjectExpression: node => {
				if (check_object) push(node)
			},
			ObjectPattern: node => {
				if (check_object) push(node)
			},
			"Program:exit": () => {
				for (let i = nodes.length - 1; i >= 0; i--) {
					verify(
						/** @type {import("../../private.js").AstNode} */(nodes[i])/**/
					)
				}
			},
			SequenceExpression: node => {
				if (check_sequence) push(node)
			},
			TemplateLiteral: node => {
				if (node.range[1] > template_end) template_end = node.range[1]
			}
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
	},
	meta: {
		docs: {
			description: "Enforces pretty formatting of arrays, objects, parameters and arguments.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-sequence.md"
		},
		fixable: "code",
		messages: {
			indent: "Indent each item one level deeper than the line the brackets open on",
			multiline: "Put {{target}} on a line of its own, since {{reason}}",
			single_line: "Write these items on one line as `{{expected}}`, since the items are {{length}} characters together, within the {{max_length}} allowed"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					arrayBracketSpacing: { default: true, type: "boolean" },
					checkArray: { default: true, type: "boolean" },
					checkCall: { default: true, type: "boolean" },
					checkObject: { default: true, type: "boolean" },
					checkSequence: { default: true, type: "boolean" },
					fixIndent: { default: false, type: "boolean" },
					funcCallSpacing: { default: false, type: "boolean" },
					ignoreTemplateLiteral: { default: true, type: "boolean" },
					indent: { default: "\t", type: "string" },
					maxLength: { default: 30, type: "number" },
					objectCurlySpacing: { default: true, type: "boolean" }
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
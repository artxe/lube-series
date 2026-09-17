import { create_source_text, is_space } from "../utils/source_text.js"
const line_break_regex = /[\n\r\u2028\u2029]/
const restricted_regex = /(?:^|[^$\w])(?:return|throw|yield)$/
const simple_type_regex = /^\*\s*@type\s*\{(.+)\}\s*$/
const type_regex = /^\*[^]*@type\s*\{[^]*\}/
const typescript_file_regex = /\.[cm]?tsx?$/
const marker_regex = /\/\*\*\//g
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		if (typescript_file_regex.test(context.filename)) return {}
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const text = source.text
		/** @type {import("../../private.js").AstNode[]} */
		const expressions = []
		/** @type {Set<string>} */
		const node_ranges = new Set()
		/**
		 * @param {import("../../private.js").Comment} comment
		 * @returns {string}
		 */
		function get_type_comment(comment) {
			const type = simple_type_regex.exec(comment.value)?.[1]
			return type == null
				? text.slice(
					comment.range[0],
					comment.range[1]
				)
				: `/** @type {${type}} */`
		}
		/**
		 * @param {number} position
		 * @returns {boolean}
		 */
		function is_arguments(position) {
			const node = /** @type {import("../../private.js").AstNode | null} */(/** @type {unknown} */(source_code.getNodeByRangeIndex(position)))/**/
			if (!node) return false
			const type = node.type
			if (type != "CallExpression" && type != "ImportExpression" && type != "NewExpression") return false
			const before = type == "ImportExpression"
				? source_code.getFirstToken(
					/** @type {import("estree").Node} */(node)/**/
				)
				: node.typeArguments ?? node.typeParameters ?? node.callee
			let open = before && source_code.getTokenAfter(
				/** @type {import("estree").Node} */(before)/**/
			)
			while (open && open.value != "(" && open.range[0] < node.range[1]) {
				open = source_code.getTokenAfter(open)
			}
			return open?.range[0] == position
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {void}
		 */
		function push(node) {
			const range = node.range[0] + " " + node.range[1]
			if (node_ranges.has(range)) return
			node_ranges.add(range)
			expressions.push(node)
		}
		/**
		 * @param {number} start
		 * @param {number} end
		 * @param {[number, number][]} removed
		 * @returns {string | null}
		 */
		function render_without(start, end, removed) {
			let position = start
			let result = ""
			for (const [ removed_start, removed_end ] of removed) {
				if (removed_end <= start || removed_start >= end) continue
				if (source.crosses_edit(removed_start) || source.crosses_edit(removed_end)) return null
				let chunk_end = removed_start
				if (text[removed_start] == ")") {
					while (chunk_end > position && is_space(text.charCodeAt(chunk_end - 1))) chunk_end--
					if (source.comment_by_end.get(chunk_end)?.type == "Line") chunk_end = removed_start
				}
				result += source.render(position, chunk_end)
				position = removed_end
				if (text[removed_start] == "(") {
					while (position < end && is_space(text.charCodeAt(position))) position++
				}
			}
			return result + source.render(position, end)
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {void}
		 */
		function verify(node) {
			const node_start = node.range[0]
			const before = source.skip_left(node_start, 0)
			if (!before || text[before - 1] != "(" || is_arguments(before - 1)) return
			/** @type {import("../../private.js").CastingLevel[]} */
			const levels = []
			/** @type {[number, number][]} */
			const removed = []
			let content_end = node.range[1]
			let content_start = node_start
			let has_inner_type_comment = false
			let left = node_start
			let right = content_end
			for (;;) {
				while (left > 0) {
					if (is_space(text.charCodeAt(left - 1))) {
						left--
						continue
					}
					const comment = source.comment_by_end.get(left)
					if (!comment) break
					const level = levels[levels.length - 1]
					const type = comment.type == "Block" && type_regex.test(comment.value)
						? get_type_comment(comment)
						: void 0
					if (type && level && level.type == null) {
						let comment_end = comment.range[1]
						while (comment_end < level.open && is_space(text.charCodeAt(comment_end))) comment_end++
						level.type = type
						removed.push(
							[ comment.range[0], comment_end ]
						)
					} else if (type) has_inner_type_comment = true
					left = comment.range[0]
				}
				if (!left || text[left - 1] != "(" || is_arguments(left - 1)) break
				const close = source.skip_right(right, text.length)
				right = close
				if (text[close] != ")") break
				if (has_inner_type_comment) {
					if (levels.length) return
					content_end = close
					content_start = left
					has_inner_type_comment = false
				}
				const close_end = source.render(close + 1, close + 5) == "/**/" ? close + 5 : close + 1
				left--
				levels.push(
					{
						close,
						close_end,
						open: left,
						type: void 0
					}
				)
				right = close_end
			}
			const outer = levels[levels.length - 1]
			const first = levels[0]
			if (!outer || !first) return
			const restores_outer = outer.type == null
			for (const level of levels) {
				if (level == outer && restores_outer) removed.push(
					[ level.close + 1, level.close_end ]
				)
				else removed.push(
					[ level.open, level.open + 1 ],
					[ level.close, level.close_end ]
				)
			}
			removed.sort((a, b) => a[0] - b[0])
			if (content_end + 4 <= first.close && source.render(content_end, content_end + 4) == "/**/") {
				content_end += 4
			}
			const unwrapped = restores_outer
				? levels.slice(0, -1)
				: levels
			const unwrapped_outer = unwrapped[unwrapped.length - 1]
			if (unwrapped_outer) {
				let type_comments = 0
				for (const level of unwrapped) {
					if (level != unwrapped_outer && level.type != null) type_comments++
				}
				if (source.count_comments(
					unwrapped_outer.open,
					content_start
				) > type_comments) return
			}
			const boundaries = [
				left,
				content_start,
				content_end,
				right
			]
			if (boundaries.some(source.crosses_edit)) return
			let corrected_text = source.render(content_start, content_end)
			for (const [ index, level ] of unwrapped.entries()) {
				corrected_text = level.type
					? unwrapped[index + 1]?.type
						? `${level.type}(${corrected_text})`
						: `${level.type}(${corrected_text})/**/`
					: `(${corrected_text})`
			}
			const prefix = render_without(left, content_start, removed)
			const suffix = render_without(content_end, right, removed)
			if (
				prefix == null
				|| suffix == null
				|| line_break_regex.test(prefix)
					&& restricted_regex.test(
						text.slice(Math.max(0, left - 7), left)
					)
			) return
			corrected_text = prefix + corrected_text + suffix
			const current = source.render(left, right)
			if (current == corrected_text) return
			const message_id = current.replace(marker_regex, "") == corrected_text.replace(marker_regex, "")
				? "marker"
				: "format"
			source.edit(left, right, corrected_text)
			context.report(
				{
					fix(fixer) {
						return fixer.replaceTextRange([ left, right ], corrected_text)
					},
					loc: {
						end: source_code.getLocFromIndex(right),
						start: source_code.getLocFromIndex(left)
					},
					messageId: message_id,
					node: /** @type {import("estree").Node} */(node)/**/
				}
			)
		}
		/** @type {import("../../private.js").RuleListener} */
		const listener = {
			ArrayExpression: push,
			ArrowFunctionExpression: push,
			AssignmentExpression: push,
			AwaitExpression: push,
			BinaryExpression: push,
			CallExpression: push,
			ChainExpression: push,
			ClassExpression: push,
			ConditionalExpression: push,
			FunctionExpression: push,
			Identifier: push,
			ImportExpression: push,
			Literal: push,
			LogicalExpression: push,
			MemberExpression: push,
			MetaProperty: push,
			NewExpression: push,
			ObjectExpression: push,
			"Program:exit": () => {
				for (let i = expressions.length - 1; i >= 0; i--) {
					verify(
						/** @type {import("../../private.js").AstNode} */(expressions[i])/**/
					)
				}
			},
			SequenceExpression: push,
			TaggedTemplateExpression: push,
			TemplateLiteral: push,
			ThisExpression: push,
			UnaryExpression: push,
			UpdateExpression: push,
			YieldExpression: push
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
	},
	meta: {
		docs: {
			description: "Enforces additional empty comment when type casting in JSDoc.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-jsdoc-casting.md"
		},
		fixable: "code",
		messages: {
			format: "Write this cast as `/** @type {T} */(value)/**/`, without white space or extra parentheses around the value",
			marker: "Put one empty comment `/**/` right after the closing parenthesis of the outermost cast"
		},
		schema: [],
		type: "layout"
	}
}
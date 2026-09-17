const closers_set = new Set([ ")", "]", "}" ])
const continuation_regex = /^(?:[([{]|=>|(?:[-%&*+/^|]|\*\*|<<|>>>?|&&|\|\||\?\?)?=)$/
const line_break_regex = /[\n\r\u2028\u2029]/
const line_terminator_regex = /\r\n|[\n\r\u2028\u2029]/g
const openers_set = new Set([ "(", "[", "{" ])
const quote_regex = /^["']/
const text_token_types = new Set([ "HTMLText", "JSXText" ])
const space_regex = /\s/
const statement_lists = new Set(
	[
		"BlockStatement",
		"ClassBody",
		"Program",
		"StaticBlock",
		"SwitchCase",
		"TSModuleBlock"
	]
)
/**
 * @param {import("eslint").SourceCode} source_code
 */
function create_source_text(source_code) {
	const text = source_code.text
	const comments = /** @type {import("../../private.js").Comment[]} */(source_code.getAllComments())/**/
	/** @type {Map<number, import("../../private.js").Comment>} */
	const comment_by_end = new Map()
	/** @type {Map<number, import("../../private.js").Comment>} */
	const comment_by_start = new Map()
	for (const comment of comments) {
		comment_by_end.set(comment.range[1], comment)
		comment_by_start.set(comment.range[0], comment)
	}
	/** @type {{ end: number, start: number, text: string }[]} */
	const edits = []
	/** @type {number[] | undefined} */
	let anchors
	/** @type {number[]} */
	const enclosers = []
	/** @type {number[]} */
	const line_starts = [ 0 ]
	for (const match of text.matchAll(line_terminator_regex)) line_starts.push(match.index + match[0].length)
	/** @type {[number, number][]} */
	const multiline_literals = []
	for (const token of source_code.ast.tokens) {
		const type = /** @type {string} */(token.type)/**/
		if ((type == "String" || type == "Template" || type == "JSXText" && quote_regex.test(token.value)) && line_break_regex.test(token.value)) {
			multiline_literals.push(
				/** @type {[number, number]} */(token.range)/**/
			)
		}
	}
	/**
	 * @returns {number[]}
	 */
	function build_anchors() {
		if (anchors) return anchors
		const tokens = source_code.ast.tokens
		anchors = []
		/** @type {number[]} */
		const openers = []
		let previous_line = 0
		for (const [ index, token ] of tokens.entries()) {
			let anchor = token.loc.start.line == previous_line
				? /** @type {number} */(anchors[index - 1])/**/
				: index
			let encloser = openers[openers.length - 1]
			if (token.type == "Punctuator") {
				if (openers_set.has(token.value)) openers.push(index)
				else if (closers_set.has(token.value)) {
					const opener = openers.pop()
					if (opener != null && anchor != index) anchor = /** @type {number} */(anchors[opener])/**/
					encloser = openers[openers.length - 1]
				}
			}
			anchors.push(anchor)
			enclosers.push(encloser ?? -1)
			previous_line = text_token_types.has(token.type)
				? token.loc.start.line
				: token.loc.end.line
		}
		return anchors
	}
	/**
	 * @param {{ end: number, start: number }} edit
	 * @returns {number}
	 */
	function get_edit_key(edit) {
		return -edit.start
	}
	/**
	 * @param {number} index
	 * @returns {number}
	 */
	function get_line_start(index) {
		return /** @type {number} */(line_starts[lower_bound(line_starts, identity, index + 1) - 1])/**/
	}
	/**
	 * @param {import("../../private.js").AstNode} node
	 * @returns {number}
	 */
	function get_node_start(node) {
		return node.range[0]
	}
	/**
	 * @param {[number, number]} range
	 * @returns {number}
	 */
	function get_range_end(range) {
		return range[1]
	}
	/**
	 * @param {import("../../private.js").Comment} comment
	 * @returns {number}
	 */
	function get_range_start(comment) {
		return comment.range[0]
	}
	/**
	 * @param {import("eslint").AST.Token} token
	 * @returns {number}
	 */
	function get_token_start(token) {
		return token.range[0]
	}
	return {
		comment_by_end,
		comment_by_start,
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {number}
		 */
		count_comments(start, end) {
			return lower_bound(comments, get_range_start, end) - lower_bound(comments, get_range_start, start)
		},
		/**
		 * @param {number} position
		 * @returns {boolean}
		 */
		crosses_edit(position) {
			const edit = edits[lower_bound(edits, get_edit_key, 1 - position)]
			return !!edit && edit.end > position
		},
		/**
		 * @param {number} start
		 * @param {number} end
		 * @param {string} value
		 * @returns {void}
		 */
		edit(start, end, value) {
			const index = lower_bound(edits, get_edit_key, 1 - start)
			let first = index
			while (first > 0 && (/** @type {{ end: number }} */(edits[first - 1])/**/).end <= end) first--
			edits.splice(
				first,
				index - first,
				{ end, start, text: value }
			)
		},
		eol: text.match(line_terminator_regex)?.[0] ?? "\n",
		/**
		 * @param {number} position
		 * @returns {number}
		 */
		get_anchor(position) {
			const tokens = source_code.ast.tokens
			const indexes = build_anchors()
			const index = lower_bound(tokens, get_token_start, position)
			const anchor = tokens[index]?.range[0] == position
				? tokens[/** @type {number} */(indexes[index])/**/]
				: undefined
			return anchor ? anchor.range[0] : position
		},
		/**
		 * @param {number} position
		 * @returns {number}
		 */
		get_encloser(position) {
			const tokens = source_code.ast.tokens
			build_anchors()
			const index = lower_bound(tokens, get_token_start, position)
			if (tokens[index]?.range[0] != position) return -1
			const encloser = /** @type {number} */(enclosers[index])/**/
			return encloser < 0
				? -1
				: /** @type {import("eslint").AST.Token} */(tokens[encloser])/**/.range[0]
		},
		/**
		 * @param {number} index
		 * @returns {string}
		 */
		get_indent(index) {
			const line_start = get_line_start(index)
			let position = line_start
			while (position < index && (text[position] == " " || text[position] == "\t")) position++
			return text.slice(line_start, position)
		},
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @param {number} position
		 * @param {string} indent
		 * @returns {string}
		 */
		get_line_indent(node, position, indent) {
			const line_start = get_line_start(position)
			const line_indent = this.get_indent(position)
			const comment = comments[lower_bound(
				comments,
				get_range_start,
				line_start
			) - 1]
			let statement = node
			while (statement.parent && !statement_lists.has(statement.parent.type)) statement = statement.parent
			const before = source_code.getTokenBefore(
				/** @type {import("estree").Node} */(statement)/**/
			)
			const line_first = line_start + line_indent.length
			if (
				comment_by_start.has(line_first)
				&& this.skip_right(line_first, position) == position
				&& statement.range[0] < line_start
			) {
				const previous = source_code.getTokenBefore(
					/** @type {import("eslint").AST.Token} */(source_code.getTokenByRangeStart(position))/**/
				)
				const previous_anchor = previous && continuation_regex.test(previous.value) && previous.range[1] <= line_start
					? this.get_anchor(previous.range[0])
					: -1
				if (previous_anchor >= 0 && this.get_indent(previous_anchor) == line_indent) {
					return this.get_line_indent(node, previous_anchor, indent) + indent
				}
			}
			if (comment && comment.range[1] > line_start && comment.range[1] <= position) {
				let opener = this.get_encloser(position)
				while (opener >= line_start) opener = this.get_encloser(opener)
				const statement_start = statement.range[0]
				if (opener > statement_start) {
					return this.get_line_indent(
						node,
						this.get_anchor(opener),
						indent
					) + indent
				}
				if (statement_start < line_start) {
					return this.get_line_indent(
						statement,
						this.get_anchor(statement_start),
						indent
					) + indent
				}
			}
			const line_comment = comment_by_start.get(line_first)
			if (
				text[line_start + line_indent.length] == ";"
				|| comment && comment.range[1] > line_start
				|| !!before && before.range[1] > line_start && get_line_start(statement.range[0]) == line_start
				|| !!line_comment && line_comment.range[1] <= statement.range[0] && get_line_start(statement.range[0]) == line_start
			) {
				const container = /** @type {import("../../private.js").AstNode & { body: import("../../private.js").AstNode[] } | undefined} */(/** @type {unknown} */(statement.parent))/**/
				if (!container || container.type == "Program") return ""
				let opener = container.range[0]
				/** @type {import("../../private.js").AstNode} */
				let owner = container
				if (container.type != "SwitchCase") {
					const body = container.body
					const previous = body[lower_bound(
						body,
						get_node_start,
						statement.range[0]
					) - 1]
					opener = /** @type {import("eslint").AST.Token} */(source_code.getFirstToken(
						/** @type {import("estree").Node} */(container)/**/,
						{
							filter: token => token.value == "{"
						}
					))/**/.range[0]
					if (previous && get_line_start(previous.range[1] - 1) > get_line_start(opener)) {
						return this.get_line_indent(
							previous,
							previous.range[0],
							indent
						)
					}
					if (container.type == "BlockStatement" && !statement_lists.has(container.parent.type)) owner = container.parent
				}
				const container_indent = this.get_line_indent(owner, owner.range[0], indent)
				return get_line_start(opener) == line_start
					? container_indent
					: container_indent + indent
			}
			let child = node
			for (let parent = node.parent; parent && !statement_lists.has(parent.type); parent = parent.parent) {
				if (
					parent.type == "ForStatement"
					&& child != parent.body
					&& get_line_start(child.range[0]) == line_start
					&& get_line_start(parent.range[0]) != line_start
				) {
					return this.get_line_indent(parent, parent.range[0], indent) + indent
				}
				if (
					(parent.type == "BinaryExpression" || parent.type == "LogicalExpression")
					&& child == parent.right
					&& parent.range[0] < line_start
				) {
					const operator = /** @type {string} */(parent.operator)/**/
					const operator_start = /** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(
						/** @type {import("estree").Node} */(parent.right)/**/,
						{
							filter: token => token.value == operator
						}
					))/**/.range[0]
					if (operator_start > line_start + line_indent.length && operator_start < node.range[0]) {
						return this.get_line_indent(parent, parent.range[0], indent)
					}
				}
				child = parent
			}
			for (let parent = node.parent; parent && !statement_lists.has(parent.type); parent = parent.parent) {
				if (parent.type == "VariableDeclaration") {
					const declaration_start = get_line_start(parent.range[0])
					const last = /** @type {import("../../private.js").AstNode | undefined} */(parent.declarations[parent.declarations.length - 1])/**/
					return declaration_start == line_start && !!last && get_line_start(last.range[0]) > declaration_start
						? line_indent + indent
						: line_indent
				}
			}
			return line_indent
		},
		get_line_start,
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {boolean}
		 */
		has_multiline_literal(start, end) {
			const range = multiline_literals[lower_bound(
				multiline_literals,
				get_range_end,
				start + 1
			)]
			return !!range && range[0] < end
		},
		is_space,
		/**
		 * @param {number} start
		 * @param {number} end
		 * @returns {string}
		 */
		render(start, end) {
			let position = start
			let result = ""
			for (let index = lower_bound(edits, get_edit_key, 1 - start) - 1; index >= 0; index--) {
				const edit = /** @type {{ end: number, start: number, text: string }} */(edits[index])/**/
				if (edit.end > end) break
				result += text.slice(position, edit.start) + edit.text
				position = edit.end
			}
			return result + text.slice(position, end)
		},
		/**
		 * @param {number} position
		 * @param {number} limit
		 * @returns {number}
		 */
		skip_left(position, limit) {
			while (position > limit) {
				if (is_space(text.charCodeAt(position - 1))) position--
				else {
					const comment = comment_by_end.get(position)
					if (!comment || comment.range[0] < limit) break
					position = comment.range[0]
				}
			}
			return position
		},
		/**
		 * @param {number} position
		 * @param {number} limit
		 * @returns {number}
		 */
		skip_right(position, limit) {
			while (position < limit) {
				if (is_space(text.charCodeAt(position))) position++
				else {
					const comment = comment_by_start.get(position)
					if (!comment || comment.range[1] > limit) break
					position = comment.range[1]
				}
			}
			return position
		},
		text,
		/**
		 * @param {string} value
		 * @returns {string}
		 */
		to_lf(value) {
			return value.replace(line_terminator_regex, "\n")
		}
	}
}
/**
 * @param {number} value
 * @returns {number}
 */
function identity(value) {
	return value
}
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_space(code) {
	return code == 32
		|| code >= 9 && code <= 13
		|| code > 127 && space_regex.test(String.fromCharCode(code))
}
/**
 * @template T
 * @param {T[]} array
 * @param {(item: T) => number} get
 * @param {number} value
 * @returns {number}
 */
function lower_bound(array, get, value) {
	let low = 0
	let high = array.length
	while (low < high) {
		const middle = (low + high) >> 1
		if (get(
			/** @type {T} */(array[middle])/**/
		) < value) low = middle + 1
		else high = middle
	}
	return low
}
export {
	create_source_text,
	is_space,
	lower_bound
}
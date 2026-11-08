import {
	get_indent_model,
	read_indent_options
} from "./indent_model.js"
import { get_rule_options } from "./rule_options.js"
const line_break_regex = /[\n\r\u2028\u2029]/
const line_terminator_regex = /\r\n|[\n\r\u2028\u2029]/g
const quote_regex = /^["']/
const space_regex = /\s/
/**
 * @param {import("eslint").SourceCode} source_code
 * @returns {{ comment_by_end: Map<number, import("../../private.js").Comment>; comment_by_start: Map<number, import("../../private.js").Comment>; count_comments(start: number, end: number): number; crosses_edit(position: number): boolean; edit(start: number, end: number, value: string): void; eol: string; get_indent(index: number): string; get_line_start: (index: number) => number; get_token_indent(position: number, indent: string): string; has_multiline_literal(start: number, end: number): boolean; is_space: (code: number) => boolean; render(start: number, end: number): string; skip_left(position: number, limit: number): number; skip_right(position: number, limit: number): number; text: string; to_lf(value: string): string; }}
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
	/** @type {number[]} */
	const line_starts = [ 0 ]
	for (const match of text.matchAll(line_terminator_regex)) {
		line_starts.push(match.index + match[0].length)
	}
	/** @type {[number, number][]} */
	const multiline_literals = []
	for (const token of source_code.ast.tokens) {
		/** @type {string} */
		const type = token.type
		if ((type == "String" || type == "Template" || type == "JSXText" && quote_regex.test(token.value)) && line_break_regex.test(token.value)) {
			multiline_literals.push(
				/** @type {[number, number]} */(token.range)/**/
			)
		}
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
			while (first > 0 && (/** @type {{ end: number }} */(edits[first - 1])/**/).end <= end) {
				first--
			}
			edits.splice(
				first,
				index - first,
				{ end, start, text: value }
			)
		},
		eol: text.match(line_terminator_regex)?.[0] ?? "\n",
		/**
		 * @param {number} index
		 * @returns {string}
		 */
		get_indent(index) {
			const line_start = get_line_start(index)
			let position = line_start
			while (position < index && (text[position] == " " || text[position] == "\t")) {
				position++
			}
			return text.slice(line_start, position)
		},
		get_line_start,
		/**
		 * @param {number} position
		 * @param {string} indent
		 * @returns {string}
		 */
		get_token_indent(position, indent) {
			const options = get_rule_options(source_code, "indent")
			if (options) {
				return get_indent_model(
					source_code,
					read_indent_options(options)
				).get_token_indent(position)
			}
			const model = get_indent_model(
				source_code,
				{
					...read_indent_options([]),
					unit: indent
				}
			)
			let line_start = get_line_start(position)
			for (;;) {
				const comment = comments[lower_bound(
					comments,
					get_range_start,
					line_start
				) - 1]
				const literal = multiline_literals[lower_bound(
					multiline_literals,
					get_range_end,
					line_start + 1
				)]
				const opener = comment && comment.range[1] > line_start
					? comment.range[0]
					: literal && literal[0] < line_start
						? literal[0]
						: -1
				if (opener < 0) {
					break
				}
				line_start = get_line_start(opener)
			}
			let line_first = line_start
			while (text[line_first] == " " || text[line_first] == "\t") {
				line_first++
			}
			const physical = text.slice(line_start, line_first)
			const line_indent = model.get_token_indent(line_start)
			const token_indent = model.get_token_indent(position)
			if (token_indent.startsWith(line_indent)) {
				return physical + token_indent.slice(line_indent.length)
			}
			const excess = line_indent.length - token_indent.length
			return line_indent.startsWith(token_indent) && physical.length >= excess
				? physical.slice(0, physical.length - excess)
				: physical
		},
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
				if (edit.end > end) {
					break
				}
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
				if (is_space(text.charCodeAt(position - 1))) {
					position--
				} else {
					const comment = comment_by_end.get(position)
					if (!comment || comment.range[0] < limit) {
						break
					}
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
				if (is_space(text.charCodeAt(position))) {
					position++
				} else {
					const comment = comment_by_start.get(position)
					if (!comment || comment.range[1] > limit) {
						break
					}
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
		) < value) {
			low = middle + 1
		} else {
			high = middle
		}
	}
	return low
}
export {
	create_source_text,
	is_space,
	lower_bound
}
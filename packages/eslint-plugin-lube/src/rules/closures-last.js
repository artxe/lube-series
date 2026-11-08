import { compare } from "../utils/order_compare.js"
import { get_rule_options } from "../utils/rule_options.js"
import { create_source_text } from "../utils/source_text.js"
const function_owners = new Set(
	[
		"ArrowFunctionExpression",
		"FunctionDeclaration",
		"FunctionExpression"
	]
)
const ends_statement_regex = /(?:Block|Body|Clause|Declaration|Statement)$/
const hazard_regex = /^[-+/<[(`]/
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		const source = create_source_text(source_code)
		const text = source.text
		const eol = source.eol
		/** @type {import("../../private.js").AstNode[]} */
		const bodies = []
		return {
			BlockStatement(node) {
				if (function_owners.has(node.parent.type)) {
					bodies.push(
						/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(node))/**/
					)
				}
			},
			"Program:exit": () => {
				for (let i = bodies.length - 1; i >= 0; i--) {
					verify(
						/** @type {import("../../private.js").AstNode} */(bodies[i])/**/
					)
				}
			}
		}
		/**
		 * @param {{ last: import("eslint").AST.Token, node: import("../../private.js").AstNode }} statement
		 * @returns {boolean}
		 */
		function continues(statement) {
			const last = statement.last
			if (last.value != "}") {
				return last.value != ";"
			}
			let node = /** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(source_code.getNodeByRangeIndex(last.range[0])))/**/
			while (node != statement.node) {
				if (!ends_statement_regex.test(node.type)) {
					return true
				}
				node = node.parent
			}
			return false
		}
		/**
		 * @param {number} position
		 * @returns {import("../../private.js").Comment | undefined}
		 */
		function find_comment(position) {
			let start = position
			while (text[start] == " " || text[start] == "\t") {
				start++
			}
			return source.comment_by_start.get(start)
		}
		/**
		 * @param {number} statement_end
		 * @returns {number}
		 */
		function get_end(statement_end) {
			let end = statement_end
			let comment = find_comment(end)
			while (comment) {
				end = comment.range[1]
				comment = comment.type == "Line" ? undefined : find_comment(end)
			}
			return end
		}
		/**
		 * @param {import("../../private.js").AstNode} statement
		 * @returns {import("../../private.js").AstNode | undefined}
		 */
		function get_id(statement) {
			return /** @type {{ id?: import("../../private.js").AstNode | null }} */(/** @type {unknown} */(statement))/**/.id ?? undefined
		}
		/**
		 * @param {number} position
		 * @param {number} previous_end
		 * @returns {number}
		 */
		function get_start(position, previous_end) {
			const comments = /** @type {import("../../private.js").Comment[]} */(source_code.getCommentsBefore(
				/** @type {import("eslint").AST.Token} */(source_code.getTokenByRangeStart(position))/**/
			))/**/
			const comment = comments.find(
				item => item.range[0] >= previous_end && starts_line(item.range[0])
			)
			return comment ? comment.range[0] : position
		}
		/**
		 * @param {import("../../private.js").AstNode} statement
		 * @returns {boolean}
		 */
		function is_function(statement) {
			/** @type {string} */
			const type = statement.type
			return type == "FunctionDeclaration" || type == "TSDeclareFunction"
		}
		/**
		 * @param {{ end: number, insert: number, skip: number, start: number }} chunk
		 * @returns {string}
		 */
		function render_chunk(chunk) {
			if (chunk.insert >= 0) {
				return `${source.render(chunk.start, chunk.insert)};${source.render(chunk.insert, chunk.end)}`
			}
			if (chunk.skip < 0) {
				return source.render(chunk.start, chunk.end)
			}
			let resume = chunk.skip + 1
			while (text[resume] == " " || text[resume] == "\t") {
				resume++
			}
			return source.render(chunk.start, chunk.skip) + source.render(resume, chunk.end)
		}
		/**
		 * @param {number} semicolon
		 * @param {import("../../private.js").AstNode} next
		 * @returns {boolean}
		 */
		function starts_guard(semicolon, next) {
			return starts_line(semicolon) && source.get_line_start(semicolon) == source.get_line_start(next.range[0])
		}
		/**
		 * @param {number} index
		 * @returns {boolean}
		 */
		function starts_line(index) {
			return source.get_indent(index).length == index - source.get_line_start(index)
		}
		/**
		 * @param {import("../../private.js").AstNode} body
		 * @returns {void}
		 */
		function verify(body) {
			const nodes = /** @type {import("../../private.js").AstNode[]} */(/** @type {unknown} */(
				/** @type {import("estree").BlockStatement} */(/** @type {unknown} */(body))/**/.body
			))/**/
			/** @type {{ end: number, guard: number, last: import("eslint").AST.Token, node: import("../../private.js").AstNode }[]} */
			const statements = []
			let guard = -1
			/** @type {Set<number>} */
			const owned = new Set()
			for (const [ index, node ] of nodes.entries()) {
				const next = nodes[index + 1]
				const guards_next = !!next && /** @type {string} */(next.type)/**/ != "EmptyStatement"
				/** @type {string} */
				const type = node.type
				if (type == "EmptyStatement" && guards_next && starts_guard(
					node.range[0],
					/** @type {import("../../private.js").AstNode} */(next)/**/
				)) {
					guard = node.range[0]
					continue
				}
				let last = /** @type {import("eslint").AST.Token} */(source_code.getLastToken(
					/** @type {import("estree").Node} */(node)/**/
				))/**/
				let end = node.range[1]
				let next_guard = -1
				if (last.value == ";" && !is_function(node) && guards_next && starts_guard(
					last.range[0],
					/** @type {import("../../private.js").AstNode} */(next)/**/
				)) {
					const before = source_code.getTokenBefore(last)
					if (before) {
						next_guard = last.range[0]
						owned.add(next_guard)
						end = before.range[1]
						last = before
					}
				}
				statements.push({ end, guard, last, node })
				guard = next_guard
			}
			let last = -1
			for (const [ index, statement ] of statements.entries()) {
				if (!is_function(statement.node)) {
					last = index
				}
			}
			const first = statements.findIndex(
				(statement, index) => index < last && is_function(statement.node)
			)
			if (first < 0) {
				return
			}
			let fixable = true
			let previous_end = first
				? /** @type {{ end: number }} */(statements[first - 1])/**/.end
				: body.range[0] + 1
			let previous = statements[first - 1]
			/** @type {{ end: number, gap: string, insert: number, is_function: boolean, name: string, skip: number, start: number }[]} */
			const chunks = []
			for (const statement of statements.slice(first)) {
				const node = statement.node
				const guarded = statement.guard >= 0
				const code_start = get_start(
					guarded ? statement.guard : node.range[0],
					previous_end
				)
				const start = source.get_line_start(code_start)
				const end = get_end(statement.end)
				const after = /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(statement.last))/**/
				const token = source_code.getFirstToken(
					/** @type {import("estree").Node} */(node)/**/
				)
				if (
					!starts_line(code_start)
						|| source_code.getLocFromIndex(end).line >= after.loc.start.line
				) {
					fixable = false
				}
				let insert = -1
				if (!is_function(node)) {
					if (!guarded && !!token && hazard_regex.test(token.value) && !!previous && continues(previous)) {
						insert = token.range[0]
					}
					previous = statement
				}
				chunks.push(
					{
						end,
						gap: chunks.length ? text.slice(previous_end, start) : eol,
						insert,
						is_function: is_function(node),
						name: /** @type {import("estree").Identifier | undefined} */(get_id(node))/**/?.name ?? "",
						skip: guarded && is_function(node) && owned.has(statement.guard)
							? statement.guard
							: -1,
						start
					}
				)
				previous_end = end
			}
			const region_start = /** @type {{ start: number }} */(chunks[0])/**/.start
			const region_end = /** @type {{ end: number }} */(chunks[chunks.length - 1])/**/.end
			const function_chunks = chunks.filter(chunk => chunk.is_function)
			const ascii_options = get_rule_options(source_code, "ascii-order")
			if (ascii_options && (ascii_options[0]?.checkDeclarations ?? true)) {
				/** @type {{ chunks: typeof chunks, name: string }[]} */
				const groups = []
				for (const chunk of function_chunks) {
					const group = groups[groups.length - 1]
					if (group && group.name == chunk.name) {
						group.chunks.push(chunk)
					} else {
						groups.push(
							{
								chunks: [ chunk ],
								name: chunk.name
							}
						)
					}
				}
				groups.sort(compare)
				function_chunks.length = 0
				for (const group of groups) {
					function_chunks.push(...group.chunks)
				}
			}
			const ordered = [
				...chunks.filter(chunk => !chunk.is_function),
				...function_chunks
			]
			let rendered = ""
			for (const [ index, chunk ] of ordered.entries()) {
				rendered += (index ? chunk.gap : "") + render_chunk(chunk)
			}
			if (fixable) {
				source.edit(region_start, region_end, rendered)
			}
			for (const [ index, { node } ] of statements.entries()) {
				const id = get_id(node)
				if (index >= last || !is_function(node) || !id) {
					continue
				}
				context.report(
					{
						data: {
							name: /** @type {import("estree").Identifier} */(/** @type {unknown} */(id))/**/.name
						},
						fix: fixable
							? fixer => fixer.replaceTextRange(
								[ region_start, region_end ],
								rendered
							)
							: null,
						loc: {
							end: source_code.getLocFromIndex(id.range[1]),
							start: source_code.getLocFromIndex(id.range[0])
						},
						messageId: "last"
					}
				)
			}
		}
	},
	meta: {
		docs: {
			description: "Enforces function declarations inside a function body below its other statements, since they are hoisted.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/closures-last.md"
		},
		fixable: "code",
		messages: {
			last: "Move the closure `{{name}}` below the last statement of its function, since it is hoisted"
		},
		schema: [],
		type: "suggestion"
	}
}
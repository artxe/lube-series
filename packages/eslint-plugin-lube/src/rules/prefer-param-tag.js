const blank_regex = /^\s*\*?\s*$/
const directive_regex = /^\s*(?:eslint-disable-next-line\b|@ts-(?:expect-error|ignore)\b)/
const line_break_regex = /\s*(?:\r\n|[\n\r\p{Zl}\p{Zp}])\s*/gu
const line_terminator_regex = /\r\n|[\n\r\p{Zl}\p{Zp}]/u
const param_tag_regex = /^\s*\*\s*@param\b/
const space_regex = /^\s*$/
const tag_after_param_regex = /^\s*\*\s*@(?:deprecated|example|returns?|see|throws|yields?)\b/
const tag_regex = /^\s*\*\s*@/
const type_regex = /^\*\s*@type\s*(\{[^]*\})\s*$/
const white_space_regex = /\s/
/**
 * @param {string} text
 * @returns {string}
 */
function escape_regex(text) {
	return text.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")
}
/**
 * @param {import("estree").Comment} comment
 * @param {string} indent
 * @param {string} eol
 * @param {string[]} tags
 * @returns {string}
 */
function jsdoc_with(comment, indent, eol, tags) {
	let rows = `/*${comment.value}*/`.split(line_terminator_regex)
	/**
	 * @param {number} index
	 * @returns {string}
	 */
	function row_at(index) {
		return /** @type {string} */(rows[index])/**/
	}
	if (rows.length < 2 || !/^\/\*\*\s*$/.test(row_at(0)) || !/^\s*\*\/$/.test(row_at(rows.length - 1))) {
		const body = comment.value.slice(1).split(line_terminator_regex)
			.map(
				row => row.replace(/^\s*\*?\s?/, "").trimEnd()
			)
		while (body[0] === "") {
			body.shift()
		}
		while (body.at(-1) === "") {
			body.pop()
		}
		rows = [
			"/**",
			...body.map(
				row => `${indent} * ${row}`.trimEnd()
			),
			`${indent} */`
		]
	}
	const rows_end = rows.length - 1
	let at = rows_end
	let after_param = false
	for (let i = 1; i < rows_end; i++) {
		if (param_tag_regex.test(row_at(i))) {
			after_param = true
			at = i + 1
			while (at < rows_end && !tag_regex.test(row_at(at)) && !blank_regex.test(row_at(at))) {
				at++
			}
		}
	}
	if (!after_param) {
		const tag_at = rows.findIndex(
			row => tag_after_param_regex.test(row)
		)
		if (tag_at >= 0) {
			at = tag_at
		}
	}
	const added = tags.map(tag => `${indent} * ${tag}`)
	if (at == rows_end && at > 1 && !tag_regex.test(row_at(at - 1)) && !blank_regex.test(row_at(at - 1))) {
		added.unshift(`${indent} *`)
	}
	rows.splice(at, 0, ...added)
	return rows.join(eol)
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		const text = source_code.text
		/**
		 * @param {import("estree").Comment} comment
		 * @returns {import("eslint").AST.Range}
		 */
		function comment_range(comment) {
			return /** @type {import("eslint").AST.Range} */(comment.range)/**/
		}
		/**
		 * @param {number} position
		 * @returns {number}
		 */
		function line_start_of(position) {
			let start = position
			while (start > 0 && !line_terminator_regex.test(text.charAt(start - 1))) {
				start--
			}
			return start
		}
		/**
		 * @param {import("estree").Comment} comment
		 * @returns {boolean}
		 */
		function starts_line(comment) {
			const start = comment_range(comment)[0]
			return space_regex.test(
				text.slice(line_start_of(start), start)
			)
		}
		return {
			FunctionDeclaration(node) {
				/** @type {{ comment: import("estree").Comment, name: string, type: string }[]} */
				const named = []
				const data = {
					name: node.id?.name ?? "default"
				}
				for (const param of node.params) {
					const comment = source_code.getCommentsBefore(param).findLast(
						item => item.type == "Block" && type_regex.test(item.value)
					)
					if (!comment) {
						continue
					}
					const target = param.type == "AssignmentPattern" ? param.left : param
					if (target.type == "Identifier") {
						named.push(
							{
								comment,
								name: target.name,
								type: /** @type {string} */(/** @type {RegExpExecArray} */(type_regex.exec(comment.value))/**/[1])/**/.replace(line_break_regex, " ")
							}
						)
					} else {
						context.report(
							{
								data,
								loc: /** @type {import("estree").SourceLocation} */(comment.loc)/**/,
								messageId: "name"
							}
						)
					}
				}
				const first = named[0]
				if (!first) {
					return
				}
				const loc = /** @type {import("estree").SourceLocation} */(first.comment.loc)/**/
				const statement = node.parent.type == "ExportNamedDeclaration" || node.parent.type == "ExportDefaultDeclaration"
					? node.parent
					: node
				const leading = source_code.getCommentsBefore(statement)
				let start = /** @type {import("eslint").AST.Range} */(statement.range)/**/[0]
				let last = leading.length - 1
				while (last >= 0) {
					const item = /** @type {import("estree").Comment} */(leading[last])/**/
					if (!starts_line(item) || !directive_regex.test(item.value)) {
						break
					}
					start = comment_range(item)[0]
					last--
				}
				const candidate = leading[last]
				const jsdoc = candidate?.type == "Block" && candidate.value.startsWith("*")
					? candidate
					: undefined
				const anchor = jsdoc ? comment_range(jsdoc)[0] : start
				const indent = text.slice(line_start_of(anchor), anchor)
				if (!space_regex.test(indent)) {
					context.report(
						{ data, loc, messageId: "hand" }
					)
					return
				}
				const eol = text.match(line_terminator_regex)?.[0] ?? "\n"
				const tags = named.filter(
					item => !jsdoc || !new RegExp(
						`@param\\s+(?:\\{[^]*?\\}\\s+)?\\[?${escape_regex(item.name)}(?![\\w$])`
					).test(jsdoc.value)
				).map(
					item => `@param ${item.type} ${item.name}`
				)
				context.report(
					{
						data,
						fix(fixer) {
							const fixes = named.map(
								({ comment }) => {
									const [ begin, close ] = comment_range(comment)
									let end = close
									while (white_space_regex.test(text.charAt(end))) {
										end++
									}
									return fixer.removeRange([ begin, end ])
								}
							)
							if (jsdoc) {
								fixes.push(
									fixer.replaceTextRange(
										comment_range(jsdoc),
										jsdoc_with(jsdoc, indent, eol, tags)
									)
								)
							} else {
								fixes.push(
									fixer.insertTextBeforeRange(
										[ start, start ],
										`/**${eol}${tags.map(tag => `${indent} * ${tag}${eol}`).join("")}${indent} */${eol}${indent}`
									)
								)
							}
							return fixes
						},
						loc,
						messageId: "tag"
					}
				)
			}
		}
	},
	meta: {
		docs: {
			description: "Enforces JSDoc `@param` tags on a function declaration instead of inline `/** @type {T} */` comments inside its parameter list.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/prefer-param-tag.md"
		},
		fixable: "code",
		messages: {
			hand: "Type the parameters of `{{name}}` with `@param` tags on the declaration instead of inline comments; it is not fixed automatically because the declaration or its JSDoc comment does not start its line, so write the tags by hand",
			name: "Type this parameter of `{{name}}` with a `@param` tag on the declaration instead of an inline comment; it is not fixed automatically because the parameter has no simple name to write in the tag, so document it by hand",
			tag: "Type the parameters of `{{name}}` with `@param` tags on the declaration instead of inline `@type` comments"
		},
		schema: [],
		type: "suggestion"
	}
}
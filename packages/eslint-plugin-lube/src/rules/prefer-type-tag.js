const const_regex = /@type\s*\{\s*const\s*\}/
const directive_regex = /^\s*(?:eslint-disable-next-line\b|@ts-(?:expect-error|ignore)\b)/
const line_terminator_regex = /\r\n|[\n\r\p{Zl}\p{Zp}]/u
const space_regex = /^\s*$/
const statement_lists = new Set(
	[
		"BlockStatement",
		"Program",
		"StaticBlock",
		"SwitchCase",
		"TSModuleBlock"
	]
)
const type_regex = /^\*[^]*@type\s*\{[^]*\}/
const typescript_file_regex = /\.[cm]?tsx?$/
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").TypeServices | undefined} */
		const services = context.sourceCode.parserServices
		const program = services?.program
		if (!services || !program || typescript_file_regex.test(context.filename)) {
			return {}
		}
		const checker = program.getTypeChecker()
		const source_code = context.sourceCode
		const text = source_code.text
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
			const start = /** @type {import("eslint").AST.Range} */(comment.range)/**/[0]
			return space_regex.test(
				text.slice(line_start_of(start), start)
			)
		}
		return {
			VariableDeclaration(node) {
				const [ declarator, other ] = node.declarations
				const value = declarator?.init
				const statement = node.parent.type == "ExportNamedDeclaration" ? node.parent : node
				if (!declarator || !value || other || !statement_lists.has(statement.parent.type)) {
					return
				}
				const open = source_code.getTokenBefore(value)
				const close = source_code.getTokenAfter(value)
				const assign = open && source_code.getTokenBefore(open)
				if (open?.value != "(" || close?.value != ")" || assign?.value != "=") {
					return
				}
				const comment = source_code.getCommentsBefore(open).at(-1)
				const comment_range = comment?.range
				if (
					!comment
					|| !comment_range
					|| comment.type != "Block"
					|| !type_regex.test(comment.value)
					|| const_regex.test(comment.value)
					|| !space_regex.test(
						text.slice(comment_range[1], open.range[0])
					)
				) {
					return
				}
				const declaration = services.esTreeNodeToTSNodeMap.get(declarator)
				const cast = /** @type {import("typescript").ParenthesizedExpression | undefined} */(declaration?.initializer)/**/
				if (!cast?.expression) {
					return
				}
				const leading = source_code.getCommentsBefore(statement)
				const jsdoc = leading.filter(
					item => item.type == "Block" && item.value.startsWith("*")
				)
				if (jsdoc.some(
					item => type_regex.test(item.value)
				)) {
					return
				}
				const type = checker.getTypeAtLocation(cast)
				const value_type = checker.getTypeAtLocation(cast.expression)
				if (
					!checker.isTypeAssignableTo(value_type, type)
					|| type.isUnion() && !checker.isTypeAssignableTo(type, value_type)
				) {
					return
				}
				const tag = text.slice(
					comment_range[0],
					comment_range[1]
				)
				let start = /** @type {import("eslint").AST.Range} */(statement.range)/**/[0]
				for (let i = leading.length - 1; i >= 0; i--) {
					const item = /** @type {import("estree").Comment} */(leading[i])/**/
					if (!starts_line(item) || !directive_regex.test(item.value)) {
						break
					}
					start = /** @type {import("eslint").AST.Range} */(item.range)/**/[0]
				}
				const end = text.startsWith("/**/", close.range[1]) ? close.range[1] + 4 : close.range[1]
				const data = {
					tag,
					value: checker.typeToString(value_type)
				}
				const loc = {
					end: source_code.getLocFromIndex(end),
					start: source_code.getLocFromIndex(comment_range[0])
				}
				if (jsdoc.length) {
					context.report(
						{ data, loc, messageId: "merge" }
					)
					return
				}
				const indent = text.slice(line_start_of(start), start)
				const eol = text.match(line_terminator_regex)?.[0] ?? "\n"
				const inner = text.slice(open.range[1], close.range[0])
				context.report(
					{
						data,
						fix(fixer) {
							return [
								fixer.insertTextBeforeRange(
									[ start, start ],
									space_regex.test(indent) ? tag + eol + indent : tag + " "
								),
								fixer.replaceTextRange(
									[ comment_range[0], end ],
									value.type == "SequenceExpression" ? `(${inner})` : inner
								)
							]
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
			description: "Enforces a JSDoc type tag on a declaration instead of a type cast of its value, wherever the value is assignable to the type.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/prefer-type-tag.md"
		},
		fixable: "code",
		messages: {
			merge: "Type the declaration with `{{tag}}` instead of casting its value, since its type `{{value}}` is assignable to it; it is not fixed automatically because the declaration already has a JSDoc comment, so add the type to it by hand",
			tag: "Write `{{tag}}` in front of the declaration instead of casting its value, since its type `{{value}}` is assignable to it"
		},
		schema: [],
		type: "suggestion"
	}
}
import { tag_starts } from "../utils/jsdoc_tags.js"
const directive_regex = /^\s*(?:eslint-disable-next-line\b|@ts-(?:expect-error|ignore)\b)/
const line_terminator_regex = /\r\n|[\n\r\p{Zl}\p{Zp}]/u
const returns_regex = /(?:^|[\s*])@returns?\b/
const space_regex = /^\s*$/
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		const text = source_code.text
		/** @type {{ value: boolean }[]} */
		const frames = []
		return {
			":function"() {
				frames.push({ value: false })
			},
			":function:exit"(
				/** @type {import("eslint").Rule.Node & import("estree").Function} */ node
			) {
				const frame = /** @type {{ value: boolean }} */(frames.pop())/**/
				const held = held_by(node)
				if (!held || !node.body) {
					return
				}
				const { statement } = held
				const leading = source_code.getCommentsBefore(statement)
				const jsdoc = leading.findLast(
					item => item.type == "Block" && item.value.startsWith("*")
				)
				if (jsdoc && returns_regex.test(jsdoc.value)) {
					return
				}
				const name = held.name
				const value = frame.value || node.type == "ArrowFunctionExpression" && node.body.type != "BlockStatement"
				const fixable = !value && !node.generator
				const type = node.async ? "Promise<void>" : "void"
				const data = { name, type }
				const loc = /** @type {import("estree").SourceLocation} */(node.loc)/**/
				if (!fixable) {
					context.report(
						{ data, loc, messageId: "missing" }
					)
					return
				}
				const tag = `@returns {${type}}`
				const eol = text.match(line_terminator_regex)?.[0] ?? "\n"
				if (jsdoc) {
					const range = /** @type {import("eslint").AST.Range} */(jsdoc.range)/**/
					const indent = indent_of(range[0])
					if (indent === undefined) {
						context.report(
							{ data, loc, messageId: "missing" }
						)
						return
					}
					const raw = jsdoc.value.slice(1)
					let replacement = ""
					if (line_terminator_regex.test(raw)) {
						const rows = `/*${jsdoc.value}*/`.split(line_terminator_regex)
						const last = /** @type {string} */(rows.at(-1))/**/
						if (!/^\s*\*\/$/.test(last)) {
							context.report(
								{ data, loc, messageId: "missing" }
							)
							return
						}
						rows.splice(
							rows.length - 1,
							0,
							`${indent} * ${tag}`
						)
						replacement = rows.join(eol)
					} else {
						const body = raw.trim()
						const starts = tag_starts(body)
						const description = body.slice(0, starts[0] ?? body.length).trim()
						const rows = [
							...description ? [ description, "" ] : [],
							...starts.map(
								(start, i) => body.slice(start, starts[i + 1]).trim()
							),
							tag
						]
						replacement = `/**${eol}${rows.map(row => `${indent} * ${row}`.trimEnd() + eol).join("")}${indent} */`
					}
					context.report(
						{
							data,
							fix: fixer => fixer.replaceTextRange(range, replacement),
							loc,
							messageId: "missing"
						}
					)
					return
				}
				let start = /** @type {import("eslint").AST.Range} */(statement.range)/**/[0]
				for (let i = leading.length - 1; i >= 0; i--) {
					const item = /** @type {import("estree").Comment} */(leading[i])/**/
					const item_start = /** @type {import("eslint").AST.Range} */(item.range)/**/[0]
					if (indent_of(item_start) === undefined || !directive_regex.test(item.value)) {
						break
					}
					start = item_start
				}
				const indent = indent_of(start)
				if (indent === undefined) {
					context.report(
						{ data, loc, messageId: "missing" }
					)
					return
				}
				context.report(
					{
						data,
						fix: fixer => fixer.insertTextBeforeRange(
							[ start, start ],
							`/** ${tag} */${eol}${indent}`
						),
						loc,
						messageId: "missing"
					}
				)
			},
			ReturnStatement(node) {
				const frame = frames.at(-1)
				if (frame && node.argument) {
					frame.value = true
				}
			}
		}
		/**
		 * @param {import("eslint").Rule.Node & import("estree").Function} node
		 * @returns {{ name: string, statement: import("eslint").Rule.Node } | undefined}
		 */
		function held_by(node) {
			/** @type {import("eslint").Rule.Node | null} */
			let holder = null
			let name = "function"
			if (node.type == "FunctionDeclaration") {
				holder = node
				name = node.id?.name ?? "default"
			} else {
				const declarator = node.parent
				const declaration = declarator?.parent
				if (
					declarator?.type == "VariableDeclarator"
						&& declarator.init == node
						&& declaration?.type == "VariableDeclaration"
						&& declaration.kind == "const"
				) {
					holder = declaration
					name = declarator.id.type == "Identifier" ? declarator.id.name : name
				}
			}
			if (!holder) {
				return undefined
			}
			const parent = holder.parent
			const statement = parent?.type == "ExportNamedDeclaration" || parent?.type == "ExportDefaultDeclaration"
				? parent
				: holder
			return { name, statement }
		}
		/**
		 * @param {number} position
		 * @returns {string | undefined}
		 */
		function indent_of(position) {
			let start = position
			while (start > 0 && !line_terminator_regex.test(text.charAt(start - 1))) {
				start--
			}
			const indent = text.slice(start, position)
			return space_regex.test(indent) ? indent : undefined
		}
	},
	meta: {
		docs: {
			description: "Requires a `@returns` tag on every function declaration and every function held by a `const`.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/require-returns.md"
		},
		fixable: "code",
		messages: {
			missing: "`{{name}}` has no `@returns` tag; write `@returns {T}` in its JSDoc (`{{type}}` when it returns no value, which is fixed automatically)"
		},
		schema: [],
		type: "suggestion"
	}
}
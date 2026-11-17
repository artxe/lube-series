/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function split_statements(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			/** @type {{ max?: number } | undefined} */
			const options = context.options[0]
			const max = options?.max ?? 1
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor & { node?: import("../../private.js").AstNode }} */ descriptor
							) => {
								const node = descriptor.node
								const parent = /** @type {{ body?: unknown, consequent?: unknown } | null | undefined} */(node?.parent)/**/
								const list = Array.isArray(parent?.body) ? parent.body : parent?.consequent
								if (!node || !descriptor.fix || !Array.isArray(list)) {
									context.report(descriptor)
									return
								}
								/** @type {import("../../private.js").AstNode[]} */
								const statements = list
								const indent = /^\s*/u.exec(
									/** @type {string} */(source_code.lines[/** @type {import("eslint").AST.SourceLocation} */(node.loc)/**/.start.line - 1])/**/
								)?.[0]
								/** @type {[number, number][]} */
								const gaps = []
								let previous = node
								const start = statements.indexOf(node)
								for (let index = start; index < statements.length; index++) {
									const statement = /** @type {import("../../private.js").AstNode} */(statements[index])/**/
									const token = /** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(
										/** @type {import("estree").Node} */(statement)/**/
									))/**/
									if (statement != node) {
										const last = /** @type {import("eslint").AST.Token} */(source_code.getLastToken(
											/** @type {import("estree").Node} */(previous)/**/,
											{
												filter: item => item.type != "Punctuator" || item.value != ";"
											}
										))/**/
										if (
											/** @type {import("eslint").AST.SourceLocation} */(statement.loc)/**/.start.line != last.loc.end.line
												|| token.type != "Punctuator"
												|| token.value != ";" && token.value != "}"
										) {
											break
										}
									}
									if ((index - start) % max == 0) {
										const after = /** @type {import("eslint").AST.Token} */(source_code.getTokenAfter(token, { includeComments: true }))/**/
										gaps.push(
											[ token.range[1], after.range[0] ]
										)
									}
									previous = statement
								}
								for (const gap of gaps) {
									context.report(
										{
											...descriptor,
											fix: fixer => fixer.replaceTextRange(gap, "\n" + indent)
										}
									)
								}
							}
						}
					}
				)
			)
		}
	}
}
export { split_statements }
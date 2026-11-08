/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function split_declarations(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			const text = source_code.text
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor & { node?: import("../../private.js").AstNode }} */ descriptor
							) => {
								const node = descriptor.node
								const before = node && source_code.getTokenBefore(
									/** @type {import("estree").Node} */(node)/**/,
									{ includeComments: true }
								)
								const semicolon = before?.type == "Punctuator" && before.value == ";" ? before : null
								const previous = semicolon
									? /** @type {import("../../private.js").AstNode | null} */(/** @type {unknown} */(source_code.getNodeByRangeIndex(semicolon.range[0])))/**/
									: null
								const first = previous && source_code.getFirstToken(
									/** @type {import("estree").Node} */(previous)/**/
								)
								const indent = first && text.slice(
									first.range[0] - first.loc.start.column,
									first.range[0]
								)
								if (
									!node
										|| !semicolon
										|| !previous
										|| indent == null
										|| indent.trim()
										|| node.type != "VariableDeclaration"
										|| previous.type != "VariableDeclaration"
										|| previous.parent != node.parent
										|| previous.range[1] != semicolon.range[1]
								) {
									context.report(descriptor)
									return
								}
								/** @type {[number, number][]} */
								const gaps = [
									[
										semicolon.range[1],
										node.range[0]
									]
								]
								const siblings = /** @type {{ body?: unknown, consequent?: unknown }} */(node.parent)/**/
								const statements = /** @type {import("../../private.js").AstNode[]} */(Array.isArray(siblings.body) ? siblings.body : siblings.consequent)/**/
								for (let index = statements.indexOf(node) + 1; index < statements.length; index++) {
									const current = /** @type {import("../../private.js").AstNode} */(statements[index - 1])/**/
									const next = /** @type {import("../../private.js").AstNode} */(statements[index])/**/
									if (
										next.type != "VariableDeclaration"
											|| text[current.range[1] - 1] != ";"
											|| !/^[ \t]*$/.test(
												text.slice(current.range[1], next.range[0])
											)
									) {
										break
									}
									gaps.push(
										[ current.range[1], next.range[0] ]
									)
								}
								context.report(
									{
										...descriptor,
										fix(fixer) {
											return gaps.map(
												gap => fixer.replaceTextRange(gap, "\n" + indent)
											)
										}
									}
								)
							}
						}
					}
				)
			)
		},
		meta: {
			...rule.meta,
			fixable: "whitespace"
		}
	}
}
export { split_declarations }
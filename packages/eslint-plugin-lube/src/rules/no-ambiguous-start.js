/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		return {
			ExpressionStatement(node) {
				const token = source_code.getFirstToken(node)
				if (!token || !source_code.getTokenBefore(node, { includeComments: false })) {
					return
				}
				const kind = token.type == "Template"
					? "a template literal"
					: token.type == "Punctuator" && token.value == "("
						? "`(`"
						: token.type == "Punctuator" && token.value == "["
							? "`[`"
							: undefined
				if (kind) {
					context.report(
						{
							data: { kind },
							loc: token.loc,
							messageId: "start"
						}
					)
				}
			}
		}
	},
	meta: {
		docs: {
			description: "Disallows a statement that starts with `(`, `[`, a template literal or a leading type cast, which a line without a semicolon would join to the line above.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/no-ambiguous-start.md"
		},
		messages: {
			start: "A statement starting with {{kind}} joins the line above when it has no semicolon; assign the value to a variable first"
		},
		schema: [],
		type: "problem"
	}
}
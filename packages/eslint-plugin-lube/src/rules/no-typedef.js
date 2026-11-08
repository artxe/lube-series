const tag_regex = /(?:^|[\s*])@(typedef|callback)\b/g
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		return {
			Program() {
				for (const comment of source_code.getAllComments()) {
					if (comment.type != "Block" || !comment.value.startsWith("*")) {
						continue
					}
					const range = /** @type {import("eslint").AST.Range} */(comment.range)/**/
					for (const match of comment.value.matchAll(tag_regex)) {
						const at = range[0] + 2 + match.index + match[0].indexOf("@")
						context.report(
							{
								data: { tag: `@${match[1]}` },
								loc: {
									end: source_code.getLocFromIndex(
										at + 1 + String(match[1]).length
									),
									start: source_code.getLocFromIndex(at)
								},
								messageId: "typedef"
							}
						)
					}
				}
			}
		}
	},
	meta: {
		docs: {
			description: "Disallows the JSDoc tags `@typedef` and `@callback`.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/no-typedef.md"
		},
		messages: {
			typedef: "`{{tag}}` is not allowed; declare the type in a `.d.ts` file instead"
		},
		schema: [],
		type: "suggestion"
	}
}
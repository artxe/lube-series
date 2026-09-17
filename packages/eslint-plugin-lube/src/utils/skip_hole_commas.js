/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function skip_hole_commas(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor & { node?: import("eslint").AST.Token }} */ descriptor
							) => {
								const token = descriptor.node
								if (token?.type == "Punctuator" && token.value == ",") {
									const before = source_code.getTokenBefore(token)
									if (before?.value == "," && before.loc.end.line < token.loc.start.line) return
								}
								context.report(descriptor)
							}
						}
					}
				)
			)
		}
	}
}
export { skip_hole_commas }
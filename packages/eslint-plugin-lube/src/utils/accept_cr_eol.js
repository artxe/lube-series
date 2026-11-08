const trailing_regex = /(?:\r\n|\r|\n)+$/
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function accept_cr_eol(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			const text = source_code.text
			if (!text.endsWith("\r")) {
				return rule.create(context)
			}
			if (context.options[0] == "never") {
				context.report(
					{
						fix: fixer => fixer.removeRange(
							[
								text.search(trailing_regex),
								text.length
							]
						),
						loc: {
							end: source_code.getLocFromIndex(text.length),
							start: source_code.getLocFromIndex(text.length - 1)
						},
						messageId: "unexpected"
					}
				)
			}
			return {}
		}
	}
}
export { accept_cr_eol }
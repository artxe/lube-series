import { create_source_text } from "./source_text.js"
const lf_regex = /(?<!\r)\n/g
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function keep_line_breaks(rule) {
	return {
		...rule,
		create(context) {
			const eol = create_source_text(context.sourceCode).eol
			if (eol == "\n") return rule.create(context)
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor} */ descriptor
							) => {
								const fix = descriptor.fix
								context.report(
									fix
										? {
											...descriptor,
											fix(fixer) {
												const result = fix(fixer)
												return result == null
													? result
													: "range" in result
														? to_eol(result, eol)
														: [ ...result ].map(item => to_eol(item, eol))
											}
										}
										: descriptor
								)
							}
						}
					}
				)
			)
		}
	}
}
/**
 * @param {import("eslint").Rule.Fix} fix
 * @param {string} eol
 * @returns {import("eslint").Rule.Fix}
 */
function to_eol(fix, eol) {
	return {
		range: fix.range,
		text: fix.text.replace(lf_regex, eol)
	}
}
export { keep_line_breaks }
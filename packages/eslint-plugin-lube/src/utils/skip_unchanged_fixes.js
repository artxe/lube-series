import { get_fixes } from "./fix_recorder.js"
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function skip_unchanged_fixes(rule) {
	return {
		...rule,
		create(context) {
			const text = context.sourceCode.text
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor} */ descriptor
							) => {
								const fixes = get_fixes(descriptor)
								if (
									fixes.length
									&& fixes.every(
										item => text.slice(item.range[0], item.range[1]) == item.text
									)
								) return
								context.report(descriptor)
							}
						}
					}
				)
			)
		}
	}
}
export { skip_unchanged_fixes }
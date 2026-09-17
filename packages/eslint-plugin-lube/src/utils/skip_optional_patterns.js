/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function skip_optional_patterns(rule) {
	return {
		...rule,
		create(context) {
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor & { node?: import("estree").Node & { optional?: boolean } }} */ descriptor
							) => {
								if (descriptor.node?.type == "ObjectPattern" && descriptor.node.optional) return
								context.report(descriptor)
							}
						}
					}
				)
			)
		}
	}
}
export { skip_optional_patterns }
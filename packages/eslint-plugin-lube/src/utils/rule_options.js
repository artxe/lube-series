/** @type {WeakMap<import("eslint").SourceCode, Map<string, import("eslint").Rule.RuleContext["options"]>>} */
const registry = new WeakMap()
/**
 * @param {import("eslint").SourceCode} source_code
 * @param {string} rule_name
 * @returns {import("eslint").Rule.RuleContext["options"] | undefined}
 */
function get_rule_options(source_code, rule_name) {
	return registry.get(source_code)?.get(rule_name)
}
/**
 * @param {string} rule_name
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function record_options(rule_name, rule) {
	return {
		...rule,
		create(context) {
			let rules = registry.get(context.sourceCode)
			if (!rules) {
				rules = new Map()
				registry.set(context.sourceCode, rules)
			}
			rules.set(rule_name, context.options)
			return rule.create(context)
		}
	}
}
export { get_rule_options, record_options }
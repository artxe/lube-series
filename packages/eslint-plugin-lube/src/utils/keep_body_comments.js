import { get_fixes } from "./fix_recorder.js"
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function keep_body_comments(rule) {
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
								/** @type {import("eslint").Rule.ReportDescriptor} */ descriptor
							) => {
								const [ fix, extra ] = get_fixes(descriptor)
								const body = fix && !extra && fix.text == `{${text.slice(fix.range[0], fix.range[1])}}`
									? source_code.getTokenByRangeStart(fix.range[0])
									: null
								const comment = body && source_code.getCommentsBefore(body)[0]
								if (!fix || !comment) {
									context.report(descriptor)
									return
								}
								/** @type {import("eslint").AST.Range} */
								const range = [
									/** @type {import("eslint").AST.Range} */(comment.range)/**/[0],
									fix.range[1]
								]
								context.report(
									{
										...descriptor,
										fix(fixer) {
											return fixer.replaceTextRange(
												range,
												`{${text.slice(range[0], range[1])}}`
											)
										}
									}
								)
							}
						}
					}
				)
			)
		}
	}
}
export { keep_body_comments }
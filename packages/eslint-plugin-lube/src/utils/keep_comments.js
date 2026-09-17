import { get_fixes } from "./fix_recorder.js"
import { lower_bound } from "./source_text.js"
const line_break_regex = /^[\n\r\p{Zl}\p{Zp}]/u
const non_space_regex = /\S/
/**
 * @param {import("../../private.js").Comment} comment
 * @returns {number}
 */
function get_comment_start(comment) {
	return comment.range[0]
}
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function keep_comment_order(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			const comments = /** @type {import("../../private.js").Comment[]} */(source_code.getAllComments())/**/
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor} */ descriptor
							) => {
								const fixes = get_fixes(descriptor)
								if (fixes.some(
									item => {
										const comment = comments[lower_bound(
											comments,
											get_comment_start,
											item.range[0]
										)]
										return !!comment && comment.range[1] <= item.range[1]
									}
								)) return
								context.report(descriptor)
							}
						}
					}
				)
			)
		}
	}
}
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function keep_comments(rule) {
	return {
		...rule,
		create(context) {
			const source_code = context.sourceCode
			const text = source_code.text
			/** @type {Set<number> | undefined} */
			let line_comment_ends
			return rule.create(
				Object.create(
					context,
					{
						report: {
							value: (
								/** @type {import("eslint").Rule.ReportDescriptor} */ descriptor
							) => {
								const fixes = get_fixes(descriptor)
								line_comment_ends ??= new Set(
									source_code.getAllComments()
										.filter(
											comment => comment.type == "Line"
										)
										.map(
											comment => /** @type {import("eslint").AST.Range} */(comment.range)/**/[1]
										)
								)
								const ends = line_comment_ends
								if (fixes.some(
									item => non_space_regex.test(
										text.slice(item.range[0], item.range[1])
									)
										|| ends.has(item.range[0]) && !line_break_regex.test(item.text)
								)) return
								context.report(descriptor)
							}
						}
					}
				)
			)
		}
	}
}
export {
	keep_comment_order,
	keep_comments
}
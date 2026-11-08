import { get_fixes } from "./fix_recorder.js"
/**
 * @param {number} code
 * @returns {boolean}
 */
function is_line_break(code) {
	return code == 10 || code == 13 || code == 0x2028 || code == 0x2029
}
/**
 * @param {string} value
 * @param {number} index
 * @returns {number}
 */
function line_start(value, index) {
	let position = index
	while (position > 0 && !is_line_break(value.charCodeAt(position - 1))) {
		position--
	}
	return position
}
/**
 * @param {import("eslint").Rule.RuleModule} rule
 * @returns {import("eslint").Rule.RuleModule}
 */
function trim_fixes(rule) {
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
								const fixes = get_fixes(descriptor).sort(
									(a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]
								)
								if (!fixes.length) {
									context.report(descriptor)
									return
								}
								const start = /** @type {import("eslint").Rule.Fix} */(fixes[0])/**/.range[0]
								const end = Math.max(
									...fixes.map(item => item.range[1])
								)
								let replacement = ""
								let position = start
								for (const item of fixes) {
									replacement += text.slice(position, item.range[0]) + item.text
									position = item.range[1]
								}
								replacement += text.slice(position, end)
								const original = text.slice(start, end)
								const limit = Math.min(
									original.length,
									replacement.length
								)
								let head = 0
								while (head < limit && original[head] == replacement[head]) {
									head++
								}
								let tail = 0
								while (
									tail < limit - head
										&& original[original.length - 1 - tail] == replacement[replacement.length - 1 - tail]
								) {
									tail++
								}
								if (original.length == replacement.length && head == original.length) {
									const { fix: _fix, ...rest } = descriptor
									context.report(rest)
									return
								}
								const kept = replacement.length - tail
								const replaced_line = line_start(replacement, kept)
								const new_line = replaced_line > 0
									? replacement.slice(replaced_line, kept)
									: text.slice(line_start(text, start), start) + replacement.slice(0, kept)
								const old_line = text.slice(
									line_start(text, end - tail),
									end - tail
								)
								if (new_line.includes("//") || old_line.includes("//")) {
									while (tail > 0 && !is_line_break(text.charCodeAt(end - tail))) {
										tail--
									}
								}
								/** @type {import("eslint").AST.Range} */
								const range = [ start + head, end - tail ]
								const trimmed = replacement.slice(head, replacement.length - tail)
								context.report(
									{
										...descriptor,
										fix: fixer => fixer.replaceTextRange(range, trimmed)
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
export { trim_fixes }
import { tag_name, tag_starts } from "../utils/jsdoc_tags.js"
const blank_line_regex = /\n\s*\n/
const line_join_regex = /\s*\n\s*/g
const line_mark_regex = /^\s*\*?\s?/
const line_terminator_regex = /\r\n|[\n\r\p{Zl}\p{Zp}]/u
const space_regex = /^\s*$/
/**
 * @param {string} body
 * @returns {boolean}
 */
function is_open_first_line(body) {
	const first_line = body.split("\n", 1).join("")
	return first_line.split("{").length != first_line.split("}").length
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const text = context.sourceCode.text
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) {
					if (comment.type != "Block" || !comment.value.startsWith("*") || comment.value.length < 2) {
						continue
					}
					const range = /** @type {import("eslint").AST.Range} */(comment.range)/**/
					const loc = /** @type {import("estree").SourceLocation} */(comment.loc)/**/
					const raw = comment.value.slice(1)
					if (line_terminator_regex.test(raw)) {
						const body = raw.split(line_terminator_regex)
							.map(
								row => row.replace(line_mark_regex, "").trimEnd()
							)
							.join("\n")
							.trim()
						const starts = tag_starts(body)
						const [ first ] = starts
						if (
							starts.length != 1
								|| first != 0
								|| tag_name(body) == "example"
								|| blank_line_regex.test(body)
								|| is_open_first_line(body)
						) {
							continue
						}
						context.report(
							{
								fix: fixer => fixer.replaceTextRange(
									range,
									`/** ${body.replace(line_join_regex, " ")} */`
								),
								loc,
								messageId: "one"
							}
						)
					} else {
						const body = raw.trim()
						const starts = tag_starts(body)
						if (starts.length < 2) {
							continue
						}
						const line_start = text.lastIndexOf("\n", range[0] - 1) + 1
						const indent = text.slice(line_start, range[0])
						if (!space_regex.test(indent)) {
							context.report({ loc, messageId: "many" })
							continue
						}
						const eol = text.includes("\r\n") ? "\r\n" : "\n"
						const parts = [
							body.slice(0, starts[0]).trim(),
							...starts.map(
								(start, i) => body.slice(start, starts[i + 1]).trim()
							)
						].filter(Boolean)
						context.report(
							{
								fix: fixer => fixer.replaceTextRange(
									range,
									`/**${eol}${parts.map(part => `${indent} * ${part}${eol}`).join("")}${indent} */`
								),
								loc,
								messageId: "many"
							}
						)
					}
				}
			}
		}
	},
	meta: {
		docs: {
			description: "Enforces a JSDoc block of one tag on one line and a block of two or more tags with one tag a line.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-jsdoc-lines.md"
		},
		fixable: "code",
		messages: {
			many: "Write each tag of this JSDoc block on a line of its own",
			one: "Write this JSDoc block, which holds one tag and no description, on one line"
		},
		schema: [],
		type: "layout"
	}
}
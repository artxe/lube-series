import {
	get_indent_model,
	read_indent_options
} from "../utils/indent_model.js"
/**
 * @param {string} indent
 * @returns {string}
 */
function describe(indent) {
	const tabs = indent.split("\t").length - 1
	const spaces = indent.length - tabs
	return tabs > 0 && spaces > 0
		? `${plural(tabs, "tab")} and ${plural(spaces, "space")}`
		: tabs > 0
			? plural(tabs, "tab")
			: plural(spaces, "space")
}
/**
 * @param {number} count
 * @param {string} name
 * @returns {string}
 */
function plural(count, name) {
	return `${count} ${name}${count == 1 ? "" : "s"}`
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const settings = read_indent_options(context.options)
		const source_code = context.sourceCode
		const text = source_code.text
		return {
			"Program:exit"() {
				for (const { end, expected, line, start } of get_indent_model(source_code, settings).get_lines()) {
					const actual = text.slice(start, end)
					if (actual != expected) {
						context.report(
							{
								data: {
									actual: describe(actual),
									expected: describe(expected)
								},
								fix: fixer => fixer.replaceTextRange([ start, end ], expected),
								loc: {
									end: { column: end - start, line },
									start: { column: 0, line }
								},
								messageId: "wrongIndentation"
							}
						)
					}
				}
			}
		}
	},
	meta: {
		docs: {
			description: "Enforce consistent indentation computed from the syntax tree.",
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/indent.md"
		},
		fixable: "whitespace",
		messages: {
			wrongIndentation: "Expected indentation of {{expected}} but found {{actual}}."
		},
		schema: [
			{
				additionalProperties: false,
				anyOf: [
					{ enum: [ "tab" ] },
					{ minimum: 0, type: "integer" }
				]
			},
			{
				additionalProperties: false,
				properties: {
					SwitchCase: { minimum: 0, type: "integer" },
					binaryOperator: { minimum: 0, type: "integer" }
				},
				type: "object"
			}
		],
		type: "layout"
	}
}
/**
 * @param {import("eslint").AST.Range} range
 * @param {string} text
 * @returns {import("eslint").Rule.Fix}
 */
function fix_of(range, text) {
	return { range, text }
}
/** @type {import("eslint").Rule.RuleFixer} */
const recorder = {
	insertTextAfter: (node, text) => fix_of(
		[
			/** @type {import("eslint").AST.Range} */(node.range)/**/[1],
			/** @type {import("eslint").AST.Range} */(node.range)/**/[1]
		],
		text
	),
	insertTextAfterRange: (range, text) => fix_of([ range[1], range[1] ], text),
	insertTextBefore: (node, text) => fix_of(
		[
			/** @type {import("eslint").AST.Range} */(node.range)/**/[0],
			/** @type {import("eslint").AST.Range} */(node.range)/**/[0]
		],
		text
	),
	insertTextBeforeRange: (range, text) => fix_of([ range[0], range[0] ], text),
	remove: node => fix_of(
		/** @type {import("eslint").AST.Range} */(node.range)/**/,
		""
	),
	removeRange: range => fix_of(range, ""),
	replaceText: (node, text) => fix_of(
		/** @type {import("eslint").AST.Range} */(node.range)/**/,
		text
	),
	replaceTextRange: (range, text) => fix_of(range, text)
}
/**
 * @param {import("eslint").Rule.ReportDescriptor} descriptor
 * @returns {import("eslint").Rule.Fix[]}
 */
function get_fixes(descriptor) {
	const fix = descriptor.fix?.(recorder)
	return fix == null
		? []
		: "range" in fix
			? [ fix ]
			: [ ...fix ]
}
export { get_fixes }
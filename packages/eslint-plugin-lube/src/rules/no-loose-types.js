const line_star_regex = /(?<=\n[ \t]*)\*/g
const loose_names = new Set([ "any", "Object", "object" ])
const string_regex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g
const tag_regex = /(?:^|[\s*])@(?:extends|augments|param|prop|property|returns?|satisfies|template|this|throws|type|yields?)\s*\{/g
const token_regex = /[A-Za-z_$][\w$]*|\*/g
/**
 * @param {string} type
 * @returns {string[]}
 */
function loose_in(type) {
	const clean = type.replace(
		string_regex,
		match => " ".repeat(match.length)
	).replace(
		line_star_regex,
		match => " ".repeat(match.length)
	)
	/** @type {string[]} */
	const found = []
	for (const match of clean.matchAll(token_regex)) {
		const [ token ] = match
		const index = match.index
		if (token != "*" && !loose_names.has(token)) {
			continue
		}
		if (token != "*") {
			const before = clean.slice(0, index).trimEnd()
			const after = clean.slice(index + token.length).trimStart()
			if (before.endsWith(".") || after.startsWith(":") || after.startsWith("?:")) {
				continue
			}
		}
		found.push(token)
	}
	return found
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		const source_code = context.sourceCode
		return {
			Program() {
				for (const comment of source_code.getAllComments()) {
					if (comment.type != "Block" || !comment.value.startsWith("*")) {
						continue
					}
					const range = /** @type {import("eslint").AST.Range} */(comment.range)/**/
					for (const match of comment.value.matchAll(tag_regex)) {
						const open = match.index + match[0].length - 1
						let depth = 0
						let close = open
						for (; close < comment.value.length; close++) {
							const char = comment.value.charAt(close)
							depth += char == "{"
								? 1
								: char == "}"
									? -1
									: 0
							if (depth == 0) {
								break
							}
						}
						for (const type of loose_in(
							comment.value.slice(open + 1, close)
						)) {
							context.report(
								{
									data: { type },
									loc: {
										end: source_code.getLocFromIndex(range[0] + 2 + open + 1),
										start: source_code.getLocFromIndex(range[0] + 2 + open)
									},
									messageId: "loose"
								}
							)
						}
					}
				}
			},
			TSAnyKeyword(
				/** @type {import("estree").Node} */ node
			) {
				context.report(
					{
						data: { type: "any" },
						messageId: "loose",
						node
					}
				)
			},
			TSObjectKeyword(
				/** @type {import("estree").Node} */ node
			) {
				context.report(
					{
						data: { type: "object" },
						messageId: "loose",
						node
					}
				)
			},
			"TSTypeReference[typeName.name='Object']"(
				/** @type {import("estree").Node} */ node
			) {
				context.report(
					{
						data: { type: "Object" },
						messageId: "loose",
						node
					}
				)
			}
		}
	},
	meta: {
		docs: {
			description: "Disallows `any`, `*`, `object` and `Object` in JSDoc type expressions and TypeScript type annotations.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/no-loose-types.md"
		},
		messages: {
			loose: "`{{type}}` is too loose a type; use `unknown` where the value is really arbitrary, or a precise type"
		},
		schema: [],
		type: "suggestion"
	}
}
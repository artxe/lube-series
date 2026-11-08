import ascii_order from "./rules/ascii-order.js"
import closures_last from "./rules/closures-last.js"
import indent from "./rules/indent.js"
import no_ambiguous_start from "./rules/no-ambiguous-start.js"
import no_loose_types from "./rules/no-loose-types.js"
import no_typedef from "./rules/no-typedef.js"
import prefer_param_tag from "./rules/prefer-param-tag.js"
import prefer_type_tag from "./rules/prefer-type-tag.js"
import pretty_imports from "./rules/pretty-imports.js"
import pretty_jsdoc_casting from "./rules/pretty-jsdoc-casting.js"
import pretty_jsdoc_lines from "./rules/pretty-jsdoc-lines.js"
import pretty_parens from "./rules/pretty-parens.js"
import pretty_sequence from "./rules/pretty-sequence.js"
import pretty_ternary from "./rules/pretty-ternary.js"
import require_returns from "./rules/require-returns.js"
import svelte_naming_convention from "./rules/svelte-naming-convention.js"
import { accept_cr_eol } from "./utils/accept_cr_eol.js"
import { keep_body_comments } from "./utils/keep_body_comments.js"
import {
	keep_comment_order,
	keep_comments
} from "./utils/keep_comments.js"
import { keep_line_breaks } from "./utils/keep_line_breaks.js"
import { record_options } from "./utils/rule_options.js"
import { skip_hole_commas } from "./utils/skip_hole_commas.js"
import { skip_optional_patterns } from "./utils/skip_optional_patterns.js"
import { skip_unchanged_fixes } from "./utils/skip_unchanged_fixes.js"
import { split_declarations } from "./utils/split_declarations.js"
import { trim_fixes } from "./utils/trim_fixes.js"
import stylistic_plugin from "@stylistic/eslint-plugin"
import { builtinRules } from "eslint/use-at-your-own-risk"
import { readFileSync } from "node:fs"
/** @type {import("eslint").ESLint.Plugin} */
const stylistic = stylistic_plugin
/** @type {{ version: string }} */
const manifest = JSON.parse(
	readFileSync(
		new URL(
			"../package.json",
			import.meta.url
		),
		"utf8"
	)
)
const whole_comment_rules = new Set(
	[
		"pretty-jsdoc-lines",
		"require-returns"
	]
)
const brace_rules = /** @type {const} */([
	"object-curly-newline",
	"object-curly-spacing"
])/**/
const spacing_rules = /** @type {const} */([
	"generator-star-spacing",
	"key-spacing",
	"rest-spread-spacing",
	"semi-spacing",
	"space-unary-ops",
	"yield-star-spacing"
])/**/
/** @type {import("eslint").Linter.RulesRecord} */
const strict_rules = {
	"@stylistic/array-bracket-newline": [ "error", "consistent" ],
	"@stylistic/array-element-newline": [ "error", "consistent" ],
	"@stylistic/arrow-parens": [ "error", "as-needed" ],
	"@stylistic/arrow-spacing": [
		"error",
		{ "after": true, "before": true }
	],
	"@stylistic/block-spacing": [ "error", "always" ],
	"@stylistic/brace-style": [ "error", "1tbs" ],
	"@stylistic/comma-dangle": [ "error", "never" ],
	"@stylistic/comma-spacing": [
		"error",
		{ "after": true, "before": false }
	],
	"@stylistic/comma-style": [ "error", "last" ],
	"@stylistic/computed-property-spacing": [ "error", "never" ],
	"@stylistic/dot-location": [ "error", "property" ],
	"@stylistic/eol-last": [ "error", "never" ],
	"@stylistic/function-call-argument-newline": [ "error", "consistent" ],
	"@stylistic/function-call-spacing": [ "error", "never" ],
	"@stylistic/generator-star-spacing": [ "error", "after" ],
	"@stylistic/jsx-quotes": [ "error", "prefer-double" ],
	"@stylistic/key-spacing": [
		"error",
		{
			"afterColon": true,
			"beforeColon": false
		}
	],
	"@stylistic/keyword-spacing": [
		"error",
		{ "after": true, "before": true }
	],
	"@stylistic/max-statements-per-line": [ "error", { "max": 1 } ],
	"@stylistic/multiline-ternary": [ "error", "always-multiline" ],
	"@stylistic/new-parens": "error",
	"@stylistic/newline-per-chained-call": [
		"error",
		{ "ignoreChainWithDepth": 2 }
	],
	"@stylistic/no-extra-semi": "error",
	"@stylistic/no-multi-spaces": "error",
	"@stylistic/no-multiple-empty-lines": [
		"error",
		{ "max": 0, "maxBOF": 0, "maxEOF": 0 }
	],
	"@stylistic/no-trailing-spaces": [
		"error",
		{
			"ignoreComments": false,
			"skipBlankLines": false
		}
	],
	"@stylistic/object-curly-newline": [ "error", { "consistent": true } ],
	"@stylistic/object-curly-spacing": [ "error", "always" ],
	"@stylistic/operator-linebreak": [
		"error",
		"before",
		{ "overrides": { "=": "after" } }
	],
	"@stylistic/quotes": [ "error", "double" ],
	"@stylistic/rest-spread-spacing": [ "error", "never" ],
	"@stylistic/semi": [ "error", "never" ],
	"@stylistic/semi-spacing": [
		"error",
		{ "after": true, "before": false }
	],
	"@stylistic/semi-style": [ "error", "first" ],
	"@stylistic/space-before-blocks": [ "error", "always" ],
	"@stylistic/space-before-function-paren": [
		"error",
		{
			"anonymous": "never",
			"asyncArrow": "always",
			"named": "never"
		}
	],
	"@stylistic/space-in-parens": [ "error", "never" ],
	"@stylistic/space-infix-ops": [ "error", { "int32Hint": true } ],
	"@stylistic/space-unary-ops": [
		"error",
		{ "nonwords": false, "words": true }
	],
	"@stylistic/switch-colon-spacing": [
		"error",
		{ "after": true, "before": false }
	],
	"@stylistic/template-curly-spacing": [ "error", "never" ],
	"@stylistic/template-tag-spacing": [ "error", "never" ],
	"@stylistic/yield-star-spacing": [ "error", "after" ],
	"arrow-body-style": [ "error", "as-needed" ],
	"func-style": [ "error", "declaration" ],
	"lube/ascii-order": [
		"error",
		{
			checkDeclarations: true,
			checkImports: true,
			checkKeys: true,
			checkNames: true,
			checkTests: true
		}
	],
	"lube/closures-last": "error",
	"lube/curly": [ "error", "all" ],
	"lube/indent": [
		"error",
		"tab",
		{
			"SwitchCase": 0,
			"binaryOperator": 1
		}
	],
	"lube/no-ambiguous-start": "error",
	"lube/no-loose-types": "error",
	"lube/no-typedef": "error",
	"lube/prefer-param-tag": "error",
	"lube/prefer-type-tag": "error",
	"lube/pretty-imports": "error",
	"lube/pretty-jsdoc-casting": "error",
	"lube/pretty-jsdoc-lines": "error",
	"lube/pretty-parens": "error",
	"lube/pretty-sequence": "error",
	"lube/pretty-ternary": "error",
	"lube/require-returns": "error",
	"lube/svelte-naming-convention": "error",
	"no-case-declarations": "off",
	"no-console": "warn",
	"no-duplicate-imports": [
		"error",
		{
			"allowSeparateTypeImports": true
		}
	],
	"no-extra-boolean-cast": "error",
	"no-lonely-if": "error",
	"no-new-native-nonconstructor": "error",
	"no-self-compare": "error",
	"no-shadow": "error",
	"no-shadow-restricted-names": "error",
	"no-unneeded-ternary": "error",
	"no-useless-computed-key": "error",
	"no-useless-rename": "error",
	"no-useless-return": "error",
	"one-var": [ "error", "never" ],
	"prefer-const": [
		"warn",
		{
			"destructuring": "all",
			"ignoreReadBeforeAssign": false
		}
	],
	"prefer-exponentiation-operator": "error",
	"prefer-object-spread": "error",
	"yoda": "error"
}
/** @type {import("eslint").Linter.RulesRecord} */
const recommended_rules = {
	...Object.fromEntries(
		Object.entries(strict_rules).filter(
			([ name ]) => name.startsWith("@stylistic/") && name != "@stylistic/max-statements-per-line"
		)
	),
	"@stylistic/eol-last": [ "error", "always" ],
	"@stylistic/no-multiple-empty-lines": [
		"error",
		{ max: 1, maxBOF: 0, maxEOF: 0 }
	],
	"lube/ascii-order": [
		"error",
		{
			checkDeclarations: false,
			checkImports: false,
			checkKeys: false,
			checkNames: true,
			checkTests: false
		}
	],
	"lube/indent": [
		"error",
		"tab",
		{ "SwitchCase": 0 }
	],
	"lube/pretty-imports": [ "error", { maxLength: 80 } ],
	"lube/pretty-jsdoc-casting": "error",
	"lube/pretty-jsdoc-lines": "error",
	"lube/pretty-parens": "error",
	"lube/pretty-sequence": [ "error", { maxLength: 80 } ],
	"lube/pretty-ternary": "error"
}
/**
 * @type {import("eslint").ESLint.Plugin & {
 *   configs: {
 *     recommended: import("eslint").Linter.Config & {
 *       plugins: Record<string, import("eslint").ESLint.Plugin>
 *       rules: import("eslint").Linter.RulesRecord
 *     }
 *     strict: import("eslint").Linter.Config & {
 *       plugins: Record<string, import("eslint").ESLint.Plugin>
 *       rules: import("eslint").Linter.RulesRecord
 *     }
 *   }
 * }}
 */
const plugin = {
	configs: {
		recommended: {
			plugins: {},
			rules: recommended_rules
		},
		strict: { plugins: {}, rules: strict_rules }
	},
	meta: {
		name: "eslint-plugin-lube",
		version: manifest.version
	},
	rules: Object.fromEntries(
		Object.entries(
			/** @type {Record<string, import("eslint").Rule.RuleModule>} */({
				"ascii-order": ascii_order,
				"closures-last": closures_last,
				"curly": keep_body_comments(
					/** @type {import("eslint").Rule.RuleModule} */(builtinRules.get("curly"))/**/
				),
				"indent": indent,
				"no-ambiguous-start": no_ambiguous_start,
				"no-loose-types": no_loose_types,
				"no-typedef": no_typedef,
				"prefer-param-tag": prefer_param_tag,
				"prefer-type-tag": prefer_type_tag,
				"pretty-imports": pretty_imports,
				"pretty-jsdoc-casting": pretty_jsdoc_casting,
				"pretty-jsdoc-lines": pretty_jsdoc_lines,
				"pretty-parens": pretty_parens,
				"pretty-sequence": pretty_sequence,
				"pretty-ternary": pretty_ternary,
				"require-returns": require_returns,
				"svelte-naming-convention": svelte_naming_convention
			})/**/
		).map(
			([ name, rule ]) => [
				name,
				record_options(
					name,
					rule.meta?.fixable && !whole_comment_rules.has(name) ? trim_fixes(rule) : rule
				)
			]
		)
	)
}
/** @type {Record<string, import("eslint").Rule.RuleModule>} */
const stylistic_rules = {
	...stylistic.rules,
	"comma-style": skip_hole_commas(
		/** @type {import("eslint").Rule.RuleModule} */(stylistic.rules?.["comma-style"])/**/
	),
	"eol-last": accept_cr_eol(
		/** @type {import("eslint").Rule.RuleModule} */(stylistic.rules?.["eol-last"])/**/
	),
	"max-statements-per-line": split_declarations(
		/** @type {import("eslint").Rule.RuleModule} */(stylistic.rules?.["max-statements-per-line"])/**/
	),
	"operator-linebreak": keep_comment_order(
		/** @type {import("eslint").Rule.RuleModule} */(stylistic.rules?.["operator-linebreak"])/**/
	),
	...Object.fromEntries(
		brace_rules.map(
			name => [
				name,
				skip_optional_patterns(
					/** @type {Record<typeof brace_rules[number], import("eslint").Rule.RuleModule>} */(stylistic.rules)/**/[name]
				)
			]
		)
	),
	...Object.fromEntries(
		spacing_rules.map(
			name => [
				name,
				keep_comments(
					/** @type {Record<typeof spacing_rules[number], import("eslint").Rule.RuleModule>} */(stylistic.rules)/**/[name]
				)
			]
		)
	)
}
/** @type {Record<string, import("eslint").ESLint.Plugin>} */
const plugins = {
	"@stylistic": {
		...stylistic,
		rules: Object.fromEntries(
			Object.entries(stylistic_rules).map(
				([ name, rule ]) => [
					name,
					trim_fixes(
						skip_unchanged_fixes(keep_line_breaks(rule))
					)
				]
			)
		)
	},
	"lube": plugin
}
plugin.configs.recommended.plugins = plugins
plugin.configs.strict.plugins = plugins
export default plugin
export { plugin as "module.exports" }
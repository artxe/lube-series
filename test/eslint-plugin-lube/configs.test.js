import { Linter } from "eslint"
import lube from "eslint-plugin-lube"
import { builtinRules } from "eslint/use-at-your-own-risk"
import { assert, describe, it } from "vitest"
/** @type {import("eslint").Linter.RulesRecord} */
const recommended_rules = lube.configs.recommended.rules
/** @type {import("eslint").Linter.RulesRecord} */
const strict_rules = lube.configs.strict.rules
const lube_rules = /** @type {Record<string, import("eslint").Rule.RuleModule>} */(lube.rules)/**/
/**
 * @param {string} name
 * @returns {import("eslint").Rule.RuleModule | undefined}
 */
function rule_of(name) {
	const [ prefix, rule ] = name.split("/")
	if (rule === undefined) {
		return undefined
	}
	/** @type {Record<string, import("eslint").ESLint.Plugin>} */
	const plugins = lube.configs.strict.plugins
	return plugins[/** @type {string} */(prefix)/**/]?.rules?.[rule]
}
describe(
	"configs",
	() => {
		it(
			"adds @returns to a one-tag JSDoc block without breaking its layout",
			() => {
				const linter = new Linter()
				for (const code of [
					"/**\n * @param {number} seed\n */\nfunction f(seed) {}",
					"/** @param {number} seed */\nfunction f(seed) {}"
				]) {
					assert.strictEqual(
						linter.verifyAndFix(code, [ lube.configs.strict ]).output,
						"/**\n * @param {number} seed\n * @returns {void}\n */\nfunction f(seed) {}"
					)
				}
			}
		)
		it(
			"holds recommended and strict, each with the plugins and rules",
			() => {
				assert.hasAllKeys(
					lube.configs,
					[ "recommended", "strict" ]
				)
				for (const config of [
					lube.configs.recommended,
					lube.configs.strict
				]) {
					assert.hasAllKeys(
						config.plugins ?? {},
						[ "@stylistic", "lube" ]
					)
					assert.strictEqual(config.plugins?.["lube"], lube)
				}
			}
		)
		it(
			"keeps the whole house style in strict",
			() => {
				for (const name of Object.keys(recommended_rules)) {
					assert.property(strict_rules, name)
				}
				for (const [ name, setting ] of /** @type {[string, unknown][]} */([
					[
						"@stylistic/eol-last",
						[ "error", "never" ]
					],
					[
						"@stylistic/no-multiple-empty-lines",
						[
							"error",
							{ max: 0, maxBOF: 0, maxEOF: 0 }
						]
					],
					[
						"func-style",
						[ "error", "declaration" ]
					],
					[ "lube/pretty-sequence", "error" ],
					[
						"lube/svelte-naming-convention",
						"error"
					],
					[ "lube/curly", [ "error", "all" ] ],
					[ "no-shadow", "error" ]
				])/**/) {
					assert.deepStrictEqual(strict_rules[name], setting, name)
				}
				assert.notProperty(strict_rules, "curly")
				assert.notProperty(strict_rules, "no-await-in-loop")
			}
		)
		it(
			"puts the JSDoc layout rule in both configs and the @returns rule in strict only",
			() => {
				assert.strictEqual(
					recommended_rules["lube/pretty-jsdoc-lines"],
					"error"
				)
				assert.strictEqual(
					strict_rules["lube/pretty-jsdoc-lines"],
					"error"
				)
				assert.strictEqual(
					strict_rules["lube/require-returns"],
					"error"
				)
				assert.notProperty(
					recommended_rules,
					"lube/require-returns"
				)
			}
		)
		it(
			"puts the loose type, typedef and ambiguous start rules in strict only",
			() => {
				for (const name of [
					"lube/no-ambiguous-start",
					"lube/no-loose-types",
					"lube/no-typedef"
				]) {
					assert.strictEqual(strict_rules[name], "error", name)
					assert.notProperty(recommended_rules, name)
				}
			}
		)
		it(
			"recommends only fixable formatting and ordering",
			() => {
				for (const name of Object.keys(recommended_rules)) {
					assert.match(
						name,
						/^(?:@stylistic|lube)\//,
						name
					)
					const rule = rule_of(name)
					assert.ok(
						rule?.meta?.fixable,
						`${name} is fixable`
					)
				}
				for (const name of [
					"lube/curly",
					"lube/svelte-naming-convention",
					"@stylistic/max-statements-per-line",
					"func-style",
					"no-await-in-loop",
					"no-console",
					"no-shadow",
					"one-var",
					"prefer-const"
				]) {
					assert.notProperty(recommended_rules, name)
				}
				assert.deepStrictEqual(
					recommended_rules["lube/ascii-order"],
					[
						"error",
						{
							checkDeclarations: false,
							checkImports: false,
							checkKeys: false,
							checkNames: true,
							checkTests: false
						}
					]
				)
			}
		)
		it(
			"rejects unknown options of every rule",
			() => {
				const linter = new Linter()
				for (const [ name, rule ] of Object.entries(lube_rules)) {
					if (name == "curly") {
						assert.strictEqual(
							rule.meta?.schema,
							builtinRules.get("curly")?.meta?.schema
						)
					} else {
						const schema = /** @type {unknown[]} */(rule.meta?.schema)/**/
						assert.isArray(schema, name)
						for (const option of schema) {
							assert.strictEqual(
								/** @type {{ additionalProperties?: boolean }} */(option)/**/.additionalProperties,
								false,
								name
							)
						}
					}
					assert.throws(
						() => linter.verify(
							"var a = 1",
							[
								{
									plugins: { lube },
									rules: {
										[`lube/${name}`]: [ "error", { maxLenght: 80 } ]
									}
								}
							]
						),
						/should NOT have additional properties|should NOT have more than 0 items|should match some schema in anyOf/,
						name
					)
				}
			}
		)
	}
)
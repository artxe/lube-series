import { Linter } from "eslint"
import lube from "eslint-plugin-lube"
import { assert, describe, it } from "vitest"
const recommended_rules = /** @type {import("eslint").Linter.RulesRecord} */(lube.configs.recommended.rules)/**/
const strict_rules = /** @type {import("eslint").Linter.RulesRecord} */(lube.configs.strict.rules)/**/
const lube_rules = /** @type {Record<string, import("eslint").Rule.RuleModule>} */(lube.rules)/**/
/**
 * @param {string} name
 * @returns {import("eslint").Rule.RuleModule | undefined}
 */
function rule_of(name) {
	const [ prefix, rule ] = name.split("/")
	if (rule === undefined) return undefined
	const plugins = /** @type {Record<string, import("eslint").ESLint.Plugin>} */(lube.configs.strict.plugins)/**/
	return plugins[/** @type {string} */(prefix)/**/]?.rules?.[rule]
}
describe(
	"configs",
	() => {
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
				for (const name of Object.keys(recommended_rules)) assert.property(strict_rules, name)
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
					[ "no-await-in-loop", "warn" ],
					[ "no-shadow", "error" ]
				])/**/) {
					assert.deepStrictEqual(strict_rules[name], setting, name)
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
					"lube/svelte-naming-convention",
					"@stylistic/max-statements-per-line",
					"func-style",
					"no-await-in-loop",
					"no-console",
					"no-shadow",
					"one-var",
					"prefer-const"
				]) assert.notProperty(recommended_rules, name)
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
				assert.deepStrictEqual(
					recommended_rules["@stylistic/eol-last"],
					[ "error", "always" ]
				)
				assert.deepStrictEqual(
					recommended_rules["lube/pretty-sequence"],
					[ "error", { maxLength: 80 } ]
				)
				assert.deepStrictEqual(
					recommended_rules["lube/pretty-imports"],
					[ "error", { maxLength: 80 } ]
				)
			}
		)
		it(
			"rejects unknown options of every rule",
			() => {
				const linter = new Linter()
				for (const [ name, rule ] of Object.entries(lube_rules)) {
					const schema = /** @type {unknown[]} */(rule.meta?.schema)/**/
					assert.isArray(schema, name)
					for (const option of schema) {
						assert.strictEqual(
							/** @type {{ additionalProperties?: boolean }} */(option)/**/.additionalProperties,
							false,
							name
						)
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
						/should NOT have additional properties|should NOT have more than 0 items/,
						name
					)
				}
			}
		)
		it(
			"types svelte-naming-convention as a suggestion, since its fix renames",
			() => {
				assert.strictEqual(
					lube_rules["svelte-naming-convention"]?.meta?.type,
					"suggestion"
				)
			}
		)
	}
)
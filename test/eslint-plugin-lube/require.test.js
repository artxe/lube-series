import lube from "eslint-plugin-lube"
import { execFileSync } from "node:child_process"
import { assert, describe, it } from "vitest"
describe(
	"require",
	() => {
		it(
			"returns the plugin itself to a CommonJS config",
			() => {
				/** @type {{ keys: string[], meta: unknown, plugin_keys: string[] }} */
				const required = JSON.parse(
					execFileSync(
						process.execPath,
						[
							"--input-type=commonjs",
							"--eval",
							"const plugin = require('eslint-plugin-lube'); console.log(JSON.stringify({ keys: Object.keys(plugin.rules), meta: plugin.meta, plugin_keys: Object.keys(plugin) }))"
						],
						{
							cwd: import.meta.dirname,
							encoding: "utf8"
						}
					)
				)
				assert.notInclude(required.plugin_keys, "default")
				assert.deepEqual(required.meta, lube.meta)
				assert.sameMembers(
					required.keys,
					Object.keys(lube.rules ?? {})
				)
			}
		)
	}
)
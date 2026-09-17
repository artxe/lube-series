import lube from "eslint-plugin-lube"
import { createRequire } from "node:module"
import { assert, describe, it } from "vitest"
describe(
	"require",
	() => {
		it(
			"returns the plugin itself to a CommonJS config",
			() => {
				const required = /** @type {typeof lube} */(createRequire(import.meta.url)("eslint-plugin-lube"))/**/
				assert.notProperty(required, "default")
				assert.deepEqual(required.meta, lube.meta)
				assert.hasAllKeys(
					required.rules,
					Object.keys(lube.rules ?? {})
				)
			}
		)
	}
)
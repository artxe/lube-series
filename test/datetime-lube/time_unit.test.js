import { timeUnit } from "datetime-lube"
import { assert, describe, it } from "vitest"
describe(
	"time_unit",
	() => {
		it(
			"values",
			() => {
				assert.deepStrictEqual(
					{ ...timeUnit },
					{
						DD: 86400000,
						HH: 3600000,
						mm: 60000,
						ss: 1000
					}
				)
			}
		)
	}
)
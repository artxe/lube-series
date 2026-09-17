import { install, uninstall } from "./sim/clock.js"
import { sim_seeds, within } from "./sim/seeds.js"
import { afterEach, assert, describe, it } from "vitest"
describe(
	"sim seeds",
	() => {
		/** @type {string[]} */
		const changed = []
		/**
		 * @template T
		 * @param {PromiseLike<T>} promise
		 * @returns {Promise<unknown>}
		 */
		function rejection(promise) {
			return Promise.resolve(promise)
				.then(
					() => assert.fail("No error occurred"),
					error => error
				)
		}
		/**
		 * @param {string} name
		 * @param {string} value
		 * @returns {void}
		 */
		function set(name, value) {
			changed.push(name)
			process.env[name] = value
		}
		afterEach(
			() => {
				for (const name of changed) delete process.env[name]
				changed.length = 0
				uninstall()
			}
		)
		it(
			"seeds",
			() => {
				assert.deepEqual(
					sim_seeds("queue", 3),
					[ 1, 2, 3 ]
				)
				set("SIM_FROM", "10")
				set("SIM_SEEDS", "2")
				assert.deepEqual(
					sim_seeds("queue", 3),
					[ 10, 11 ]
				)
				set("SIM_SEED", "77")
				assert.deepEqual(sim_seeds("queue", 3), [ 77 ])
				set("SIM_MODE", "other")
				assert.deepEqual(sim_seeds("queue", 3), [])
			}
		)
		it(
			"within gives up on a simulation that hangs",
			async () => {
				set("SIM_TIMEOUT", "20")
				install()
				const error = /** @type {Error} */(await rejection(
					within(
						"SIM_MODE=memory SIM_SEED=13",
						new Promise(() => {})
					)
				))/**/
				assert.equal(
					error.message,
					"SIM_MODE=memory SIM_SEED=13 did not finish within 20 ms"
				)
			}
		)
		it(
			"within passes the result through",
			async () => {
				assert.equal(
					await within(
						"SIM_MODE=queue SIM_SEED=1",
						Promise.resolve("done")
					),
					"done"
				)
				const error = /** @type {Error} */(await rejection(
					within(
						"SIM_MODE=queue SIM_SEED=1",
						Promise.reject(Error("failed"))
					)
				))/**/
				assert.equal(error.message, "failed")
			}
		)
		it(
			"within waits forever without a budget",
			async () => {
				set("SIM_TIMEOUT", "0")
				let settled = false
				void within(
					"SIM_MODE=memory SIM_SEED=13",
					new Promise(() => {})
				)
					.then(
						() => settled = true,
						() => settled = true
					)
				await new Promise(
					resolve => setTimeout(resolve, 30)
				)
				assert.isFalse(settled)
			}
		)
	}
)
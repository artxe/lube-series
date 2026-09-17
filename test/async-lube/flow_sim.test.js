/** @import { SimMode } from "./private.js" */
import { install, uninstall } from "./sim/clock.js"
import { simulate_flow } from "./sim/flow_sim.js"
import { catch_unhandled, sim_seeds, within } from "./sim/seeds.js"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
describe(
	"flow simulation",
	() => {
		/** @type {unknown[]} */
		const unhandled = []
		/** @type {() => void} */
		let restore
		afterAll(
			() => {
				uninstall()
				restore()
			}
		)
		beforeAll(
			() => {
				restore = catch_unhandled(unhandled)
				install()
			}
		)
		for (const mode of /** @type {SimMode[]} */([ "plain", "finish", "edges", "goto" ])/**/) {
			it(
				mode,
				async () => {
					/** @type {string[]} */
					const failures = []
					for (const seed of sim_seeds(mode, 40)) {
						const { describe: nodes, log, problems } = await within(
							`SIM_MODE=${mode} SIM_SEED=${seed}`,
							simulate_flow(seed, mode, unhandled)
						)
						if (problems.length) failures.push(
							[
								`SIM_MODE=${mode} SIM_SEED=${seed}`,
								...problems,
								...nodes,
								...log
							].join("\n")
						)
					}
					assert.deepEqual(
						{
							count: failures.length,
							first: failures.slice(0, 3)
						},
						{ count: 0, first: [] }
					)
				},
				600000
			)
		}
	}
)
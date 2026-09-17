import { install, uninstall } from "./sim/clock.js"
import { simulate_queue } from "./sim/queue_sim.js"
import { catch_unhandled, sim_seeds, within } from "./sim/seeds.js"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
describe(
	"queue simulation",
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
		it(
			"queue",
			async () => {
				/** @type {string[]} */
				const failures = []
				for (const seed of sim_seeds("queue", 100)) {
					const {
						config,
						describe: nodes,
						log,
						problems
					} = await within(
						`SIM_MODE=queue SIM_SEED=${seed}`,
						simulate_queue(seed, unhandled)
					)
					if (problems.length) failures.push(
						[
							`SIM_MODE=queue SIM_SEED=${seed} ${config}`,
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
)
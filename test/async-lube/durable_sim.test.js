/** @import { DurableSimOptions } from "./private.js" */
import { install, uninstall } from "./sim/clock.js"
import { simulate_durable } from "./sim/durable_sim.js"
import { catch_unhandled, sim_seeds, within } from "./sim/seeds.js"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
describe(
	"durable simulation",
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
		for (const [ mode, options ] of /** @type {[string, DurableSimOptions][]} */([
			[
				"memory",
				{
					failures: false,
					reads: false,
					store: "memory"
				}
			],
			[
				"sqlite",
				{
					failures: false,
					reads: false,
					store: "sqlite"
				}
			],
			[
				"memory-failures",
				{
					failures: true,
					reads: false,
					store: "memory"
				}
			],
			[
				"memory-reads",
				{
					failures: true,
					reads: true,
					store: "memory"
				}
			],
			[
				"sqlite-reads",
				{
					failures: true,
					reads: true,
					store: "sqlite"
				}
			],
			[
				"sqlite-failures",
				{
					failures: true,
					reads: false,
					store: "sqlite"
				}
			]
		])/**/) {
			it(
				mode,
				async () => {
					/** @type {string[]} */
					const failures = []
					/** @type {number[]} */
					const seeds = []
					for (const seed of sim_seeds(mode, 5)) {
						const { describe: programs, log, problems } = await within(
							`SIM_MODE=${mode} SIM_SEED=${seed}`,
							simulate_durable(seed, options, unhandled)
						)
						uninstall()
						install()
						if (problems.length) seeds.push(seed)
						if (problems.length) failures.push(
							[
								`SIM_MODE=${mode} SIM_SEED=${seed}`,
								...problems,
								...programs,
								...log
							].join("\n")
						)
					}
					assert.deepEqual(
						{
							first: failures.slice(0, 1),
							seeds: seeds.slice(0, 100)
						},
						{ first: [], seeds: [] }
					)
				},
				86400000
			)
		}
	}
)
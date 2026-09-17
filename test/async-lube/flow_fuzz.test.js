/** @import { Input, NodeContext, Ref } from "async-lube" */
/** @import { DynamicFlow, DynamicOptions } from "./private.js" */
import { flow } from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"flow fuzz",
	() => {
		/**
		 * @param {number} ms
		 * @returns {Promise<void>}
		 */
		function sleep(ms) {
			return new Promise(
				resolve => setTimeout(resolve, ms)
			)
		}
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"random flows settle consistently",
			async () => {
				let seed = 7
				/**
				 * @template T
				 * @param {T[]} list
				 * @returns {T}
				 */
				function pick(list) {
					return /** @type {T} */(list[Math.floor(random() * list.length)])/**/
				}/**/
				function random() {
					seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
					return seed / 4294967296
				}
				/** @type {string[]} */
				const problems = []
				for (let iteration = 0; iteration < 40; iteration++) {
					/** @type {Ref[]} */
					const refs = []
					/** @type {Input<unknown>[]} */
					const inputs = []
					/** @type {DynamicFlow} */
					let definition = flow(
						{
							concurrency: pick([ 1, 2, Infinity ]),
							maxSteps: 200
						}
					)
					const count = 3 + Math.floor(random() * 6)
					for (let i = 0; i < count; i++) {
						const deps = refs.filter(() => random() < 0.3).slice(0, 2)
						/** @type {DynamicOptions} */
						const options = { name: "n" + i }
						const roll = random()
						if (roll < 0.1) options["optional"] = true
						else if (roll < 0.2) options["retry"] = { count: 1, delay: 1 }
						else if (roll < 0.25) options["catch"] = (
							/** @type {unknown[]} */ ...args
						) => /** @type {NodeContext} */(args[args.length - 1])/**/.skip()
						if (deps.length && random() < 0.15) options["join"] = pick([ "any", "race" ])
						if (random() < 0.1) options["timeout"] = 3
						const kind = random()
						/** @type {Ref} */
						let ref
						if (kind < 0.12) {
							delete options["catch"]
							delete options["retry"]
							ref = flow.input("n" + i)
							inputs.push(ref)
						} else if (kind < 0.22 && deps.length) {
							options["concurrency"] = pick([ 1, 2 ])
							ref = flow.each(
								async () => {
									await sleep(random() * 3)
									if (random() < 0.1) throw Error("item")
									return 1
								}
							)
						} else {
							if (random() < 0.2) options["overlap"] = pick(
								[
									"rerun",
									"queue",
									"restart",
									"ignore"
								]
							)
							const fails = random() < 0.15
							ref = async () => {
								await sleep(Math.floor(random() * 4))
								if (fails && random() < 0.7) throw Error("boom")
								return i
							}
						}
						definition = definition.add(ref, ...deps, options)
						refs.push(ref)
					}
					for (const source of refs) {
						const targets = refs.filter(() => random() < 0.3).slice(0, 2)
						if (targets.length && random() < 0.25) definition = definition.edge(
							source,
							targets,
							() => random() < 0.5 ? pick(targets) : null
						)
					}
					const run = definition.run()
					run.catch(() => {})
					const actions = 1 + Math.floor(random() * 4)
					for (let action = 0; action < actions; action++) {
						await sleep(Math.floor(random() * 6))
						const roll = random()
						if (roll < 0.2) run.cancel()
						else if (roll < 0.4) run.reload(pick(refs))
						else if (roll < 0.5) run.retry()
						else if (roll < 0.8 && inputs.length) run.send(pick(inputs), action)
						else if (roll < 0.9) run.reload()
						run.catch(() => {})
					}
					for (let round = 0; round < 6; round++) {
						for (const target of inputs) run.send(target, "value")
						run.catch(() => {})
						await sleep(5)
					}
					const outcome = await Promise.race(
						[
							Promise.resolve(run).then(() => "settled", () => "settled"),
							sleep(1500).then(() => "pending")
						]
					)
					const busy = Object.values(run.nodes).filter(
						status => status == "running" || status == "pending"
					)
					if (outcome == "pending" && run.status != "waiting") problems.push(
						`${iteration}: hangs while ${run.status}`
					)
					if (outcome == "settled" && (run.status == "running" || run.status == "waiting")) problems.push(
						`${iteration}: settled while ${run.status}`
					)
					if (outcome == "settled" && busy.length) problems.push(
						`${iteration}: settled with busy nodes`
					)
					run.cancel()
				}
				assert.deepEqual(problems, [])
			},
			60000
		)
	}
)
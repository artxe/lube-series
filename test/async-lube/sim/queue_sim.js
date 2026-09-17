/** @import { FlowRun, FlowSnapshot, NodeContext, Ref } from "async-lube" */
/** @import { SimFlow, SimOptions, SimOutcome } from "../private.js" */
import { advance, flush, rng, time } from "./clock.js"
import { channel, flow } from "async-lube"
/**
 * @param {number} seed
 * @param {unknown[]} unhandled
 * @returns {Promise<SimOutcome & { config: string }>}
 */
export async function simulate_queue(seed, unhandled) {
	const random = rng(seed)
	/** @type {string[]} */
	const problems = []
	/** @type {string[]} */
	const log = []
	const start_time = time()
	/**
	 * @param {string} line
	 * @returns {void}
	 */
	function say(line) {
		log.push(
			`[${time() - start_time}] ${line}`
		)
	}
	const mode = random.pick(
		/** @type {const} */([
			"input-queue",
			"flow.queue(input)",
			"flow.queue(channel)",
			"sub-queue"
		])/**/
	)
	const failure = random.pick(
		/** @type {const} */([
			"fatal",
			"catch",
			"optional",
			"retry"
		])/**/
	)
	const limit = random.chance(0.3) ? 1 + random.int(3) : void 0
	const fail = random.pick([ 0, 0.2, 0.5 ])
	const delays = [
		random.pick([ 0, 1, 5 ]),
		random.pick([ 0, 10, 30 ])
	]
	const with_after = random.chance(0.5)
	const use_snapshot = random.chance(0.6)
	const concurrency = random.pick([ Infinity, 1 ])
	const config = `${mode}/${failure}/${limit ? "limit" + limit : ""}`
	const describe = [
		JSON.stringify(
			{
				concurrency,
				delays,
				fail,
				failure,
				limit,
				mode,
				use_snapshot,
				with_after
			}
		)
	]
	/** @type {{ how: string, key: string, value: string }[]} */
	const done = []
	/** @type {string[]} */
	const after_done = []
	/** @type {{ attempt: number, key: string, value: string }[]} */
	const calls = []
	let epoch = 0
	/**
	 * @param {unknown} _
	 * @param {string} value
	 * @param {NodeContext} context
	 * @returns {string}
	 */
	function caught(_, value, context) {
		done.push(
			{
				how: "caught",
				key: context.key,
				value
			}
		)
		return `caught(${value})`
	}
	/**
	 * @param {string} value
	 * @param {NodeContext} context
	 * @returns {Promise<string>}
	 */
	async function handle_body(value, context) {
		calls.push(
			{
				attempt: context.attempt,
				key: context.key,
				value
			}
		)
		say(
			`call ${value} key=${context.key} attempt=${context.attempt} epoch=${epoch}`
		)
		const delay = random.pick(delays)
		if (delay) await context.sleep(delay)
		if (fail && random.chance(fail)) throw Error("fail " + value)
		if (context.signal.aborted) throw context.signal.reason
		done.push(
			{ how: "ok", key: context.key, value }
		)
		return `h(${value})`
	}
	const message = flow.input("msg")
	const source = channel()
	/** @type {SimOptions} */
	const options = { name: "handle" }
	if (failure == "catch") options["catch"] = caught
	if (failure == "optional") options["optional"] = true
	if (failure == "retry" && mode != "sub-queue") options["retry"] = { count: 5, delay: 1 }
	if (limit) options["limit"] = limit
	let definition = /** @type {SimFlow} */(/** @type {unknown} */(flow({ concurrency })))/**/
	/** @type {Ref} */
	let handle
	if (mode == "sub-queue") {
		handle = /** @type {Ref} */(/** @type {unknown} */(flow().add(
			(
				/** @type {NodeContext} */ context
			) => handle_body(
				/** @type {string} */(context.state)/**/,
				context
			),
			failure == "retry"
				? {
					name: "work",
					retry: { count: 5, delay: 1 }
				}
				: { name: "work" }
		)))/**/
		definition = definition.add(message).add(
			handle,
			message,
			{ ...options, overlap: "queue" }
		)
	} else {
		handle = (
			/** @type {string} */ value,
			/** @type {NodeContext} */ context
		) => handle_body(value, context)
		if (mode == "input-queue") definition = definition.add(message).add(
			handle,
			message,
			{ ...options, overlap: "queue" }
		)
		else if (mode == "flow.queue(input)") definition = definition.add(message).add(
			handle,
			flow.queue(message),
			options
		)
		else definition = definition.add(source, { name: "msg" }).add(
			handle,
			flow.queue(source),
			options
		)
	}
	if (with_after) definition = definition.add(
		(
			/** @type {string} */ value,
			/** @type {NodeContext} */ context
		) => {
			if (!context.signal.aborted && value !== void 0) after_done.push(value)
			return value
		},
		handle,
		{ name: "after", overlap: "queue" }
	)
	let run = definition.run(void 0, { id: "q" + seed })
	/**
	 * @param {FlowRun<unknown, unknown>} target
	 * @returns {void}
	 */
	function watch(target) {
		target.then(
			() => {},
			error => say(
				"settled " + /** @type {Error} */(error)/**/.message
			)
		)
	}
	watch(run)
	/** @type {string[]} */
	const sent = []
	let last_value = 0
	const operations = 10 + random.int(25)
	for (let i = 0; i < operations; i++) {
		const roll = random.next()
		if (roll < 0.5) {
			const value = "v" + last_value++
			sent.push(value)
			say("send " + value)
			if (mode == "flow.queue(channel)") source.send(value)
			else run.send(message, value)
		} else if (roll < 0.6) {
			say("retry")
			run.retry()
		} else if (roll < 0.7 && use_snapshot && mode != "flow.queue(channel)") {
			/** @type {FlowSnapshot} */
			let snapshot
			try {
				snapshot = JSON.parse(JSON.stringify(run.snapshot()))
			} catch (error) {
				problems.push(
					"snapshot threw " + String(error)
				)
				continue
			}
			say(
				"snapshot -> resume " + JSON.stringify(snapshot.nodes["handle"])
			)
			run.cancel()
			run.catch(() => {})
			epoch++
			run = definition.run(void 0, { snapshot })
		} else await advance(
			random.pick([ 0, 1, 3, 10, 50 ])
		)
		watch(run)
		await flush(1)
	}
	for (let round = 0; round < 60; round++) {
		await advance(40)
		if (run.status == "failed") {
			say("drain retry")
			run.retry()
			watch(run)
		} else if (run.status != "running") break
	}
	await advance(100)
	const handled = done.map(entry => entry.value)
	/** @type {Map<string, number>} */
	const counts = new Map()
	for (const value of handled) counts.set(
		value,
		(counts.get(value) ?? 0) + 1
	)
	for (const [ value, n ] of counts) {
		if (n > 1) problems.push(`${value} handled ${n} times`)
	}
	const order = handled.filter(
		(value, index) => handled.indexOf(value) == index
	)
	const positions = order.map(value => sent.indexOf(value))
	if (positions.some(
		(position, index) => index && position < /** @type {number} */(positions[index - 1])/**/
	)) problems.push(
		"out of order: " + order.join(",")
	)
	if (!limit) {
		const missing = sent.filter(value => !counts.has(value))
		if (missing.length && failure != "optional") problems.push(
			`not handled: ${missing.join(",")} (status ${run.status})`
		)
		const never = missing.filter(
			value => !calls.some(call => call.value == value)
		)
		if (never.length && failure == "optional") problems.push(
			`never attempted: ${never.join(",")} (status ${run.status})`
		)
	} else if (sent.length && !counts.has(
		/** @type {string} */(sent[sent.length - 1])/**/
	) && failure != "optional" && run.status != "failed") {
		problems.push(
			`last value ${sent[sent.length - 1]} not handled with limit ${limit}`
		)
	}
	/** @type {Map<string, string>} */
	const key_of = new Map()
	/** @type {Map<string, string>} */
	const value_of = new Map()
	for (const call of calls) {
		const key = key_of.get(call.value)
		if (key && key != call.key && !limit) problems.push(
			`value ${call.value} got keys ${key} and ${call.key}`
		)
		key_of.set(call.value, call.key)
		const value = value_of.get(call.key)
		if (value && value != call.value) problems.push(
			`key ${call.key} used for ${value} and ${call.value}`
		)
		value_of.set(call.key, call.value)
	}
	if (with_after && run.status == "done") {
		const expected = done.filter(
			entry => entry.how == "ok" || failure == "catch"
		).map(
			entry => entry.how == "ok" ? `h(${entry.value})` : `caught(${entry.value})`
		)
		const duplicates = after_done.filter(
			(value, index) => after_done.indexOf(value) != index
		)
		if (duplicates.length) problems.push(
			"after got duplicates " + duplicates.join(",")
		)
		const after_positions = after_done.map(
			value => expected.indexOf(value)
		)
		if (after_positions.some(
			(position, index) => index && position < /** @type {number} */(after_positions[index - 1])/**/
		)) problems.push(
			"after out of order: " + after_done.join(",")
		)
		if (!limit && failure != "optional") {
			const missed = expected.filter(
				value => !after_done.includes(value)
			)
			if (missed.length) problems.push(
				"after missed " + missed.join(",")
			)
		}
	}
	run.cancel()
	run.catch(() => {})
	await advance(50)
	for (const error of unhandled.splice(0)) problems.push(
		"unhandled rejection: " + (error instanceof Error ? error.message : String(error))
	)
	return { config, describe, log, problems }
}
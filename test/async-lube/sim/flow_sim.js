/** @import { FlowRun, FlowSnapshot, Input, NodeContext, Ref } from "async-lube" */
/** @import { SavedFlow, SimCall, SimFlow, SimMode, SimOptions, SimOutcome, SimSpec, SimToken } from "../private.js" */
import {
	advance,
	flush,
	pending_timers,
	rng,
	time
} from "./clock.js"
import { flow } from "async-lube"
/**
 * @param {unknown} value
 * @returns {string}
 */
function hash(value) {
	const text = stringify(value)
	let x = 2166136261
	for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619) >>> 0
	return x.toString(36).slice(0, 5)
}
/**
 * @param {number} seed
 * @param {SimMode} mode
 * @param {unknown[]} unhandled
 * @returns {Promise<SimOutcome>}
 */
export async function simulate_flow(seed, mode, unhandled) {
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
	/** @type {SimCall[]} */
	const calls = []
	/** @type {Set<SimCall>} */
	const checked = new Set()
	/** @type {SimToken[]} */
	const tokens = []
	let epoch = 0
	let last_token = 0
	const count = 3 + random.int(7)
	/** @type {SimSpec[]} */
	const specs = []
	/** @type {Ref[]} */
	const refs = []
	/** @type {Set<string>} */
	const movable = new Set()
	for (let i = 0; i < count; i++) {
		/** @type {number[]} */
		const deps = []
		for (let j = 0; j < i; j++) {
			if (random.chance(0.35) && deps.length < 2) deps.push(j)
		}
		const roll = random.next()
		/** @type {SimSpec["kind"]} */
		const kind = roll < 0.15
			? "input"
			: roll < 0.23 && deps.length
				? "each"
				: roll < 0.3
					? "sub"
					: "fn"
		/** @type {SimOptions} */
		const options = { name: "n" + i }
		/** @type {SimSpec} */
		const spec = {
			coop: false,
			delay: [
				random.pick([ 0, 0, 1, 5, 20 ]),
				random.pick([ 0, 3, 30 ])
			],
			deps,
			fail: random.chance(0.3) ? random.pick([ 0.2, 0.5, 0.9 ]) : 0,
			kind,
			name: "n" + i,
			options,
			ref: void 0,
			release: false
		}
		spec.coop = random.chance(0.5)
		if (kind == "input") {
			if (random.chance(0.2)) {
				options["timeout"] = random.pick([ 10, 50 ])
				if (random.chance(0.5)) options["optional"] = true
			}
		} else {
			const roll_failure = random.next()
			if (roll_failure < 0.12) options["optional"] = true
			else if (roll_failure < 0.22) {
				let gotos = 0
				const back = random.int(i + 1)
				if (mode == "goto") movable.add("n" + back)
				options["catch"] = (
					/** @type {unknown[]} */ ...values
				) => spec.kind == "each"
					? "caught-item"
					: mode == "goto" && spec.kind == "fn" && gotos++ < 2
						? /** @type {NodeContext} */(values[values.length - 1])/**/.goto(
							/** @type {Ref} */(refs[back])/**/
						)
						: "caught:" + spec.name
			}
			if (random.chance(0.3)) options["retry"] = {
				count: 1 + random.int(2),
				delay: random.pick([ 0, 2 ])
			}
			if (random.chance(0.15)) options["timeout"] = random.pick([ 4, 25 ])
			if (random.chance(0.2)) options["overlap"] = random.pick(
				[
					"rerun",
					"queue",
					"ignore",
					"restart"
				]
			)
			if (kind == "fn" && random.chance(0.15)) {
				spec.release = true
				options["release"] = (
					/** @type {SimToken} */ token,
					/** @type {unknown} */ error
				) => {
					const outcome = error === void 0 ? "commit" : /** @type {Error} */(error)/**/.name
					token.released.push(outcome)
					say(
						`release ${token.node}#${token.token} ${outcome}`
					)
				}
			}
			if (kind == "each") options["concurrency"] = random.pick([ 1, 2, Infinity ])
			if (mode == "finish" && random.chance(0.3)) options["finish"] = true
		}
		if (deps.length >= 2 && random.chance(mode == "finish" ? 0.6 : 0.25)) options["join"] = random.pick([ "any", "race" ])
		if (deps.length && random.chance(0.1)) {
			const throws = random.chance(0.3)
			options["when"] = (
				/** @type {unknown[]} */ ...values
			) => {
				if (throws && random.chance(0.3)) {
					say("when throws " + spec.name)
					throw Error("when " + spec.name)
				}
				return hash(values.slice(0, -1)).charCodeAt(0) % 3 != 0
			}
		}
		specs.push(spec)
	}
	for (const spec of specs) {
		if (spec.kind == "each" && specs[/** @type {number} */(spec.deps[0])/**/]?.release) {
			spec.kind = "fn"
			delete spec.options["concurrency"]
		}
		if (spec.kind == "each" && spec.options["catch"]) spec.options["catch"] = () => "caught-item"
		if (spec.kind != "fn" && spec.kind != "input") {
			delete spec.options["release"]
			spec.release = false
		}
	}
	/** @type {Input<unknown>[]} */
	const inputs = []
	/**
	 * @param {SimSpec} spec
	 * @param {string} label
	 * @returns {(...values: unknown[]) => Promise<unknown>}
	 */
	function body(spec, label) {
		return async (...values) => {
			const context = /** @type {NodeContext} */(values[values.length - 1])/**/
			const args = values.slice(0, -1)
			calls.push(
				{
					args: stringify(args),
					attempt: context.attempt,
					epoch,
					index: context.index,
					key: context.key,
					node: label
				}
			)
			say(
				`call ${label} ${context.key}${context.index == null ? "" : "#" + context.index} a${context.attempt} ${stringify(args)}`
			)
			const delay = random.pick(spec.delay)
			if (delay) {
				if (spec.coop) await context.sleep(delay)
				else await new Promise(
					resolve => setTimeout(resolve, delay)
				)
			}
			if (spec.fail && random.chance(spec.fail)) throw Error("fail " + label)
			const value = label + ":" + hash(args)
			if (!spec.release) return value
			/** @type {SimToken} */
			const token = {
				node: label,
				released: [],
				token: last_token++,
				value
			}
			tokens.push(token)
			return token
		}
	}
	let definition = /** @type {SimFlow} */(/** @type {unknown} */(flow(
		{
			concurrency: random.pick([ Infinity, Infinity, 1, 2 ]),
			maxSteps: 500
		}
	)))/**/
	for (const spec of specs) {
		/** @type {Ref} */
		let ref
		if (spec.kind == "input") {
			const input = flow.input(spec.name)
			inputs.push(input)
			ref = input
		} else if (spec.kind == "each") ref = flow.each(body(spec, spec.name))
		else if (spec.kind == "sub") {
			const inner = body(
				{
					...spec,
					fail: spec.fail / 2,
					release: false
				},
				spec.name + ".a"
			)
			ref = /** @type {Ref} */(/** @type {unknown} */(flow().add(
				(
					/** @type {NodeContext} */ context
				) => inner(context.state, context),
				{ name: "a" }
			)))/**/
		} else ref = body(spec, spec.name)
		spec.ref = ref
		refs.push(ref)
		definition = definition.add(
			ref,
			...spec.deps.map(
				dep => /** @type {Ref} */(refs[dep])/**/
			),
			spec.options
		)
	}
	/** @type {string[]} */
	const notes = []
	if (mode == "edges") {
		for (let i = 1; i < specs.length; i++) {
			if (!random.chance(0.3) || specs[i]?.kind == "input") continue
			const back = random.int(i + 1)
			const forward = specs.findIndex(
				(spec, j) => j > i && spec.deps.includes(i)
			)
			const targets = [
				/** @type {Ref} */(refs[back])/**/,
				...forward < 0
					? []
					: [
					/** @type {Ref} */(refs[forward])/**/
					]
			]
			movable.add("n" + back)
			if (forward >= 0) movable.add("n" + forward)
			let loops = 0
			const limit = 1 + random.int(3)
			definition = definition.edge(
				/** @type {Ref} */(refs[i])/**/,
				targets,
				() => (loops++ < limit ? targets[0] : targets[1]) ?? null
			)
			notes.push(
				`edge n${i} -> [n${back}${forward < 0 ? "" : ",n" + forward}] x${limit}`
			)
		}
	}
	for (const spec of specs) {
		if (spec.deps.some(dep => movable.has("n" + dep))) movable.add(spec.name)
	}
	const describe = [
		...notes,
		...specs.map(
			spec => `${spec.name}:${spec.kind}(${spec.deps.map(dep => "n" + dep).join(",")}) ${JSON.stringify(
				Object.fromEntries(
					Object.entries(spec.options)
						.filter(([ key ]) => key != "name")
						.map(
							([ key, value ]) => [ key, typeof value == "function" ? "fn" : value ]
						)
				)
			)} fail=${spec.fail} delay=${spec.delay.join(",")} coop=${spec.coop}`
		)
	]
	/** @type {FlowRun<unknown, unknown>} */
	let run
	try {
		run = definition.run(void 0, { id: "run" + seed })
	} catch (error) {
		return {
			describe,
			log,
			problems: [ "run threw " + String(error) ]
		}
	}
	/**
	 * @param {FlowRun<unknown, unknown>} target
	 * @returns {void}
	 */
	function watch(target) {
		target.then(
			() => say("settled done"),
			error => say(
				`settled ${/** @type {Error} */(error)/**/.name}: ${/** @type {Error} */(error)/**/.message}`
			)
		)
	}
	watch(run)
	/** @type {Set<string> | undefined} */
	let guard
	function check_guard() {
		if (!guard) return
		for (const call of calls) {
			const name = /** @type {string} */(call.node.split(".")[0])/**/
			if (call.epoch != epoch || checked.has(call) || !guard.has(name) || movable.has(name)) continue
			checked.add(call)
			problems.push(
				`resumed run re-ran done node ${call.node} (epoch ${epoch})`
			)
		}
	}
	const operations = 3 + random.int(12)
	for (let i = 0; i < operations; i++) {
		await advance(
			random.pick([ 0, 1, 3, 10, 40 ])
		)
		check_guard()
		const roll = random.next()
		guard = void 0
		if (roll < 0.35 && inputs.length) {
			const input = random.pick(inputs)
			say(`send ${input.name} s${i}`)
			run.send(input, "s" + i)
		} else if (roll < 0.47) {
			const spec = random.chance(0.3) ? void 0 : random.pick(specs)
			say(
				"reload " + (spec?.name ?? "all")
			)
			run.reload(spec?.ref)
		} else if (roll < 0.57) {
			say("retry")
			run.retry()
		} else if (roll < 0.62) {
			say("cancel")
			run.cancel()
		} else if (roll < 0.8) {
			/** @type {SavedFlow} */
			let snapshot
			try {
				snapshot = JSON.parse(JSON.stringify(run.snapshot()))
			} catch (error) {
				problems.push(
					"snapshot threw " + String(error)
				)
				continue
			}
			const retried = new Set(
				Object.entries(snapshot.nodes)
					.filter(([ , data ]) => data.fatal)
					.map(([ name ]) => name)
			)
			for (const spec of specs) {
				if (spec.deps.some(dep => retried.has("n" + dep))) retried.add(spec.name)
			}
			const done = new Set(
				Object.entries(snapshot.nodes)
					.filter(
						([ name, data ]) => data.status == "done" && !retried.has(name)
					)
					.map(([ name ]) => name)
			)
			say(
				`snapshot -> resume status=${run.status} ${Object.entries(snapshot.nodes).map(([ name, data ]) => name + ":" + data.status + (data.fatal ? "!" : ""))
					.join(" ")}`
			)
			run.cancel()
			epoch++
			try {
				run = definition.run(
					void 0,
					{
						snapshot: /** @type {FlowSnapshot} */(/** @type {unknown} */(snapshot))/**/
					}
				)
			} catch (error) {
				problems.push(
					"resume threw " + String(error)
				)
				break
			}
			watch(run)
			for (const name of done) {
				if (JSON.stringify(run.results[name]) != JSON.stringify(snapshot.nodes[name]?.result)) problems.push(
					"resume changed result of " + name
				)
			}
			guard = done
		}
		watch(run)
		await flush(1)
	}
	for (let round = 0; round < 40; round++) {
		await advance(50)
		check_guard()
		const status = run.status
		if (status == "waiting") {
			const waiting = inputs.filter(
				input => run.nodes[input.name] == "waiting"
			)
			if (!waiting.length) break
			for (const input of waiting) {
				say("drain send " + input.name)
				run.send(input, "d" + round)
			}
			watch(run)
			guard = void 0
		} else if (status != "running") break
	}
	await advance(200)
	const status = run.status
	const nodes = run.nodes
	const busy = Object.entries(nodes).filter(
		([ , node_status ]) => node_status == "running" || node_status == "pending"
	)
	if (status == "running") problems.push(
		`hang: status running, busy=${JSON.stringify(busy)} timers=${pending_timers()}`
	)
	if (status != "running" && status != "waiting" && busy.length) problems.push(
		`settled ${status} with busy nodes ${JSON.stringify(busy)}`
	)
	if (status == "waiting" && !Object.values(nodes).includes("waiting")) problems.push(
		"waiting without waiting node " + JSON.stringify(nodes)
	)
	let resolved = false
	void run.idle().then(
		() => {
			resolved = true
		}
	)
	await advance(10)
	if (!resolved && status != "running") problems.push(
		`run.idle() not resolved while ${status}`
	)
	if (status == "done" && mode != "edges") {
		const results = run.results
		for (const spec of specs) {
			if (spec.kind != "fn" || nodes[spec.name] != "done") continue
			if (spec.options["catch"] || spec.options["overlap"] == "ignore" || spec.options["join"] == "race" || spec.deps.some(dep => specs[dep]?.release)) continue
			const values = spec.deps.map(dep => results["n" + dep])
			const expected = spec.name + ":" + hash(values)
			const result = results[spec.name]
			const value = spec.release ? /** @type {SimToken | undefined} */(result)/**/?.value : result
			if (value !== expected && !String(value).startsWith("caught")) problems.push(
				`stale result ${spec.name}: ${String(value)} expected ${expected} from ${JSON.stringify(values)}`
			)
		}
	}
	/** @type {Map<string, SimCall[]>} */
	const by_key = new Map()
	for (const call of calls) {
		const key = call.key + "|" + (call.index ?? "")
		const list = by_key.get(key) ?? []
		by_key.set(key, list)
		list.push(call)
	}
	for (const [ key, list ] of by_key) {
		const names = new Set(list.map(call => call.node))
		if (names.size > 1) problems.push(
			`key ${key} shared by nodes ${[ ...names ].join(",")}`
		)
		if (new Set(list.map(call => call.args)).size > 1) {
			problems.push(
				`key ${key} used with different args: ${list.map(call => `e${call.epoch}a${call.attempt} ${call.args}`).join(" | ")}`
			)
		}
	}
	run.cancel()
	run.catch(() => {})
	await advance(500)
	for (const token of tokens) {
		if (token.released.length != 1) problems.push(
			`token ${token.node}#${token.token} released ${token.released.length} times ${JSON.stringify(token.released)}`
		)
	}
	for (const error of unhandled.splice(0)) problems.push(
		"unhandled rejection: " + (error instanceof Error ? error.name + ": " + error.message : String(error))
	)
	return { describe, log, problems }
}
/**
 * @param {unknown} value
 * @returns {string}
 */
function stringify(value) {
	return JSON.stringify(
		value,
		(_, item) => item && typeof item == "object" && "token" in item && "value" in item
			? "token:" + String(item.value)
			: item
	) ?? "u"
}
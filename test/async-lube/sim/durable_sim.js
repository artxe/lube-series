/** @import { Durable, DurableContext, DurableStore, SavedRun } from "async-lube" */
/** @import { DurableSimBody, DurableSimInput, DurableSimOp, DurableSimOptions, DurableSimSent, DurableSimWorker, SimOutcome } from "../private.js" */
import {
	advance,
	flush,
	pending_timers,
	rng,
	time
} from "./clock.js"
import { HttpError, TimeoutError } from "async-lube"
import { durable, memory, sqlite } from "async-lube/durable"
import { DatabaseSync } from "node:sqlite"
/**
 * @param {unknown} error
 * @returns {string}
 */
function error_shape(error) {
	const type = [
		HttpError,
		TimeoutError,
		RangeError,
		Error
	].find(
		candidate => error instanceof candidate
	)
	const fields = /** @type {Error & Record<string, unknown>} */(error)/**/
	return JSON.stringify(
		[
			type?.name,
			fields.name,
			fields.message,
			[
				"code",
				"data",
				"request",
				"status",
				"timeout"
			].map(key => fields[key])
		]
	)
}
/**
 * @param {unknown} error
 * @returns {string}
 */
function message_of(error) {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
/**
 * @param {number} seed
 * @param {DurableSimOptions} options
 * @param {unknown[]} unhandled
 * @returns {Promise<SimOutcome>}
 */
export async function simulate_durable(seed, options, unhandled) {
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
	/**
	 * @param {number | undefined} at
	 * @returns {string}
	 */
	function since(at) {
		return at == null ? "-" : String(at - start_time)
	}
	const base = options.store == "memory"
		? memory()
		: sqlite(new DatabaseSync(":memory:"))
	let fail_rate = 0
	let fail_after = false
	const latency = random.pick([ 0, 0, 1, 5 ])
	/**
	 * @returns {Promise<void>}
	 */
	async function delay() {
		const ms = random.int(latency + 1)
		if (ms) {
			await new Promise(
				resolve => setTimeout(resolve, ms)
			)
		}
	}
	/**
	 * @param {string} what
	 * @returns {void}
	 */
	function read_fault(what) {
		if (!options.reads || !fail_rate || !random.chance(fail_rate)) return
		say(`${what} failed`)
		throw Error("disk busy")
	}
	/** @type {DurableStore} */
	const store = {
		async due(now, limit) {
			await delay()
			read_fault("due")
			return base.due(now, limit)
		},
		async get(key) {
			await delay()
			read_fault(`get ${key}`)
			return base.get(key)
		},
		async put(key, run, expected) {
			await delay()
			if (fail_rate && !fail_after && random.chance(fail_rate)) {
				say(
					`put ${key} v${expected} failed before commit`
				)
				throw Error("disk full")
			}
			const written = await base.put(key, run, expected)
			say(
				`put ${key} v${expected}->${run.version} ${written ? "ok" : "conflict"} ${run.status} owner=${run.owner ?? "-"} lease=${since(run.lease)} wake=${since(run.wake)} journal=${run.journal.map(entry => entry.name + (entry.done ? entry.error ? "!" : entry.timed_out ? "T" : entry.type == "wait" ? `=${String(entry.value)}` : "+" : "?")).join(",")} events=${JSON.stringify(run.events ?? {})} inbox=${JSON.stringify(run.inbox ?? [])}`
			)
			if (fail_rate && fail_after && random.chance(fail_rate)) {
				say(
					`put ${key} failed after commit`
				)
				throw Error("connection reset")
			}
			return written
		}
	}
	/** @type {Map<string, DurableSimBody[]>} */
	const active = new Map()
	/** @type {Map<string, number>} */
	const attempts = new Map()
	let zombies = 0
	const keys = [ "m1", "m2", "m3" ].slice(0, 1 + random.int(3))
	/** @type {Map<string, DurableSimInput>} */
	const programs = new Map()
	for (const key of keys) {
		/** @type {DurableSimOp[]} */
		const ops = []
		const count = 2 + random.int(5)
		for (let i = 0; i < count; i++) {
			const roll = random.next()
			if (roll < 0.35) {
				ops.push(
					{
						error: random.pick([ "http", "range", "timeout" ]),
						fail: random.pick(
							[ "none", "none", "caught", "uncaught" ]
						),
						ms: random.pick([ 0, 0, 5, 50, 2000, 40000 ]),
						n: `s${i}`,
						t: "step"
					}
				)
			} else if (roll < 0.5) {
				ops.push(
					{
						ms: random.pick([ 1, 10, 500, 1500, 86400000 ]),
						n: `z${i}`,
						t: "sleep"
					}
				)
			} else {
				const kind = random.int(4)
				ops.push(
					{
						n: `w${i}`,
						name: random.pick([ "a", "b" ]),
						t: "wait",
						timeout: kind == 1 || kind == 3 ? random.pick([ 10, 1000, 60000, 259200000 ]) : null,
						until: kind == 2 || kind == 3
							? start_time + random.pick(
								[ 100, 5000, 120000, 86400000 ]
							)
							: null
					}
				)
			}
		}
		programs.set(key, { ops })
	}
	/**
	 * @param {string} worker
	 * @returns {(input: DurableSimInput, context: DurableContext) => Promise<string[]>}
	 */
	function make_fn(worker) {
		return async (
			input,
			{ key, sleep, step, wait }
		) => {
			/** @type {string[]} */
			const out = []
			for (const op of input.ops) {
				if (op.t == "step") {
					const { error: kind, fail, ms, n } = op
					/**
					 * @returns {Promise<string>}
					 */
					function body() {
						return step(
							n,
							async ({ signal }) => {
								const id = `${key}/${n}`
								const attempt = (attempts.get(id) ?? 0) + 1
								attempts.set(id, attempt)
								const list = active.get(key) ?? []
								active.set(key, list)
								if (signal.aborted) zombies++
								const live = signal.aborted ? [] : list.filter(other => !other.signal.aborted)
								if (live.length) problems.push(
									`two live step bodies for ${key}: ${live.map(other => `${other.worker}/${other.name}`).join(",")} and ${worker}/${n} at ${since(time())}`
								)
								/** @type {DurableSimBody} */
								const running = { name: n, signal, worker }
								list.push(running)
								say(
									`${worker} body ${key}/${n}#${attempt}${signal.aborted ? " aborted" : ""}`
								)
								try {
									if (ms) {
										await new Promise(
											resolve => setTimeout(resolve, ms)
										)
									}
									if (fail != "none" && attempt == 1) throw step_error(kind, n)
									return `${n}#${attempt}`
								} finally {
									list.splice(list.indexOf(running), 1)
								}
							}
						)
					}
					if (fail == "caught") {
						try {
							out.push(`step ${n} ${await body()}`)
						} catch (error) {
							const expected = error_shape(step_error(kind, n))
							if (error instanceof Error && error.message == `fail ${n}` && error_shape(error) != expected) problems.push(
								`${key}: ${worker} caught ${n} as ${error_shape(error)}, not ${expected}`
							)
							out.push(
								`caught ${n} ${error instanceof Error ? error.message : String(error)}`
							)
							out.push(
								await step(`comp-${n}`, () => `undo ${n}`)
							)
						}
					} else out.push(`step ${n} ${await body()}`)
				} else if (op.t == "sleep") {
					await sleep(op.n, op.ms)
					out.push(`slept ${op.n}`)
				} else {
					try {
						/** @type {{ timeout?: number, until?: number }} */
						const wait_options = {}
						if (op.timeout != null) wait_options.timeout = op.timeout
						if (op.until != null) wait_options.until = op.until
						out.push(
							`got ${op.n} ${await wait(op.name, wait_options)}`
						)
					} catch (error) {
						if (!(error instanceof TimeoutError)) throw error
						out.push(`timeout ${op.n}`)
					}
				}
			}
			return out
		}
	}
	/**
	 * @param {string} key
	 * @returns {DurableSimInput}
	 */
	function program(key) {
		return /** @type {DurableSimInput} */(programs.get(key))/**/
	}
	/** @type {DurableSimWorker[]} */
	const workers = []
	let last_worker = 0
	/**
	 * @param {boolean} serves
	 * @returns {DurableSimWorker}
	 */
	function spawn(serves) {
		const id = `w${last_worker++}`
		const idle = random.pick([ 0, 5, 1000, 30000 ])
		const lease = random.pick([ 3000, 30000 ])
		const poll = random.pick([ 50, 500, 5000 ])
		/** @type {Durable<DurableSimInput, string[]>} */
		const worker = durable(
			store,
			make_fn(id),
			{ idle, lease, owner: id, poll }
		)
		/** @type {DurableSimWorker} */
		const created = {
			alive: true,
			durable: worker,
			id,
			serve: void 0
		}
		let serving = ""
		if (serves || random.chance(0.8)) {
			const controller = new AbortController()
			created.serve = controller
			const interval = random.pick([ 5000, 30000, 60000 ])
			serving = ` serve=${interval}`
			worker.serve(
				{
					interval,
					onError: (error, key) => say(
						`serve of ${id}: ${key ?? "-"} ${message_of(error)}`
					),
					signal: controller.signal
				}
			).catch(
				error => {
					if (created.alive) problems.push(
						`serve of ${id} rejected ${message_of(error)}`
					)
				}
			)
		}
		say(
			`spawn ${id} idle=${idle} lease=${lease} poll=${poll}${serving}`
		)
		return created
	}
	const worker_count = 2 + random.int(2)
	for (let i = 0; i < worker_count; i++) workers.push(spawn(false))
	/** @type {DurableSimSent[]} */
	const sent = []
	/** @type {Map<string, Promise<void>>} */
	const chains = new Map()
	let last_value = 0
	/** @type {Map<string, { how: string, ok: boolean, value: unknown }[]>} */
	const outcomes = new Map()
	/**
	 * @returns {DurableSimWorker[]}
	 */
	function alive() {
		return workers.filter(worker => worker.alive)
	}
	/**
	 * @param {string} key
	 * @param {string} how
	 * @param {Promise<unknown>} promise
	 * @returns {void}
	 */
	function record(key, how, promise) {
		const list = outcomes.get(key) ?? []
		outcomes.set(key, list)
		promise.then(
			value => void list.push({ how, ok: true, value }),
			error => {
				const failed = error instanceof Error ? /^fail (s\d+)$/.exec(error.message) : null
				const op = failed && program(key).ops.find(item => item.n == failed[1])
				if (op && op.t == "step" && error_shape(error) != error_shape(step_error(op.error, op.n))) problems.push(
					`${key}: ${how} rejected ${error_shape(error)}, not ${error_shape(step_error(op.error, op.n))}`
				)
				list.push(
					{
						how,
						ok: false,
						value: message_of(error)
					}
				)
			}
		)
	}
	/** @type {Set<string>} */
	const cancelled = new Set()
	const moves = 30 + random.int(40)
	for (let i = 0; i < moves; i++) {
		const roll = random.next()
		const key = random.pick(keys)
		const worker = random.pick(alive())
		if (roll < 0.15) {
			say(`${worker.id} run ${key}`)
			record(
				key,
				`run@${worker.id}`,
				worker.durable.run(key, program(key))
			)
		} else if (roll < 0.22) {
			say(`${worker.id} start ${key}`)
			record(
				key,
				`start@${worker.id}`,
				worker.durable.start(key, program(key)).then(
					created => created ? "started" : "exists"
				)
			)
		} else if (roll < 0.28) {
			say(`${worker.id} join ${key}`)
			record(
				key,
				`join@${worker.id}`,
				worker.durable.join(key)
			)
		} else if (roll < 0.55) {
			const name = random.pick([ "a", "b" ])
			const id = `v${last_value++}`
			const chain = `${key}/${name}`
			/** @type {DurableSimSent} */
			const item = {
				end: void 0,
				error: void 0,
				id,
				key,
				name,
				ok: void 0,
				start: -1
			}
			sent.push(item)
			chains.set(
				chain,
				(chains.get(chain) ?? Promise.resolve()).then(
					async () => {
						const sender = worker.alive ? worker : random.pick(alive())
						item.start = time()
						say(
							`${sender.id} send ${key} ${name} ${id}`
						)
						try {
							await sender.durable.send(key, name, id)
							item.ok = true
						} catch (error) {
							item.ok = false
							item.error = message_of(error)
						}
						item.end = time()
						say(
							`send ${id} ${item.ok ? "ok" : item.error}`
						)
					}
				)
			)
		} else if (roll < 0.57) {
			say(`${worker.id} cancel ${key}`)
			cancelled.add(key)
			worker.durable.cancel(key).catch(
				error => say(
					`cancel rejected ${message_of(error)}`
				)
			)
		} else if (roll < 0.63 && alive().length > 1) {
			say(`stop ${worker.id}`)
			worker.alive = false
			worker.serve?.abort()
			worker.durable.stop()
			workers.push(spawn(false))
		} else if (roll < 0.66 && options.failures) {
			fail_rate = random.pick([ 0, 0.1, 0.3 ])
			fail_after = random.chance(0.5)
			say(
				`failures ${fail_rate} ${fail_after ? "after" : "before"} commit`
			)
		} else {
			const ms = random.pick(
				[
					0,
					1,
					10,
					100,
					1000,
					5000,
					60000,
					60000,
					3600000,
					86400000
				]
			)
			say(`advance ${ms}`)
			await advance(ms)
		}
		await flush(2)
	}
	fail_rate = 0
	say("failures off")
	if (!alive().some(worker => worker.serve)) workers.push(spawn(true))
	await advance(1000)
	let settled = false
	void Promise.all(chains.values()).then(() => void (settled = true))
	for (let i = 0; i < 30 && !settled; i++) await advance(60000)
	if (!settled) problems.push(
		`send hangs: ${sent.filter(item => item.start >= 0 && item.end == null).map(item => `${item.key}/${item.name}/${item.id}`)
			.join(",")}`
	)
	for (let round = 0; round < 40; round++) {
		let open = 0
		for (const key of keys) {
			const saved = await base.get(key)
			if (saved && (saved.status == "done" || saved.status == "cancelled")) continue
			open++
			if (!saved || saved.status == "failed" || saved.status == "pending") {
				const worker = random.pick(alive())
				say(
					`${worker.id} final run ${key} (${saved?.status ?? "none"})`
				)
				record(
					key,
					`final-run@${worker.id}`,
					worker.durable.run(key, program(key))
				)
				continue
			}
			for (const entry of saved.journal) {
				if (entry.type != "wait" || entry.done || saved.events?.[entry.name]?.length || saved.inbox?.some(
					item => item.name == entry.name
				)) continue
				const id = `v${last_value++}`
				/** @type {DurableSimSent} */
				const item = {
					end: void 0,
					error: void 0,
					id,
					key,
					name: entry.name,
					ok: void 0,
					start: time()
				}
				sent.push(item)
				const worker = random.pick(alive())
				say(
					`${worker.id} final send ${key} ${entry.name} ${id}`
				)
				let sending = true
				const sent_final = worker.durable.send(key, entry.name, id).finally(() => void (sending = false))
				for (let tick = 0; tick < 600 && sending; tick++) await advance(100)
				if (sending) {
					problems.push(
						`${key}: final send ${id} hangs`
					)
					break
				}
				try {
					await sent_final
					item.ok = true
				} catch (error) {
					item.ok = false
					item.error = message_of(error)
				}
				item.end = time()
			}
		}
		if (!open) break
		const ms = random.pick([ 1000, 60000, 86400000 ])
		say(`advance ${ms}`)
		await advance(ms)
	}
	await advance(120000)
	for (const key of keys) {
		/** @type {SavedRun | undefined} */
		const saved = await base.get(key)
		if (!saved) {
			problems.push(`${key}: no run`)
			continue
		}
		if (saved.status != "done" && saved.status != "cancelled") problems.push(
			`${key}: final status ${saved.status} ${JSON.stringify(saved.error)} journal=${JSON.stringify(saved.journal.map(entry => [ entry.name, entry.done ]))}`
		)
		if (saved.status == "cancelled" && !cancelled.has(key)) problems.push(
			`${key}: cancelled without cancel`
		)
		/** @type {{ id: string, index: number }[]} */
		const consumed = []
		saved.journal.forEach(
			(entry, index) => {
				if (entry.type == "wait" && entry.done && !entry.timed_out) consumed.push(
					{ id: String(entry.value), index }
				)
			}
		)
		/** @type {Set<string>} */
		const remaining = new Set()
		for (const list of Object.values(saved.events ?? {})) {
			for (const event of list) remaining.add(String(event.value))
		}
		for (const item of saved.inbox ?? []) remaining.add(String(item.value))
		/** @type {Map<string, number>} */
		const seen = new Map()
		for (const { id } of consumed) seen.set(id, (seen.get(id) ?? 0) + 1)
		for (const [ id, count ] of seen) {
			if (count > 1) problems.push(
				`${key}: value ${id} consumed ${count} times`
			)
			if (remaining.has(id)) problems.push(
				`${key}: value ${id} consumed and still pending`
			)
		}
		const mine = sent.filter(item => item.key == key)
		if (saved.status == "done") {
			for (const item of mine) {
				const where = seen.has(item.id)
					? "consumed"
					: remaining.has(item.id)
						? "pending"
						: "lost"
				if (item.ok && where == "lost") problems.push(
					`${key}: value ${item.id} sent ok but lost`
				)
				if (item.ok === false && where != "lost" && !/disk busy|disk full|connection reset/.test(item.error ?? "")) problems.push(
					`${key}: value ${item.id} rejected (${item.error}) but ${where}`
				)
			}
			for (const name of [ "a", "b" ]) {
				const order = mine.filter(
					item => item.name == name && seen.has(item.id)
				).map(item => item.id)
				const got = consumed.filter(
					item => saved.journal[item.index]?.name == name
				).map(item => item.id)
				if (order.join() != got.join()) problems.push(
					`${key}/${name}: consumed ${got.join()} but sent ${order.join()}`
				)
				for (const item of mine) {
					if (item.name != name || !item.ok || seen.has(item.id)) continue
					const later = mine.find(
						other => other.name == name && seen.has(other.id) && mine.indexOf(other) > mine.indexOf(item)
					)
					if (later) problems.push(
						`${key}/${name}: ${item.id} skipped while the later ${later.id} was consumed`
					)
				}
			}
			for (const { id, index } of consumed) {
				const item = mine.find(other => other.id == id)
				const until = saved.journal[index]?.until
				if (item && until != null && item.start > until) problems.push(
					`${key}: ${id} sent at ${since(item.start)} after the deadline ${since(until)} satisfied a wait`
				)
			}
			saved.journal.forEach(
				(entry, index) => {
					const { until } = entry
					if (entry.type != "wait" || !entry.timed_out || until == null) return
					for (const item of mine) {
						if (item.name != entry.name || !item.ok || item.end == null || item.end >= until) continue
						const taken = consumed.find(other => other.id == item.id)
						if (!taken) problems.push(
							`${key}: wait ${entry.name}#${index} timed out at ${since(until)} but ${item.id} sent at ${since(item.end)} is unconsumed`
						)
						else if (taken.index > index) problems.push(
							`${key}: wait ${entry.name}#${index} timed out at ${since(until)} but ${item.id} sent at ${since(item.end)} went to the later wait #${taken.index}`
						)
					}
				}
			)
			const expected = saved.journal
				.filter(
					entry => entry.type == "step" && entry.done && !entry.error && !entry.name.startsWith("comp-")
				)
				.map(
					entry => `step ${entry.name} ${String(entry.value)}`
				)
			const result = /** @type {string[]} */(saved.result)/**/
			const steps = result.filter(
				line => line.startsWith("step ")
			)
			if (steps.join() != expected.join()) problems.push(
				`${key}: result steps ${steps.join()} but journal ${expected.join()}`
			)
			for (const outcome of outcomes.get(key) ?? []) {
				if (outcome.ok && !outcome.how.startsWith("start") && JSON.stringify(outcome.value) != JSON.stringify(saved.result)) problems.push(
					`${key}: ${outcome.how} resolved ${JSON.stringify(outcome.value)}, not ${JSON.stringify(saved.result)}`
				)
			}
		}
		for (const outcome of outcomes.get(key) ?? []) {
			if (!outcome.ok && !/worker stopped|disk busy|disk full|connection reset|fail s\d|TimeoutError|CancelError|There is no run/.test(String(outcome.value))) problems.push(
				`${key}: ${outcome.how} rejected ${String(outcome.value)}`
			)
		}
	}
	if (zombies) problems.push(
		`${zombies} step bodies started after their worker stopped or lost the run`
	)
	for (const worker of workers) {
		worker.alive = false
		worker.serve?.abort()
		worker.durable.stop()
	}
	await advance(60000)
	if (pending_timers()) problems.push(
		`${pending_timers()} timers left after every worker stopped`
	)
	for (const error of unhandled.splice(0)) problems.push(
		`unhandled rejection: ${message_of(error)}`
	)
	return {
		describe: [ ...programs ].map(
			([ key, { ops } ]) => `${key}: ${JSON.stringify(ops)}`
		),
		log,
		problems
	}
}
/**
 * @param {"http" | "range" | "timeout"} kind
 * @param {string} n
 * @returns {Error}
 */
function step_error(kind, n) {
	const message = `fail ${n}`
	if (kind == "range") return Object.assign(RangeError(message), { code: n })
	if (kind == "timeout") return Object.assign(
		new TimeoutError(Number(n.slice(1))),
		{ message }
	)
	return new HttpError(
		new Response(null, { status: 503 }),
		{ message, step: n },
		{ method: "POST", url: `/${n}` }
	)
}
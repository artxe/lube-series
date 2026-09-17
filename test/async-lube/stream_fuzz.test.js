/** @import { FuzzEnd, FuzzEvent, FuzzInner, FuzzLeaf, FuzzLoop, FuzzSource, FuzzSpec, FuzzTimed } from "./private.js" */
import {
	advance,
	install,
	pending_timers,
	rng,
	time,
	uninstall
} from "./sim/clock.js"
import { catch_unhandled, sim_seeds, within } from "./sim/seeds.js"
import {
	buffer,
	channel,
	debounce,
	latest,
	merge,
	share,
	throttle,
	until
} from "async-lube"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
/**
 * @param {number[]} gaps
 * @returns {number[]}
 */
function cumulate(gaps) {
	let total = 0
	return gaps.map(
		gap => {
			total += gap
			return total
		}
	)
}
/**
 * @param {unknown} value
 * @returns {string[]}
 */
function flatten(value) {
	return Array.isArray(value) ? value.flatMap(flatten) : [ String(value) ]
}
/**
 * @param {FuzzEvent[]} events
 * @returns {string}
 */
function format(events) {
	return events.map(
		event => `${event.t}=${JSON.stringify(event.v)}`
	)
		.join(" ")
}
/**
 * @param {number} seed
 * @param {unknown[]} unhandled
 * @returns {Promise<string[]>}
 */
async function fuzz_stream(seed, unhandled) {
	const random = rng(seed)
	const base = time()
	const unhandled_before = unhandled.length
	/** @type {string[]} */
	const problems = []
	/** @type {FuzzLeaf[]} */
	const leaves = []
	/** @type {Map<string, Error>} */
	const errors = new Map()
	/** @type {ReturnType<typeof setTimeout>[]} */
	const timers = []
	let names = 0
	let tie = false
	/**
	 * @param {number} low
	 * @param {number} high
	 * @returns {number}
	 */
	function between(low, high) {
		return low + random.int(high - low + 1)
	}
	/**
	 * @param {FuzzSpec} spec
	 * @returns {AsyncIterable<unknown>}
	 */
	function build(spec) {
		switch (spec.k) {
		case "buffer":
			return buffer(build(spec.child), spec.ms)
		case "chan":
			return make_channel(spec)
		case "debounce":
			return debounce(build(spec.child), spec.ms)
		case "latest": {
			let count = 0
			return latest(
				build(spec.child),
				() => make_inner(spec.inner, count++)
			)
		}
		case "merge":
			return merge(...spec.children.map(build))
		case "share":
			return share(build(spec.child))
		case "src":
			return make_source(spec, "")
		case "throttle":
			return throttle(build(spec.child), spec.ms)
		case "until":
			return until(
				build(spec.child),
				make_source(spec.stop, "")
			)
		}
	}
	/**
	 * @param {AsyncIterable<unknown>} stream
	 * @param {number} limit
	 * @param {() => number} pause
	 * @param {FuzzLoop} loop
	 * @returns {Promise<void>}
	 */
	async function consume(stream, limit, pause, loop) {
		const reader = stream[Symbol.asyncIterator]()
		loop.reader = reader
		try {
			for (;;) {
				const step = await reader.next()
				if (loop.forced) return
				if (step.done) {
					loop.end = { kind: "end", t: now() }
					return
				}
				loop.events.push({ t: now(), v: step.value })
				if (loop.events.length > limit) {
					loop.end = { kind: "break", t: now() }
					await reader.return?.()
					return
				}
				const delay = pause()
				if (delay > 0) {
					await new Promise(
						resolve => schedule(
							now() + delay,
							() => resolve(void 0)
						)
					)
				}
			}
		} catch (error) {
			loop.throws++
			loop.end = { error, kind: "error", t: now() }
			const again = await reader.next()
				.then(
					step => step.done ? "" : "a value",
					() => "a second error"
				)
			if (again) problems.push(
				`next() after the error gave ${again}`
			)
		}
	}
	/**
	 * @param {string} name
	 * @returns {Error}
	 */
	function error_of(name) {
		let error = errors.get(name)
		if (!error) {
			error = Error("E:" + name)
			errors.set(name, error)
		}
		return error
	}
	/**
	 * @param {FuzzSpec} spec
	 * @returns {FuzzTimed}
	 */
	function expect(spec) {
		switch (spec.k) {
		case "buffer":
			return expect_buffer(expect(spec.child), spec.ms)
		case "chan":
		case "src":
			return expect_source(spec, 0, "")
		case "debounce":
			return expect_debounce(expect(spec.child), spec.ms)
		case "latest":
			return expect_latest(expect(spec.child), spec.inner)
		case "merge":
			return expect_merge(spec.children.map(expect))
		case "share":
			return expect(spec.child)
		case "throttle":
			return expect_throttle(expect(spec.child), spec.ms)
		case "until":
			return expect_until(
				expect(spec.child),
				expect_source(spec.stop, 0, "")
			)
		}
	}
	/**
	 * @param {FuzzTimed} source
	 * @param {number} ms
	 * @returns {FuzzTimed}
	 */
	function expect_buffer(source, ms) {
		/** @type {FuzzEvent[]} */
		const events = []
		/** @type {unknown[]} */
		let batch = []
		/** @type {number | undefined} */
		let due
		for (const event of source.events) {
			if (due === event.t) tie = true
			if (due !== void 0 && due <= event.t) {
				events.push({ t: due, v: batch })
				batch = []
				due = void 0
			}
			batch.push(event.v)
			due ??= event.t + ms
		}
		if (due !== void 0 && due <= source.end.t) {
			events.push({ t: due, v: batch })
			batch = []
		}
		if (source.end.kind != "never" && batch.length) events.push({ t: source.end.t, v: batch })
		return { end: source.end, events }
	}
	/**
	 * @param {FuzzTimed} source
	 * @param {number} ms
	 * @returns {FuzzTimed}
	 */
	function expect_debounce(source, ms) {
		/** @type {FuzzEvent[]} */
		const events = []
		/** @type {FuzzEvent | undefined} */
		let held
		for (const event of source.events) {
			if (held && held.t + ms == event.t) tie = true
			if (held && held.t + ms <= event.t) events.push({ t: held.t + ms, v: held.v })
			held = event
		}
		if (held && held.t + ms <= source.end.t) {
			events.push({ t: held.t + ms, v: held.v })
			held = void 0
		}
		if (source.end.kind != "never" && held) events.push({ t: source.end.t, v: held.v })
		return { end: source.end, events }
	}
	/**
	 * @param {FuzzInner} inner
	 * @param {number} start
	 * @param {number} count
	 * @returns {FuzzTimed}
	 */
	function expect_inner(inner, start, count) {
		const tag = "#" + count
		switch (inner.k) {
		case "iop": {
			const source = expect_source(inner.src, start, tag)
			return inner.op == "buffer"
				? expect_buffer(source, inner.ms)
				: inner.op == "debounce"
					? expect_debounce(source, inner.ms)
					: expect_throttle(source, inner.ms)
		}
		case "isrc":
			return expect_source(inner.src, start, tag)
		case "promise":
			return inner.fail
				? {
					end: {
						error: error_of(inner.name + tag),
						kind: "error",
						t: start + inner.dt
					},
					events: []
				}
				: {
					end: { kind: "end", t: start + inner.dt },
					events: [
						{
							t: start + inner.dt,
							v: `${inner.name}${tag}:0`
						}
					]
				}
		case "value":
			return {
				end: { kind: "end", t: start },
				events: [
					{
						t: start,
						v: `${inner.name}${tag}:0`
					}
				]
			}
		}
	}
	/**
	 * @param {FuzzTimed} outer
	 * @param {FuzzInner} inner
	 * @returns {FuzzTimed}
	 */
	function expect_latest(outer, inner) {
		const outer_error = outer.end.kind == "error" ? outer.end : void 0
		/** @type {FuzzEvent[]} */
		let events = []
		/** @type {FuzzEnd | undefined} */
		let failure = outer_error
		/** @type {FuzzEnd | undefined} */
		let last
		for (const [ count, value ] of outer.events.entries()) {
			const stop = Math.min(
				outer.events[count + 1]?.t ?? Infinity,
				outer_error?.t ?? Infinity
			)
			const run = expect_inner(inner, value.t, count)
			if (run.events.some(event => event.t == stop) || run.end.t == stop) tie = true
			events.push(
				...run.events.filter(event => event.t < stop)
			)
			if (run.end.kind == "error" && run.end.t < stop && (!failure || run.end.t < failure.t)) failure = run.end
			if (count == outer.events.length - 1) last = run.end
		}
		events.sort((a, b) => a.t - b.t)
		if (failure) {
			const at = failure.t
			events = events.filter(event => event.t <= at)
			return { end: failure, events }
		}
		if (outer.end.kind == "never") return {
			end: { kind: "never", t: Infinity },
			events
		}
		if (!last) return { end: outer.end, events }
		if (last.kind == "never") return { end: last, events }
		return {
			end: {
				kind: "end",
				t: Math.max(outer.end.t, last.t)
			},
			events
		}
	}
	/**
	 * @param {FuzzTimed[]} sources
	 * @returns {FuzzTimed}
	 */
	function expect_merge(sources) {
		/** @type {Map<number, number>} */
		const owners = new Map()
		for (const [ index, source ] of sources.entries()) {
			const times = source.events.map(event => event.t)
			if (source.end.kind == "error") times.push(source.end.t)
			for (const t of times) {
				const owner = owners.get(t)
				if (owner !== void 0 && owner != index) tie = true
				owners.set(t, index)
			}
		}
		/** @type {FuzzEnd | undefined} */
		let failure
		for (const source of sources) {
			if (source.end.kind == "error" && (!failure || source.end.t < failure.t)) failure = source.end
		}
		const events = sources.flatMap(source => source.events)
			.filter(
				event => !failure || event.t <= failure.t
			)
			.sort((a, b) => a.t - b.t)
		if (failure) return { end: failure, events }
		if (sources.some(
			source => source.end.kind == "never"
		)) return {
			end: { kind: "never", t: Infinity },
			events
		}
		return {
			end: {
				kind: "end",
				t: Math.max(
					...sources.map(source => source.end.t)
				)
			},
			events
		}
	}
	/**
	 * @param {FuzzSource} spec
	 * @param {number} start
	 * @param {string} tag
	 * @returns {FuzzTimed}
	 */
	function expect_source(spec, start, tag) {
		const times = cumulate(spec.gaps)
		const at = start + (times.at(-1) ?? 0) + spec.term.dt
		return {
			end: spec.term.kind == "never"
				? { kind: "never", t: Infinity }
				: spec.term.kind == "end"
					? { kind: "end", t: at }
					: {
						error: error_of(spec.name + tag),
						kind: "error",
						t: at
					},
			events: times.map(
				(t, index) => ({
					t: start + t,
					v: `${spec.name}${tag}:${index}`
				})
			)
		}
	}
	/**
	 * @param {FuzzTimed} source
	 * @param {number} ms
	 * @returns {FuzzTimed}
	 */
	function expect_throttle(source, ms) {
		/** @type {FuzzEvent[]} */
		const events = []
		/** @type {number | undefined} */
		let window
		/** @type {FuzzEvent | undefined} */
		let held
		/**
		 * @param {number} t
		 * @param {boolean} value
		 * @returns {void}
		 */
		function reach(t, value) {
			while (window !== void 0 && window <= t) {
				if (window == t && value) tie = true
				if (held) {
					events.push({ t: window, v: held.v })
					held = void 0
					window += ms
				} else window = void 0
			}
		}
		for (const event of source.events) {
			reach(event.t, true)
			if (window === void 0) {
				events.push(event)
				window = event.t + ms
			} else held = event
		}
		reach(source.end.t, false)
		if (source.end.kind != "never" && held) events.push({ t: source.end.t, v: held.v })
		return { end: source.end, events }
	}
	/**
	 * @param {FuzzTimed} source
	 * @param {FuzzTimed} stop
	 * @returns {FuzzTimed}
	 */
	function expect_until(source, stop) {
		const at = Math.min(
			stop.events[0]?.t ?? Infinity,
			stop.end.kind == "never" ? Infinity : stop.end.t
		)
		if (source.events.some(event => event.t == at) || source.end.t == at) tie = true
		const events = source.events.filter(event => event.t < at)
		if (source.end.kind != "never" && source.end.t < at) return { end: source.end, events }
		if (stop.end.kind == "error" && !stop.events.length) return { end: stop.end, events }
		if (at < Infinity) return {
			end: { kind: "end", t: at },
			events
		}
		return {
			end: { kind: "never", t: Infinity },
			events
		}
	}
	/**
	 * @returns {number}
	 */
	function gap() {
		return between(0, 30) + (random.chance(0.5) ? 0 : random.pick([ 0.25, 0.5, 0.75 ]))
	}
	/**
	 * @param {number} depth
	 * @returns {FuzzSpec}
	 */
	function generate(depth) {
		if (depth <= 0 || random.chance(0.25)) return generate_source(
			6,
			random.chance(0.3) ? "chan" : "src"
		)
		const k = random.pick(
			/** @type {const} */([
				"merge",
				"merge",
				"buffer",
				"debounce",
				"throttle",
				"until",
				"latest",
				"share"
			])/**/
		)
		switch (k) {
		case "buffer":
		case "debounce":
		case "throttle":
			return {
				child: generate(depth - 1),
				k,
				ms: between(1, 30)
			}
		case "latest":
			return {
				child: generate(depth - 1),
				inner: generate_inner(),
				k
			}
		case "merge":
			return {
				children: Array.from(
					{ length: between(2, 3) },
					() => generate(depth - 1)
				),
				k
			}
		case "share":
			return { child: generate(depth - 1), k }
		case "until":
			return {
				child: generate(depth - 1),
				k,
				stop: generate_source(1, "src")
			}
		}
	}
	/**
	 * @returns {FuzzInner}
	 */
	function generate_inner() {
		const roll = random.next()
		if (roll < 0.4) return {
			k: "isrc",
			src: generate_source(4, "src")
		}
		if (roll < 0.6) return {
			dt: gap(),
			fail: random.chance(0.2),
			k: "promise",
			name: `P${names++}`
		}
		if (roll < 0.7) return { k: "value", name: `V${names++}` }
		return {
			k: "iop",
			ms: between(1, 20),
			op: random.pick(
				/** @type {const} */([ "buffer", "debounce", "throttle" ])/**/
			),
			src: generate_source(4, "src")
		}
	}
	/**
	 * @param {number} most
	 * @param {"chan" | "src"} k
	 * @returns {FuzzSource}
	 */
	function generate_source(most, k) {
		const roll = random.next()
		return {
			gaps: Array.from(
				{ length: between(0, most) },
				() => k == "chan" ? gap() + 1 : gap()
			),
			k,
			name: `S${names++}`,
			term: {
				dt: between(1, 40) + random.pick([ 0, 0.25, 0.5 ]),
				kind: roll < 0.2
					? "error"
					: roll < 0.3
						? "never"
						: "end"
			}
		}
	}
	/**
	 * @param {FuzzSource} spec
	 * @returns {AsyncIterable<unknown>}
	 */
	function make_channel(spec) {
		const values = channel()
		const times = cumulate(spec.gaps)
		for (const [ index, at ] of times.entries()) {
			schedule(
				at,
				() => values.send(`${spec.name}:${index}`)
			)
		}
		if (spec.term.kind != "never") {
			schedule(
				(times.at(-1) ?? 0) + spec.term.dt,
				() => {
					if (spec.term.kind == "end") values.close()
					else values.fail(error_of(spec.name))
				}
			)
		}
		return values
	}
	/**
	 * @param {FuzzInner} inner
	 * @param {number} count
	 * @returns {unknown}
	 */
	function make_inner(inner, count) {
		const tag = "#" + count
		switch (inner.k) {
		case "iop": {
			const source = make_source(inner.src, tag)
			return inner.op == "buffer"
				? buffer(source, inner.ms)
				: inner.op == "debounce"
					? debounce(source, inner.ms)
					: throttle(source, inner.ms)
		}
		case "isrc":
			return make_source(inner.src, tag)
		case "promise":
			return new Promise(
				(resolve, reject) => {
					schedule(
						now() + inner.dt,
						() => inner.fail
							? reject(error_of(inner.name + tag))
							: resolve(`${inner.name}${tag}:0`)
					)
				}
			)
		case "value":
			return `${inner.name}${tag}:0`
		}
	}
	/**
	 * @param {FuzzSource} spec
	 * @param {string} tag
	 * @returns {AsyncIterable<unknown>}
	 */
	function make_source(spec, tag) {
		return {
			[Symbol.asyncIterator]() {
				const start = now()
				/** @type {FuzzLeaf} */
				const leaf = {
					finished: false,
					name: spec.name + tag,
					pending: false,
					returned: void 0
				}
				leaves.push(leaf)
				const times = cumulate(spec.gaps)
				const end_at = (times.at(-1) ?? 0) + spec.term.dt
				let index = 0
				/** @type {(() => void) | undefined} */
				let cancel
				/** @type {((step: IteratorResult<unknown>) => void) | undefined} */
				let settle
				return {
					next() {
						if (leaf.returned !== void 0 || leaf.finished) return Promise.resolve({ done: true, value: void 0 })
						if (leaf.pending) {
							problems.push(
								`concurrent next() on ${leaf.name}`
							)
							return Promise.reject(Error("concurrent next()"))
						}
						leaf.pending = true
						return new Promise(
							(resolve, reject) => {
								settle = resolve
								if (index < times.length) {
									const at = index
									index++
									cancel = schedule(
										start + /** @type {number} */(times[at])/**/,
										() => {
											leaf.pending = false
											settle = void 0
											resolve(
												{
													done: false,
													value: `${spec.name}${tag}:${at}`
												}
											)
										}
									)
								} else if (spec.term.kind != "never") {
									cancel = schedule(
										start + end_at,
										() => {
											leaf.pending = false
											leaf.finished = true
											settle = void 0
											if (spec.term.kind == "end") resolve({ done: true, value: void 0 })
											else reject(error_of(spec.name + tag))
										}
									)
								}
							}
						)
					},
					return() {
						if (leaf.returned === void 0) leaf.returned = now()
						cancel?.()
						if (settle) {
							leaf.pending = false
							settle({ done: true, value: void 0 })
							settle = void 0
						}
						return Promise.resolve({ done: true, value: void 0 })
					}
				}
			}
		}
	}
	/**
	 * @returns {number}
	 */
	function now() {
		return time() - base
	}
	/**
	 * @param {number} at
	 * @param {() => void} fn
	 * @returns {() => void}
	 */
	function schedule(at, fn) {
		const timer = setTimeout(fn, Math.max(0, at - now()))
		timers.push(timer)
		return () => clearTimeout(timer)
	}
	const mode = random.pick(
		/** @type {const} */([
			"fast",
			"fast",
			"fast",
			"slow",
			"share2"
		])/**/
	)
	const spec = generate(between(1, 4))
	const limit = random.chance(0.3) ? between(0, 5) : Infinity
	const slowest = between(1, 40)
	const stream = build(spec)
	const limits = mode == "share2" ? [ limit, Infinity ] : [ limit ]
	const source = mode == "share2" ? share(stream) : stream
	/** @type {FuzzLoop[]} */
	const loops = limits.map(
		() => ({
			end: { kind: "hang", t: NaN },
			events: [],
			forced: false,
			reader: void 0,
			throws: 0
		})
	)
	const running = loops.map(
		(loop, index) => consume(
			source,
			/** @type {number} */(limits[index])/**/,
			mode == "slow"
				? () => random.chance(0.5) ? between(0, slowest) + 0.5 : 0
				: () => 0,
			loop
		)
	)
	/** @type {boolean[]} */
	const settled = running.map(() => false)
	for (const [ index, promise ] of running.entries()) {
		promise.then(
			() => {
				settled[index] = true
			}
		)
	}
	for (let step = 0; step < 50 && settled.includes(false); step++) await advance(100)
	for (const loop of loops) {
		if (loop.end.kind != "hang") continue
		loop.forced = true
		loop.end = { kind: "hang", t: now() }
		await loop.reader?.return?.()
	}
	await advance(1)
	if (settled.includes(false)) problems.push(
		"a pending next() did not settle after return()"
	)
	const ended = Math.max(
		...loops.map(loop => loop.end.t)
	)
	for (const timer of timers) clearTimeout(timer)
	for (const [ index, loop ] of loops.entries()) {
		if (loop.throws > 1) problems.push(
			`loop ${index} threw ${loop.throws} times`
		)
		/** @type {Set<string>} */
		const seen = new Set()
		/** @type {Map<string, number>} */
		const last = new Map()
		for (const event of loop.events) {
			for (const value of flatten(event.v)) {
				if (seen.has(value)) problems.push(
					`loop ${index} got ${value} twice`
				)
				seen.add(value)
				const [ leaf, position ] = value.split(":")
				const before = last.get(String(leaf)) ?? -1
				if (Number(position) <= before) problems.push(
					`loop ${index} got ${value} after position ${before}`
				)
				last.set(String(leaf), Number(position))
			}
		}
		if (loop.end.kind == "error" && ![ ...errors.values() ].includes(
			/** @type {Error} */(loop.end.error)/**/
		)) problems.push(
			`loop ${index} failed with ${String(loop.end.error)}`
		)
	}
	for (const leaf of leaves) {
		if (!leaf.finished && (leaf.returned === void 0 || leaf.returned > ended)) problems.push(
			`${leaf.name} was released at ${leaf.returned} after the loops ended at ${ended}`
		)
	}
	if (pending_timers()) problems.push(
		`${pending_timers()} timers left`
	)
	if (unhandled.length > unhandled_before) problems.push(
		"unhandled rejections: " + unhandled.slice(unhandled_before).map(String)
			.join("; ")
	)
	tie = false
	const expected = expect(spec)
	if (mode != "slow" && !tie) {
		for (const [ index, loop ] of loops.entries()) {
			const most = /** @type {number} */(limits[index])/**/
			const wanted = format(
				expected.events.slice(0, most + 1)
			)
			const got = format(loop.events)
			if (wanted != got) {
				problems.push(
					`loop ${index} values differ`,
					`  expected ${wanted} | ${expected.end.kind}@${expected.end.t}`,
					`  got      ${got} | ${loop.end.kind}@${loop.end.t}`
				)
			} else if (most >= expected.events.length) {
				const kind = expected.end.kind == "never" ? "hang" : expected.end.kind
				if (kind != loop.end.kind) problems.push(
					`loop ${index} ended with ${loop.end.kind}@${loop.end.t}, expected ${kind}@${expected.end.t}`
				)
				else if (kind != "hang" && expected.end.t != loop.end.t) problems.push(
					`loop ${index} ended at ${loop.end.t}, expected ${expected.end.t}`
				)
				else if (kind == "error" && expected.end.error !== loop.end.error) problems.push(
					`loop ${index} failed with ${String(loop.end.error)}, expected ${String(expected.end.error)}`
				)
			}
		}
	}
	return problems.length
		? [
			`mode ${mode} limit ${limit}`,
			show(spec),
			...problems
		]
		: []
}
/**
 * @param {FuzzSpec} spec
 * @returns {string}
 */
function show(spec) {
	switch (spec.k) {
	case "buffer":
	case "debounce":
	case "throttle":
		return `${spec.k}(${show(spec.child)}, ${spec.ms})`
	case "chan":
	case "src":
		return `${spec.k}(${spec.name}: ${cumulate(spec.gaps).join(",")} | ${spec.term.kind} +${spec.term.dt})`
	case "latest":
		return `latest(${show(spec.child)}, ${JSON.stringify(spec.inner)})`
	case "merge":
		return `merge(${spec.children.map(show).join(", ")})`
	case "share":
		return `share(${show(spec.child)})`
	case "until":
		return `until(${show(spec.child)}, ${show(spec.stop)})`
	}
}
describe(
	"stream fuzz",
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
			"random pipelines match their reference",
			async () => {
				/** @type {string[]} */
				const failures = []
				for (const seed of sim_seeds("stream", 1000)) {
					const problems = await within(
						`SIM_MODE=stream SIM_SEED=${seed}`,
						fuzz_stream(seed, unhandled)
					)
					if (problems.length) failures.push(
						[
							`SIM_MODE=stream SIM_SEED=${seed}`,
							...problems
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
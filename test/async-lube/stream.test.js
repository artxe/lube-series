import {
	buffer,
	channel,
	debounce,
	every,
	latest,
	merge,
	share,
	throttle,
	until
} from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"stream",
	() => {
		/**
		 * @template T
		 * @param {AsyncIterable<T>} source
		 * @returns {Promise<T[]>}
		 */
		async function collect(source) {
			/** @type {T[]} */
			const values = []
			for await (const value of source) values.push(value)
			return values
		}
		/**
		 * @returns {Promise<void>}
		 */
		function settle() {
			return new Promise(
				resolve => setTimeout(resolve, 0)
			)
		}
		/**
		 * @param {number} ms
		 * @returns {Promise<void>}
		 */
		function sleep(ms) {
			return new Promise(
				resolve => setTimeout(resolve, ms)
			)
		}
		/**
		 * @template T
		 * @param {import("async-lube").Channel<T>} source
		 * @returns {{ readonly released: boolean, stream: AsyncIterableIterator<T> }}
		 */
		function tracked(source) {
			const reader = source[Symbol.asyncIterator]()
			let released = false
			/** @type {AsyncIterableIterator<T>} */
			const stream = {
				[Symbol.asyncIterator]() {
					return stream
				},
				next: () => reader.next(),
				async return() {
					released = true
					await reader.return?.()
					return { done: true, value: void 0 }
				}
			}
			return {
				get released() {
					return released
				},
				stream
			}
		}
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"buffer",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const values = channel()
				const batches = collect(buffer(values, 20))
				await settle()
				values.send(1)
				values.send(2)
				await sleep(60)
				values.send(3)
				await settle()
				values.close()
				assert.deepEqual(
					await batches,
					[ [ 1, 2 ], [ 3 ] ]
				)
				const empty = channel()
				const none = collect(buffer(empty, 5))
				await settle()
				empty.close()
				assert.deepEqual(await none, [])
			}
		)
		it(
			"channel",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const values = channel()
				/** @type {number[]} */
				const first = []
				/** @type {number[]} */
				const second = []
				const loops = Promise.all(
					[
						(async () => {
							for await (const value of values) first.push(value)
						})(),
						(async () => {
							for await (const value of values) second.push(value)
						})()
					]
				)
				await settle()
				values.send(1)
				values.send(2)
				await settle()
				values.close()
				await loops
				assert.deepEqual(first, [ 1, 2 ])
				assert.deepEqual(second, [ 1, 2 ])
				assert.isTrue(values.closed)
				const failing = channel()
				const rejected = collect(failing)
				await settle()
				failing.fail(Error("broken"))
				assert.equal(
					await rejected.then(
						() => "",
						(/** @type {Error} */ error) => error.message
					),
					"broken"
				)
				const controller = new AbortController()
				const aborted = channel({ signal: controller.signal })
				const ending = collect(aborted)
				await settle()
				controller.abort()
				assert.deepEqual(await ending, [])
				assert.deepEqual(
					await collect(
						channel(
							{ signal: AbortSignal.abort() }
						)
					),
					[]
				)
			}
		)
		it(
			"channel initial",
			async () => {
				const model = channel({ initial: "small" })
				const first = model[Symbol.asyncIterator]()
				assert.deepEqual(
					await first.next(),
					{ done: false, value: "small" }
				)
				model.send("large")
				assert.deepEqual(
					await first.next(),
					{ done: false, value: "large" }
				)
				const second = model[Symbol.asyncIterator]()
				assert.deepEqual(
					await second.next(),
					{ done: false, value: "large" }
				)
				const empty = channel({ initial: void 0 })
				assert.deepEqual(
					await empty[Symbol.asyncIterator]().next(),
					{ done: false, value: void 0 }
				)
				const limited = channel({ initial: 0, limit: 1 })
				const late = limited[Symbol.asyncIterator]()
				limited.send(1)
				assert.deepEqual(
					await late.next(),
					{ done: false, value: 1 }
				)
				model.close()
				assert.deepEqual(await collect(model), [])
				assert.deepEqual(
					await first.next(),
					{ done: true, value: void 0 }
				)
				const stale = limited[Symbol.asyncIterator]()
				limited.fail(Error("gone"))
				await stale.next()
					.then(
						() => assert.fail("No error occurred"),
						error => assert.equal(error.message, "gone")
					)
				await first.return?.()
				await second.return?.()
				await late.return?.()
			}
		)
		it(
			"channel limit",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const values = channel({ limit: 2 })
				const seen = collect(values)
				await settle()
				for (const value of [ 1, 2, 3, 4 ]) values.send(value)
				values.close()
				assert.deepEqual(await seen, [ 3, 4 ])
			}
		)
		it(
			"debounce",
			async () => {
				/** @type {import("async-lube").Channel<string>} */
				const keys = channel()
				const settled = collect(debounce(keys, 20))
				await settle()
				keys.send("a")
				keys.send("ab")
				keys.send("abc")
				await sleep(60)
				keys.send("x")
				await settle()
				keys.close()
				assert.deepEqual(await settled, [ "abc", "x" ])
			}
		)
		it(
			"held values before a failure",
			async () => {
				for (const [ wrap, expected ] of /** @type {[(source: AsyncIterable<number>) => AsyncIterable<unknown>, unknown[]][]} */([
					[
						source => buffer(source, 100),
						[ [ 1, 2, 3 ] ]
					],
					[
						source => debounce(source, 100),
						[ 3 ]
					],
					[
						source => throttle(source, 100),
						[ 1, 3 ]
					]
				])/**/) {
					/** @type {import("async-lube").Channel<number>} */
					const source = channel()
					const stream = wrap(source)[Symbol.asyncIterator]()
					/** @type {unknown[]} */
					const received = []
					const loop = (async () => {
						for (;;) {
							const step = await stream.next()
							if (step.done) return
							received.push(step.value)
						}
					})()
					await settle()
					source.send(1)
					source.send(2)
					source.send(3)
					await sleep(10)
					source.fail(Error("dropped"))
					const error = await loop.then(
						() => assert.fail("No error occurred"),
						(/** @type {unknown} */ reason) => reason
					)
					assert.equal(
						/** @type {Error} */(error)/**/.message,
						"dropped"
					)
					assert.deepEqual(received, expected)
					assert.deepEqual(
						await stream.next(),
						{ done: true, value: void 0 }
					)
				}
				/** @type {import("async-lube").Channel<number>} */
				const left = channel()
				const held = buffer(left, 100)
				const first = held.next()
				await settle()
				left.send(1)
				await settle()
				left.fail(Error("dropped"))
				assert.deepEqual(
					await first,
					{ done: false, value: [ 1 ] }
				)
				await held.return?.()
				assert.deepEqual(
					await held.next(),
					{ done: true, value: void 0 }
				)
			}
		)
		it(
			"late source failures",
			async () => {
				/**
				 * @returns {AsyncIterable<number>}
				 */
				function failing_later() {
					let calls = 0
					return {
						[Symbol.asyncIterator]: () => ({
							next: () => ++calls == 1
								? Promise.resolve({ done: false, value: 1 })
								: new Promise(
									(_, reject) => setTimeout(() => reject(Error("late")), 20)
								),
							return: async () => ({ done: true, value: void 0 })
						})
					}
				}
				/** @type {unknown[]} */
				const unhandled = []
				/**
				 * @param {unknown} reason
				 * @returns {void}
				 */
				function listener(reason) {
					unhandled.push(reason)
				}
				process.on("unhandledRejection", listener)
				try {
					for (const read of [
						() => merge(failing_later()),
						() => throttle(failing_later(), 5),
						() => debounce(failing_later(), 5),
						() => buffer(failing_later(), 5),
						() => until(failing_later(), channel()),
						() => latest(failing_later(), value => value)
					]) {
						for await (const value of read()) {
							void value
							break
						}
					}
					await sleep(60)
				} finally {
					process.off("unhandledRejection", listener)
				}
				assert.deepEqual(unhandled, [])
			}
		)
		it(
			"latest",
			async () => {
				/** @type {string[]} */
				const closed = []
				/** @type {import("async-lube").Channel<string>} */
				const queries = channel()
				/** @type {import("async-lube").Channel<string>[]} */
				const inners = []
				const results = collect(
					latest(
						queries,
						query => {
							const inner = channel()
							inners.push(inner)
							const reader = inner[Symbol.asyncIterator]()
							/** @type {AsyncIterableIterator<string>} */
							const stream = {
								[Symbol.asyncIterator]() {
									return stream
								},
								async next() {
									const step = await reader.next()
									return step.done
										? { done: true, value: void 0 }
										: {
											done: false,
											value: query + step.value
										}
								},
								async return() {
									closed.push(query)
									await reader.return?.()
									return { done: true, value: void 0 }
								}
							}
							return stream
						}
					)
				)
				await settle()
				queries.send("a")
				await settle()
				inners[0]?.send("1")
				await settle()
				queries.send("b")
				await settle()
				inners[1]?.send("1")
				inners[1]?.send("2")
				await settle()
				queries.close()
				await settle()
				inners[1]?.send("3")
				await settle()
				inners[1]?.close()
				assert.deepEqual(
					await results,
					[ "a1", "b1", "b2", "b3" ]
				)
				assert.deepEqual(closed, [ "a" ])
			}
		)
		it(
			"latest cancels what it leaves",
			async () => {
				/** @type {string[]} */
				let cancelled = []
				/**
				 * @param {string} line
				 * @returns {AsyncIterable<string> & { cancel: () => void }}
				 */
				function watch(line) {
					/** @type {import("async-lube").Channel<string>} */
					const messages = channel()
					return {
						[Symbol.asyncIterator]: () => messages[Symbol.asyncIterator](),
						cancel() {
							cancelled.push(line)
							messages.close()
						}
					}
				}
				/** @type {((line: string) => unknown)[]} */
				const starts = [
					watch,
					async line => watch(line),
					line => Object.assign(
						new Promise(() => {}),
						{
							cancel() {
								cancelled.push(line)
								return Promise.reject(Error("not cancelled"))
							}
						}
					)
				]
				for (const start of starts) {
					cancelled = []
					/** @type {import("async-lube").Channel<string>} */
					const lines = channel()
					const reader = latest(lines, start)[Symbol.asyncIterator]()
					const pending = reader.next()
					await settle()
					lines.send("a")
					await settle()
					lines.send("b")
					await settle()
					assert.deepEqual(cancelled, [ "a" ])
					await reader.return?.()
					assert.deepEqual(
						await pending,
						{ done: true, value: void 0 }
					)
					assert.deepEqual(cancelled, [ "a", "b" ])
				}
			}
		)
		it(
			"latest requests",
			async () => {
				/** @type {import("async-lube").Channel<string>} */
				const typed = channel()
				/** @type {string[]} */
				const cancelled = []
				/**
				 * @param {string} q
				 * @param {AbortSignal} signal
				 * @returns {Promise<string>}
				 */
				function search(q, signal) {
					return new Promise(
						(resolve, reject) => {
							const timer = setTimeout(
								() => resolve(q.toUpperCase()),
								30
							)
							signal.addEventListener(
								"abort",
								() => {
									clearTimeout(timer)
									cancelled.push(q)
									reject(signal.reason)
								}
							)
						}
					)
				}
				const shown = collect(latest(typed, search))
				await settle()
				typed.send("a")
				await sleep(10)
				typed.send("ab")
				await sleep(60)
				typed.send("abc")
				await sleep(60)
				typed.close()
				assert.deepEqual(await shown, [ "AB", "ABC" ])
				assert.deepEqual(cancelled, [ "a" ])
				/** @type {import("async-lube").Channel<number>} */
				const numbers = channel()
				const doubled = collect(
					latest(numbers, value => value * 2)
				)
				await settle()
				numbers.send(1)
				await settle()
				numbers.send(2)
				await settle()
				numbers.close()
				assert.deepEqual(await doubled, [ 2, 4 ])
				/** @type {import("async-lube").Channel<number>} */
				const broken = channel()
				const failing = collect(
					latest(
						broken,
						async () => {
							throw Error("search failed")
						}
					)
				)
					.then(
						() => "no error",
						error => error.message
					)
				await settle()
				broken.send(1)
				assert.equal(await failing, "search failed")
			}
		)
		it(
			"latest streamed answers",
			async () => {
				/** @type {import("async-lube").Channel<string>} */
				const questions = channel()
				/** @type {import("async-lube").Channel<string>} */
				const first = channel()
				/** @type {import("async-lube").Channel<string>} */
				const second = channel()
				const answer_a = tracked(first)
				const answer_b = tracked(second)
				/** @type {AbortSignal[]} */
				const signals = []
				const shown = collect(
					latest(
						questions,
						async (q, signal) => {
							signals.push(signal)
							await settle()
							return q == "a" ? answer_a.stream : answer_b.stream
						}
					)
				)
				await settle()
				questions.send("a")
				await sleep(20)
				first.send("a1")
				await settle()
				first.send("a2")
				await settle()
				questions.send("b")
				await sleep(20)
				assert.isTrue(signals[0]?.aborted)
				assert.isTrue(answer_a.released)
				first.send("a3")
				second.send("b1")
				await settle()
				questions.close()
				second.send("b2")
				await settle()
				second.close()
				assert.deepEqual(
					await shown,
					[ "a1", "a2", "b1", "b2" ]
				)
				/** @type {import("async-lube").Channel<number>} */
				const late = channel()
				const unread = tracked(channel())
				const reader = latest(
					late,
					async () => {
						await sleep(20)
						return unread.stream
					}
				)[Symbol.asyncIterator]()
				const pending = reader.next()
				await settle()
				late.send(1)
				await settle()
				await reader.return?.()
				assert.deepEqual(
					await pending,
					{ done: true, value: void 0 }
				)
				await sleep(40)
				assert.isTrue(unread.released)
			}
		)
		it(
			"merge",
			async () => {
				/** @type {import("async-lube").Channel<string>} */
				const a = channel()
				/** @type {import("async-lube").Channel<string>} */
				const b = channel()
				const merged = collect(merge(a, b))
				await settle()
				a.send("a1")
				await settle()
				b.send("b1")
				await settle()
				a.send("a2")
				await settle()
				a.close()
				b.send("b2")
				await settle()
				b.close()
				assert.deepEqual(
					await merged,
					[ "a1", "b1", "a2", "b2" ]
				)
				/** @type {import("async-lube").Channel<string>} */
				const kept = channel()
				/** @type {import("async-lube").Channel<string>} */
				const broken = channel()
				const source = tracked(kept)
				const failed = collect(merge(source.stream, broken))
				await settle()
				broken.fail(Error("source failed"))
				assert.equal(
					await failed.then(
						() => "",
						(/** @type {Error} */ error) => error.message
					),
					"source failed"
				)
				assert.isTrue(source.released)
			}
		)
		it(
			"merge fairness",
			async () => {
				/**
				 * @param {string} tag
				 * @returns {AsyncGenerator<string>}
				 */
				async function* busy(tag) {
					for (let i = 0; ; i++) yield `${tag}${i}`
				}
				/** @returns {AsyncGenerator<string>} */
				async function* once() {
					yield "third"
				}
				/** @type {string[]} */
				const seen = []
				for await (const value of merge(busy("a"), busy("b"), once())) {
					seen.push(value)
					if (seen.length == 30) break
				}
				assert.include(seen, "third")
				/** @type {import("async-lube").Channel<string>[]} */
				const rooms = [ channel(), channel(), channel() ]
				const merged = collect(merge(...rooms))
				await settle()
				for (let i = 0; i < 2; i++) {
					for (const [ n, room ] of rooms.entries()) room.send(`${n}-${i}`)
				}
				await settle()
				for (const room of rooms) room.close()
				assert.deepEqual(
					await merged,
					[ "0-0", "1-0", "2-0", "0-1", "1-1", "2-1" ]
				)
			}
		)
		it(
			"nested streams",
			async () => {
				/** @type {[string, (source: AsyncIterable<number>) => AsyncIterable<unknown>][]} */
				const cases = [
					[
						"until merge",
						source => until(merge(source), channel())
					],
					[
						"share debounce",
						source => share(debounce(source, 5))
					],
					[
						"latest buffer",
						source => latest(
							buffer(source, 5),
							value => value
						)
					],
					[
						"merge throttle",
						source => merge(throttle(source, 5))
					],
					[
						"until latest",
						source => until(
							latest(source, value => value),
							channel()
						)
					],
					[
						"merge until",
						source => merge(until(source, channel()))
					],
					[
						"merge merge",
						source => merge(merge(source))
					]
				]
				for (const [ name, build ] of cases) {
					/** @type {import("async-lube").Channel<number>} */
					const values = channel()
					const source = tracked(values)
					const loop = (async () => {
						for await (const value of build(source.stream)) {
							void value
							break
						}
					})()
					await settle()
					values.send(1)
					await loop
					await settle()
					assert.isTrue(source.released, name)
				}
			}
		)
		it(
			"operators restart",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const values = channel()
				/** @type {import("async-lube").Channel<number>} */
				const others = channel()
				/**
				 * @param {AsyncIterable<unknown>} stream
				 * @returns {Promise<unknown>}
				 */
				async function first(stream) {
					const loop = (async () => {
						for await (const value of stream) return value
						return "ended"
					})()
					await settle()
					values.send(1)
					return loop
				}
				/** @type {[AsyncIterable<unknown>, unknown][]} */
				const cases = [
					[ merge(values, others), 1 ],
					[ buffer(values, 5), [ 1 ] ],
					[ debounce(values, 5), 1 ],
					[ throttle(values, 5), 1 ],
					[ until(values, others), 1 ],
					[
						latest(values, value => value * 2),
						2
					],
					[ share(merge(values, others)), 1 ],
					[ share(throttle(values, 5)), 1 ]
				]
				for (const [ stream, expected ] of cases) {
					assert.deepEqual(await first(stream), expected)
					assert.deepEqual(await first(stream), expected)
				}
			}
		)
		it(
			"options",
			() => {
				for (const [ build, message ] of /** @type {[() => unknown, string][]} */([
					[
						() => channel(
							/** @type {never} */({ limt: 1 })/**/
						),
						"Unknown channel option \"limt\""
					],
					[
						() => channel({ limit: 0 }),
						"The limit of channel() must be a positive integer or Infinity"
					],
					[
						() => channel({ limit: 1.5 }),
						"The limit of channel() must be a positive integer or Infinity"
					],
					[
						() => share(
							channel(),
							/** @type {never} */({ limt: 1 })/**/
						),
						"Unknown share option \"limt\""
					],
					[
						() => share(channel(), { limit: -1 }),
						"The limit of share() must be a positive integer or Infinity"
					],
					[
						() => every(
							10,
							/** @type {never} */({ immediately: true })/**/
						),
						"Unknown every option \"immediately\""
					],
					[
						() => buffer(channel(), -1),
						"buffer() needs a non-negative number of milliseconds"
					],
					[
						() => debounce(channel(), Number.NaN),
						"debounce() needs a non-negative number of milliseconds"
					],
					[
						() => throttle(
							channel(),
							/** @type {never} */("10")/**/
						),
						"throttle() needs a non-negative number of milliseconds"
					]
				])/**/) assert.throws(build, TypeError, message)
				assert.doesNotThrow(
					() => [
						channel({ limit: Infinity }),
						share(channel(), { limit: 1 }),
						buffer(channel(), 0),
						debounce(channel(), 0),
						throttle(channel(), Infinity)
					]
				)
			}
		)
		it(
			"share",
			async () => {
				let reads = 0
				/** @type {import("async-lube").Channel<number>} */
				const values = channel()
				const source = (async function* () {
					for await (const value of values) {
						reads++
						yield value
					}
				})()
				const shared = share(source)
				/** @type {number[]} */
				const first = []
				/** @type {number[]} */
				const second = []
				const loops = Promise.all(
					[
						(async () => {
							for await (const value of shared) first.push(value)
						})(),
						(async () => {
							for await (const value of shared) second.push(value)
						})()
					]
				)
				await settle()
				values.send(1)
				values.send(2)
				await settle()
				values.close()
				await loops
				assert.deepEqual(first, [ 1, 2 ])
				assert.deepEqual(second, [ 1, 2 ])
				assert.equal(reads, 2)
			}
		)
		it(
			"share restarts",
			async () => {
				let starts = 0
				/** @type {AsyncIterable<number>} */
				const source = {
					[Symbol.asyncIterator]() {
						let done = false
						return {
							async next() {
								if (done) return { done: true, value: void 0 }
								done = true
								return { done: false, value: ++starts }
							}
						}
					}
				}
				const shared = share(source)
				assert.deepEqual(await collect(shared), [ 1 ])
				assert.deepEqual(await collect(shared), [ 2 ])
				let failures = 0
				const failing = share(
					/** @type {AsyncIterable<number>} */({
						[Symbol.asyncIterator]: () => ({
							next: () => Promise.reject(Error(`failed ${++failures}`))
						})
					})/**/
				)
				for (const expected of [ "failed 1", "failed 2" ]) {
					assert.equal(
						await collect(failing).then(
							() => "",
							(/** @type {Error} */ error) => error.message
						),
						expected
					)
				}
			}
		)
		it(
			"stream misuse",
			async () => {
				for (const build of [
					() => collect(
						merge(/** @type {never} */(7)/**/)
					),
					() => collect(
						until(
							/** @type {never} */([ 1 ])/**/,
							channel()
						)
					),
					() => collect(
						buffer(
							/** @type {never} */(null)/**/,
							1
						)
					)
				]) {
					assert.match(
						await build().then(
							() => "",
							(/** @type {Error} */ error) => error.message
						),
						/must be an async iterable/
					)
				}
			}
		)
		it(
			"throttle",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const moves = channel()
				const shown = collect(throttle(moves, 30))
				await settle()
				moves.send(1)
				moves.send(2)
				moves.send(3)
				await sleep(60)
				moves.send(4)
				await settle()
				moves.close()
				const values = await shown
				assert.equal(values[0], 1)
				assert.include(values, 3)
				assert.equal(values[values.length - 1], 4)
			}
		)
		it(
			"timers",
			async () => {
				vi.useFakeTimers()
				try {
					/** @type {import("async-lube").Channel<number>} */
					const typed = channel()
					const debounced = collect(debounce(typed, 5000))
					for (let i = 0; i < 100; i++) {
						typed.send(i)
						await vi.advanceTimersByTimeAsync(1)
					}
					assert.equal(vi.getTimerCount(), 1)
					typed.close()
					assert.deepEqual(await debounced, [ 99 ])
					assert.equal(vi.getTimerCount(), 0)
					/** @type {import("async-lube").Channel<number>} */
					const dropped = channel()
					const batches = collect(buffer(dropped, 5000))
					/** @type {import("async-lube").Channel<number>} */
					const moves = channel()
					const shown = collect(throttle(moves, 5000))
					await vi.advanceTimersByTimeAsync(1)
					dropped.send(1)
					moves.send(1)
					await vi.advanceTimersByTimeAsync(1)
					assert.equal(vi.getTimerCount(), 2)
					dropped.close()
					moves.close()
					assert.deepEqual(await batches, [ [ 1 ] ])
					assert.deepEqual(await shown, [ 1 ])
					assert.equal(vi.getTimerCount(), 0)
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"until",
			async () => {
				/** @type {import("async-lube").Channel<number>} */
				const values = channel()
				/** @type {import("async-lube").Channel<string>} */
				const stop = channel()
				const source = tracked(values)
				const seen = collect(until(source.stream, stop))
				await settle()
				values.send(1)
				await settle()
				values.send(2)
				await settle()
				stop.send("done")
				assert.deepEqual(await seen, [ 1, 2 ])
				assert.isTrue(source.released)
				/** @type {import("async-lube").Channel<number>} */
				const late = channel()
				/** @type {import("async-lube").Channel<string>} */
				const ended = channel()
				const none = collect(until(late, ended))
				await settle()
				ended.close()
				assert.deepEqual(await none, [])
				/** @type {import("async-lube").Channel<number>} */
				const running = channel()
				/** @type {import("async-lube").Channel<string>} */
				const broken = channel()
				const failing = collect(until(running, broken))
				await settle()
				running.send(1)
				await settle()
				const problem = Error("stop failed")
				broken.fail(problem)
				assert.equal(
					await failing.then(
						() => void 0,
						(/** @type {unknown} */ error) => error
					),
					problem
				)
			}
		)
		it(
			"windows end before a value at the same time",
			async () => {
				/**
				 * @param {number[]} times
				 * @returns {AsyncIterable<string>}
				 */
				function sensor(times) {
					return {
						[Symbol.asyncIterator]() {
							/** @type {((step: IteratorResult<string>) => void)[]} */
							const waiting = []
							/** @type {string[]} */
							const ready = []
							for (const [ index, time ] of times.entries()) {
								setTimeout(
									() => {
										const value = `v${index + 1}`
										const take = waiting.shift()
										if (take) take({ done: false, value })
										else ready.push(value)
									},
									time
								)
							}
							return {
								next: () => ready.length
									? Promise.resolve(
										{
											done: false,
											value: /** @type {string} */(ready.shift())/**/
										}
									)
									: new Promise(
										resolve => waiting.push(resolve)
									),
								return: async () => ({ done: true, value: void 0 })
							}
						}
					}
				}
				vi.setTimerTickMode("manual")
				const started = Date.now()
				/** @type {[AsyncIterable<unknown>, number][]} */
				const cases = [
					[
						throttle(sensor([ 10, 50, 110 ]), 100),
						3
					],
					[
						buffer(sensor([ 10, 50, 110 ]), 100),
						2
					],
					[
						debounce(sensor([ 10, 110 ]), 100),
						2
					]
				]
				const loops = cases.map(
					async ([ stream, count ]) => {
						/** @type {string[]} */
						const seen = []
						for await (const value of stream) {
							seen.push(
								`${value}@${Date.now() - started}`
							)
							if (seen.length == count) break
						}
						return seen
					}
				)
				for (let i = 0; i < 30; i++) {
					for (let j = 0; j < 50; j++) await Promise.resolve()
					vi.advanceTimersByTime(10)
				}
				assert.deepEqual(
					await Promise.all(loops),
					[
						[ "v1@10", "v2@110", "v3@210" ],
						[ "v1,v2@110", "v3@210" ],
						[ "v1@110", "v2@210" ]
					]
				)
			}
		)
	}
)
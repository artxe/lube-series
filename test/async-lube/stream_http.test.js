import {
	NetworkError,
	TimeoutError,
	channel,
	debounce,
	http,
	latest,
	merge,
	share,
	until
} from "async-lube"
import { getEventListeners } from "node:events"
import { createServer } from "node:http"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it,
	vi
} from "vitest"
describe(
	"stream http",
	() => {
		/** @type {Map<string, number>} */
		const hits = new Map()
		/** @type {Set<string>} */
		const closed = new Set()
		/** @type {Map<string, string>} */
		const last_event_ids = new Map()
		const server = createServer(
			(request, response) => {
				const url = new URL(
					/** @type {string} */(request.url)/**/,
					"http://localhost"
				)
				const key = url.searchParams.get("key") ?? url.pathname
				const count = (hits.get(key) ?? 0) + 1
				hits.set(key, count)
				request.on("close", () => closed.add(key))
				switch (url.pathname) {
				case "/drop":
					response.writeHead(
						200,
						{
							"Content-Type": "text/event-stream"
						}
					)
					response.flushHeaders()
					setTimeout(
						() => response.socket?.destroy(),
						5
					)
					return
				case "/events":
					response.writeHead(
						200,
						{
							"Content-Type": "text/event-stream"
						}
					)
					response.write(
						count == 1 ? "retry: 5\ndata: first\n\n" : ": quiet\n\n"
					)
					if (url.searchParams.has("end")) setTimeout(() => response.end(), 10)
					return
				case "/flap":
					response.writeHead(
						200,
						{
							"Content-Type": "text/event-stream"
						}
					)
					response.write("data: flap\n\n")
					setTimeout(
						() => response.socket?.destroy(),
						5
					)
					return
				case "/json":
					response.writeHead(
						200,
						{
							"Content-Type": "text/event-stream"
						}
					)
					last_event_ids.set(
						key,
						String(
							request.headers["last-event-id"]
						)
					)
					response.end(
						url.searchParams.has("bad")
							? "data: {\"n\":\"x\"}\n\n"
							: url.searchParams.has("poison")
								? count == 1
									? "id: 1\ndata: {\"n\":\"x\"}\n\n"
									: "data: {\"n\":2}\n\n"
								: "id: 1\ndata: {\"n\":1}\n\ndata: {\"n\":2}\n\n"
					)
					return
				case "/lines":
					response.writeHead(
						200,
						{
							"Content-Type": "application/x-ndjson"
						}
					)
					response.write("{\"n\":1}\n")
					if (url.searchParams.has("bad")) response.end("{oops\n")
					else if (url.searchParams.has("drop")) setTimeout(
						() => response.socket?.destroy(),
						5
					)
				}
			}
		)
		/** @type {string} */
		let base
		/**
		 * @param {string} key
		 * @returns {Promise<boolean>}
		 */
		async function closes(key) {
			const started = Date.now()
			while (!closed.has(key) && Date.now() - started < 2000) await sleep(5)
			return closed.has(key)
		}
		/**
		 * @param {() => boolean} condition
		 * @returns {Promise<void>}
		 */
		async function eventually(condition) {
			const started = Date.now()
			while (!condition()) {
				if (Date.now() - started > 2000) assert.fail("Timed out")
				await sleep(5)
			}
		}
		/**
		 * @param {PromiseLike<unknown>} promise
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
		 * @param {number} ms
		 * @returns {Promise<void>}
		 */
		function sleep(ms) {
			return new Promise(
				resolve => setTimeout(resolve, ms)
			)
		}
		afterAll(
			() => {
				server.closeAllConnections()
				server.close()
			}
		)
		beforeAll(
			async () => {
				await new Promise(
					resolve => server.listen(
						0,
						"127.0.0.1",
						() => resolve(void 0)
					)
				)
				const address = /** @type {import("node:net").AddressInfo} */(server.address())/**/
				base = `http://127.0.0.1:${address.port}`
			}
		)
		it(
			"closing at once",
			async () => {
				const api = http({ base })
				/** @type {[string, (key: string) => Promise<AsyncIterable<unknown>>][]} */
				const cases = [
					[
						"plain",
						async key => api.sse(
							"/events",
							{ key },
							{ reconnect: false }
						)
					],
					[
						"merge",
						async key => merge(
							api.sse(
								"/events",
								{ key },
								{ reconnect: false }
							)
						)
					],
					[
						"until",
						async key => until(
							api.sse(
								"/events",
								{ key },
								{ reconnect: false }
							),
							channel()
						)
					],
					[
						"share",
						async key => share(
							api.sse(
								"/events",
								{ key },
								{ reconnect: false }
							)
						)
					],
					[
						"latest",
						async key => latest(
							channel({ initial: 1 }),
							() => api.sse(
								"/events",
								{ key },
								{ reconnect: false }
							)
						)
					],
					[
						"until merge",
						async key => until(
							merge(
								api.sse(
									"/events",
									{ key },
									{ reconnect: false }
								)
							),
							channel()
						)
					],
					[
						"share debounce",
						async key => share(
							debounce(
								api.sse(
									"/events",
									{ key },
									{ reconnect: false }
								),
								5
							)
						)
					],
					[
						"ndjson",
						async key => merge(
							/** @type {AsyncIterable<unknown>} */(await api.get(
								"/lines",
								{ key },
								{ as: "ndjson" }
							))/**/
						)
					]
				]
				for (const [ key, open ] of cases) {
					for await (const value of await open(key)) {
						void value
						break
					}
					assert.isTrue(await closes(key), key)
				}
				const events = api.sse(
					"/events",
					{ end: "", key: "reconnect" }
				)
				for await (const event of merge(events)) {
					assert.equal(event.data, "first")
					break
				}
				await sleep(100)
				assert.equal(hits.get("reconnect"), 1)
			}
		)
		it(
			"failures while reading",
			async () => {
				/** @type {unknown[]} */
				const errors = []
				const api = http(
					{
						base,
						on: {
							error: error => void errors.push(error)
						}
					}
				)
				/**
				 * @param {AsyncIterable<unknown>} lines
				 * @returns {Promise<void>}
				 */
				async function read(lines) {
					for await (const line of lines) void line
				}
				const dropped = await rejection(
					read(
						/** @type {AsyncIterable<unknown>} */(await api.get(
							"/lines",
							{ drop: "" },
							{ as: "ndjson" }
						))/**/
					)
				)
				assert.instanceOf(dropped, NetworkError)
				const invalid = await rejection(
					read(
						/** @type {AsyncIterable<unknown>} */(await api.get(
							"/lines",
							{ bad: "" },
							{ as: "ndjson" }
						))/**/
					)
				)
				assert.instanceOf(invalid, SyntaxError)
				assert.deepEqual(errors, [ dropped, invalid ])
				errors.length = 0
				for await (const line of /** @type {AsyncIterable<unknown>} */(await api.get(
					"/lines",
					{ key: "left" },
					{ as: "ndjson" }
				))/**/) {
					void line
					break
				}
				assert.deepEqual(errors, [])
				const dropping = api.sse(
					"/drop",
					{},
					{
						reconnect: { count: 2, delay: () => 1 }
					}
				)
				const lost = await rejection(read(dropping))
				assert.instanceOf(lost, NetworkError)
				assert.lengthOf(errors, 3)
				for (const error of errors) assert.instanceOf(error, NetworkError)
				assert.equal(errors[2], lost)
				errors.length = 0
				const silent = api.sse(
					"/silent",
					{},
					{
						reconnect: { count: 1, delay: () => 1 },
						timeout: 20
					}
				)
				const timed_out = await rejection(read(silent))
				assert.instanceOf(timed_out, TimeoutError)
				assert.lengthOf(errors, 2)
				for (const error of errors) assert.instanceOf(error, TimeoutError)
				errors.length = 0
				vi.useFakeTimers()
				try {
					/** @type {ReadableStreamDefaultController<Uint8Array> | undefined} */
					let body
					const slow = http(
						{
							base,
							fetch: async () => new Response(
								new ReadableStream(
									{
										start: controller => {
											body = controller
										}
									}
								),
								{
									headers: {
										"Content-Type": "text/event-stream"
									}
								}
							),
							on: {
								error: error => void errors.push(error)
							}
						}
					)
					/** @type {string[]} */
					const received = []
					const reading = (async () => {
						for await (const event of slow.sse(
							"/late-event",
							{},
							{ reconnect: false, timeout: 20 }
						)) received.push(event.data)
					})()
					await vi.advanceTimersByTimeAsync(60)
					body?.enqueue(
						new TextEncoder().encode("data: late\n\n")
					)
					body?.close()
					await reading
					assert.deepEqual(received, [ "late" ])
					assert.deepEqual(errors, [])
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"flapping connections",
			async () => {
				const api = http({ base })
				/** @type {number[]} */
				const delays = []
				let received = 0
				const lost = await rejection(
					(async () => {
						for await (const event of api.sse(
							"/flap",
							{ key: "flap" },
							{
								reconnect: {
									count: 2,
									delay: failures => {
										delays.push(failures)
										return 1
									}
								}
							}
						)) received += event.data == "flap" ? 1 : 0
					})()
				)
				assert.instanceOf(lost, NetworkError)
				assert.equal(hits.get("flap"), 3)
				assert.equal(received, 3)
				assert.deepEqual(delays, [ 1, 2 ])
				vi.useFakeTimers({ toFake: [ "Date" ] })
				try {
					let stable = 0
					for await (const event of api.sse(
						"/flap",
						{ key: "stable" },
						{
							reconnect: { count: 1, delay: () => 1 }
						}
					)) {
						void event
						vi.setSystemTime(Date.now() + 5000)
						if (++stable == 4) break
					}
					assert.equal(stable, 4)
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"latest ndjson",
			async () => {
				const api = http({ base })
				for await (const line of latest(
					channel({ initial: 1 }),
					(_, signal) => api.get(
						"/lines",
						{ key: "latest-lines" },
						{
							as: "ndjson",
							parse: data => /** @type {{ n: number }} */(data)/**/,
							signal
						}
					)
				)) {
					assert.deepEqual(line, { n: 1 })
					break
				}
				assert.isTrue(await closes("latest-lines"))
			}
		)
		it(
			"parse",
			async () => {
				/** @type {unknown[]} */
				const reported = []
				const api = http(
					{
						base,
						on: {
							error: error => void reported.push(error)
						}
					}
				)
				/**
				 * @param {unknown} data
				 * @returns {number}
				 */
				function parse(data) {
					const n = /** @type {{ n: unknown }} */(data)/**/.n
					if (typeof n != "number") throw TypeError("Not a number")
					return n * 10
				}
				/** @type {unknown[]} */
				const values = []
				const events = api.sse(
					"/json",
					{ key: "json" },
					{
						as: "json",
						parse,
						reconnect: false
					}
				)
				for await (const event of events) values.push(event.data)
				assert.deepEqual(values, [ 10, 20 ])
				assert.equal(events.lastEventId, "1")
				const bad = api.sse(
					"/json",
					{ bad: "", key: "json-bad" },
					{ as: "json", parse }
				)
				const error = await rejection(
					(async () => {
						for await (const event of bad) void event
					})()
				)
				assert.instanceOf(error, TypeError)
				assert.equal(bad.status, "idle")
				assert.equal(hits.get("json-bad"), 1)
				assert.deepEqual(reported, [ error ])
				/** @type {unknown[]} */
				const awaited = []
				for await (const event of api.sse(
					"/json",
					{ key: "json-async" },
					{
						as: "json",
						parse: async data => {
							const n = parse(data)
							await sleep(n == 10 ? 20 : 0)
							return n
						},
						reconnect: false
					}
				)) awaited.push(event.data)
				assert.deepEqual(awaited, [ 10, 20 ])
				reported.length = 0
				const rejected = api.sse(
					"/json",
					{ bad: "", key: "json-async-bad" },
					{
						as: "json",
						parse: async data => {
							await sleep(1)
							return parse(data)
						}
					}
				)
				const async_error = await rejection(
					(async () => {
						for await (const event of rejected) void event
					})()
				)
				assert.instanceOf(async_error, TypeError)
				assert.equal(rejected.status, "idle")
				assert.equal(hits.get("json-async-bad"), 1)
				assert.deepEqual(reported, [ async_error ])
				const poison = api.sse(
					"/json",
					{ key: "json-poison", poison: "" },
					{ as: "json", parse }
				)
				/** @type {unknown[]} */
				const after = []
				assert.instanceOf(
					await rejection(
						(async () => {
							for await (const event of poison) after.push(event.data)
						})()
					),
					TypeError
				)
				assert.equal(poison.lastEventId, "1")
				for await (const event of poison) {
					after.push(event.data)
					break
				}
				assert.deepEqual(after, [ 20 ])
				assert.equal(
					last_event_ids.get("json-poison"),
					"1"
				)
			}
		)
		it(
			"signal",
			async () => {
				/** @type {string[]} */
				const statuses = []
				const api = http({ base })
				const controller = new AbortController()
				const events = api.sse(
					"/events",
					{ key: "signal" },
					{
						onStatus: status => void statuses.push(status),
						signal: controller.signal
					}
				)
				const reader = events[Symbol.asyncIterator]()
				assert.equal(
					(await reader.next()).value?.data,
					"first"
				)
				const pending = reader.next()
				controller.abort()
				assert.deepEqual(
					await pending,
					{ done: true, value: void 0 }
				)
				assert.equal(events.status, "closed")
				assert.deepEqual(
					statuses,
					[ "connecting", "open", "closed" ]
				)
				assert.isTrue(await closes("signal"))
				for await (const event of events) assert.fail(event.data)
				assert.equal(events.status, "closed")
				assert.equal(hits.get("signal"), 1)
				const idle = new AbortController()
				const later = api.sse(
					"/events",
					{ key: "signal-idle" },
					{
						onStatus: status => void statuses.push(status),
						signal: idle.signal
					}
				)
				statuses.length = 0
				idle.abort()
				assert.equal(later.status, "closed")
				assert.deepEqual(statuses, [ "closed" ])
				for await (const event of later) assert.fail(event.data)
				assert.deepEqual(statuses, [ "closed" ])
				assert.isUndefined(hits.get("signal-idle"))
				const ended = new AbortController()
				const left = api.sse(
					"/events",
					{ key: "signal-left" },
					{
						onStatus: status => void statuses.push(status),
						signal: ended.signal
					}
				)
				statuses.length = 0
				for await (const event of left) {
					void event
					break
				}
				assert.deepEqual(
					statuses,
					[ "connecting", "open", "idle" ]
				)
				ended.abort()
				assert.equal(left.status, "closed")
				assert.deepEqual(
					statuses,
					[
						"connecting",
						"open",
						"idle",
						"closed"
					]
				)
				const kept = new AbortController()
				const watched = api.sse(
					"/events",
					{ key: "signal-kept" },
					{
						onStatus: status => void status,
						signal: kept.signal
					}
				)
				assert.equal(
					getEventListeners(kept.signal, "abort").length,
					1
				)
				watched.cancel()
				assert.equal(
					getEventListeners(kept.signal, "abort").length,
					0
				)
				const aborted = api.sse(
					"/events",
					{ key: "signal-aborted" },
					{ signal: AbortSignal.abort() }
				)
				assert.equal(aborted.status, "closed")
				for await (const event of aborted) assert.fail(event.data)
				assert.isUndefined(hits.get("signal-aborted"))
			}
		)
		it(
			"status",
			async () => {
				/** @type {string[]} */
				const statuses = []
				const api = http({ base })
				const events = api.sse(
					"/events",
					{ end: "", key: "status" },
					{
						onStatus: status => void statuses.push(status)
					}
				)
				assert.equal(events.status, "idle")
				const reader = events[Symbol.asyncIterator]()
				assert.equal(
					(await reader.next()).value?.data,
					"first"
				)
				assert.deepEqual(
					statuses,
					[ "connecting", "open" ]
				)
				assert.equal(events.status, "open")
				const pending = reader.next()
				await eventually(
					() => statuses.filter(status => status == "open").length >= 2
				)
				assert.include(statuses.slice(2), "connecting")
				await reader.return?.()
				assert.deepEqual(
					await pending,
					{ done: true, value: void 0 }
				)
				await eventually(
					() => statuses.at(-1) == "idle"
				)
				assert.equal(events.status, "idle")
				statuses.length = 0
				const again = events[Symbol.asyncIterator]()
				const next = again.next()
				await sleep(20)
				events.cancel()
				await next
				await eventually(
					() => statuses.at(-1) == "closed"
				)
				assert.equal(events.status, "closed")
			}
		)
		it(
			"status at once",
			async () => {
				/** @type {string[]} */
				const statuses = []
				const api = http({ base })
				const events = api.sse(
					"/events",
					{ key: "status-break" },
					{
						onStatus: status => void statuses.push(status)
					}
				)
				for await (const event of events) {
					void event
					break
				}
				assert.equal(events.status, "idle")
				const again = events[Symbol.asyncIterator]()
				const pending = again.next()
				await eventually(() => events.status == "open")
				assert.deepEqual(
					statuses,
					[
						"connecting",
						"open",
						"idle",
						"connecting",
						"open"
					]
				)
				const newer = events[Symbol.asyncIterator]()
				const newer_next = newer.next()
				await sleep(40)
				await again.return?.()
				assert.equal(events.status, "open")
				assert.deepEqual(
					await pending,
					{ done: true, value: void 0 }
				)
				await eventually(() => events.status == "open")
				events.cancel()
				await newer.return?.()
				assert.deepEqual(
					await newer_next,
					{ done: true, value: void 0 }
				)
				assert.equal(events.status, "closed")
				assert.deepEqual(
					statuses.slice(5),
					[ "connecting", "open", "closed" ]
				)
				statuses.length = 0
				const cancelled = api.sse(
					"/events",
					{ key: "status-cancel" },
					{
						onStatus: status => void statuses.push(status)
					}
				)
				cancelled.cancel()
				for await (const event of cancelled) assert.fail(event.data)
				await sleep(10)
				assert.deepEqual(statuses, [ "closed" ])
				assert.equal(cancelled.status, "closed")
				assert.isFalse(hits.has("status-cancel"))
			}
		)
	}
)
/** @import { ConnectionStatus } from "async-lube" */
import { start_server } from "./server.js"
import {
	CancelError,
	NetworkError,
	SocketError,
	TimeoutError,
	channel,
	flow,
	http,
	latest
} from "async-lube"
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	describe,
	it,
	vi
} from "vitest"
describe(
	"http ws",
	() => {
		/** @type {Awaited<ReturnType<typeof start_server>>} */
		let server
		/** @type {ControlledSocket[]} */
		const sockets = []
		class ControlledSocket {
			binaryType = "blob"
			readyState = 0
			/** @type {((event: { code: number, reason: string }) => void) | null} */
			onclose = null
			/** @type {(() => void) | null} */
			onerror = null
			/** @type {((event: { data: unknown }) => void) | null} */
			onmessage = null
			/** @type {(() => void) | null} */
			onopen = null
			/** @type {unknown[]} */
			sent = []
			constructor() {
				sockets.push(this)
			}
			accept() {
				this.readyState = 1
				this.onopen?.()
			}
			close() {
				this.readyState = 3
			}
			/**
			 * @param {number} code
			 */
			drop(code) {
				this.readyState = 3
				this.onclose?.({ code, reason: "" })
			}
			/**
			 * @param {unknown} data
			 */
			send(data) {
				this.sent.push(data)
			}
		}
		/**
		 * @returns {(() => void)[]}
		 */
		function controlled() {
			sockets.length = 0
			/** @type {(() => void)[]} */
			const online = []
			vi.stubGlobal(
				"addEventListener",
				(
					/** @type {string} */ type,
					/** @type {() => void} */ listener
				) => {
					if (type == "online") online.push(listener)
				}
			)
			vi.stubGlobal(
				"removeEventListener",
				(
					/** @type {string} */ type,
					/** @type {() => void} */ listener
				) => {
					if (type == "online") online.splice(online.indexOf(listener), 1)
				}
			)
			return online
		}
		/**
		 * @param {import("async-lube").HttpConfig=} config
		 * @returns {import("async-lube").Http}
		 */
		function create(config) {
			return http(
				{ base: server.base, ...config }
			)
		}
		/**
		 * @param {AsyncIterable<unknown>} socket
		 * @returns {Promise<unknown>}
		 */
		async function failure(socket) {
			try {
				for await (const message of socket) void message
			} catch (error) {
				return error
			}
			return assert.fail("No error occurred")
		}
		/**
		 * @param {number} index
		 * @returns {ControlledSocket}
		 */
		function socket_at(index) {
			return /** @type {ControlledSocket} */(sockets[index])/**/
		}
		/**
		 * @param {AsyncIterable<unknown>} socket
		 * @param {number} count
		 * @returns {Promise<unknown[]>}
		 */
		async function take(socket, count) {
			/** @type {unknown[]} */
			const messages = []
			if (count) {
				for await (const message of socket) {
					messages.push(message)
					if (messages.length == count) break
				}
			}
			return messages
		}
		/**
		 * @param {() => boolean} condition
		 * @returns {Promise<void>}
		 */
		async function until(condition) {
			const started = Date.now()
			while (!condition()) {
				if (Date.now() - started > 2000) assert.fail("Timed out")
				await new Promise(
					resolve => setTimeout(resolve, 5)
				)
			}
		}
		afterAll(() => server.close())
		afterEach(() => vi.unstubAllGlobals())
		beforeAll(
			async () => {
				server = await start_server()
			}
		)
		it(
			"cancel",
			async () => {
				/** @type {ConnectionStatus[]} */
				const statuses = []
				const socket = create().ws(
					"/ws",
					{ key: "ws-cancel" },
					{
						onStatus: status => void statuses.push(status)
					}
				)
				assert.equal(socket.status, "idle")
				/** @type {unknown[]} */
				const received = []
				const reading = (async () => {
					for await (const message of socket) {
						received.push(message)
						socket.cancel()
					}
				})()
				await reading
				assert.equal(received.length, 1)
				assert.equal(socket.status, "closed")
				assert.deepEqual(
					statuses,
					[ "connecting", "open", "closed" ]
				)
				assert.throws(
					() => socket.send("late"),
					CancelError
				)
				assert.deepEqual(await take(socket, 1), [])
				await until(
					() => server.hits.get("ws-cancel-closed") == 1
				)
				const controller = new AbortController()
				const aborted = create().ws(
					"/ws",
					{ key: "ws-signal" },
					{ signal: controller.signal }
				)
				await take(aborted, 1)
				controller.abort("unmounted")
				assert.equal(aborted.status, "closed")
				assert.throws(
					() => aborted.send("late"),
					CancelError,
					"unmounted"
				)
				await until(
					() => server.hits.get("ws-signal-closed") == 1
				)
				const never = create().ws(
					"/ws",
					{ key: "ws-aborted" },
					{ signal: AbortSignal.abort() }
				)
				assert.equal(never.status, "closed")
				assert.deepEqual(await take(never, 1), [])
				assert.isUndefined(server.hits.get("ws-aborted"))
			}
		)
		it(
			"close codes",
			async () => {
				const api = create()
				const normal = api.ws("/ws", { key: "ws-normal" })
				normal.send("close 1000 bye")
				const ended = await take(normal, 5)
				assert.equal(ended.length, 1)
				assert.equal(normal.status, "idle")
				const again = await take(normal, 1)
				assert.equal(
					/** @type {{ count: number }} */(again[0])/**/.count,
					2
				)
				normal.cancel()
				/** @type {unknown[]} */
				const errors = []
				const reporting = create(
					{
						on: {
							error: error => void errors.push(error)
						}
					}
				)
				const refused = await failure(
					reporting.ws(
						"/ws",
						{
							code: 4001,
							fail: 1,
							key: "ws-4001"
						}
					)
				)
				assert.instanceOf(refused, SocketError)
				assert.equal(
					/** @type {SocketError} */(refused)/**/.code,
					4001
				)
				assert.equal(
					/** @type {SocketError} */(refused)/**/.reason,
					"failed 1"
				)
				assert.equal(server.hits.get("ws-4001"), 1)
				assert.deepEqual(errors, [ refused ])
				const restarted = api.ws(
					"/ws",
					{
						code: 1012,
						fail: 2,
						key: "ws-1012"
					},
					{ reconnect: { delay: () => 1 } }
				)
				const welcome = await take(restarted, 1)
				assert.equal(
					/** @type {{ count: number }} */(welcome[0])/**/.count,
					3
				)
				restarted.cancel()
				const flapping = await failure(
					api.ws(
						"/ws",
						{
							code: 1012,
							fail: 5,
							key: "ws-flapping"
						},
						{
							reconnect: { count: 1, delay: () => 1 }
						}
					)
				)
				assert.instanceOf(flapping, SocketError)
				assert.equal(
					server.hits.get("ws-flapping"),
					2
				)
			}
		)
		it(
			"config",
			async () => {
				/** @type {[string, string | string[] | undefined][]} */
				const created = []
				class FakeSocket {
					binaryType = "blob"
					readyState = 0
					/** @type {((event: { code: number, reason: string }) => void) | null} */
					onclose = null
					/** @type {(() => void) | null} */
					onerror = null
					/** @type {(() => void) | null} */
					onmessage = null
					/** @type {(() => void) | null} */
					onopen = null
					/**
					 * @param {string} url
					 * @param {(string | string[])=} protocols
					 */
					constructor(url, protocols) {
						created.push([ url, protocols ])
						queueMicrotask(
							() => this.onclose?.({ code: 4003, reason: "fake" })
						)
					}
					close() {}
					send() {}
				}
				const api = http(
					{
						WebSocket: FakeSocket,
						base: "https://api.example.com/v1?app=web",
						query: params => new URLSearchParams(
							/** @type {Record<string, string>} */(params)/**/
						)
							.toString()
					}
				)
				const error = await failure(
					api.ws(
						"/rooms/:id",
						{ id: "a b", q: "1" },
						{
							params: async () => ({ token: "t" }),
							protocols: [ "chat" ]
						}
					)
				)
				assert.instanceOf(error, SocketError)
				assert.deepEqual(
					created,
					[
						[
							"wss://api.example.com/v1/rooms/a%20b?app=web&token=t&q=1",
							[ "chat" ]
						]
					]
				)
				await failure(
					http({ WebSocket: FakeSocket })
						.ws("ws://example.com/live")
				)
				assert.equal(
					created[1]?.[0],
					"ws://example.com/live"
				)
				assert.isUndefined(created[1]?.[1])
				vi.stubGlobal(
					"location",
					{
						href: "http://app.example.com/page"
					}
				)
				await failure(
					http(
						{
							WebSocket: FakeSocket,
							base: "/api"
						}
					)
						.ws("/live")
				)
				assert.equal(
					created[2]?.[0],
					"ws://app.example.com/api/live"
				)
				vi.unstubAllGlobals()
				const relative = await failure(
					http({ WebSocket: FakeSocket })
						.ws("/live")
				)
				assert.instanceOf(relative, TypeError)
				const missing = await failure(
					api.ws("/rooms/:id", { id: "" })
				)
				assert.instanceOf(missing, TypeError)
				vi.stubGlobal("WebSocket", void 0)
				const unavailable = await failure(
					api.extend({ WebSocket: null })
						.ws("/live")
				)
				assert.instanceOf(unavailable, TypeError)
				assert.match(
					/** @type {TypeError} */(unavailable)/**/.message,
					/WebSocket/
				)
			}
		)
		it(
			"credentials in errors",
			async () => {
				/** @type {unknown[]} */
				const errors = []
				const api = create(
					{
						on: {
							error: error => void errors.push(error)
						}
					}
				)
				const socket = api.ws(
					"/ws",
					{
						code: 1008,
						fail: 1,
						key: "ws-secret"
					},
					{
						params: () => ({ token: "SECRET" })
					}
				)
				const refused = await failure(socket)
				assert.instanceOf(refused, SocketError)
				assert.deepEqual(errors, [ refused ])
				const { url } = /** @type {SocketError} */(refused)/**/.request
				assert.notInclude(url, "SECRET")
				assert.match(
					url,
					/^ws:.*\/ws\?token=\*\*\*&.*key=ws-secret/
				)
				assert.equal(socket.status, "idle")
				const welcome = await take(socket, 1)
				assert.include(
					/** @type {{ url: string }} */(welcome[0])/**/.url,
					"token=SECRET"
				)
				socket.cancel()
			}
		)
		it(
			"feeds a flow",
			async () => {
				const socket = create().ws("/ws", { key: "ws-flow" })
				/** @type {unknown[]} */
				const handled = []
				function handle(/** @type {unknown} */ message) {
					handled.push(message)
					return message
				}
				const run = flow().add(handle, flow.queue(socket))
					.run()
				socket.send({ n: 1 })
				socket.send({ n: 2 })
				await until(() => handled.length == 3)
				assert.deepEqual(
					handled,
					[
						{
							count: 1,
							protocol: "",
							url: "/ws?key=ws-flow"
						},
						{ n: 1 },
						{ n: 2 }
					]
				)
				run.cancel()
				socket.send({ n: 3 })
				assert.deepEqual(
					await take(socket, 1),
					[ { n: 3 } ]
				)
				assert.equal(handled.length, 3)
				socket.cancel()
			}
		)
		it(
			"heartbeat",
			async () => {
				const api = create()
				const socket = api.ws(
					"/ws",
					{ key: "ws-heartbeat" },
					{
						heartbeat: {
							interval: 10,
							message: { type: "ping" }
						}
					}
				)
				const messages = await take(socket, 3)
				assert.deepEqual(
					messages.slice(1),
					[
						{ type: "ping" },
						{ type: "ping" }
					]
				)
				socket.cancel()
				const heartbeat = {
					interval: 10,
					message: "ping",
					timeout: 20
				}
				const silent = api.ws(
					"/ws",
					{ key: "ws-silent", silent: 1 },
					{ heartbeat, reconnect: false }
				)
				const error = await failure(silent)
				assert.instanceOf(error, TimeoutError)
				assert.equal(
					/** @type {TimeoutError} */(error)/**/.timeout,
					20
				)
				assert.equal(server.hits.get("ws-silent"), 1)
				assert.equal(silent.status, "idle")
				const revived = api.ws(
					"/ws",
					{ key: "ws-revived", silent: 1 },
					{
						heartbeat,
						reconnect: { delay: () => 1 }
					}
				)
				const reading = take(revived, 1)
				await until(
					() => Number(server.hits.get("ws-revived")) >= 3
				)
				revived.cancel()
				assert.deepEqual(await reading, [])
			}
		)
		it(
			"latest closes the sockets it leaves",
			async () => {
				const api = create()
				/** @type {import("async-lube").Channel<string>} */
				const lines = channel()
				/** @type {unknown[]} */
				const seen = []
				const reading = (async () => {
					for await (const message of latest(
						lines,
						line => api.ws(
							"/ws",
							{ key: "ws-latest-" + line }
						)
					)) {
						seen.push(message)
						if (seen.length == 2) break
					}
				})()
				lines.send("a")
				await until(() => seen.length == 1)
				lines.send("b")
				await until(
					() => server.hits.get("ws-latest-a-closed") == 1
				)
				await reading
				await until(
					() => server.hits.get("ws-latest-b-closed") == 1
				)
			}
		)
		it(
			"limit",
			async () => {
				const socket = create().ws(
					"/ws",
					{ key: "ws-limit" },
					{ limit: 2 }
				)
				const reader = socket[Symbol.asyncIterator]()
				await reader.next()
				for (let n = 1; n <= 5; n++) socket.send({ n })
				await until(
					() => server.hits.get("ws-limit-received") == 5
				)
				await new Promise(
					resolve => setTimeout(resolve, 100)
				)
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 4 }
				)
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 5 }
				)
				socket.send({ n: 6 })
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 6 }
				)
				socket.cancel()
			}
		)
		it(
			"loop teardown",
			async () => {
				const socket = create().ws(
					"/ws",
					{ key: "ws-teardown", silent: 1 }
				)
				const reader = socket[Symbol.asyncIterator]()
				const waiting = reader.next()
				waiting.catch(() => {})
				await new Promise(
					resolve => setTimeout(resolve, 50)
				)
				const released = await Promise.race(
					[
						/** @type {Promise<unknown>} */(reader.return?.() ?? Promise.resolve())/**/.then(() => "released"),
						new Promise(
							resolve => setTimeout(() => resolve("hung"), 500)
						)
					]
				)
				assert.equal(released, "released")
				assert.deepEqual(
					await waiting,
					{ done: true, value: void 0 }
				)
				socket.cancel()
			}
		)
		it(
			"messages",
			async () => {
				/** @type {number[]} */
				const tokens = []
				const socket = create().ws(
					"/ws",
					{ key: "ws-messages", room: 7 },
					{
						params: () => ({
							token: String(tokens.push(tokens.length))
						}),
						protocols: "chat"
					}
				)
				socket.send({ text: "queued" })
				socket.send("plain")
				socket.send("42")
				socket.send(new Uint8Array([ 1, 2, 3 ]))
				const messages = await take(socket, 5)
				assert.deepEqual(
					messages.slice(0, 4),
					[
						{
							count: 1,
							protocol: "chat",
							url: "/ws?token=1&key=ws-messages&room=7"
						},
						{ text: "queued" },
						"plain",
						42
					]
				)
				assert.instanceOf(messages[4], ArrayBuffer)
				assert.deepEqual(
					[
						...new Uint8Array(
							/** @type {ArrayBuffer} */(messages[4])/**/
						)
					],
					[ 1, 2, 3 ]
				)
				assert.equal(socket.status, "open")
				const second = take(socket, 2)
				const third = take(socket, 1)
				socket.send({ n: 1 })
				socket.send({ n: 2 })
				assert.deepEqual(await third, [ { n: 1 } ])
				assert.deepEqual(
					await second,
					[ { n: 1 }, { n: 2 } ]
				)
				socket.send("drop")
				await until(
					() => socket.status == "connecting"
				)
				socket.send("after drop")
				const reconnected = await take(socket, 2)
				assert.include(
					/** @type {{ url: string }} */(reconnected[0])/**/.url,
					"token=2"
				)
				assert.equal(reconnected[1], "after drop")
				socket.cancel()
				const text = create().ws(
					"/ws",
					{ key: "ws-text" },
					{ as: "text" }
				)
				text.send({ a: 1 })
				const raw = await take(text, 2)
				assert.typeOf(raw[0], "string")
				assert.equal(raw[1], "{\"a\":1}")
				text.cancel()
				const parsed = create().ws(
					"/ws",
					{ key: "ws-parse" },
					{
						parse: data => {
							if (data == "bad") throw TypeError("Invalid message")
							return { data }
						}
					}
				)
				parsed.send("good")
				parsed.send("bad")
				parsed.send("ignored")
				/** @type {unknown[]} */
				const valid = []
				/** @type {unknown} */
				let invalid
				try {
					for await (const message of parsed) valid.push(message)
				} catch (error) {
					invalid = error
				}
				assert.instanceOf(invalid, TypeError)
				assert.equal(valid.length, 2)
				assert.deepEqual(valid[1], { data: "good" })
				assert.equal(parsed.status, "idle")
				await until(
					() => server.hits.get("ws-parse-closed") == 1
				)
				const awaited = create().ws(
					"/ws",
					{ key: "ws-async-parse" },
					{
						parse: async data => {
							await new Promise(
								resolve => setTimeout(resolve, data == "slow" ? 30 : 0)
							)
							if (data == "bad") throw TypeError("Invalid message")
							return { data }
						}
					}
				)
				awaited.send("slow")
				awaited.send("fast")
				awaited.send("bad")
				awaited.send("ignored")
				/** @type {unknown[]} */
				const ordered = []
				/** @type {unknown} */
				let rejected
				try {
					for await (const message of awaited) ordered.push(message)
				} catch (error) {
					rejected = error
				}
				assert.instanceOf(rejected, TypeError)
				assert.deepEqual(
					ordered.slice(1),
					[
						{ data: "slow" },
						{ data: "fast" }
					]
				)
				assert.equal(awaited.status, "idle")
				const burst = create().ws(
					"/ws",
					{ key: "ws-burst" },
					{
						as: "text",
						onStatus: () => {
							throw Error("Render failed")
						}
					}
				)
				const iterator = burst[Symbol.asyncIterator]()
				await iterator.next()
				const sent = Array.from(
					{ length: 1100 },
					(_, i) => String(i)
				)
				for (const message of sent) burst.send(message)
				await until(
					() => server.hits.get("ws-burst-received") == 1100
				)
				await new Promise(
					resolve => setTimeout(resolve, 50)
				)
				/** @type {unknown[]} */
				const echoed = []
				while (echoed.length < sent.length) echoed.push((await iterator.next()).value)
				assert.deepEqual(echoed, sent)
				assert.equal(burst.status, "open")
				burst.cancel()
			}
		)
		it(
			"outbox",
			async () => {
				const socket = create().ws(
					"/ws",
					{ key: "ws-outbox" },
					{ outbox: 2 }
				)
				for (let n = 1; n <= 5; n++) socket.send({ n })
				const reader = socket[Symbol.asyncIterator]()
				await reader.next()
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 4 }
				)
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 5 }
				)
				socket.send({ n: 6 })
				assert.deepEqual(
					(await reader.next()).value,
					{ n: 6 }
				)
				await reader.return?.()
				const none = create().ws(
					"/ws",
					{ key: "ws-outbox-none" },
					{ outbox: 0 }
				)
				none.send({ n: 1 })
				const messages = none[Symbol.asyncIterator]()
				await messages.next()
				none.send({ n: 2 })
				assert.deepEqual(
					(await messages.next()).value,
					{ n: 2 }
				)
				none.cancel()
				socket.cancel()
			}
		)
		it(
			"policies",
			async () => {
				vi.useFakeTimers()
				try {
					controlled()
					const api = http(
						{
							WebSocket: ControlledSocket,
							base: "https://api.example.com"
						}
					)
					for (const [ options, message ] of /** @type {const} */([
						[
							{ limt: 1 },
							"Unknown ws option \"limt\""
						],
						[
							{ limit: 0 },
							"The limit of ws() must be a positive integer or Infinity"
						],
						[
							{ outbox: -1 },
							"The outbox of ws() must be a non-negative integer or Infinity"
						],
						[
							{ as: "blob" },
							"The as of ws() must be \"json\" or \"text\""
						],
						[
							{
								heartbeat: { interval: 0, message: "ping" }
							},
							"The heartbeat interval of ws() must be positive milliseconds"
						],
						[
							{
								heartbeat: {
									interval: 10,
									message: "ping",
									timout: 1
								}
							},
							"Unknown ws option \"heartbeat.timout\""
						],
						[
							{ reconnect: { cont: 1 } },
							"Unknown ws option \"reconnect.cont\""
						],
						[
							{ reconnect: { count: -1 } },
							"The reconnect count of ws() must be a non-negative integer or Infinity"
						]
					])/**/) {
						assert.throws(
							() => api.ws(
								"/live",
								{},
								/** @type {never} */(options)/**/
							),
							TypeError,
							message
						)
					}
					assert.lengthOf(sockets, 0)
					/** @type {unknown[][]} */
					const delays = []
					const refused = api.ws(
						"/live",
						{},
						{
							reconnect: {
								delay: (failures, error, fallback) => {
									delays.push([ failures, error, fallback ])
									return 10
								}
							}
						}
					)
					const refusing = failure(refused)
					for (let index = 0; index < 6; index++) {
						await vi.advanceTimersByTimeAsync(index ? 10 : 0)
						socket_at(index).drop(1006)
					}
					assert.instanceOf(await refusing, NetworkError)
					assert.lengthOf(sockets, 6)
					assert.deepEqual(
						delays.map(([ failures ]) => failures),
						[ 1, 2, 3, 4, 5 ]
					)
					assert.instanceOf(delays[0]?.[1], NetworkError)
					assert.isAtLeast(Number(delays[0]?.[2]), 250)
					assert.isAtMost(Number(delays[0]?.[2]), 500)
					const opened = api.ws(
						"/live",
						{},
						{ reconnect: { delay: 10 } }
					)
					const opening = take(opened, 1)
					await vi.advanceTimersByTimeAsync(0)
					socket_at(6).accept()
					socket_at(6).drop(1006)
					for (let index = 7; index < 14; index++) {
						await vi.advanceTimersByTimeAsync(10)
						socket_at(index).drop(1006)
					}
					await vi.advanceTimersByTimeAsync(10)
					socket_at(14).accept()
					socket_at(14).onmessage?.({ data: "\"hi\"" })
					assert.deepEqual(await opening, [ "hi" ])
					opened.cancel()
					const sender = api.ws("/live", {}, { outbox: 0 })
					assert.isFalse(sender.send("dropped"))
					await vi.advanceTimersByTimeAsync(0)
					socket_at(15).accept()
					assert.isTrue(sender.send("now"))
					assert.deepEqual(socket_at(15).sent, [ "now" ])
					sender.cancel()
				} finally {
					vi.useRealTimers()
				}
			}
		)
		it(
			"reconnection",
			async () => {
				/** @type {unknown[]} */
				const reported = []
				const api = create(
					{
						on: {
							error: error => void reported.push(error)
						}
					}
				)
				/** @type {ConnectionStatus[]} */
				const statuses = []
				const rejected = api.ws(
					"/ws-reject",
					{ key: "ws-reject" },
					{
						onStatus: status => void statuses.push(status),
						reconnect: { count: 2, delay: () => 1 }
					}
				)
				const error = await failure(rejected)
				assert.instanceOf(error, NetworkError)
				assert.equal(server.hits.get("ws-reject"), 3)
				assert.lengthOf(reported, 3)
				assert.equal(reported[2], error)
				for (const each of reported) assert.instanceOf(each, NetworkError)
				reported.length = 0
				assert.deepEqual(
					statuses,
					[ "connecting", "idle" ]
				)
				const once = await failure(
					api.ws(
						"/ws-reject",
						{ key: "ws-once" },
						{ reconnect: false }
					)
				)
				assert.instanceOf(once, NetworkError)
				assert.equal(server.hits.get("ws-once"), 1)
				const stopped = await failure(
					api.ws(
						"/ws-reject",
						{ key: "ws-stop" },
						{
							reconnect: { delay: () => void 0 }
						}
					)
				)
				assert.instanceOf(stopped, NetworkError)
				assert.equal(server.hits.get("ws-stop"), 1)
				const hanging = await failure(
					api.ws(
						"/ws-hang",
						{ key: "ws-hang" },
						{ reconnect: false, timeout: 30 }
					)
				)
				assert.instanceOf(hanging, TimeoutError)
				let token_calls = 0
				const offline_token = api.ws(
					"/ws",
					{ key: "ws-token" },
					{
						params: async () => {
							if (++token_calls == 1) throw new NetworkError(
								TypeError("fetch failed"),
								{ method: "POST", url: "/token" }
							)
							return { token: "t" }
						},
						reconnect: { delay: () => 1 }
					}
				)
				assert.deepEqual(
					await take(offline_token, 1),
					[
						{
							count: 1,
							protocol: "",
							url: "/ws?token=t&key=ws-token"
						}
					]
				)
				offline_token.cancel()
				const slow_token = await failure(
					api.ws(
						"/ws",
						{ key: "ws-slow-token" },
						{
							params: () => new Promise(() => void 0),
							reconnect: false,
							timeout: 30
						}
					)
				)
				assert.instanceOf(slow_token, TimeoutError)
				const invalid_token = await failure(
					api.ws(
						"/ws",
						{ key: "ws-invalid-token" },
						{
							params: () => {
								throw TypeError("No token")
							},
							reconnect: { delay: () => 1 }
						}
					)
				)
				assert.instanceOf(invalid_token, TypeError)
				const backoff = create({ timeout: 30 })
					.ws(
						"/ws-hang",
						{ key: "ws-backoff" }
					)
				const reading = take(backoff, 1)
				await until(
					() => server.hits.get("ws-backoff") == 2
				)
				backoff.cancel()
				assert.deepEqual(await reading, [])
				const sender = api.ws("/ws", { key: "ws-sender" })
				sender.send("hello")
				await until(
					() => server.hits.get("ws-sender-received") == 1
				)
				sender.cancel()
			}
		)
		it(
			"recovery",
			async () => {
				vi.useFakeTimers()
				try {
					const online = controlled()
					const api = http(
						{
							WebSocket: ControlledSocket,
							base: "https://api.example.com"
						}
					)
					const options = {
						reconnect: { count: 1, delay: () => 60000 }
					}
					const socket = api.ws("/live", {}, options)
					const reading = failure(socket)
					socket.send("a")
					await vi.advanceTimersByTimeAsync(0)
					socket_at(0).accept()
					assert.deepEqual(socket_at(0).sent, [ "a" ])
					socket_at(0).readyState = 2
					socket.send("b")
					assert.deepEqual(socket_at(0).sent, [ "a" ])
					socket_at(0).drop(1012)
					assert.equal(socket.status, "connecting")
					assert.equal(online.length, 1)
					online[0]?.()
					assert.equal(online.length, 0)
					await vi.advanceTimersByTimeAsync(0)
					socket_at(1).accept()
					assert.deepEqual(socket_at(1).sent, [ "b" ])
					socket_at(1).drop(1012)
					const error = await reading
					assert.instanceOf(error, SocketError)
					assert.equal(online.length, 0)
					const stable = api.ws("/live", {}, options)
					const stable_reading = take(stable, 1)
					await vi.advanceTimersByTimeAsync(0)
					socket_at(2).accept()
					await vi.advanceTimersByTimeAsync(5000)
					socket_at(2).drop(1012)
					await vi.advanceTimersByTimeAsync(60000)
					assert.equal(online.length, 0)
					socket_at(3).accept()
					socket_at(3).onmessage?.({ data: "hi" })
					assert.deepEqual(await stable_reading, [ "hi" ])
					const dropping = failure(stable)
					socket_at(3).drop(1012)
					assert.instanceOf(await dropping, SocketError)
					assert.equal(stable.status, "idle")
					assert.equal(online.length, 0)
					assert.equal(sockets.length, 4)
					const chatty = api.ws(
						"/live",
						{},
						{
							reconnect: { count: 2, delay: () => 1000 }
						}
					)
					const chatty_reading = failure(chatty)
					for (let index = 4; index < 7; index++) {
						await vi.advanceTimersByTimeAsync(index == 4 ? 0 : 1000)
						socket_at(index).accept()
						socket_at(index).onmessage?.({ data: "hi" })
						socket_at(index).drop(1012)
					}
					assert.instanceOf(
						await chatty_reading,
						SocketError
					)
					assert.equal(sockets.length, 7)
				} finally {
					vi.useRealTimers()
				}
			}
		)
	}
)
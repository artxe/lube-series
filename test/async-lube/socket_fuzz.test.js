/** @import { ConnectionStatus } from "async-lube" */
/** @import { SimRng, SseFuzzCase, SseFuzzConnection, WsFuzzCase, WsFuzzConnection } from "./private.js" */
import {
	close_frame,
	read_frames,
	write_frame
} from "./server.js"
import { rng } from "./sim/clock.js"
import { sim_seeds } from "./sim/seeds.js"
import {
	CancelError,
	HttpError,
	NetworkError,
	SocketError,
	TimeoutError,
	http
} from "async-lube"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
/**
 * @param {SimRng} random
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
function between(random, low, high) {
	return low + random.int(high - low + 1)
}
/**
 * @param {ConnectionStatus[]} statuses
 * @returns {string[]}
 */
function check_statuses(statuses) {
	/** @type {string[]} */
	const problems = []
	for (let i = 1; i < statuses.length; i++) {
		if (statuses[i] == statuses[i - 1]) problems.push(
			`status ${statuses[i]} twice in a row`
		)
	}
	if (statuses.at(-1) != "closed") problems.push(
		`status ${statuses.at(-1)} after cancel()`
	)
	if (statuses.indexOf("closed") != statuses.length - 1) problems.push("status left closed")
	return problems
}
/**
 * @param {unknown} error
 * @returns {string}
 */
function kind_of(error) {
	if (error === void 0) return "end"
	if (error instanceof CancelError) return "cancel"
	if (error instanceof SocketError) return "socket " + error.code
	if (error instanceof HttpError) return "http " + error.status
	if (error instanceof NetworkError) return "network"
	if (error instanceof TimeoutError) return "timeout"
	if (error instanceof TypeError) return "type: " + error.message
	return "other: " + String(error)
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
 * @param {() => boolean} condition
 * @param {number} ms
 * @returns {Promise<boolean>}
 */
async function until(condition, ms) {
	const started = Date.now()
	while (!condition()) {
		if (Date.now() - started > ms) return false
		await sleep(5)
	}
	return true
}
describe(
	"socket fuzz",
	() => {
		/** @type {Map<string, WsFuzzCase>} */
		const sockets = new Map()
		/** @type {Map<string, SseFuzzCase>} */
		const streams = new Map()
		/** @type {Set<import("node:stream").Duplex>} */
		const upgrades = new Set()
		/** @type {unknown[]} */
		const unhandled = []
		/**
		 * @param {unknown} reason
		 * @returns {void}
		 */
		function on_unhandled(reason) {
			unhandled.push(reason)
		}
		const server = createServer(
			(request, response) => {
				request.socket.on("error", () => {})
				const url = new URL(
					/** @type {string} */(request.url)/**/,
					"http://localhost"
				)
				const state = streams.get(
					url.searchParams.get("case") ?? ""
				)
				if (!state) {
					response.writeHead(404)
					response.end()
					return
				}
				const count = state.connections++
				const last_id = Number(
					request.headers["last-event-id"] ?? 0
				)
				state.last_ids.push(last_id)
				/** @type {SseFuzzConnection} */
				const connection = state.script[count] ?? {
					gap: 0,
					k: "events",
					n: 0,
					retry: void 0,
					then: "stay"
				}
				switch (connection.k) {
				case "hang":
					state.open.add(response)
					return
				case "status":
					response.writeHead(
						connection.status,
						connection.retry_after
							? {
								"Retry-After": connection.retry_after
							}
							: {}
					)
					response.end()
					return
				case "wrong-type":
					response.writeHead(
						200,
						{ "Content-Type": "text/html" }
					)
					response.end("<html>")
					return
				}
				response.writeHead(
					200,
					{
						"Content-Type": "text/event-stream"
					}
				)
				if (connection.retry != null) response.write(
					`retry: ${connection.retry}\n\n`
				)
				state.open.add(response)
				const stream = state
				const events = connection
				let sent = 0
				function tick() {
					if (response.destroyed) return
					if (sent < events.n) {
						sent++
						stream.next_id = Math.max(last_id, stream.next_id) + 1
						response.write(
							`id: ${stream.next_id}\ndata: {"id":${stream.next_id}}\n\n`
						)
						setTimeout(tick, events.gap)
					} else if (events.then == "end") response.end()
					else if (events.then == "drop") response.socket?.destroy()
				}
				setTimeout(tick, 1)
			}
		)
		server.on(
			"upgrade",
			(request, socket) => {
				upgrades.add(socket)
				socket.on(
					"close",
					() => upgrades.delete(socket)
				)
				socket.on("error", () => {})
				const url = new URL(
					/** @type {string} */(request.url)/**/,
					"http://localhost"
				)
				const state = sockets.get(
					url.searchParams.get("case") ?? ""
				)
				if (!state) {
					socket.destroy()
					return
				}
				const count = state.connections++
				/** @type {WsFuzzConnection} */
				const connection = state.script[count] ?? {
					gap: 0,
					k: "accept",
					messages: 0,
					pong: true,
					then: "stay"
				}
				if (connection.k == "refuse") {
					socket.end(
						"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n"
					)
					return
				}
				if (connection.k == "hang") return
				const accept = createHash("sha1")
					.update(
						request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
					)
					.digest("base64")
				socket.write(
					`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
				)
				read_frames(
					socket,
					(opcode, payload) => {
						if (opcode == 8) {
							close_frame(socket, 1000, "")
							return
						}
						const text = payload.toString()
						state.received.push(text)
						if (connection.pong && text.includes("ping")) write_frame(
							socket,
							1,
							Buffer.from("{\"pong\":true}")
						)
					}
				)
				const known = state
				const accepted = connection
				let sent = 0
				function tick() {
					if (socket.destroyed || !socket.writable) return
					if (sent < accepted.messages) {
						sent++
						write_frame(
							socket,
							1,
							Buffer.from(
								JSON.stringify({ seq: ++known.sequence })
							)
						)
						setTimeout(tick, accepted.gap)
						return
					}
					if (accepted.then == "terminate") socket.destroy()
					else if (typeof accepted.then == "number") close_frame(socket, accepted.then, "")
				}
				setTimeout(tick, 1)
			}
		)
		let origin = ""
		afterAll(
			async () => {
				process.off(
					"unhandledRejection",
					on_unhandled
				)
				for (const socket of upgrades) socket.destroy()
				server.closeAllConnections()
				await new Promise(
					resolve => server.close(resolve)
				)
			}
		)
		beforeAll(
			async () => {
				process.on(
					"unhandledRejection",
					on_unhandled
				)
				await new Promise(
					resolve => server.listen(
						0,
						"127.0.0.1",
						() => resolve(void 0)
					)
				)
				origin = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */(server.address())/**/.port}`
			}
		)
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function fuzz_sse(seed) {
			const random = rng(seed)
			const id = "s" + seed
			/** @type {SseFuzzConnection[]} */
			const script = Array.from(
				{ length: 10 },
				() => {
					const roll = random.next()
					if (roll < 0.2) return {
						k: "status",
						retry_after: random.chance(0.5) ? "0" : void 0,
						status: random.pick(
							[ 204, 401, 404, 429, 500, 503, 503 ]
						)
					}
					if (roll < 0.25) return { k: "wrong-type" }
					if (roll < 0.3) return { k: "hang" }
					return {
						gap: random.int(6),
						k: "events",
						n: random.int(6),
						retry: random.chance(0.5) ? between(random, 1, 20) : void 0,
						then: random.pick(
							/** @type {const} */([ "end", "drop", "drop", "stay" ])/**/
						)
					}
				}
			)
			/** @type {SseFuzzCase} */
			const state = {
				connections: 0,
				last_ids: [],
				next_id: 0,
				open: new Set(),
				script
			}
			streams.set(id, state)
			/** @type {unknown[]} */
			const errors = []
			const api = http(
				{
					base: origin,
					on: {
						error: error => {
							errors.push(error)
						}
					},
					timeout: 100
				}
			)
			const count = random.chance(0.7) ? random.int(4) : void 0
			const reconnect = random.chance(0.15)
				? false
				: random.chance(0.2)
					? true
					: {
						count,
						delay: random.chance(0.3) ? between(random, 1, 10) : () => between(random, 1, 10)
					}
			const controller = new AbortController()
			const use_signal = random.chance(0.4)
			/** @type {ConnectionStatus[]} */
			const statuses = []
			const as = random.pick(
				/** @type {const} */([ void 0, "text", "json" ])/**/
			)
			const parse_mode = random.pick(
				/** @type {const} */([
					"none",
					"none",
					"sync",
					"async",
					"fail"
				])/**/
			)
			const fail_at = between(random, 1, 6)
			let parsed = 0
			const on_status = random.chance(0.8)
			const events = api.sse(
				"/e",
				{ case: id },
				{
					as,
					onStatus: on_status ? status => void statuses.push(status) : void 0,
					parse: parse_mode == "none"
						? void 0
						: data => {
							parsed++
							if (parse_mode == "fail" && parsed == fail_at) throw TypeError("bad event")
							if (parse_mode == "async") return new Promise(
								resolve => setTimeout(
									() => resolve(data),
									random.int(4)
								)
							)
							return data
						},
					reconnect,
					signal: use_signal ? controller.signal : null
				}
			)
			/** @type {string[]} */
			const problems = []
			/** @type {number[]} */
			const seen = []
			/** @type {string[]} */
			const ends = []
			const rounds = between(random, 1, 3)
			const action = random.pick(
				/** @type {const} */([ "cancel", "abort", "none", "none" ])/**/
			)
			let acted = false
			const timer = setTimeout(
				() => {
					acted = true
					if (action == "cancel") events.cancel()
					if (action == "abort") controller.abort()
				},
				between(random, 5, 200)
			)
			for (let round = 0; round < rounds; round++) {
				const most = random.chance(0.4) ? random.int(4) : Infinity
				let got = 0
				const loop = (async () => {
					try {
						for await (const event of events) {
							const data = as == "json"
								? /** @type {{ id: number }} */(/** @type {unknown} */(event.data))/**/
								: /** @type {{ id: number }} */(JSON.parse(String(event.data)))/**/
							seen.push(data.id)
							if (String(data.id) != event.id) problems.push(
								`event id ${event.id} with data ${data.id}`
							)
							if (++got > most) return "break"
						}
						return "end"
					} catch (error) {
						return kind_of(error)
					}
				})()
				const end = await Promise.race(
					[
						loop,
						sleep(2500).then(() => "pending")
					]
				)
				if (end == "pending") {
					if (acted && (action == "cancel" || action == "abort" && use_signal)) problems.push(
						"a loop was pending after cancel or abort"
					)
					events.cancel()
					const late = await Promise.race(
						[
							loop,
							sleep(1000).then(() => "pending")
						]
					)
					if (late == "pending") problems.push(
						"a loop was pending after cancel()"
					)
					ends.push("pending, then " + late)
					break
				}
				ends.push(end)
				if (end.startsWith("other")) problems.push(`a loop failed with ${end}`)
				if (end.startsWith("type") && !(parse_mode == "fail" || end.includes("event-stream"))) problems.push(`a loop failed with ${end}`)
				if (on_status && !acted && statuses.at(-1) != "idle") problems.push(
					`status ${statuses.at(-1)} after the loop ended with ${end}`
				)
			}
			clearTimeout(timer)
			events.cancel()
			await sleep(20)
			for (let i = 1; i < seen.length; i++) {
				if (/** @type {number} */(seen[i])/**/ <= /** @type {number} */(seen[i - 1])/**/) problems.push(`event ids went back: ${seen}`)
			}
			if (on_status) problems.push(...check_statuses(statuses))
			if (events.status != "closed") problems.push(
				`events.status ${events.status}`
			)
			if (errors.some(
				error => error instanceof CancelError
			)) problems.push(
				"the error hook got a CancelError"
			)
			for (let i = 1; i < state.last_ids.length; i++) {
				if (/** @type {number} */(state.last_ids[i])/**/ < /** @type {number} */(state.last_ids[i - 1])/**/) problems.push(
					`Last-Event-ID went back: ${state.last_ids}`
				)
			}
			for (const response of state.open) response.destroy()
			streams.delete(id)
			return problems.length
				? [
					...problems,
					`script ${JSON.stringify(script.slice(0, state.connections + 1))}`,
					`options ${JSON.stringify({ action, as, count, on_status, parse_mode, reconnect, use_signal })}`,
					`statuses ${statuses.join(">")} connections ${state.connections} last ids ${state.last_ids} errors ${errors.map(kind_of)} ends ${ends} seen ${seen}`
				]
				: []
		}
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function fuzz_ws(seed) {
			const random = rng(seed)
			const id = "w" + seed
			/** @type {WsFuzzConnection[]} */
			const script = Array.from(
				{ length: 8 },
				() => {
					const roll = random.next()
					if (roll < 0.12) return { k: "refuse" }
					if (roll < 0.2) return { k: "hang" }
					return {
						gap: random.int(6),
						k: "accept",
						messages: random.int(7),
						pong: random.chance(0.7),
						then: random.pick(
							/** @type {const} */([
								1000,
								1001,
								1011,
								1008,
								4001,
								"terminate",
								"terminate",
								"silent",
								"stay",
								"stay"
							])/**/
						)
					}
				}
			)
			/** @type {WsFuzzCase} */
			const state = {
				connections: 0,
				received: [],
				script,
				sequence: 0
			}
			sockets.set(id, state)
			/** @type {unknown[]} */
			const errors = []
			const api = http(
				{
					base: origin,
					on: {
						error: error => {
							errors.push(error)
						}
					},
					timeout: 100
				}
			)
			const count = random.chance(0.7) ? random.int(4) : void 0
			const reconnect = random.chance(0.15)
				? false
				: {
					count,
					delay: () => between(random, 1, 15)
				}
			const heartbeat = random.chance(0.5)
				? {
					interval: 20,
					message: { type: "ping" },
					timeout: 40
				}
				: void 0
			const controller = new AbortController()
			const use_signal = random.chance(0.4)
			/** @type {ConnectionStatus[]} */
			const statuses = []
			const parse_mode = random.pick(
				/** @type {const} */([
					"none",
					"none",
					"sync",
					"async",
					"fail"
				])/**/
			)
			const fail_at = between(random, 1, 8)
			let parsed = 0
			const outbox = random.chance(0.4) ? random.int(3) : void 0
			const limit = random.chance(0.3) ? between(random, 1, 3) : void 0
			const socket = api.ws(
				"/s",
				{ case: id },
				{
					heartbeat,
					limit,
					onStatus: status => void statuses.push(status),
					outbox,
					parse: parse_mode == "none"
						? void 0
						: data => {
							parsed++
							if (parse_mode == "fail" && parsed == fail_at) throw TypeError("bad message")
							if (parse_mode == "async") return new Promise(
								resolve => setTimeout(
									() => resolve(data),
									random.int(4)
								)
							)
							return data
						},
					reconnect,
					signal: use_signal ? controller.signal : void 0
				}
			)
			/** @type {string[]} */
			const problems = []
			const loops = between(random, 1, 2)
			/** @type {{ end: string, seqs: number[] }[]} */
			const results = []
			const running = Array.from(
				{ length: loops },
				async () => {
					const result = {
						end: "pending",
						seqs: /** @type {number[]} */([])/**/
					}
					results.push(result)
					const most = random.chance(0.3) ? random.int(5) : Infinity
					try {
						for await (const message of socket) {
							const { seq } = /** @type {{ seq?: number }} */(message)/**/
							if (seq) result.seqs.push(seq)
							if (result.seqs.length > most) {
								result.end = "break"
								return
							}
							if (limit && random.chance(0.3)) await sleep(between(random, 1, 10))
						}
						result.end = "end"
					} catch (error) {
						result.end = kind_of(error)
					}
				}
			)
			/** @type {string[]} */
			const sent = []
			const action = random.pick(
				/** @type {const} */([
					"cancel",
					"cancel",
					"abort",
					"none",
					"send"
				])/**/
			)
			const action_at = between(random, 5, 150)
			const sends = random.int(6)
			for (let i = 0; i < sends; i++) {
				await sleep(random.int(31))
				try {
					socket.send("m" + i)
					sent.push("m" + i)
				} catch (error) {
					if (!(error instanceof CancelError)) problems.push(`send threw ${String(error)}`)
				}
			}
			await sleep(action_at)
			if (action == "cancel") socket.cancel()
			if (action == "abort" && use_signal) controller.abort()
			const closed_by_us = action == "cancel" || action == "abort" && use_signal
			const settled = await until(
				() => results.every(
					result => result.end != "pending"
				),
				closed_by_us ? 1000 : 3000
			)
			if (closed_by_us && !settled) problems.push(
				`loops still pending after ${action}`
			)
			socket.cancel()
			await Promise.race(
				[
					Promise.all(running),
					sleep(1000)
				]
			)
			if (results.some(
				result => result.end == "pending"
			)) problems.push(
				"loops still pending after cancel()"
			)
			for (const result of results) {
				for (let i = 1; i < result.seqs.length; i++) {
					if (/** @type {number} */(result.seqs[i])/**/ <= /** @type {number} */(result.seqs[i - 1])/**/) problems.push(
						`messages out of order ${result.seqs}`
					)
				}
				if (result.end.startsWith("other") || result.end.startsWith("type") && !(parse_mode == "fail" && result.end.includes("bad message"))) problems.push(
					`a loop failed with ${result.end}`
				)
			}
			problems.push(...check_statuses(statuses))
			if (socket.status != "closed") problems.push(
				`socket.status ${socket.status}`
			)
			const delivered = state.received.filter(text => /^m\d/.test(text))
			if (new Set(delivered).size != delivered.length) problems.push(
				`a message was sent twice: ${delivered}`
			)
			for (let i = 1; i < delivered.length; i++) {
				if (Number(delivered[i]?.slice(1)) < Number(delivered[i - 1]?.slice(1))) problems.push(
					`messages sent out of order: ${delivered}`
				)
			}
			if (errors.some(
				error => error instanceof CancelError
			)) problems.push(
				"the error hook got a CancelError"
			)
			sockets.delete(id)
			return problems.length
				? [
					...problems,
					`script ${JSON.stringify(script.slice(0, state.connections + 1))}`,
					`options ${JSON.stringify({ action, action_at, count, heartbeat: !!heartbeat, limit, outbox, parse_mode, reconnect: !!reconnect, use_signal })}`,
					`statuses ${statuses.join(">")} connections ${state.connections} errors ${errors.map(kind_of)} loops ${JSON.stringify(results)}`
				]
				: []
		}
		for (const [ mode, fuzz, count ] of /** @type {const} */([
			[ "ws", fuzz_ws, 24 ],
			[ "sse", fuzz_sse, 24 ]
		])/**/) {
			it(
				mode,
				async () => {
					/** @type {string[]} */
					const failures = []
					const seeds = sim_seeds(mode, count)
					let next = 0
					await Promise.all(
						Array.from(
							{ length: 16 },
							async () => {
								while (next < seeds.length) {
									const seed = /** @type {number} */(seeds[next++])/**/
									const problems = await fuzz(seed)
									if (problems.length) failures.push(
										[
											`SIM_MODE=${mode} SIM_SEED=${seed}`,
											...problems
										].join("\n")
									)
								}
							}
						)
					)
					assert.deepEqual(
						{
							count: failures.length,
							first: failures.slice(0, 3),
							unhandled: unhandled.map(String)
						},
						{ count: 0, first: [], unhandled: [] }
					)
				},
				600000
			)
		}
	}
)
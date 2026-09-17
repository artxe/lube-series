/** @import { ConnectionStatus } from "async-lube" */
import { NetworkError, SocketError, http } from "async-lube"
import { assert, describe, inject, it } from "vitest"
describe(
	"WebSocket in a browser",
	() => {
		const base = inject("base")
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
		 * @param {import("async-lube").Socket} socket
		 * @param {number} count
		 * @returns {Promise<unknown[]>}
		 */
		async function take(socket, count) {
			/** @type {unknown[]} */
			const messages = []
			for await (const message of socket) {
				messages.push(message)
				if (messages.length == count) break
			}
			return messages
		}
		it(
			"connects, sends and receives with the real WebSocket",
			async () => {
				assert.isFunction(globalThis.WebSocket)
				const api = http({ base })
				const socket = api.ws(
					"/ws",
					{ key: "browser-echo" },
					{ protocols: "chat" }
				)
				socket.send({ hello: "world" })
				const messages = await take(socket, 2)
				assert.equal(
					/** @type {{ protocol: string }} */(messages[0])/**/.protocol,
					"chat"
				)
				assert.deepEqual(messages[1], { hello: "world" })
				assert.equal(socket.status, "open")
				socket.cancel()
				await sleep(20)
				assert.equal(socket.status, "closed")
			}
		)
		it(
			"ends the loops on a close with 1000",
			async () => {
				const socket = http({ base }).ws("/ws", { key: "browser-close" })
				/** @type {unknown[]} */
				const seen = []
				socket.send("close 1000 bye")
				for await (const message of socket) seen.push(message)
				assert.equal(seen.length, 1)
				assert.equal(socket.status, "idle")
			}
		)
		it(
			"reads binary messages as ArrayBuffers",
			async () => {
				const socket = http({ base }).ws("/ws", { key: "browser-binary" })
				await take(socket, 1)
				socket.send(new Uint8Array([ 1, 2, 3 ]))
				const messages = await take(socket, 1)
				assert.instanceOf(messages[0], ArrayBuffer)
				assert.deepEqual(
					[
						...new Uint8Array(
							/** @type {ArrayBuffer} */(messages[0])/**/
						)
					],
					[ 1, 2, 3 ]
				)
				socket.cancel()
			}
		)
		it(
			"reconnects after the connection drops",
			async () => {
				/** @type {ConnectionStatus[]} */
				const statuses = []
				const socket = http({ base }).ws(
					"/ws",
					{ key: "browser-drop" },
					{
						onStatus: status => statuses.push(status),
						reconnect: { delay: () => 10 }
					}
				)
				socket.send("drop")
				const messages = await take(socket, 2)
				assert.equal(
					/** @type {{ count: number }} */(messages[0])/**/.count,
					1
				)
				assert.equal(
					/** @type {{ count: number }} */(messages[1])/**/.count,
					2
				)
				assert.include(statuses, "connecting")
				assert.include(statuses, "open")
				socket.cancel()
			}
		)
		it(
			"reconnects at once when the browser comes back online",
			async () => {
				const socket = http({ base }).ws(
					"/ws",
					{ key: "browser-online" },
					{
						reconnect: { delay: () => 30000 }
					}
				)
				const first = take(socket, 1)
				await first
				socket.send("drop")
				await sleep(50)
				const reconnected = take(socket, 1)
				globalThis.dispatchEvent(new Event("online"))
				const messages = await Promise.race(
					[
						reconnected,
						sleep(3000).then(() => "pending")
					]
				)
				assert.notEqual(messages, "pending")
				assert.equal(
					/** @type {{ count: number }[]} */(messages)/**/[0]?.count,
					2
				)
				socket.cancel()
			}
		)
		it(
			"rejects the loops with SocketError on a policy close",
			async () => {
				const socket = http({ base }).ws(
					"/ws",
					{ key: "browser-policy" },
					{ reconnect: false }
				)
				socket.send("close 4001 denied")
				/** @type {unknown} */
				let error
				try {
					for await (const message of socket) void message
				} catch (thrown) {
					error = thrown
				}
				assert.instanceOf(error, SocketError)
				assert.equal(error.code, 4001)
			}
		)
		it(
			"reports a refused upgrade as a dropped connection",
			async () => {
				/** @type {unknown[]} */
				const reported = []
				const socket = http(
					{
						base,
						on: {
							error: error => void reported.push(error)
						}
					}
				).ws(
					"/ws-reject",
					{ key: "browser-reject" },
					{
						reconnect: { count: 1, delay: () => 1 }
					}
				)
				/** @type {unknown} */
				let failure
				try {
					for await (const message of socket) void message
				} catch (error) {
					failure = error
				}
				assert.instanceOf(failure, NetworkError)
				const cause = /** @type {NetworkError} */(failure)/**/.cause
				assert.instanceOf(cause, SocketError)
				assert.equal(
					/** @type {SocketError} */(cause)/**/.code,
					1006
				)
				assert.lengthOf(reported, 2)
				assert.equal(reported[1], failure)
			}
		)
	}
)
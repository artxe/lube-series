import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { gzipSync } from "node:zlib"
/**
 * @param {import("node:stream").Duplex} socket
 * @param {number} code
 * @param {string} reason
 * @returns {void}
 */
export function close_frame(socket, code, reason) {
	const payload = Buffer.alloc(2 + Buffer.byteLength(reason))
	payload.writeUInt16BE(code)
	payload.write(reason, 2)
	write_frame(socket, 8, payload)
	socket.end()
}
/**
 * @param {import("node:stream").Duplex} socket
 * @param {(opcode: number, payload: Buffer) => void} on_frame
 * @returns {void}
 */
export function read_frames(socket, on_frame) {
	let pending = Buffer.alloc(0)
	socket.on(
		"data",
		(/** @type {Buffer} */ chunk) => {
			pending = Buffer.concat([ pending, chunk ])
			for (;;) {
				if (pending.length < 2) return
				const opcode = /** @type {number} */(pending[0])/**/ & 15
				let length = /** @type {number} */(pending[1])/**/ & 127
				let offset = 2
				if (length == 126) {
					if (pending.length < 4) return
					length = pending.readUInt16BE(2)
					offset = 4
				} else if (length == 127) {
					if (pending.length < 10) return
					length = Number(pending.readBigUInt64BE(2))
					offset = 10
				}
				if (pending.length < offset + 4 + length) return
				const mask = pending.subarray(offset, offset + 4)
				const payload = Buffer.from(
					pending.subarray(offset + 4, offset + 4 + length)
				)
				for (let i = 0; i < payload.length; i++) payload[i] = /** @type {number} */(payload[i])/**/ ^ /** @type {number} */(mask[i % 4])/**/
				pending = pending.subarray(offset + 4 + length)
				on_frame(opcode, payload)
			}
		}
	)
}
/**
 * @returns {Promise<{ base: string, close: () => Promise<void>, hits: Map<string, number> }>}
 */
export async function start_server() {
	/** @type {Map<string, number>} */
	const hits = new Map()
	/** @type {Map<string, () => void>} */
	const releases = new Map()
	/** @type {Set<import("node:stream").Duplex>} */
	const upgrades = new Set()
	/**
	 * @param {string} key
	 * @returns {number}
	 */
	function hit(key) {
		const count = (hits.get(key) ?? 0) + 1
		hits.set(key, count)
		return count
	}
	const server = createServer(
		async (request, response) => {
			const url = new URL(
				/** @type {string} */(request.url)/**/,
				"http://localhost"
			)
			const origin = request.headers.origin
			if (origin && url.pathname != "/no-cors") {
				response.setHeader(
					"Access-Control-Allow-Credentials",
					"true"
				)
				response.setHeader(
					"Access-Control-Allow-Headers",
					request.headers["access-control-request-headers"] ?? "Content-Type"
				)
				response.setHeader(
					"Access-Control-Allow-Methods",
					request.headers["access-control-request-method"] ?? "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT"
				)
				response.setHeader(
					"Access-Control-Allow-Origin",
					origin
				)
				response.setHeader(
					"Access-Control-Expose-Headers",
					"Content-Disposition, Content-Encoding, Content-Length, Content-Type, Retry-After, X-Id, X-Size"
				)
			}
			if (request.method == "OPTIONS" && request.headers["access-control-request-method"]) {
				response.writeHead(204)
				response.end()
				return
			}
			/** @type {Buffer[]} */
			const chunks = []
			for await (const chunk of request) chunks.push(chunk)
			const body = Buffer.concat(chunks)
			const key = url.searchParams.get("key") ?? url.pathname
			/**
			 * @param {number} status
			 * @param {unknown} data
			 * @param {Record<string, string>=} headers
			 */
			function json(status, data, headers = {}) {
				response.writeHead(
					status,
					{
						"Content-Type": "application/json",
						...headers
					}
				)
				response.end(JSON.stringify(data))
			}
			switch (url.pathname) {
			case "/auth": {
				hit(key)
				if (request.headers.authorization == "Bearer fresh") json(200, { ok: true })
				else json(401, { message: "Expired" })
				return
			}
			case "/bad-json":
				response.writeHead(
					500,
					{
						"Content-Type": "application/json"
					}
				)
				response.end("<html>proxy error</html>")
				return
			case "/body-drop":
				hit(key)
				response.writeHead(
					200,
					{
						"Content-Length": "100",
						"Content-Type": "application/json"
					}
				)
				response.write("{\"a\":")
				setTimeout(
					() => response.socket?.destroy(),
					5
				)
				return
			case "/big": {
				const size = 64 * 1024
				response.writeHead(
					200,
					{
						"Content-Length": String(size),
						"Content-Type": "application/octet-stream"
					}
				)
				for (let i = 0; i < 8; i++) {
					response.write(Buffer.alloc(size / 8, i))
					await new Promise(
						resolve => setTimeout(resolve, 2)
					)
				}
				response.end()
				return
			}
			case "/count": {
				await new Promise(
					resolve => setTimeout(
						resolve,
						Number(
							url.searchParams.get("ms") ?? 20
						)
					)
				)
				json(200, { count: hit(key) })
				return
			}
			case "/echo":
				hit(key)
				json(
					200,
					{
						body: body.toString(),
						headers: request.headers,
						method: request.method,
						url: request.url
					}
				)
				return
			case "/empty":
				response.writeHead(204)
				response.end()
				return
			case "/events":
				response.writeHead(
					200,
					{
						"Content-Type": "text/event-stream"
					}
				)
				response.write(": comment\r\n")
				response.write("data: first\r")
				response.write("\n\r\n")
				response.write(
					"event: update\nid: 7\nretry: 1000\ndata: {\"a\":1}\ndata: second line\n\n"
				)
				response.write("data:no space\n\n")
				setTimeout(
					() => response.end("data: last\n\n"),
					5
				)
				return
			case "/file":
				if (url.searchParams.has("lang")) {
					response.writeHead(
						200,
						{
							"Content-Disposition": "attachment; filename*=UTF-8'en'%E2%82%AC%20rates.txt",
							"Content-Type": "text/plain"
						}
					)
					response.end("rates")
					return
				}
				response.writeHead(
					200,
					{
						"Content-Disposition": "attachment; filename=\"fallback.csv\"; "
							+ "filename*=UTF-8''%EA%B1%B0%EB%9E%98%EB%82%B4%EC%97%AD.csv",
						"Content-Type": "text/csv"
					}
				)
				response.end("a,b\n1,2")
				return
			case "/flaky": {
				const count = hit(key)
				if (count <= Number(
					url.searchParams.get("fail") ?? 1
				)) {
					json(
						Number(
							url.searchParams.get("status") ?? 503
						),
						{
							error: { message: "Try later" }
						},
						url.searchParams.has("retry_after")
							? {
								"Retry-After": String(
									url.searchParams.get("retry_after")
								)
							}
							: {}
					)
				} else {
					json(
						200,
						{
							count,
							idempotency_key: request.headers["idempotency-key"] ?? null
						}
					)
				}
				return
			}
			case "/gzip": {
				const zipped = gzipSync(
					JSON.stringify(
						Array.from({ length: 2000 }, (_, i) => i)
					)
				)
				response.writeHead(
					200,
					{
						"Content-Encoding": "gzip",
						"Content-Length": String(zipped.length),
						"Content-Type": "application/json"
					}
				)
				response.end(zipped)
				return
			}
			case "/html":
				response.writeHead(
					200,
					{ "Content-Type": "text/html" }
				)
				response.end("<p>login</p>")
				return
			case "/ndjson":
				response.writeHead(
					200,
					{
						"Content-Type": "application/x-ndjson"
					}
				)
				response.write(
					`{"body":${JSON.stringify(body.toString())},"method":"${request.method}"}\r\n`
				)
				response.write("{\"a\":")
				response.write("1}\n\n  \n{\"b\":2}\n")
				setTimeout(
					() => response.end("{\"c\":3}"),
					5
				)
				return
			case "/ndjson-bad":
				response.writeHead(
					200,
					{
						"Content-Type": "application/x-ndjson"
					}
				)
				response.end("{\"a\":1}\n{oops\n")
				return
			case "/ndjson-drop":
				hit(key)
				response.writeHead(
					200,
					{
						"Content-Type": "application/x-ndjson"
					}
				)
				response.write("{\"a\":1}\n")
				setTimeout(
					() => response.socket?.destroy(),
					5
				)
				return
			case "/ndjson-live": {
				response.writeHead(
					200,
					{
						"Content-Type": "application/x-ndjson"
					}
				)
				let count = 0
				const timer = setInterval(
					() => response.write(`{"n":${++count}}\n`),
					5
				)
				response.on(
					"close",
					() => {
						clearInterval(timer)
						hit(key + "-closed")
					}
				)
				return
			}
			case "/sse": {
				const count = hit(key)
				const last_event_id = request.headers["last-event-id"] ?? ""
				if (url.searchParams.has("fail") && count == 1) {
					json(503, { message: "Unavailable" })
					return
				}
				if (count > 2) {
					response.writeHead(204)
					response.end()
					return
				}
				response.writeHead(
					200,
					{
						"Content-Type": "text/event-stream"
					}
				)
				response.end(
					`retry: 5\nid: ${count}\n`
					+ `data: ${request.method} ${count} ${request.headers.accept} ${last_event_id} ${body}\n\n`
				)
				return
			}
			case "/sse-busy":
				hit(key)
				json(
					503,
					{ message: "Busy" },
					{
						"Retry-After": url.searchParams.get("after") ?? "120"
					}
				)
				return
			case "/sse-cr": {
				response.writeHead(
					200,
					{
						"Content-Type": "text/event-stream"
					}
				)
				response.write("data: first\r\r")
				const timer = setTimeout(
					() => {
						hit(key + "-late")
						response.end("data: second\r\r")
					},
					2000
				)
				releases.set(
					key,
					() => {
						clearTimeout(timer)
						response.end("data: second\r\r")
					}
				)
				return
			}
			case "/sse-cr-release":
				releases.get(key)?.()
				releases.delete(key)
				json(200, {})
				return
			case "/sse-drop":
				hit(key)
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
			case "/sse-live": {
				response.writeHead(
					200,
					{
						"Content-Type": "text/event-stream"
					}
				)
				let count = 0
				const timer = setInterval(
					() => response.write(`data: ${++count}\n\n`),
					5
				)
				response.on(
					"close",
					() => {
						clearInterval(timer)
						hit(key + "-closed")
					}
				)
				return
			}
			case "/slow":
				setTimeout(
					() => json(200, { slow: true }),
					Number(
						url.searchParams.get("ms") ?? 200
					)
				)
				return
			case "/slow-error":
				response.writeHead(
					500,
					{
						"Content-Type": "application/json"
					}
				)
				response.flushHeaders()
				setTimeout(() => response.end("{}"), 300)
				return
			case "/sse-state":
			case "/sse-unicode": {
				if (hit(key) == 1) {
					response.writeHead(
						200,
						{
							"Content-Type": "text/event-stream"
						}
					)
					response.end(
						url.pathname == "/sse-state"
							? "id: 1\ndata: a\n\nid: 2\n\nretry: 10\n\n"
							: "retry: 10\nid: 사용자-1\ndata: x\n\n"
					)
					return
				}
				const last_event_id = String(
					request.headers["last-event-id"] ?? ""
				)
				hit(
					key + ":" + Buffer.from(last_event_id, "latin1").toString("utf8")
				)
				response.writeHead(204)
				response.end()
				return
			}
			case "/status":
				json(
					Number(url.searchParams.get("code")),
					{
						detail: "Status " + url.searchParams.get("code")
					}
				)
				return
			case "/text":
				response.writeHead(
					200,
					{
						"Content-Type": "text/plain; charset=utf-8"
					}
				)
				response.end("안녕")
				return
			case "/no-cors":
				json(200, { ok: true })
				return
			case "/upload": {
				hit(key)
				const ms = Number(
					url.searchParams.get("ms") ?? 0
				)
				if (ms) {
					await new Promise(
						resolve => setTimeout(resolve, ms)
					)
				}
				const status = Number(
					url.searchParams.get("code") ?? 200
				)
				json(
					status,
					status < 400 ? { size: body.byteLength } : { message: "Upload failed" },
					{
						"X-Size": String(body.byteLength)
					}
				)
				return
			}
			case "/zero":
				response.writeHead(
					200,
					{
						"Content-Length": "0",
						"Content-Type": "application/octet-stream"
					}
				)
				response.end()
				return
			default:
				json(404, { message: "Not found" })
			}
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
			const key = url.searchParams.get("key") ?? url.pathname
			const count = hit(key)
			if (url.pathname == "/ws-hang") return
			if (url.pathname != "/ws") {
				socket.end(
					"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n"
				)
				return
			}
			const accept = createHash("sha1")
				.update(
					request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
				)
				.digest("base64")
			const protocol = String(
				request.headers["sec-websocket-protocol"] ?? ""
			)
				.split(",")[0]
				?.trim()
			socket.write(
				"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
				+ `Sec-WebSocket-Accept: ${accept}\r\n`
				+ (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "")
				+ "\r\n"
			)
			socket.on(
				"close",
				() => hit(key + "-closed")
			)
			const silent = url.searchParams.has("silent")
			if (count <= Number(
				url.searchParams.get("fail") ?? 0
			)) {
				close_frame(
					socket,
					Number(url.searchParams.get("code")),
					"failed " + count
				)
				return
			}
			if (!silent) write_frame(
				socket,
				1,
				Buffer.from(
					JSON.stringify(
						{ count, protocol, url: request.url }
					)
				)
			)
			read_frames(
				socket,
				(opcode, payload) => {
					hit(key + "-received")
					if (opcode == 8) {
						close_frame(socket, 1000, "")
						return
					}
					if (silent) return
					const text = payload.toString()
					if (opcode == 1 && text.startsWith("close ")) {
						const [ , code, reason ] = text.split(" ")
						close_frame(socket, Number(code), reason ?? "")
					} else if (opcode == 1 && text == "drop") socket.destroy()
					else write_frame(socket, opcode, payload)
				}
			)
		}
	)
	await new Promise(
		resolve => server.listen(
			0,
			"127.0.0.1",
			() => resolve(void 0)
		)
	)
	const address = /** @type {import("node:net").AddressInfo} */(server.address())/**/
	return {
		base: `http://127.0.0.1:${address.port}`,
		close: () => new Promise(
			resolve => {
				server.closeAllConnections()
				for (const socket of upgrades) socket.destroy()
				server.close(() => resolve())
			}
		),
		hits
	}
}
/**
 * @param {import("node:stream").Duplex} socket
 * @param {number} opcode
 * @param {Buffer} payload
 * @returns {void}
 */
export function write_frame(socket, opcode, payload) {
	const length = payload.length
	const head = length < 126
		? Buffer.from([ 128 | opcode, length ])
		: Buffer.from(
			[
				128 | opcode,
				126,
				length >> 8,
				length & 255
			]
		)
	if (!socket.destroyed) socket.write(
		Buffer.concat([ head, payload ])
	)
}
/** @import { RequestSummary } from "async-lube" */
/** @import { Echo, Flaky } from "./private.js" */
import {
	get_reconnect_delay,
	get_retry_delay
} from "../../packages/async-lube/src/http/retry.js"
import { encode_cp949 } from "./cp949.js"
import { start_server } from "./server.js"
import {
	CancelError,
	HttpError,
	NetworkError,
	TimeoutError,
	http,
	isCancel
} from "async-lube"
import { execFile } from "node:child_process"
import { getEventListeners } from "node:events"
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
	"http",
	() => {
		/** @type {Awaited<ReturnType<typeof start_server>>} */
		let server
		/**
		 * @param {string} url
		 * @param {RequestInit=} init
		 * @returns {Promise<Response>}
		 */
		async function auth_fetch(url, init) {
			const key = new URL(url).searchParams.get("key") ?? ""
			server.hits.set(
				key,
				(server.hits.get(key) ?? 0) + 1
			)
			return new Headers(init?.headers).get("Authorization") == "Bearer fresh"
				? Response.json({ ok: true })
				: Response.json(
					{ message: "Expired" },
					{ status: 401 }
				)
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
		 * @template T
		 * @param {PromiseLike<T>} promise
		 * @param {number} ms
		 * @returns {Promise<T>}
		 */
		async function settled(promise, ms) {
			const result = Promise.resolve(promise)
			result.catch(() => {})
			await vi.advanceTimersByTimeAsync(ms)
			return result
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
		afterAll(() => server.close())
		afterEach(
			() => {
				vi.unstubAllGlobals()
				vi.useRealTimers()
			}
		)
		beforeAll(
			async () => {
				server = await start_server()
			}
		)
		it(
			"body drops",
			async () => {
				const error = await rejection(
					create().get(
						"/body-drop",
						{ key: "body-drop" },
						{
							retry: { count: 1, delay: () => 0 }
						}
					)
				)
				assert.instanceOf(error, NetworkError)
				assert.equal(server.hits.get("body-drop"), 2)
			}
		)
		it(
			"body serialization",
			async () => {
				const api = create()
				/** @type {Echo} */
				const json = await api.post("/echo", { a: [ 1 ], b: "c" })
				assert.equal(
					json.body,
					"{\"a\":[1],\"b\":\"c\"}"
				)
				assert.equal(
					json.headers["content-type"],
					"application/json"
				)
				/** @type {Echo} */
				const text = await api.put("/echo", "plain")
				assert.equal(text.body, "plain")
				assert.equal(
					text.headers["content-type"],
					"text/plain;charset=UTF-8"
				)
				const form = new FormData()
				form.append("name", "value")
				/** @type {Echo} */
				const multipart = await api.patch("/echo", form)
				assert.match(
					/** @type {string} */(multipart.headers["content-type"])/**/,
					/^multipart\/form-data; boundary=/
				)
				assert.include(multipart.body, "value")
				/** @type {Echo} */
				const configured = await create(
					{
						headers: {
							"Content-Type": "application/json"
						}
					}
				)
					.post("/echo", form)
				assert.match(
					/** @type {string} */(configured.headers["content-type"])/**/,
					/^multipart\/form-data; boundary=/
				)
				/** @type {Echo} */
				const custom = await api.post(
					"/echo",
					{ a: 1 },
					{
						headers: {
							"Content-Type": "application/vnd.api+json"
						}
					}
				)
				assert.equal(
					custom.headers["content-type"],
					"application/vnd.api+json"
				)
				/** @type {Echo} */
				const encoded = await api.request(
					"post",
					"/echo",
					{
						body: new URLSearchParams({ a: "1 2" })
					}
				)
				assert.equal(encoded.method, "POST")
				assert.equal(encoded.body, "a=1+2")
			}
		)
		it(
			"body types",
			async () => {
				const api = create()
				/** @type {Echo} */
				const blob = await api.post(
					"/echo",
					new Blob(
						[ "blob body" ],
						{ type: "text/x-custom" }
					)
				)
				assert.equal(blob.body, "blob body")
				assert.equal(
					blob.headers["content-type"],
					"text/x-custom"
				)
				/** @type {Echo} */
				const bytes = await api.post(
					"/echo",
					new TextEncoder().encode("bytes")
				)
				assert.equal(bytes.body, "bytes")
				assert.isUndefined(bytes.headers["content-type"])
				/** @type {Echo} */
				const buffer = await api.post(
					"/echo",
					new TextEncoder().encode("buffer").buffer
				)
				assert.equal(buffer.body, "buffer")
				/** @type {Echo} */
				const json_null = await api.post("/echo", null)
				assert.equal(json_null.body, "null")
				assert.equal(
					json_null.headers["content-type"],
					"application/json"
				)
				/** @type {Echo} */
				const none = await api.post("/echo")
				assert.equal(none.body, "")
				assert.isUndefined(none.headers["content-type"])
			}
		)
		it(
			"cancel",
			async () => {
				const api = create()
				const request = api.get("/slow", { ms: 500 })
				request.cancel()
				const error = await rejection(request)
				assert.instanceOf(error, CancelError)
				assert.isTrue(isCancel(error))
				const controller = new AbortController()
				const signalled = api.get(
					"/slow",
					{ ms: 500 },
					{ signal: controller.signal }
				)
				controller.abort("unmounted")
				const signal_error = await rejection(signalled)
				assert.isTrue(isCancel(signal_error))
				assert.instanceOf(signal_error, CancelError)
				assert.equal(signal_error.cause, "unmounted")
				const reader = new AbortController()
				const mid_read = await rejection(
					api.get(
						"/big",
						{},
						{
							progress: ({ loaded }) => {
								if (loaded > 0) reader.abort("mid-read")
							},
							signal: reader.signal
						}
					)
				)
				assert.instanceOf(mid_read, CancelError)
				assert.equal(mid_read.cause, "mid-read")
				const done = api.get("/text")
				assert.equal(await done, "안녕")
				done.cancel()
				assert.equal(await done, "안녕")
			}
		)
		it(
			"debounce",
			async () => {
				const api = create()
				const requests = [ "a", "ab", "abc" ].map(
					q => api.get(
						"/count",
						{ key: "debounce", q },
						{ debounce: 30 }
					)
						.safe()
				)
				const results = await Promise.all(requests)
				assert.isTrue(isCancel(results[0]?.[0]))
				assert.isTrue(isCancel(results[1]?.[0]))
				assert.deepEqual(
					results[2],
					[ void 0, { count: 1 } ]
				)
				assert.equal(server.hits.get("debounce"), 1)
				const drafts = http(
					{
						base: "http://localhost",
						fetch: async url => new Response(url)
					}
				)
				const rooms = await Promise.all(
					[ "r1", "r2" ].map(
						room => drafts.put(
							"/rooms/:room",
							{ room },
							{ debounce: 30, params: { room } }
						).safe()
					)
				)
				assert.deepEqual(
					rooms.map(([ error ]) => error),
					[ void 0, void 0 ]
				)
			}
		)
		it(
			"dedupe",
			async () => {
				const api = create()
				const [ a, b, c ] = await Promise.all(
					[
						api.get("/count", { key: "dedupe" }),
						api.get("/count", { key: "dedupe" }),
						api.get("/count", { key: "dedupe" })
					]
				)
				assert.deepEqual(
					[ a, b, c ],
					[
						{ count: 1 },
						{ count: 1 },
						{ count: 1 }
					]
				)
				const cancelled = api.get("/count", { key: "dedupe" })
				const kept = api.get("/count", { key: "dedupe" })
				cancelled.cancel()
				assert.isTrue(
					isCancel(await rejection(cancelled))
				)
				assert.deepEqual(await kept, { count: 2 })
				await Promise.all(
					[
						api.get(
							"/count",
							{ key: "dedupe" },
							{ dedupe: false }
						),
						api.get(
							"/count",
							{ key: "dedupe" },
							{ dedupe: false }
						)
					]
				)
				assert.equal(server.hits.get("dedupe"), 4)
				const controller = new AbortController()
				const aborted = api.get(
					"/count",
					{ key: "dedupe" },
					{ signal: controller.signal }
				)
				const signalled = api.get(
					"/count",
					{ key: "dedupe" },
					{
						signal: new AbortController().signal
					}
				)
				controller.abort()
				assert.isTrue(
					isCancel(await rejection(aborted))
				)
				assert.deepEqual(await signalled, { count: 5 })
				assert.equal(server.hits.get("dedupe"), 5)
			}
		)
		it(
			"dedupe copies",
			async () => {
				const api = create()
				const [ first, second ] = /** @type {[Echo, Echo]} */(await Promise.all(
					[
						api.get("/echo", { key: "copy" }),
						api.get("/echo", { key: "copy" })
					]
				))/**/
				first.method = "changed"
				assert.equal(second.method, "GET")
				assert.equal(server.hits.get("copy"), 1)
			}
		)
		it(
			"dedupe isolation",
			async () => {
				const api = create()
				const cancelled = api.get("/slow", { ms: 30 })
				cancelled.cancel()
				await cancelled.safe()
				assert.deepEqual(
					await api.get("/slow", { ms: 30 }),
					{ slow: true }
				)
				const alice = create(
					{
						headers: { Authorization: "alice" }
					}
				)
				const bob = alice.extend(
					{
						headers: { Authorization: "bob" }
					}
				)
				const [ from_alice, from_bob ] = /** @type {[Echo, Echo]} */(await Promise.all(
					[
						alice.get("/echo", { key: "isolation" }),
						bob.get("/echo", { key: "isolation" })
					]
				))/**/
				assert.equal(
					from_alice.headers.authorization,
					"alice"
				)
				assert.equal(
					from_bob.headers.authorization,
					"bob"
				)
				const [ plain, parsed ] = /** @type {[Echo, string]} */(await Promise.all(
					[
						api.get("/echo", { key: "parse" }),
						api.get(
							"/echo",
							{ key: "parse" },
							{
								parse: data => /** @type {Echo} */(data)/**/.method + "!"
							}
						)
					]
				))/**/
				assert.equal(plain.method, "GET")
				assert.equal(parsed, "GET!")
				assert.equal(server.hits.get("parse"), 2)
			}
		)
		it(
			"empty bodies",
			async () => {
				const api = http(
					{
						base: "http://localhost",
						fetch: async url => new Response(
							new Blob([ "" ]),
							{
								headers: url.endsWith("/json")
									? {
										"Content-Type": "application/json"
									}
									: url.endsWith("/text")
										? { "Content-Type": "text/plain" }
										: {}
							}
						)
					}
				)
				assert.isUndefined(await api.get("/json"))
				assert.equal(await api.get("/text"), "")
				assert.isUndefined(await api.get("/none"))
				assert.isUndefined(
					await api.get("/none", {}, { as: "json" })
				)
				assert.equal(
					await api.get("/json", {}, { as: "text" }),
					""
				)
			}
		)
		it(
			"error bodies",
			async () => {
				const api = create()
				const error = await rejection(api.get("/bad-json"))
				assert.instanceOf(error, HttpError)
				assert.equal(
					error.data,
					"<html>proxy error</html>"
				)
				/** @type {unknown[]} */
				const statuses = []
				const busy = api.sse(
					"/sse-busy",
					{ key: "busy" },
					{
						onStatus: status => void statuses.push(status)
					}
				)
				const next = busy[Symbol.asyncIterator]()
					.next()
				await eventually(() => server.hits.has("busy"))
				await sleep(100)
				assert.equal(server.hits.get("busy"), 1)
				assert.deepEqual(statuses, [ "connecting" ])
				busy.cancel()
				assert.deepEqual(
					await next,
					{ done: true, value: void 0 }
				)
				const now = api.sse(
					"/sse-busy",
					{ after: 0, key: "busy-now" }
				)
				const now_next = now[Symbol.asyncIterator]()
					.next()
				await eventually(
					() => server.hits.has("busy-now")
				)
				await sleep(200)
				assert.equal(server.hits.get("busy-now"), 1)
				now.cancel()
				await now_next
				const refused = await rejection(
					api.sse(
						"/sse-busy",
						{ key: "busy-once" },
						{ reconnect: { count: 0 } }
					)[Symbol.asyncIterator]()
						.next()
				)
				assert.instanceOf(refused, HttpError)
				assert.equal(server.hits.get("busy-once"), 1)
			}
		)
		it(
			"error hooks",
			async () => {
				/** @type {unknown[]} */
				const errors = []
				const api = create(
					{
						on: {
							error: error => {
								errors.push(error)
								throw Error("The hook failed")
							}
						}
					}
				)
				assert.instanceOf(
					await rejection(
						api.get("/status", { code: 404 })
					),
					HttpError
				)
				assert.instanceOf(
					await rejection(
						api.get(
							"/users/:id",
							/** @type {never} */({})/**/
						)
					),
					TypeError
				)
				assert.equal(errors.length, 2)
			}
		)
		it(
			"extend",
			async () => {
				/** @type {string[]} */
				const calls = []
				const api = create(
					{
						headers: {
							"X-App": "web",
							"X-Scope": "base"
						},
						on: {
							request: () => void calls.push("base")
						}
					}
				)
				const admin = api.extend(
					{
						headers: async () => ({ "X-Scope": "admin" }),
						on: {
							request: () => void calls.push("admin")
						}
					}
				)
				/** @type {Echo} */
				const echo = await admin.get("/echo")
				assert.equal(echo.headers["x-app"], "web")
				assert.equal(echo.headers["x-scope"], "admin")
				assert.deepEqual(calls, [ "base", "admin" ])
			}
		)
		it(
			"extend config",
			async () => {
				const api = create(
					{ headers: { "X-App": "web" } }
				)
				/** @type {Echo} */
				const echo = await api.extend(
					/** @type {never} */({ headers: void 0, timeout: 1000 })/**/
				)
					.get("/echo")
				assert.equal(echo.headers["x-app"], "web")
			}
		)
		it(
			"file download and progress",
			async () => {
				const api = create()
				const file = await api.get("/file", {}, { as: "file" })
				assert.equal(file.name, "거래내역.csv")
				assert.equal(
					await file.blob.text(),
					"a,b\n1,2"
				)
				/** @type {import("async-lube").Progress[]} */
				const progress = []
				const blob = await api.get(
					"/big",
					{},
					{
						progress: value => progress.push(value)
					}
				)
				assert.instanceOf(blob, Blob)
				assert.equal(blob.size, 64 * 1024)
				assert.deepEqual(
					progress[0],
					{
						loaded: 0,
						ratio: 0,
						total: 64 * 1024
					}
				)
				assert.deepEqual(
					progress[progress.length - 1],
					{
						loaded: 64 * 1024,
						ratio: 1,
						total: 64 * 1024
					}
				)
			}
		)
		it(
			"file names",
			async () => {
				/** @type {Record<string, [string, string]>} */
				const cases = {
					"iso-8859-1": [
						"attachment; filename*=ISO-8859-1''caf%E9.txt",
						"café.txt"
					],
					"latin1-plain": [
						"attachment; filename=\"café.txt\"",
						"café.txt"
					],
					"lower-charset": [
						"attachment; filename*=utf-8''%EC%98%88%EC%95%BD.csv",
						"예약.csv"
					],
					"percent": [
						`attachment; filename="${encodeURIComponent("예약 목록.csv")}"`,
						"예약 목록.csv"
					],
					"percent-invalid": [
						"attachment; filename=\"100%.txt\"",
						"100%.txt"
					],
					"raw-cp949": [
						`attachment; filename="${String.fromCharCode(0xBD, 0xBA, 0xC5, 0xCD, 0xB5, 0xF0)}.csv"`,
						"스터디.csv"
					],
					"raw-cp949-enclosed": [
						`attachment; filename="${String.fromCharCode(0xA2, 0xDF, 0xB9, 0xE8, 0xB4, 0xDE)}.pdf"`,
						"㈜배달.pdf"
					],
					"raw-cp949-hanja": [
						`attachment; filename="${String.fromCharCode(0xF9, 0xDB, 0xCF, 0xD0, 0xBF, 0xB5, 0xBC, 0xF6, 0xC1, 0xF5)}.pdf"`,
						"韓國영수증.pdf"
					],
					"raw-cp949-jamo": [
						`attachment; filename="${String.fromCharCode(0xA4, 0xBB, 0xA4, 0xBB, 0xBF, 0xB5, 0xBC, 0xF6, 0xC1, 0xF5)}.pdf"`,
						"ㅋㅋ영수증.pdf"
					],
					"raw-cp949-punctuation": [
						`attachment; filename="${String.fromCharCode(0xBF, 0xB5, 0xBC, 0xF6, 0xC1, 0xF5, 0xA1, 0xA4, 0xB9, 0xE8, 0xB4, 0xDE)}.pdf"`,
						"영수증·배달.pdf"
					],
					"raw-latin1": [
						"attachment; filename=\"Müßig.txt\"",
						"Müßig.txt"
					],
					"raw-latin1-hanja": [
						"attachment; filename=\"Äß Müßig.txt\"",
						"Äß Müßig.txt"
					],
					"raw-latin1-letter": [
						"attachment; filename=\"Ärger.txt\"",
						"Ärger.txt"
					],
					"raw-utf8": [
						`attachment; filename="${String.fromCharCode(...new TextEncoder().encode("예약 목록.csv"))}"`,
						"예약 목록.csv"
					],
					"unknown-charset": [
						"attachment; filename*=x-unknown''a.txt; filename=\"b.txt\"",
						"b.txt"
					]
				}
				const api = http(
					{
						base: "http://localhost",
						fetch: async url => new Response(
							"x",
							{
								headers: {
									"Content-Disposition": /** @type {[string, string]} */(cases[
										/** @type {string} */(url.split("/").pop())/**/
									])/**/[0]
								}
							}
						)
					}
				)
				for (const [ key, [ , name ] ] of Object.entries(cases)) {
					assert.equal(
						(await api.get("/:key", { key }, { as: "file" })).name,
						name,
						key
					)
				}
			}
		)
		it(
			"file names in CP949 or Latin-1",
			async () => {
				const korean = [
					"1월_2일.xlsx",
					"2024년_보고서.hwp",
					"2일.xlsx",
					"A안.pdf",
					"A형.pdf",
					"Q한.txt",
					"Report_최종.docx",
					"Type-A형.pdf",
					"①②③_급여.xlsx",
					"①급여명세서.xlsx",
					"㈜韓國商事_급여.xlsx",
					"㈜배달·영수증.pdf",
					"급.txt",
					"韓國支社.xlsx",
					"韓國支社_급여명세.xlsx",
					"韓國영수증.pdf"
				]
				const latin = [
					"25°C.txt",
					"AÇÃO.txt",
					"Ação.txt",
					"Café.txt",
					"Crème brûlée.txt",
					"GRÖßE.txt",
					"INFORMAÇÕES.pdf",
					"Noël.txt",
					"créé.txt",
					"naïve.txt",
					"Füße.txt",
					"Größe.pdf",
					"Straße.txt",
					"São Paulo.txt",
					"süß.txt",
					"Ångström.txt",
					"Ärger.txt",
					"Äß Müßig.txt",
					"ÄÖÜ.txt",
					"Übersicht_Größe.xlsx",
					"¿Qué?.txt",
					"½ price.txt"
				]
				/** @type {Map<string, string>} */
				const names = new Map()
				for (const name of korean) {
					const bytes = encode_cp949(name)
					assert.isString(bytes, name)
					names.set(
						/** @type {string} */(bytes)/**/,
						name
					)
				}
				for (const name of latin) names.set(name, name)
				const api = http(
					{
						base: "http://localhost",
						fetch: async url => new Response(
							"x",
							{
								headers: {
									"Content-Disposition": `attachment; filename="${[ ...names.keys() ][Number(url.split("/").pop())]}"`
								}
							}
						)
					}
				)
				const files = await Promise.all(
					[ ...names.keys() ].map(
						(_, i) => api.get("/:i", { i }, { as: "file" })
					)
				)
				assert.deepEqual(
					files.map(file => file.name),
					[ ...names.values() ]
				)
				const uhc = "\x8c\x63\xb9\xe6.txt"
				assert.equal(
					(await http(
						{
							base: "http://localhost",
							fetch: async () => new Response(
								"x",
								{
									headers: {
										"Content-Disposition": `attachment; filename="${uhc}"`
									}
								}
							)
						}
					)
						.get("/a", {}, { as: "file" })).name,
					new TextDecoder("euc-kr").decode(new Uint8Array([ 0x8c, 0x63 ])) == "똠"
						? "똠방.txt"
						: uhc
				)
			}
		)
		it(
			"header precedence",
			async () => {
				const api = create(
					{
						headers: {
							"X-Only": "config",
							"X-Token": "config"
						}
					}
				)
				/** @type {Echo} */
				const echo = await api.get(
					"/echo",
					{},
					{
						headers: new Headers({ "x-token": "options" })
					}
				)
				assert.equal(
					echo.headers["x-token"],
					"options"
				)
				assert.equal(echo.headers["x-only"], "config")
				/** @type {Echo} */
				const typed = await api.post(
					"/echo",
					{ a: 1 },
					{
						headers: [
							[
								"content-type",
								"application/x-custom+json"
							]
						]
					}
				)
				assert.equal(
					typed.headers["content-type"],
					"application/x-custom+json"
				)
				assert.equal(typed.body, "{\"a\":1}")
			}
		)
		it(
			"hook timing",
			async () => {
				function never() {
					return new Promise(() => {})
				}
				assert.instanceOf(
					await rejection(
						create(
							{ headers: never, timeout: 30 }
						).get("/echo")
					),
					TimeoutError
				)
				assert.instanceOf(
					await rejection(
						create(
							{
								on: { request: never },
								timeout: 30
							}
						).get("/echo")
					),
					TimeoutError
				)
				assert.instanceOf(
					await rejection(
						create(
							{
								on: { response: never },
								timeout: 30
							}
						).get("/echo")
					),
					TimeoutError
				)
				assert.instanceOf(
					await rejection(
						create({ on: { error: never } }).get("/status", { code: 404 })
					),
					HttpError
				)
				/** @type {string[]} */
				const calls = []
				const child = create(
					{
						on: {
							error: () => {
								calls.push("parent")
								throw Error("The parent hook failed")
							}
						}
					}
				)
					.extend(
						{
							on: {
								error: () => void calls.push("child")
							}
						}
					)
				await rejection(
					child.get("/status", { code: 404 })
				)
				await sleep(0)
				assert.deepEqual(calls, [ "parent", "child" ])
				const shared_error = Error("invalid")
				let reported = 0
				const api = create(
					{
						on: { error: () => void reported++ }
					}
				)
				for (let i = 0; i < 2; i++) {
					await rejection(
						api.get(
							"/echo",
							{},
							{
								parse: () => {
									throw shared_error
								}
							}
						)
					)
				}
				assert.equal(reported, 2)
			}
		)
		it(
			"hooks",
			async () => {
				/** @type {unknown[]} */
				const errors = []
				/** @type {number[]} */
				const durations = []
				const api = create(
					{
						on: {
							error: error => void errors.push(error),
							request: context => {
								context.headers.set(
									"X-Trace",
									"trace-" + context.attempt
								)
							},
							response: context => void durations.push(context.duration)
						}
					}
				)
				/** @type {Echo} */
				const echo = await api.get("/echo")
				assert.equal(
					echo.headers["x-trace"],
					"trace-1"
				)
				assert.equal(durations.length, 1)
				await Promise.all(
					[
						api.get("/status", { code: 500 }).safe(),
						api.get("/status", { code: 500 }).safe()
					]
				)
				assert.equal(errors.length, 1)
				const cancelled = api.get("/slow")
				cancelled.cancel()
				await cancelled.safe()
				assert.equal(errors.length, 1)
			}
		)
		it(
			"http errors",
			async () => {
				const api = create()
				const error = await rejection(
					api.get("/status", { code: 422 })
				)
				assert.instanceOf(error, HttpError)
				assert.equal(error.status, 422)
				assert.equal(error.message, "Status 422")
				assert.deepEqual(
					error.data,
					{ detail: "Status 422" }
				)
				assert.deepEqual(
					error.request,
					{
						method: "GET",
						url: server.base + "/status?code=422"
					}
				)
				const [ safe_error, data ] = await api.get("/status", { code: 404 }).safe()
				assert.instanceOf(safe_error, HttpError)
				assert.isUndefined(data)
				const accepted = await api.get(
					"/status",
					{ code: 404 },
					{
						ok: response => response.status < 500
					}
				)
				assert.deepEqual(
					accepted,
					{ detail: "Status 404" }
				)
				const offline = http({ base: "http://127.0.0.1:1" })
				assert.instanceOf(
					await rejection(offline.get("/")),
					NetworkError
				)
			}
		)
		it(
			"latest",
			async () => {
				const api = create()
				const first = api.get(
					"/count",
					{ key: "latest", q: "a" },
					{ latest: "search" }
				)
				const second = api.get(
					"/count",
					{ key: "latest", q: "ab" },
					{ latest: "search" }
				)
				assert.isTrue(
					isCancel(await rejection(first))
				)
				assert.deepEqual(await second, { count: 1 })
				const kept = api.get(
					"/slow",
					{ ms: 20 },
					{ latest: "kept" }
				)
				const debounced = api.get(
					"/slow",
					{ ms: 20 },
					{ debounce: 10 }
				)
				for (const options of [
					{ latest: "kept" },
					{ debounce: 10 },
					{ throttle: 10 }
				]) {
					assert.isTrue(
						isCancel(
							await rejection(
								api.get(
									"/slow",
									{ ms: 20 },
									{
										...options,
										signal: AbortSignal.abort("unmounted")
									}
								)
							)
						)
					)
				}
				assert.deepEqual(await kept, { slow: true })
				assert.deepEqual(await debounced, { slow: true })
			}
		)
		it(
			"latest streams and clients",
			async () => {
				const api = create()
				const first = /** @type {ReadableStream<Uint8Array>} */(await api.get(
					"/sse-live",
					{ key: "latest-a" },
					{ as: "stream", latest: "feed" }
				))/**/
				const reader = first.getReader()
				await reader.read()
				const second = /** @type {ReadableStream<Uint8Array>} */(await api.get(
					"/sse-live",
					{ key: "latest-b" },
					{ as: "stream", latest: "feed" }
				))/**/
				const error = await rejection(
					(async () => {
						for (;;) {
							if ((await reader.read()).done) return
						}
					})()
				)
				assert.isTrue(isCancel(error))
				await second.cancel()
				await eventually(
					() => server.hits.has("latest-a-closed")
				)
				assert.equal(
					server.hits.get("latest-a-closed"),
					1
				)
				const results = await Promise.allSettled(
					[
						create().get(
							"/slow",
							{ key: "client-1", ms: 20 },
							{ latest: "search" }
						),
						create().get(
							"/slow",
							{ key: "client-2", ms: 20 },
							{ latest: "search" }
						)
					]
				)
				assert.deepEqual(
					results.map(result => result.status),
					[ "fulfilled", "fulfilled" ]
				)
			}
		)
		it(
			"latest supersedes",
			async () => {
				const api = create()
				const first = api.delete(
					"/slow",
					{ ms: 50 },
					{ latest: "supersede" }
				)
				const second = api.post(
					"/slow",
					{},
					{
						latest: "supersede",
						params: { ms: 1 }
					}
				)
				const error = await rejection(first)
				assert.isTrue(isCancel(error))
				assert.instanceOf(error, CancelError)
				assert.equal(
					/** @type {RequestSummary} */(error.request)/**/.method,
					"DELETE"
				)
				assert.deepEqual(await second, { slow: true })
			}
		)
		it(
			"listeners",
			async () => {
				const api = create()
				const controller = new AbortController()
				for (let i = 0; i < 3; i++) {
					const stream = await api.get(
						"/text",
						{},
						{
							as: "stream",
							signal: controller.signal
						}
					)
					await new Response(stream).text()
				}
				for (let i = 0; i < 3; i++) {
					await api.get(
						"/status",
						{ code: 404 },
						{
							as: "stream",
							signal: controller.signal
						}
					)
						.safe()
				}
				for await (const event of api.sse(
					"/sse",
					{ key: "listeners" },
					{ signal: controller.signal }
				)) void event
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
			}
		)
		it(
			"lock",
			async () => {
				const api = create()
				const orders = await Promise.all(
					[
						api.post(
							"/count",
							{ qty: 1 },
							{
								lock: "order",
								params: { key: "lock" }
							}
						),
						api.post(
							"/count",
							{ qty: 1 },
							{
								lock: "order",
								params: { key: "lock" }
							}
						)
					]
				)
				assert.deepEqual(
					orders,
					[ { count: 1 }, { count: 1 } ]
				)
				assert.equal(server.hits.get("lock"), 1)
			}
		)
		it(
			"lock endpoints",
			async () => {
				/** @type {string[]} */
				const sent = []
				const api = http(
					{
						base: "https://lock.test",
						fetch: async (url, init) => {
							sent.push(`${init.method} ${url}`)
							await Promise.resolve()
							return Response.json({ url })
						}
					}
				)
				const [ first, second, same, other ] = await Promise.all(
					[
						api.post("/orders", {}, { lock: "submit" }),
						api.post("/carts", {}, { lock: "submit" }),
						api.post(
							"/orders?draft=1",
							{},
							{ lock: "submit" }
						),
						api.put("/orders", {}, { lock: "submit" })
					]
				)
				assert.deepEqual(
					sent,
					[
						"POST https://lock.test/orders",
						"POST https://lock.test/carts",
						"PUT https://lock.test/orders"
					]
				)
				assert.deepEqual(
					first,
					{
						url: "https://lock.test/orders"
					}
				)
				assert.deepEqual(
					second,
					{ url: "https://lock.test/carts" }
				)
				assert.deepEqual(same, first)
				assert.deepEqual(
					other,
					{
						url: "https://lock.test/orders"
					}
				)
			}
		)
		it(
			"lock streams",
			async () => {
				const api = create()
				const error = await rejection(
					api.get(
						"/ndjson",
						{},
						{ as: "ndjson", lock: "feed" }
					)
				)
				assert.instanceOf(error, TypeError)
				assert.match(
					/** @type {Error} */(error)/**/.message,
					/cannot be locked/
				)
				const shared = await Promise.all(
					[
						api.get(
							"/count",
							{ key: "lock-stream" },
							{ lock: "feed" }
						),
						api.get(
							"/count",
							{ key: "lock-stream" },
							{ lock: "feed" }
						)
					]
				)
				assert.deepEqual(
					shared,
					[ { count: 1 }, { count: 1 } ]
				)
			}
		)
		it(
			"ndjson",
			async () => {
				const api = create()
				/** @type {unknown[]} */
				const lines = []
				for await (const line of await api.post(
					"/ndjson",
					{ q: 1 },
					{ as: "ndjson" }
				)) lines.push(line)
				assert.deepEqual(
					lines,
					[
						{
							body: "{\"q\":1}",
							method: "POST"
						},
						{ a: 1 },
						{ b: 2 },
						{ c: 3 }
					]
				)
				/** @type {string[]} */
				const keys = []
				for await (const key of await api.get(
					"/ndjson",
					{},
					{
						as: "ndjson",
						parse: line => Object.keys(
							/** @type {Record<string, unknown>} */(line)/**/
						)[0] ?? ""
					}
				)) keys.push(key)
				assert.deepEqual(keys, [ "body", "a", "b", "c" ])
				assert.equal(
					typeof await api.get("/ndjson"),
					"string"
				)
				/** @type {unknown[]} */
				const empty = []
				for await (const line of await api.get("/empty", {}, { as: "ndjson" })) empty.push(line)
				assert.deepEqual(empty, [])
				const raw = await api.get("/ndjson", {}, { as: "ndjson" }).raw()
				assert.equal(raw.status, 200)
				let last
				for await (const line of raw.data) last = line
				assert.deepEqual(last, { c: 3 })
				/** @type {(number | undefined)[]} */
				const ratios = []
				for await (const line of await api.get(
					"/ndjson",
					{},
					{
						as: "ndjson",
						progress: progress => ratios.push(progress.ratio)
					}
				)) void line
				assert.equal(ratios.at(-1), 1)
				const counts = []
				for (const stream of await Promise.all(
					[
						api.get(
							"/count",
							{ key: "ndjson-dedupe", ms: 1 },
							{ as: "ndjson" }
						),
						api.get(
							"/count",
							{ key: "ndjson-dedupe", ms: 1 },
							{ as: "ndjson" }
						)
					]
				)) for await (const line of stream) counts.push(
					/** @type {{ count: number }} */(line)/**/.count
				)
				assert.deepEqual(counts.sort(), [ 1, 2 ])
			}
		)
		it(
			"ndjson errors",
			async () => {
				const api = create()
				const bad = await api.get(
					"/ndjson-bad",
					{},
					{ as: "ndjson" }
				)
				const iterator = bad[Symbol.asyncIterator]()
				assert.deepEqual(
					(await iterator.next()).value,
					{ a: 1 }
				)
				const invalid = await rejection(iterator.next())
				assert.equal(
					/** @type {{ request: RequestSummary }} */(invalid)/**/.request.url,
					server.base + "/ndjson-bad"
				)
				assert.instanceOf(invalid, SyntaxError)
				assert.include(invalid.message, "Invalid JSON")
				const dropped = await rejection(
					(async () => {
						for await (const line of await api.get(
							"/ndjson-drop",
							{},
							{ as: "ndjson" }
						)) void line
					})()
				)
				assert.instanceOf(dropped, NetworkError)
				const failing = await rejection(
					(async () => {
						for await (const line of await api.get(
							"/ndjson",
							{},
							{
								as: "ndjson",
								parse: () => {
									throw TypeError("Invalid line")
								}
							}
						)) void line
					})()
				)
				assert.instanceOf(failing, TypeError)
				assert.equal(failing.message, "Invalid line")
				assert.instanceOf(
					await rejection(
						api.get(
							"/status",
							{ code: 500 },
							{ as: "ndjson" }
						)
					),
					HttpError
				)
				const request = api.get(
					"/ndjson-live",
					{ key: "ndjson-cancel" },
					{ as: "ndjson" }
				)
				const live = await request
				const cancelled = await rejection(
					(async () => {
						for await (const line of live) {
							if (/** @type {{ n: number }} */(line)/**/.n == 2) request.cancel()
						}
					})()
				)
				assert.isTrue(isCancel(cancelled))
				const controller = new AbortController()
				const signalled = await rejection(
					(async () => {
						for await (const line of await api.get(
							"/ndjson-live",
							{ key: "ndjson-signal" },
							{
								as: "ndjson",
								signal: controller.signal
							}
						)) {
							if (/** @type {{ n: number }} */(line)/**/.n == 2) controller.abort()
						}
					})()
				)
				assert.isTrue(isCancel(signalled))
				assert.equal(
					getEventListeners(controller.signal, "abort").length,
					0
				)
				for await (const line of await api.get(
					"/ndjson-live",
					{ key: "ndjson-break" },
					{ as: "ndjson" }
				)) {
					if (/** @type {{ n: number }} */(line)/**/.n == 2) break
				}
				await eventually(
					() => server.hits.has("ndjson-break-closed") && server.hits.has("ndjson-cancel-closed")
				)
				assert.equal(
					server.hits.get("ndjson-break-closed"),
					1
				)
				assert.equal(
					server.hits.get("ndjson-cancel-closed"),
					1
				)
			}
		)
		it(
			"parse timeout",
			async () => {
				const slow_parse = create({ timeout: 30 }).get(
					"/echo",
					{},
					{
						parse: data => new Promise(
							resolve => setTimeout(() => resolve(data), 200)
						)
					}
				)
				assert.instanceOf(
					await rejection(slow_parse),
					TimeoutError
				)
			}
		)
		it(
			"progress edge cases",
			async () => {
				const api = create()
				/** @type {import("async-lube").Progress[]} */
				const zipped = []
				/** @type {number[]} */
				const numbers = await api.get(
					"/gzip",
					{},
					{
						progress: value => zipped.push(value)
					}
				)
				assert.equal(numbers.length, 2000)
				assert.isTrue(
					zipped.every(
						value => value.total === void 0 || value.ratio == 1
					)
				)
				assert.equal(
					zipped[zipped.length - 1]?.ratio,
					1
				)
				/** @type {import("async-lube").Progress[]} */
				const empty = []
				await api.get(
					"/zero",
					{},
					{
						as: "blob",
						progress: value => empty.push(value)
					}
				)
				assert.deepEqual(
					empty[empty.length - 1],
					{ loaded: 0, ratio: 1, total: 0 }
				)
				const file = await api.get(
					"/file",
					{ lang: 1 },
					{ as: "file" }
				)
				assert.equal(file.name, "€ rates.txt")
				/** @type {import("async-lube").Progress[]} */
				const unknown_length = []
				await create(
					{
						fetch: async () => new Response(
							"hello",
							{
								headers: {
									"Content-Length": "unknown",
									"Content-Type": "text/plain"
								}
							}
						)
					}
				)
					.get(
						"/text",
						{},
						{
							as: "text",
							progress: value => unknown_length.push(value)
						}
					)
				assert.isTrue(
					unknown_length.every(
						value => value.total === void 0 || Number.isFinite(value.total)
					)
				)
				assert.equal(
					unknown_length[unknown_length.length - 1]?.ratio,
					1
				)
			}
		)
		it(
			"progress errors",
			async () => {
				const api = create()
				let reported = 0
				const data = await api.get(
					"/big",
					{},
					{
						as: "arrayBuffer",
						progress: () => {
							reported++
							throw Error("the progress bar is gone")
						}
					}
				)
				assert.equal(data.byteLength, 65536)
				assert.isAbove(reported, 1)
				const empty = await api.get(
					"/empty",
					{},
					{
						progress: () => {
							throw Error("the progress bar is gone")
						}
					}
				)
				assert.isUndefined(empty)
			}
		)
		it(
			"query encoding",
			async () => {
				const api = create()
				/** @type {Echo} */
				const echo = await api.get(
					"/echo",
					{
						"a b": "c d",
						"amp": "&",
						"big": 10n,
						"deep": { list: [ { id: 1 }, { id: 2 } ] },
						"nested": [ 1, [ 2, 3 ] ],
						"plus": "1+2",
						"skipped": [ void 0, null ],
						"t": true,
						"uni": "한글",
						"zero": 0
					}
				)
				assert.equal(
					echo.url,
					"/echo?a%20b=c%20d&amp=%26&big=10&deep%5Blist%5D%5Bid%5D=1&deep%5Blist%5D%5Bid%5D=2"
						+ "&nested=1&nested=2&nested=3&plus=1%2B2&t=true&uni=%ED%95%9C%EA%B8%80&zero=0"
				)
				const custom = create(
					{
						query: params => new URLSearchParams(
							/** @type {Record<string, string>} */(params)/**/
						).toString()
					}
				)
				assert.equal(
					/** @type {Echo} */(await custom.get("/echo", { q: "a b" }))/**/.url,
					"/echo?q=a+b"
				)
			}
		)
		it(
			"refresh",
			async () => {
				let token = "stale"
				let refreshes = 0
				const api = create(
					{
						fetch: auth_fetch,
						headers: () => ({
							Authorization: "Bearer " + token
						}),
						refresh: async () => {
							refreshes++
							await new Promise(
								resolve => setTimeout(resolve, 20)
							)
							token = "fresh"
						}
					}
				)
				const results = await Promise.all(
					[
						api.get("/auth", { key: "refresh-1" }),
						api.get("/auth", { key: "refresh-2" }),
						api.post(
							"/auth",
							{},
							{ params: { key: "refresh-3" } }
						)
					]
				)
				assert.deepEqual(
					results,
					[
						{ ok: true },
						{ ok: true },
						{ ok: true }
					]
				)
				assert.equal(refreshes, 1)
				/** @type {HttpError[]} */
				const unauthorized = []
				const failing = create(
					{
						fetch: auth_fetch,
						on: {
							unauthorized: error => void unauthorized.push(error)
						},
						refresh: () => Promise.reject(Error("Refresh token expired"))
					}
				)
				const errors = await Promise.all(
					[
						rejection(
							failing.get("/auth", { key: "refresh-4" })
						),
						rejection(
							failing.get("/auth", { key: "refresh-5" })
						)
					]
				)
				assert.equal(
					/** @type {HttpError} */(errors[0])/**/.status,
					401
				)
				assert.equal(
					/** @type {HttpError} */(errors[1])/**/.status,
					401
				)
				assert.equal(unauthorized.length, 1)
			}
		)
		it(
			"refresh failures",
			async () => {
				/** @type {[HttpError, unknown][]} */
				const calls = []
				const api = create(
					{
						fetch: auth_fetch,
						headers: { Authorization: "Bearer stale" },
						on: {
							unauthorized: (error, reason) => void calls.push([ error, reason ])
						},
						refresh: async () => {}
					}
				)
				const errors = await Promise.all(
					[
						rejection(
							api.get("/auth", { key: "refused-1" })
						),
						rejection(
							api.get("/auth", { key: "refused-2" })
						)
					]
				)
				assert.instanceOf(errors[0], HttpError)
				assert.instanceOf(errors[1], HttpError)
				assert.equal(server.hits.get("refused-1"), 2)
				assert.equal(calls.length, 1)
				assert.equal(calls[0]?.[0].status, 401)
				assert.isUndefined(calls[0]?.[1])
				const started = Date.now()
				const hanging = await rejection(
					create(
						{
							fetch: auth_fetch,
							refresh: () => new Promise(() => void 0),
							timeout: 50
						}
					).get("/auth", { key: "refresh-hang" })
				)
				assert.instanceOf(hanging, TimeoutError)
				assert.equal(hanging.timeout, 50)
				assert.isBelow(Date.now() - started, 1000)
			}
		)
		it(
			"refresh isolation",
			async () => {
				const refreshes = { x: 0, y: 0 }
				let token_x = "stale"
				let token_y = "stale"
				const x = create(
					{
						headers: () => ({
							Authorization: "Bearer " + token_x
						}),
						refresh: async () => {
							refreshes.x++
							token_x = "fresh"
						}
					}
				)
				const y = x.extend(
					{
						headers: () => ({
							Authorization: "Bearer " + token_y
						}),
						refresh: async () => {
							refreshes.y++
							token_y = "fresh"
						}
					}
				)
				await Promise.all(
					[
						x.get("/auth", { key: "x" }),
						y.get("/auth", { key: "y" })
					]
				)
				assert.deepEqual(refreshes, { x: 1, y: 1 })
				let stream_refreshes = 0
				/** @type {unknown[]} */
				const unauthorized = []
				const stale = create(
					{
						headers: { Authorization: "Bearer stale" },
						on: {
							unauthorized: (_, reason) => void unauthorized.push(reason)
						},
						refresh: async () => {
							if (++stream_refreshes > 1) throw Error("Logged out")
						}
					}
				)
				/**
				 * @returns {ReadableStream<Uint8Array>}
				 */
				function body() {
					return new ReadableStream(
						{
							start(controller) {
								controller.enqueue(
									new TextEncoder().encode("body")
								)
								controller.close()
							}
						}
					)
				}
				const error = await rejection(
					stale.post(
						"/auth",
						body(),
						{ params: { key: "stream-401" } }
					)
				)
				assert.instanceOf(error, HttpError)
				assert.equal(error.status, 401)
				assert.equal(stream_refreshes, 1)
				assert.equal(server.hits.get("stream-401"), 1)
				assert.deepEqual(unauthorized, [])
				const failed = await rejection(
					stale.post(
						"/auth",
						body(),
						{
							params: { key: "stream-401-again" }
						}
					)
				)
				assert.instanceOf(failed, HttpError)
				assert.equal(stream_refreshes, 2)
				assert.equal(
					server.hits.get("stream-401-again"),
					1
				)
				assert.lengthOf(unauthorized, 1)
				assert.equal(
					/** @type {Error} */(unauthorized[0])/**/.message,
					"Logged out"
				)
			}
		)
		it(
			"refresh sharing",
			async () => {
				let token = "stale"
				let refreshes = 0
				function headers() {
					return {
						Authorization: "Bearer " + token
					}
				}
				async function refresh() {
					refreshes++
					await sleep(20)
					token = "fresh"
				}
				await Promise.all(
					[
						create(
							{
								fetch: auth_fetch,
								headers,
								refresh
							}
						).get("/auth", { key: "shared-1" }),
						create(
							{
								fetch: auth_fetch,
								headers,
								refresh,
								timeout: 5000
							}
						).get("/auth", { key: "shared-2" })
					]
				)
				assert.equal(refreshes, 1)
				token = "stale"
				/** @type {unknown[]} */
				const reasons = []
				/** @type {import("async-lube").Http} */
				const api = create(
					{
						headers,
						on: {
							unauthorized: (_, reason) => void reasons.push(reason)
						},
						refresh: () => api.extend({ refresh: null }).get("/auth", { key: "refresh-self" })
					}
				)
				const error = await rejection(
					api.get(
						"/auth",
						{ key: "refresh-outer" }
					)
				)
				assert.instanceOf(error, HttpError)
				assert.equal(error.status, 401)
				assert.equal(reasons.length, 1)
				assert.instanceOf(reasons[0], HttpError)
			}
		)
		it(
			"refresh timeout",
			async () => {
				vi.useFakeTimers()
				let token = "stale"
				let refreshes = 0
				/** @type {AbortSignal[]} */
				const signals = []
				/** @type {[HttpError, unknown][]} */
				const calls = []
				const api = create(
					{
						fetch: auth_fetch,
						headers: () => ({
							Authorization: "Bearer " + token
						}),
						on: {
							unauthorized: (error, reason) => void calls.push([ error, reason ])
						},
						refresh: async signal => {
							signals.push(signal)
							if (++refreshes == 1) {
								await new Promise(
									(_, reject) => signal.addEventListener(
										"abort",
										() => reject(signal.reason)
									)
								)
							}
							token = "fresh"
						},
						timeout: 50
					}
				)
				const errors = await settled(
					Promise.all(
						[
							rejection(
								api.get(
									"/auth",
									{ key: "refresh-timeout-1" }
								)
							),
							rejection(
								api.get(
									"/auth",
									{ key: "refresh-timeout-2" },
									{ timeout: 1000 }
								)
							)
						]
					),
					50
				)
				assert.instanceOf(errors[0], TimeoutError)
				assert.instanceOf(errors[1], TimeoutError)
				assert.equal(errors[1].timeout, 50)
				assert.include(
					errors[1].request?.url,
					"refresh-timeout-2"
				)
				assert.equal(refreshes, 1)
				assert.isTrue(signals[0]?.aborted)
				assert.equal(calls.length, 1)
				assert.equal(calls[0]?.[0].status, 401)
				assert.instanceOf(calls[0]?.[1], TimeoutError)
				await vi.advanceTimersByTimeAsync(10)
				assert.equal(calls.length, 1)
				assert.deepEqual(
					await api.get(
						"/auth",
						{ key: "refresh-timeout-3" }
					),
					{ ok: true }
				)
				assert.equal(refreshes, 2)
				assert.isFalse(signals[1]?.aborted)
				let late_token = "stale"
				let late_refreshes = 0
				const late = create(
					{
						fetch: auth_fetch,
						headers: () => ({
							Authorization: "Bearer " + late_token
						}),
						on: {
							unauthorized: (error, reason) => void calls.push([ error, reason ])
						},
						refresh: async () => {
							if (++late_refreshes == 1) await sleep(100)
							else late_token = "fresh"
						},
						timeout: 30
					}
				)
				const late_errors = await settled(
					Promise.all(
						[
							rejection(
								late.get(
									"/auth",
									{ key: "refresh-late-1" }
								)
							),
							rejection(
								late.get(
									"/auth",
									{ key: "refresh-late-2" }
								)
							)
						]
					),
					30
				)
				assert.instanceOf(late_errors[0], TimeoutError)
				assert.instanceOf(late_errors[1], TimeoutError)
				assert.equal(calls.length, 2)
				await vi.advanceTimersByTimeAsync(120)
				assert.deepEqual(
					await late.get(
						"/auth",
						{ key: "refresh-late-3" }
					),
					{ ok: true }
				)
				assert.equal(late_refreshes, 2)
				assert.equal(calls.length, 2)
			}
		)
		it(
			"refresh waiter timeout",
			async () => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
				let token = "stale"
				let refreshes = 0
				/** @type {AbortSignal[]} */
				const signals = []
				/** @type {unknown[]} */
				const reasons = []
				const api = create(
					{
						fetch: auth_fetch,
						headers: () => ({
							Authorization: "Bearer " + token
						}),
						on: {
							unauthorized: (_, reason) => void reasons.push(reason)
						},
						refresh: async signal => {
							signals.push(signal)
							refreshes++
							await sleep(120)
							token = "fresh"
						},
						timeout: 5000
					}
				)
				const results = await Promise.all(
					[
						api.get("/auth", { key: "waiter-1" })
							.safe(),
						api.get("/auth", { key: "waiter-2" })
							.safe(),
						api.get(
							"/auth",
							{ key: "waiter-short" },
							{ timeout: 40 }
						)
							.safe()
					]
				)
				assert.deepEqual(
					results.slice(0, 2),
					[
						[ void 0, { ok: true } ],
						[ void 0, { ok: true } ]
					]
				)
				assert.instanceOf(results[2][0], TimeoutError)
				assert.equal(results[2][0].timeout, 40)
				assert.equal(refreshes, 1)
				assert.isFalse(signals[0]?.aborted)
				assert.deepEqual(reasons, [])
				token = "stale"
				const alone = await Promise.all(
					[
						rejection(
							api.get(
								"/auth",
								{ key: "waiter-alone-1" },
								{ timeout: 30 }
							)
						),
						rejection(
							api.get(
								"/auth",
								{ key: "waiter-alone-2" },
								{ timeout: 50 }
							)
						)
					]
				)
				assert.instanceOf(alone[0], TimeoutError)
				assert.instanceOf(alone[1], TimeoutError)
				assert.equal(alone[1].timeout, 50)
				assert.equal(refreshes, 2)
				assert.isTrue(signals[1]?.aborted)
				assert.lengthOf(reasons, 1)
				assert.instanceOf(reasons[0], TimeoutError)
				token = "stale"
				const controller = new AbortController()
				const cancelled = rejection(
					api.get(
						"/auth",
						{ key: "waiter-cancel" },
						{ signal: controller.signal }
					)
				)
				await sleep(20)
				controller.abort()
				assert.instanceOf(await cancelled, CancelError)
				assert.equal(refreshes, 3)
				assert.isFalse(signals[2]?.aborted)
				await sleep(150)
				assert.equal(token, "fresh")
				assert.lengthOf(reasons, 1)
			}
		)
		it(
			"request misuse",
			async () => {
				const api = create()
				assert.instanceOf(
					await rejection(
						api.get("/echo", {}, { body: "text" })
					),
					TypeError
				)
				assert.instanceOf(
					await rejection(http().get("/relative")),
					TypeError
				)
				/** @type {Echo} */
				const removed = await api.delete(
					"/echo",
					{},
					{ body: { ids: [ 1 ] } }
				)
				assert.equal(removed.body, "{\"ids\":[1]}")
				assert.equal(
					removed.headers["content-type"],
					"application/json"
				)
				/** @type {Echo} */
				const posted = await api.post(
					"/echo",
					void 0,
					{ body: { a: 1 } }
				)
				assert.equal(posted.body, "{\"a\":1}")
				const html = http(
					{
						base: "http://localhost",
						fetch: async () => new Response(
							"<html>",
							{
								headers: {
									"Content-Type": "application/json"
								}
							}
						)
					}
				)
				const invalid = await rejection(
					html.get("/users/:id", { id: 7 })
				)
				assert.instanceOf(invalid, SyntaxError)
				assert.include(
					invalid.message,
					"GET http://localhost/users/7"
				)
				assert.deepEqual(
					/** @type {SyntaxError & { request: RequestSummary }} */(invalid)/**/.request,
					{
						method: "GET",
						url: "http://localhost/users/7"
					}
				)
				const flaky = await rejection(
					api.get(
						"/flaky",
						{ fail: 5, key: "nan-delay" },
						{
							retry: { count: 2, delay: () => NaN }
						}
					)
				)
				assert.instanceOf(flaky, HttpError)
				assert.equal(server.hits.get("nan-delay"), 3)
				const pending = api.get(
					"/status",
					{ code: 503 },
					{
						retry: {
							count: 1,
							when: () => new Promise(() => {})
						}
					}
				)
				setTimeout(() => pending.cancel(), 30)
				assert.instanceOf(
					await rejection(pending),
					CancelError
				)
			}
		)
		it(
			"response parsing",
			async () => {
				const api = create()
				assert.equal(await api.get("/text"), "안녕")
				assert.isUndefined(await api.get("/empty"))
				assert.isUndefined(await api.head("/echo"))
				assert.equal(
					await api.get("/echo", {}, { as: "text" }).then(text => typeof text),
					"string"
				)
				assert.instanceOf(
					await api.get("/text", {}, { as: "arrayBuffer" }),
					ArrayBuffer
				)
				const stream = await api.get("/text", {}, { as: "stream" })
				assert.instanceOf(stream, ReadableStream)
				await stream?.cancel()
				const raw = await api.get("/status", { code: 201 }).raw()
				assert.equal(raw.status, 201)
				assert.equal(
					raw.headers.get("Content-Type"),
					"application/json"
				)
				assert.deepEqual(
					raw.data,
					{ detail: "Status 201" }
				)
				const parsed = await api.get(
					"/echo",
					{},
					{
						parse: data => {
							const method = /** @type {{ method?: unknown } | null | undefined} */(data)/**/?.method
							if (typeof method != "string") throw TypeError("Invalid response")
							return method
						}
					}
				)
				assert.equal(parsed, "GET")
				const invalid = await rejection(
					api.get(
						"/text",
						{},
						{ parse: () => JSON.parse("{") }
					)
				)
				assert.instanceOf(invalid, SyntaxError)
			}
		)
		it(
			"retry",
			async () => {
				const api = create(
					{
						retry: { count: 2, delay: () => 1 }
					}
				)
				assert.deepEqual(
					await api.get(
						"/flaky",
						{ fail: 2, key: "retry-get" }
					),
					{ count: 3, idempotency_key: null }
				)
				const not_idempotent = await rejection(
					api.post(
						"/flaky",
						{},
						{
							params: { fail: 1, key: "retry-post" }
						}
					)
				)
				assert.instanceOf(not_idempotent, HttpError)
				assert.equal(not_idempotent.status, 503)
				/** @type {Flaky} */
				const explicit = await api.post(
					"/flaky",
					{},
					{
						params: { fail: 1, key: "retry-explicit" },
						retry: { count: 1, delay: () => 1 }
					}
				)
				assert.equal(explicit.count, 2)
				assert.equal(
					not_idempotent.message,
					"Try later"
				)
				/** @type {Flaky} */
				const idempotent = await api.post(
					"/flaky",
					{},
					{
						idempotent: true,
						params: { fail: 2, key: "retry-idempotent" }
					}
				)
				assert.equal(idempotent.count, 3)
				assert.match(
					/** @type {string} */(idempotent.idempotency_key)/**/,
					/^[\da-f-]{36}$/
				)
				const client_error = await rejection(
					api.get(
						"/flaky",
						{
							fail: 1,
							key: "retry-400",
							status: 400
						}
					)
				)
				assert.instanceOf(client_error, HttpError)
				assert.equal(client_error.status, 400)
				assert.equal(server.hits.get("retry-400"), 1)
				const retry_after = create({ retry: 1 })
				assert.equal(
					/** @type {Flaky} */(await retry_after.get(
						"/flaky",
						{
							fail: 1,
							key: "retry-after",
							retry_after: 0,
							status: 429
						}
					))/**/.count,
					2
				)
				const timeout = await rejection(
					create(
						{
							retry: { count: 1, delay: () => 1 },
							timeout: 30
						}
					)
						.get("/slow", { ms: 200 })
				)
				assert.instanceOf(timeout, TimeoutError)
				assert.equal(timeout.timeout, 30)
			}
		)
		it(
			"retry after parsing",
			async () => {
				/**
				 * @param {string} value
				 * @returns {number | undefined}
				 */
				function delay_of(value) {
					return get_retry_delay(
						new HttpError(
							new Response(
								null,
								{
									headers: { "Retry-After": value },
									status: 503
								}
							),
							void 0,
							{ method: "GET", url: "/" }
						),
						1
					)
				}
				assert.equal(delay_of("2"), 2000)
				assert.isBelow(Number(delay_of("0x2")), 500)
				assert.isUndefined(delay_of("120"))
			}
		)
		it(
			"retry delay",
			() => {
				/**
				 * @param {string} retry_after
				 * @returns {HttpError}
				 */
				function create_error(retry_after) {
					return new HttpError(
						new Response(
							null,
							{
								headers: { "Retry-After": retry_after },
								status: 503
							}
						),
						void 0,
						{ method: "GET", url: "/" }
					)
				}
				assert.equal(
					get_retry_delay(create_error("2"), 1),
					2000
				)
				assert.isUndefined(
					get_retry_delay(create_error("120"), 1)
				)
				const date = new Date(Date.now() + 5000).toUTCString()
				assert.isAtLeast(
					/** @type {number} */(get_retry_delay(create_error(date), 1))/**/,
					3000
				)
				for (let attempt = 1; attempt <= 8; attempt++) {
					const delay = /** @type {number} */(get_retry_delay(Error(), attempt))/**/
					const base = Math.min(500 * 2 ** (attempt - 1), 30000)
					assert.isAtLeast(delay, base / 2)
					assert.isAtMost(delay, base)
					const zero = get_reconnect_delay(create_error("0"), attempt)
					assert.isAtLeast(zero, base / 2)
					assert.isAtMost(zero, base)
				}
				assert.equal(
					get_reconnect_delay(create_error("2"), 1),
					2000
				)
				assert.isAtLeast(
					get_reconnect_delay(create_error("2"), 5),
					4000
				)
				assert.equal(
					get_reconnect_delay(create_error("120"), 1),
					120000
				)
				assert.isAtLeast(
					get_reconnect_delay(create_error(date), 1),
					3000
				)
			}
		)
		it(
			"retry policies",
			async () => {
				vi.useFakeTimers()
				let calls = 0
				/** @type {(string | undefined)[]} */
				let retry_after = []
				const api = http(
					{
						base: "https://retry.test",
						fetch: async () => {
							const header = retry_after[calls++]
							if (calls > retry_after.length) return Response.json({ calls })
							return new Response(
								"",
								{
									headers: header == null ? {} : { "Retry-After": header },
									status: 503
								}
							)
						}
					}
				)
				retry_after = [ "90", "90" ]
				const numbered = api.get(
					"/a",
					{},
					{
						retry: { count: 2, delay: 100 }
					}
				)
				await vi.advanceTimersByTimeAsync(199)
				assert.equal(calls, 2)
				assert.deepEqual(
					await settled(numbered, 1),
					{ calls: 3 }
				)
				calls = 0
				retry_after = [ "90", "2" ]
				/** @type {unknown[][]} */
				const seen = []
				const custom = api.get(
					"/a",
					{},
					{
						retry: {
							count: 2,
							delay: (attempt, error, fallback) => {
								seen.push(
									[
										attempt,
										error instanceof HttpError,
										fallback
									]
								)
								return fallback ?? 90000
							}
						}
					}
				)
				await vi.advanceTimersByTimeAsync(89999)
				assert.equal(calls, 1)
				await vi.advanceTimersByTimeAsync(1)
				assert.equal(calls, 2)
				assert.deepEqual(
					await settled(custom, 2000),
					{ calls: 3 }
				)
				assert.deepEqual(
					seen,
					[
						[ 1, true, void 0 ],
						[ 2, true, 2000 ]
					]
				)
				calls = 0
				retry_after = [ void 0 ]
				const stopped = await rejection(
					api.get(
						"/a",
						{},
						{
							retry: { count: 3, delay: () => void 0 }
						}
					)
				)
				assert.instanceOf(stopped, HttpError)
				assert.equal(calls, 1)
				calls = 0
				for (const [ retry, message ] of /** @type {const} */([
					[
						{ cont: 1 },
						"Unknown request option \"retry.cont\""
					],
					[
						{ count: -1 },
						"The retry count of request() must be a non-negative integer or Infinity"
					],
					[
						{ count: 1, delay: "1" },
						"The retry delay of request() must be non-negative milliseconds or a function"
					]
				])/**/) {
					const error = /** @type {Error} */(await rejection(
						api.get(
							"/a",
							{},
							{
								retry: /** @type {never} */(retry)/**/
							}
						)
					))/**/
					assert.instanceOf(error, TypeError)
					assert.equal(error.message, message)
				}
				assert.equal(calls, 0)
			}
		)
		it(
			"retry when",
			async () => {
				const api = create(
					{
						retry: {
							count: 2,
							delay: () => 1,
							when: error => error instanceof HttpError && error.status != 400
						}
					}
				)
				const payment = await rejection(
					api.post(
						"/flaky",
						{ amount: 1 },
						{
							params: { fail: 1, key: "when-post" }
						}
					)
				)
				assert.instanceOf(payment, HttpError)
				assert.equal(server.hits.get("when-post"), 1)
				assert.equal(
					/** @type {Flaky} */(await api.patch(
						"/flaky",
						{},
						{
							params: { fail: 1, key: "when-asked" },
							retry: 1
						}
					))/**/.count,
					2
				)
				assert.equal(
					/** @type {Flaky} */(await api.post(
						"/flaky",
						{},
						{
							idempotent: true,
							params: { fail: 2, key: "when-idempotent" }
						}
					))/**/.count,
					3
				)
				assert.equal(
					/** @type {Flaky} */(await api.get(
						"/flaky",
						{
							fail: 1,
							key: "when-409",
							status: 409
						}
					))/**/.count,
					2
				)
				await rejection(
					api.get(
						"/flaky",
						{
							fail: 1,
							key: "when-400",
							status: 400
						}
					)
				)
				assert.equal(server.hits.get("when-400"), 1)
				assert.equal(
					/** @type {Flaky} */(await api.post(
						"/flaky",
						{},
						{
							params: {
								fail: 1,
								key: "when-own",
								status: 400
							},
							retry: {
								count: 1,
								delay: () => 1,
								when: () => true
							}
						}
					))/**/.count,
					2
				)
			}
		)
		it(
			"sse closing",
			async () => {
				const api = create()
				/** @type {string[]} */
				const received = []
				for await (const event of api.sse(
					"/sse-live",
					{ key: "live-break" }
				)) {
					received.push(event.data)
					if (received.length == 2) break
				}
				assert.deepEqual(received, [ "1", "2" ])
				const stream = api.sse(
					"/sse-live",
					{ key: "live-cancel" }
				)
				let count = 0
				for await (const event of stream) {
					assert.equal(event.data, String(++count))
					if (count == 3) stream.cancel()
				}
				assert.equal(count, 3)
				await eventually(
					() => server.hits.has("live-break-closed") && server.hits.has("live-cancel-closed")
				)
				assert.equal(
					server.hits.get("live-break-closed"),
					1
				)
				assert.equal(
					server.hits.get("live-cancel-closed"),
					1
				)
			}
		)
		it(
			"sse failure counting",
			async () => {
				/** @type {number[]} */
				const failures = []
				let attempt = 0
				const api = http(
					{
						base: "https://events.test",
						fetch: async () => {
							const index = attempt++
							if (!index) return new Response("", { status: 503 })
							return new Response(
								new ReadableStream(
									{
										start: controller => {
											controller.enqueue(
												new TextEncoder().encode(
													index > 1 ? "data: ok\n\n" : "retry: 1\n\n"
												)
											)
											controller.close()
										}
									}
								),
								{
									headers: {
										"Content-Type": "text/event-stream"
									}
								}
							)
						}
					}
				)
				for await (const event of api.sse(
					"/stream",
					{},
					{
						reconnect: {
							delay: count => {
								failures.push(count)
								return 1
							}
						}
					}
				)) {
					assert.equal(event.data, "ok")
					break
				}
				assert.deepEqual(failures, [ 1 ])
			}
		)
		it(
			"sse options",
			async () => {
				/** @type {RequestInit[]} */
				const inits = []
				const api = http(
					{
						base: "https://events.test",
						fetch: async (_, init) => {
							inits.push(init)
							return new Response(
								"data: {\"a\":1}\n\ndata: plain\n\n",
								{
									headers: {
										"Content-Type": "text/event-stream"
									}
								}
							)
						}
					}
				)
				for (const [ options, message ] of /** @type {const} */([
					[
						{ lock: "x" },
						"Unknown sse option \"lock\""
					],
					[
						{ retry: 1 },
						"Unknown sse option \"retry\""
					],
					[
						{ as: "ndjson" },
						"The as of sse() must be \"json\" or \"text\""
					],
					[
						{ reconnect: { cont: 1 } },
						"Unknown sse option \"reconnect.cont\""
					],
					[
						{ reconnect: { count: 1.5 } },
						"The reconnect count of sse() must be a non-negative integer or Infinity"
					],
					[
						{ reconnect: { delay: -1 } },
						"The reconnect delay of sse() must be non-negative milliseconds or a function"
					],
					[
						{ reconnect: 1 },
						"The reconnect of sse() must be a boolean or { count, delay }"
					]
				])/**/) {
					assert.throws(
						() => api.sse(
							"/e",
							{},
							/** @type {never} */(options)/**/
						),
						TypeError,
						message
					)
				}
				/**
				 * @param {import("async-lube").SseOptions} options
				 * @returns {Promise<unknown[]>}
				 */
				async function read(options) {
					/** @type {unknown[]} */
					const values = []
					for await (const event of api.sse(
						"/e",
						{},
						{ ...options, reconnect: false }
					)) values.push(event.data)
					return values
				}
				assert.deepEqual(
					await read(
						{
							credentials: "include",
							lastEventId: "1",
							onStatus: () => {}
						}
					),
					[ "{\"a\":1}", "plain" ]
				)
				assert.deepEqual(
					Object.keys(
						/** @type {RequestInit} */(inits[0])/**/
					)
						.sort(),
					[
						"body",
						"credentials",
						"headers",
						"method",
						"signal"
					]
				)
				assert.equal(inits[0]?.method, "GET")
				assert.deepEqual(
					await read({ as: "json" }),
					[ { a: 1 }, "plain" ]
				)
				assert.deepEqual(
					await read({ parse: data => typeof data }),
					[ "string", "string" ]
				)
				assert.deepEqual(
					await read(
						{
							as: "json",
							parse: data => [ data ]
						}
					),
					[ [ { a: 1 } ], [ "plain" ] ]
				)
			}
		)
		it(
			"sse parsing",
			async () => {
				const api = create()
				/** @type {import("async-lube").ServerEvent[]} */
				const events = []
				for await (const event of api.sse(
					"/events",
					{},
					{ reconnect: false }
				)) events.push(event)
				assert.deepEqual(
					events,
					[
						{
							data: "first",
							event: "message",
							id: "",
							retry: void 0
						},
						{
							data: "{\"a\":1}\nsecond line",
							event: "update",
							id: "7",
							retry: 1000
						},
						{
							data: "no space",
							event: "message",
							id: "7",
							retry: void 0
						},
						{
							data: "last",
							event: "message",
							id: "7",
							retry: void 0
						}
					]
				)
			}
		)
		it(
			"sse reconnect policies",
			async () => {
				vi.useFakeTimers()
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
				let calls = 0
				/** @type {(string | null | undefined)[]} */
				let script = []
				const api = http(
					{
						base: "https://events.test",
						fetch: async () => {
							const header = script[calls++]
							if (header === void 0) return new Response(
								"data: ok\n\n",
								{
									headers: {
										"Content-Type": "text/event-stream"
									}
								}
							)
							return new Response(
								"",
								{
									headers: header == null ? {} : { "Retry-After": header },
									status: 503
								}
							)
						}
					}
				)
				/**
				 * @param {import("async-lube").SseOptions=} options
				 * @returns {Promise<unknown>}
				 */
				async function first(options) {
					for await (const event of api.sse("/e", {}, options)) return event.data
					return void 0
				}
				script = [ "120", null ]
				const waiting = first()
				await vi.advanceTimersByTimeAsync(0)
				assert.equal(calls, 1)
				assert.lengthOf(online, 0)
				await vi.advanceTimersByTimeAsync(119999)
				assert.equal(calls, 1)
				await vi.advanceTimersByTimeAsync(1)
				assert.equal(calls, 2)
				assert.lengthOf(online, 1)
				online[0]?.()
				assert.lengthOf(online, 0)
				assert.equal(await settled(waiting, 0), "ok")
				assert.equal(calls, 3)
				calls = 0
				script = [ "120", null ]
				/** @type {unknown[][]} */
				const seen = []
				const custom = first(
					{
						reconnect: {
							delay: (failures, error, fallback) => {
								seen.push(
									[
										failures,
										error instanceof HttpError,
										fallback
									]
								)
								return 5
							}
						}
					}
				)
				await vi.advanceTimersByTimeAsync(5)
				assert.equal(calls, 2)
				assert.equal(await settled(custom, 5), "ok")
				assert.equal(seen[0]?.[2], 120000)
				assert.deepEqual(
					seen.map(
						([ failures, is_http ]) => [ failures, is_http ]
					),
					[ [ 1, true ], [ 2, true ] ]
				)
				assert.isAtLeast(Number(seen[1]?.[2]), 500)
				assert.isAtMost(Number(seen[1]?.[2]), 1000)
				calls = 0
				script = [ null ]
				const numbered = first({ reconnect: { delay: 7 } })
				await vi.advanceTimersByTimeAsync(6)
				assert.equal(calls, 1)
				assert.equal(await settled(numbered, 1), "ok")
				calls = 0
				script = [ null, null ]
				const stopped = rejection(
					first(
						{
							reconnect: {
								delay: failures => failures < 2 ? 0 : void 0
							}
						}
					)
				)
				await vi.advanceTimersByTimeAsync(0)
				assert.instanceOf(await stopped, HttpError)
				assert.equal(calls, 2)
				calls = 0
				script = [ null ]
				const cancelling = api.sse(
					"/e",
					{},
					{
						reconnect: {
							delay: () => {
								cancelling.cancel()
								return 10
							}
						}
					}
				)
				const cancelled = (async () => {
					for await (const event of cancelling) return event.data
					return "ended"
				})()
				await vi.advanceTimersByTimeAsync(0)
				assert.equal(await cancelled, "ended")
				assert.equal(calls, 1)
				assert.lengthOf(online, 0)
			}
		)
		it(
			"sse reconnection",
			async () => {
				const api = create()
				const stream = api.sse("/sse", { key: "sse-reconnect" })
				/** @type {string[]} */
				const received = []
				for await (const event of stream) received.push(event.data)
				assert.deepEqual(
					received,
					[
						"GET 1 text/event-stream  ",
						"GET 2 text/event-stream 1 "
					]
				)
				assert.equal(stream.lastEventId, "2")
				assert.equal(
					server.hits.get("sse-reconnect"),
					3
				)
				/** @type {string[]} */
				const after_failure = []
				for await (const event of api.sse(
					"/sse",
					{ fail: 1, key: "sse-failure" },
					{ reconnect: { delay: () => 1 } }
				)) {
					after_failure.push(event.data)
				}
				assert.deepEqual(
					after_failure,
					[ "GET 2 text/event-stream  " ]
				)
				const not_found = await rejection(
					(async () => {
						for await (const event of api.sse("/missing")) assert.fail(event.data)
					})()
				)
				assert.instanceOf(not_found, HttpError)
				/** @type {string[]} */
				const posted = []
				for await (const event of api.sse(
					"/sse",
					{ key: "sse-post" },
					{
						body: { prompt: "hi" },
						method: "POST"
					}
				)) {
					posted.push(event.data)
				}
				assert.deepEqual(
					posted,
					[
						"POST 1 text/event-stream  {\"prompt\":\"hi\"}"
					]
				)
				assert.equal(server.hits.get("sse-post"), 1)
			}
		)
		it(
			"sse request errors",
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
				const reconnect = { count: 3, delay: () => 1 }
				const hook = Error("Hook")
				const failures = await Promise.all(
					[
						api.sse("/rooms/:id", {}, { reconnect }),
						api.sse(
							"/rooms/:id",
							{ id: ".." },
							{ reconnect }
						),
						api.sse(
							"/sse",
							{ key: "sse-body" },
							{ body: "x", reconnect }
						),
						http(
							{
								on: {
									error: error => void errors.push(error)
								}
							}
						)
							.sse("/sse", {}, { reconnect }),
						api.extend(
							{
								on: {
									request: () => {
										throw hook
									}
								}
							}
						)
							.sse(
								"/sse",
								{ key: "sse-hook" },
								{ reconnect }
							)
					].map(
						events => rejection(
							events[Symbol.asyncIterator]().next()
						)
					)
				)
				assert.deepEqual(
					failures.map(
						error => error instanceof TypeError
					),
					[ true, true, true, true, false ]
				)
				assert.equal(failures[4], hook)
				assert.sameMembers(errors, failures)
				assert.isUndefined(server.hits.get("sse-body"))
				assert.isUndefined(server.hits.get("sse-hook"))
			}
		)
		it(
			"sse restarts",
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
				const events = api.sse(
					"/events",
					{ key: "restart" },
					{ reconnect: false }
				)
				for (let i = 0; i < 2; i++) {
					/** @type {string[]} */
					const data = []
					for await (const event of events) data.push(event.data)
					assert.equal(data[data.length - 1], "last")
				}
				/** @type {number[]} */
				const delays = []
				/** @type {string[]} */
				const ticks = []
				const started = Date.now()
				for await (const event of api.sse(
					"/sse",
					{ key: "server-retry" },
					{
						reconnect: {
							delay: failures => {
								delays.push(failures)
								return [ 1000, 2000 ][failures - 1]
							}
						}
					}
				)) ticks.push(event.data)
				assert.lengthOf(ticks, 2)
				assert.deepEqual(delays, [])
				assert.isBelow(Date.now() - started, 500)
				const given_up = await rejection(
					(async () => {
						for await (const event of api.sse(
							"/sse-busy",
							{ after: 0, key: "given-up" },
							{
								reconnect: {
									delay: failures => failures < 2 ? 1 : void 0
								}
							}
						)) void event
					})()
				)
				assert.instanceOf(given_up, HttpError)
				assert.equal(server.hits.get("given-up"), 2)
				await rejection(
					api.sse("/html")[Symbol.asyncIterator]()
						.next()
				)
				await sleep(0)
				assert.equal(errors.length, 3)
			}
		)
		it(
			"sse state",
			async () => {
				const api = create()
				/** @type {string[]} */
				const received = []
				for await (const event of api.sse(
					"/sse-cr",
					{ key: "cr" },
					{ reconnect: false }
				)) {
					received.push(event.data)
					if (event.data == "first") await api.get("/sse-cr-release", { key: "cr" })
				}
				assert.deepEqual(received, [ "first", "second" ])
				assert.isFalse(server.hits.has("cr-late"))
				const state = api.sse("/sse-state", { key: "state" })
				/** @type {string[]} */
				const data = []
				for await (const event of state) data.push(event.data)
				assert.deepEqual(data, [ "a" ])
				assert.equal(state.lastEventId, "2")
				assert.equal(server.hits.get("state:2"), 1)
				for await (const event of api.sse(
					"/sse-unicode",
					{ key: "unicode" }
				)) void event
				assert.equal(
					server.hits.get("unicode:사용자-1"),
					1
				)
				assert.instanceOf(
					await rejection(
						api.sse("/html")[Symbol.asyncIterator]()
							.next()
					),
					TypeError
				)
				const dropping = api.sse(
					"/sse-drop",
					{ key: "drop" },
					{
						reconnect: { count: 2, delay: () => 1 }
					}
				)
				assert.instanceOf(
					await rejection(
						dropping[Symbol.asyncIterator]().next()
					),
					NetworkError
				)
				assert.equal(server.hits.get("drop"), 3)
			}
		)
		it(
			"throttle",
			async () => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
				/** @type {string[]} */
				const sent = []
				const api = http(
					{
						base: "http://localhost",
						fetch: async url => {
							sent.push(
								new URL(url).pathname + new URL(url).search
							)
							return new Response(
								"{}",
								{
									headers: {
										"Content-Type": "application/json"
									}
								}
							)
						}
					}
				)
				const results = await Promise.all(
					[ 1, 2, 3 ].map(
						y => api.get("/tiles", { y }, { throttle: 50 }).safe()
					)
				)
				assert.deepEqual(
					sent,
					[ "/tiles?y=1", "/tiles?y=3" ]
				)
				assert.isUndefined(results[0]?.[0])
				assert.isTrue(isCancel(results[1]?.[0]))
				assert.isUndefined(results[2]?.[0])
				await sleep(120)
				const started = Date.now()
				await api.get(
					"/tiles",
					{ y: 4 },
					{ throttle: 50 }
				)
				assert.isBelow(Date.now() - started, 40)
				sent.length = 0
				await Promise.all(
					[
						api.get(
							"/items/:id",
							{ id: 1 },
							{ throttle: 50 }
						),
						api.get(
							"/items/:id",
							{ id: 2 },
							{ throttle: 50 }
						)
					]
				)
				assert.deepEqual(sent, [ "/items/1", "/items/2" ])
				const leading = api.get("/save", {}, { throttle: 50 })
				const waiting = api.get("/save", {}, { throttle: 50 })
				waiting.cancel()
				assert.isTrue(
					isCancel(await rejection(waiting))
				)
				await leading
				assert.deepEqual(sent.slice(2), [ "/save" ])
			}
		)
		it(
			"throttle timers",
			async () => {
				const index = new URL(
					"../../packages/async-lube/src/index.js",
					import.meta.url
				).href
				await new Promise(
					(resolve, reject) => execFile(
						process.execPath,
						[
							"--input-type=module",
							"-e",
							`const { http } = await import(${JSON.stringify(index)})
							globalThis.fetch = async () => new Response("{}")
							await http({ base: "https://throttle.test" }).get("/a", {}, { throttle: 60000 })`
						],
						{ timeout: 20000 },
						(/** @type {unknown} */ error) => error ? reject(error) : resolve(void 0)
					)
				)
			},
			30000
		)
		it(
			"timeout",
			async () => {
				const api = create({ timeout: 30 })
				const error = await rejection(api.get("/slow", { ms: 200 }))
				assert.instanceOf(error, TimeoutError)
				assert.isFalse(isCancel(error))
				assert.deepEqual(
					await api.get(
						"/slow",
						{ ms: 60 },
						{ timeout: 1000 }
					),
					{ slow: true }
				)
			}
		)
		it(
			"timeout edge cases",
			async () => {
				const hanging = create(
					{
						fetch: () => new Promise(() => {}),
						timeout: 20
					}
				)
				assert.instanceOf(
					await rejection(hanging.get("/slow")),
					TimeoutError
				)
				assert.instanceOf(
					await rejection(
						create({ timeout: 50 }).get("/slow-error")
					),
					TimeoutError
				)
				assert.deepEqual(
					await create({ timeout: 2 ** 31 }).get("/slow", { ms: 10 }),
					{ slow: true }
				)
			}
		)
		it(
			"upload errors",
			async () => {
				class BrokenXMLHttpRequest {
					response = new Blob([ "{}" ])
					status = 999
					statusText = "Unknown"
					upload = { onprogress: () => {} }
					/** @type {(() => void) | null} */
					onload = null
					abort() {}
					getAllResponseHeaders() {
						return ""
					}
					open() {}
					send() {
						setTimeout(
							() => /** @type {() => void} */(this.onload)/**/()
						)
					}
					setRequestHeader() {}
				}
				vi.stubGlobal(
					"XMLHttpRequest",
					BrokenXMLHttpRequest
				)
				const error = await rejection(
					create().post(
						"/upload",
						new FormData(),
						{ timeout: 1000, upload: () => {} }
					)
				)
				assert.instanceOf(error, NetworkError)
				class OfflineXMLHttpRequest extends BrokenXMLHttpRequest {
					/** @override */
					status = 0
				}
				vi.stubGlobal(
					"XMLHttpRequest",
					OfflineXMLHttpRequest
				)
				const offline = await rejection(
					create().post(
						"/upload",
						new FormData(),
						{ upload: () => {} }
					)
				)
				assert.instanceOf(offline, NetworkError)
				assert.equal(
					offline.message,
					"Network request failed"
				)
			}
		)
		it(
			"upload progress",
			async () => {
				/** @type {string[]} */
				const sent = []
				class FakeXMLHttpRequest {
					response = new Blob([ "{\"uploaded\":true}" ])
					status = 201
					statusText = "Created"
					upload = {
						/** @type {((event: ProgressEventInit) => void) | null} */
						onprogress: null
					}
					/** @type {(() => void) | null} */
					onabort = null
					/** @type {(() => void) | null} */
					onerror = null
					/** @type {(() => void) | null} */
					onload = null
					abort() {}
					getAllResponseHeaders() {
						return "content-type: application/json\r\nx-id: 1\r\n"
					}
					/**
					 * @param {string} method
					 * @param {string} url
					 */
					open(method, url) {
						sent.push(method + " " + url)
					}
					/**
					 * @param {XMLHttpRequestBodyInit | null} body
					 */
					send(body) {
						const upload = /** @type {{ onprogress: (event: ProgressEventInit) => void }} */(this.upload)/**/
						sent.push(
							String(body instanceof FormData)
						)
						upload.onprogress(
							{
								lengthComputable: true,
								loaded: 50,
								total: 100
							}
						)
						upload.onprogress(
							{
								lengthComputable: true,
								loaded: 100,
								total: 100
							}
						)
						setTimeout(
							() => /** @type {() => void} */(this.onload)/**/()
						)
					}
					setRequestHeader() {}
				}
				vi.stubGlobal(
					"XMLHttpRequest",
					FakeXMLHttpRequest
				)
				/** @type {import("async-lube").Progress[]} */
				const progress = []
				const api = create()
				const result = await api.post(
					"/upload",
					new FormData(),
					{
						upload: value => progress.push(value)
					}
				)
					.raw()
				assert.deepEqual(result.data, { uploaded: true })
				assert.equal(result.status, 201)
				assert.equal(result.headers.get("X-Id"), "1")
				assert.deepEqual(
					sent,
					[
						"POST " + server.base + "/upload",
						"true"
					]
				)
				assert.deepEqual(
					progress,
					[
						{ loaded: 50, ratio: 0.5, total: 100 },
						{ loaded: 100, ratio: 1, total: 100 }
					]
				)
				const thrown = await api.post(
					"/upload",
					new FormData(),
					{
						upload: () => {
							throw Error("the progress bar is gone")
						}
					}
				)
				assert.deepEqual(thrown, { uploaded: true })
			}
		)
		it(
			"upload stream body",
			async () => {
				vi.stubGlobal("XMLHttpRequest", class {})
				const stream = new ReadableStream(
					{
						start: controller => controller.close()
					}
				)
				assert.instanceOf(
					await rejection(
						create().post(
							"/upload",
							stream,
							{ upload: () => {} }
						)
					),
					TypeError
				)
			}
		)
		it(
			"upload with a custom fetch",
			async () => {
				vi.stubGlobal(
					"XMLHttpRequest",
					class {
						constructor() {
							throw Error("XMLHttpRequest was used")
						}
					}
				)
				let used = false
				const data = await create(
					{
						fetch: async () => {
							used = true
							return new Response(
								"{\"ok\":true}",
								{
									headers: {
										"Content-Type": "application/json"
									}
								}
							)
						}
					}
				)
					.post(
						"/upload",
						new FormData(),
						{ upload: () => {} }
					)
				assert.isTrue(used)
				assert.deepEqual(data, { ok: true })
			}
		)
		it(
			"url",
			async () => {
				const api = http({ base: server.base + "/" })
				/** @type {Echo} */
				const url = await api.get(
					"/echo",
					{
						date: new Date(0),
						empty: void 0,
						filter: { price: [ 1, 2 ] },
						none: null,
						tags: [ "x", "y" ]
					}
				)
				assert.equal(
					decodeURIComponent(url.url),
					"/echo?date=1970-01-01T00:00:00.000Z&filter[price]=1&filter[price]=2&tags=x&tags=y"
				)
				/** @type {Echo} */
				const with_query = await api.get("echo?a=1#hash", { b: 2 })
				assert.equal(with_query.url, "/echo?a=1&b=2")
				/** @type {Echo} */
				const absolute = await http({ base: "http://127.0.0.1:1" }).get(server.base + "/echo")
				assert.equal(absolute.url, "/echo")
				const encoded = await rejection(
					api.get(
						"/status/:id",
						{ code: 404, id: "a/b" }
					)
				)
				assert.equal(
					/** @type {HttpError} */(encoded)/**/.request.url,
					server.base + "/status/a%2Fb?code=404"
				)
				// @ts-expect-error: missing path parameter
				const missing = await rejection(api.get("/users/:id"))
				assert.instanceOf(missing, TypeError)
				assert.equal(
					missing.message,
					"Missing path parameter \"id\" for /users/:id"
				)
			}
		)
		it(
			"url joining",
			async () => {
				/** @type {string[]} */
				const urls = []
				/** @param {string} url */
				async function record(url) {
					urls.push(url)
					return new Response(null, { status: 204 })
				}
				const api = http(
					{
						base: "https://api.example.com/v1/",
						fetch: record
					}
				)
				await api.get("users")
				await api.get("/users")
				await api.get("")
				await api.get("?q=1")
				await api.get("https://other.example.com/x")
				await http(
					{
						base: "https://api.example.com/v1",
						fetch: record
					}
				).get("users/:id", { id: 1 })
				assert.deepEqual(
					urls,
					[
						"https://api.example.com/v1/users",
						"https://api.example.com/v1/users",
						"https://api.example.com/v1",
						"https://api.example.com/v1?q=1",
						"https://other.example.com/x",
						"https://api.example.com/v1/users/1"
					]
				)
			}
		)
		it(
			"url params",
			async () => {
				const api = create()
				/** @type {Echo} */
				const in_query = await api.get(
					"/echo?next=/:page",
					{ page: "x" }
				)
				assert.equal(
					in_query.url,
					"/echo?next=/:page&page=x"
				)
				/** @type {Echo} */
				const in_base = await http(
					{ base: server.base + "/:page" }
				).get("/", { b: 2, page: "echo" })
				assert.equal(in_base.url, "/echo?b=2")
				const named = http(
					{
						base: "http://localhost",
						fetch: async () => new Response(
							"x",
							{
								headers: {
									"Content-Disposition": "attachment; xfilename=\"bad.txt\"; filename=\"good.txt\""
								}
							}
						)
					}
				)
				assert.equal(
					(await named.get("/download", {}, { as: "file" })).name,
					"good.txt"
				)
			}
		)
		it(
			"url safety",
			async () => {
				const api = create()
				assert.instanceOf(
					await rejection(
						api.get(
							"/users/:id/profile",
							{ id: ".." }
						)
					),
					TypeError
				)
				assert.instanceOf(
					await rejection(
						api.get(
							"/users/:toString",
							/** @type {never} */({})/**/
						)
					),
					TypeError
				)
				const repeated = await api.get(
					"/echo/:id/:id",
					{ id: 1 },
					{ ok: () => true }
				)
					.raw()
				assert.isTrue(
					repeated.response.url.endsWith("/echo/1/1")
				)
				const with_query = http(
					{
						base: server.base + "/echo?app=1"
					}
				)
				assert.equal(
					/** @type {Echo} */(await with_query.get("/", { b: 2 }))/**/.url,
					"/echo?app=1&b=2"
				)
			}
		)
	}
)
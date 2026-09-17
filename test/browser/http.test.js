/** @import { DownloadedFile, Progress, ServerEvent } from "async-lube" */
import { encode_cp949 } from "../async-lube/cp949.js"
import { NetworkError, http } from "async-lube"
import { assert, describe, inject, it } from "vitest"
describe(
	"http in a browser",
	() => {
		const base = inject("base")
		/**
		 * @param {import("async-lube").HttpConfig=} config
		 * @returns {import("async-lube").Http}
		 */
		function create(config) {
			return http({ base, ...config })
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
		it(
			"closes a live ndjson stream when the loop is left",
			async () => {
				const lines = /** @type {AsyncIterable<unknown>} */(await create().get(
					"/ndjson-live",
					{ key: "browser-ndjson" },
					{ as: "ndjson" }
				))/**/
				/** @type {unknown[]} */
				const seen = []
				for await (const line of lines) {
					seen.push(line)
					if (seen.length == 3) break
				}
				assert.deepEqual(
					seen,
					[ { n: 1 }, { n: 2 }, { n: 3 } ]
				)
				await sleep(50)
			}
		)
		it(
			"keeps raw latin1 file names that the browser decodes as CP949",
			async () => {
				/** @type {Record<string, string>} */
				const cases = {
					"Ärger.txt": "Ärger.txt",
					"Äß Müßig.txt": "Äß Müßig.txt",
					[String.fromCharCode(
						0xBF,
						0xB5,
						0xBC,
						0xF6,
						0xC1,
						0xF5,
						0xA1,
						0xA4,
						0xB9,
						0xE8,
						0xB4,
						0xDE
					) + ".pdf"]: "영수증·배달.pdf"
				}
				const api = http(
					{
						base,
						fetch: async url => new Response(
							"x",
							{
								headers: {
									"Content-Disposition": `attachment; filename="${decodeURIComponent(url.split("/").pop() ?? "")}"`
								}
							}
						)
					}
				)
				/** @type {DownloadedFile[]} */
				const files = await Promise.all(
					Object.keys(cases).map(
						raw => api.get("/:raw", { raw }, { as: "file" })
					)
				)
				assert.deepEqual(
					files.map(file => file.name),
					Object.values(cases)
				)
			}
		)
		it(
			"leaves the total unknown for a compressed response",
			async () => {
				/** @type {Progress[]} */
				const progress = []
				/** @type {number[]} */
				const numbers = await create().get(
					"/gzip",
					{},
					{
						progress: value => progress.push(value)
					}
				)
				assert.equal(numbers.length, 2000)
				assert.isUndefined(progress[0]?.total)
				assert.equal(
					progress[progress.length - 1]?.ratio,
					1
				)
			}
		)
		it(
			"reads a file name from a real Content-Disposition",
			async () => {
				/** @type {DownloadedFile} */
				const file = await create().get(
					"/file",
					{ lang: 1 },
					{ as: "file" }
				)
				assert.equal(file.name, "€ rates.txt")
				assert.instanceOf(file.blob, Blob)
				assert.isAbove(file.blob.size, 0)
			}
		)
		it(
			"reads raw CP949 file names with UHC syllables",
			async () => {
				const names = [
					"①②③_급여.xlsx",
					"똠방각하_급여.xlsx",
					"뷁뷁_급여.xlsx",
					"韓國支社_급여명세.xlsx",
					"Ärger.txt",
					"Äß Müßig.txt",
					"¿Qué?.txt"
				]
				const raw = names.map(
					name => name.charCodeAt(0) < 0x100 ? name : encode_cp949(name)
				)
				const api = http(
					{
						base,
						fetch: async url => new Response(
							"x",
							{
								headers: {
									"Content-Disposition": `attachment; filename="${raw[Number(url.split("/").pop())]}"`
								}
							}
						)
					}
				)
				/** @type {DownloadedFile[]} */
				const files = await Promise.all(
					raw.map(
						(_, i) => api.get("/:i", { i }, { as: "file" })
					)
				)
				assert.deepEqual(
					files.map(file => file.name),
					names
				)
			}
		)
		it(
			"reconnects an event stream with Last-Event-ID",
			async () => {
				const stream = create().sse("/sse", { key: "browser-sse" })
				/** @type {ServerEvent[]} */
				const events = []
				for await (const event of stream) {
					events.push(event)
					if (events.length == 2) break
				}
				assert.equal(events[0]?.id, "1")
				assert.equal(events[1]?.id, "2")
				assert.include(
					/** @type {string} */(events[1]?.data)/**/,
					"text/event-stream 1"
				)
				assert.equal(stream.lastEventId, "2")
			}
		)
		it(
			"reports download progress of a real stream",
			async () => {
				/** @type {Progress[]} */
				const progress = []
				const data = await create().get(
					"/big",
					{},
					{
						as: "arrayBuffer",
						progress: value => progress.push(value)
					}
				)
				assert.equal(
					/** @type {ArrayBuffer} */(data)/**/.byteLength,
					64 * 1024
				)
				assert.isAbove(progress.length, 1)
				assert.equal(progress[0]?.total, 64 * 1024)
				assert.equal(
					progress[progress.length - 1]?.ratio,
					1
				)
			}
		)
		it(
			"sends credentials across origins",
			async () => {
				/** @type {{ headers: Record<string, string> }} */
				const echo = await create({ credentials: "include" }).post(
					"/echo",
					{ a: 1 },
					{
						headers: { "X-Trace": "browser" }
					}
				)
				assert.equal(
					echo.headers["x-trace"],
					"browser"
				)
			}
		)
		it(
			"shares one request between callers and copies the data",
			async () => {
				const api = create()
				const [ first, second ] = await Promise.all(
					[
						api.get(
							"/count",
							{ key: "browser-dedupe" }
						),
						api.get(
							"/count",
							{ key: "browser-dedupe" }
						)
					]
				)
				assert.deepEqual(first, { count: 1 })
				assert.deepEqual(second, { count: 1 })
				assert.notStrictEqual(first, second)
			}
		)
		it(
			"turns a blocked cross-origin request into NetworkError",
			async () => {
				const error = await rejection(create().get("/no-cors"))
				assert.instanceOf(error, NetworkError)
				assert.equal(
					/** @type {NetworkError} */(error)/**/.request.method,
					"GET"
				)
			}
		)
	}
)
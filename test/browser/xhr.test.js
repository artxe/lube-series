/** @import { Progress } from "async-lube" */
import {
	CancelError,
	HttpError,
	NetworkError,
	http
} from "async-lube"
import { assert, describe, inject, it } from "vitest"
describe(
	"xhr in a browser",
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
		 * @param {number} size
		 * @returns {FormData}
		 */
		function form(size) {
			const data = new FormData()
			data.append(
				"file",
				new Blob(
					[ new Uint8Array(size) ],
					{
						type: "application/octet-stream"
					}
				),
				"big.bin"
			)
			return data
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
		it(
			"cancels an upload in flight",
			async () => {
				const request = create().post(
					"/upload",
					form(1024),
					{
						params: { ms: 300 },
						upload: () => {}
					}
				)
				await new Promise(
					resolve => setTimeout(resolve, 20)
				)
				request.cancel("left the page")
				const error = await rejection(request)
				assert.instanceOf(error, CancelError)
				assert.equal(error.cause, "left the page")
			}
		)
		it(
			"ignores an error thrown by the upload callback",
			async () => {
				let calls = 0
				const data = await create().post(
					"/upload",
					form(256 * 1024),
					{
						upload: () => {
							calls++
							throw Error("the progress bar is gone")
						}
					}
				)
				assert.isAbove(calls, 0)
				assert.isAbove(
					/** @type {{ size: number }} */(data)/**/.size,
					256 * 1024
				)
			}
		)
		it(
			"lets a fetch of the config take the upload",
			async () => {
				let used = 0
				const data = await create(
					{
						fetch: (url, init) => {
							used++
							return fetch(url, init)
						}
					}
				)
					.post(
						"/upload",
						form(1024),
						{
							upload: () => assert.fail("XMLHttpRequest was used")
						}
					)
				assert.equal(used, 1)
				assert.isAbove(
					/** @type {{ size: number }} */(data)/**/.size,
					1024
				)
			}
		)
		it(
			"reads an empty response through XMLHttpRequest",
			async () => {
				const result = await create().post(
					"/empty",
					form(16),
					{ upload: () => {} }
				)
					.raw()
				assert.equal(result.status, 204)
				assert.isUndefined(result.data)
			}
		)
		it(
			"rejects a failed upload with HttpError",
			async () => {
				const error = await rejection(
					create().post(
						"/upload",
						form(1024),
						{
							params: { code: 500 },
							upload: () => {}
						}
					)
				)
				assert.instanceOf(error, HttpError)
				assert.equal(error.status, 500)
				assert.equal(error.message, "Upload failed")
				assert.isAbove(
					Number(error.headers.get("X-Size")),
					1024
				)
			}
		)
		it(
			"rejects an unreachable upload with NetworkError",
			async () => {
				const error = await rejection(
					http({ base: "http://127.0.0.1:1" }).post(
						"/upload",
						form(16),
						{ upload: () => {} }
					)
				)
				assert.instanceOf(error, NetworkError)
			}
		)
		it(
			"reports real upload progress",
			async () => {
				assert.isFunction(globalThis.XMLHttpRequest)
				/** @type {Progress[]} */
				const progress = []
				const result = await create().post(
					"/upload",
					form(2 * 1024 * 1024),
					{
						upload: value => progress.push(value)
					}
				)
					.raw()
				assert.isAbove(
					/** @type {{ size: number }} */(result.data)/**/.size,
					2 * 1024 * 1024
				)
				assert.equal(result.status, 200)
				assert.equal(
					result.headers.get("X-Size"),
					String(
						/** @type {{ size: number }} */(result.data)/**/.size
					)
				)
				assert.isAbove(progress.length, 0)
				const last = /** @type {Progress} */(progress[progress.length - 1])/**/
				assert.equal(last.ratio, 1)
				assert.equal(last.loaded, last.total)
				assert.isTrue(
					progress.every(
						value => value.loaded <= (value.total ?? Infinity)
					)
				)
			}
		)
		it(
			"times out an upload",
			async () => {
				const error = await rejection(
					create().post(
						"/upload",
						form(16),
						{
							params: { ms: 500 },
							timeout: 50,
							upload: () => {}
						}
					)
				)
				assert.equal(
					/** @type {Error} */(error)/**/.name,
					"TimeoutError"
				)
			}
		)
	}
)
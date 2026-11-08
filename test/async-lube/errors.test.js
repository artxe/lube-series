import { FlowError, NetworkError, flow, http } from "async-lube"
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	it,
	vi
} from "vitest"
describe(
	"errors",
	() => {
		afterEach(() => vi.useRealTimers())
		beforeEach(
			() => {
				vi.useFakeTimers()
				vi.setTimerTickMode("nextTimerAsync")
			}
		)
		it(
			"names the value that a flow node threw when it is no Error",
			async () => {
				const error = /** @type {FlowError} */(await rejection(
					flow()
						.add(
							function reserve() {
								throw "sold out"
							}
						)
						.run()
				))/**/
				assert.instanceOf(error, FlowError)
				assert.equal(error.node, "reserve")
				assert.equal(error.cause, "sold out")
			}
		)
		it(
			"says that the network failed when fetch rejects with no Error",
			async () => {
				const api = http(
					{
						base: "http://localhost",
						fetch: () => Promise.reject("offline")
					}
				)
				const error = /** @type {NetworkError} */(await rejection(api.get("/stock")))/**/
				assert.instanceOf(error, NetworkError)
				assert.equal(error.cause, "offline")
			}
		)
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
	}
)
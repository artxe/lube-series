/** @type {import("async-lube").OffloadSetup<{ closed?: SharedArrayBuffer, close_error?: string, start?: number } | undefined, number | string, unknown, { size: number }>} */
export default data => {
	let total = data?.start ?? 0
	let size = 0
	let poisoned = false
	return {
		async batch(run) {
			size = 0
			poisoned = false
			await run()
			if (poisoned) {
				throw Error("commit failed")
			}
			return { size }
		},
		call(request) {
			size++
			if (request == "poison") {
				poisoned = true
				return "poisoned"
			}
			if (request == "fail") {
				throw RangeError("bad request")
			}
			if (request == "crash") {
				setTimeout(
					() => {
						throw RangeError("crashed")
					}
				)
				return new Promise(() => {})
			}
			if (request == "slow") {
				return new Promise(
					resolve => setTimeout(resolve, 30, "slow")
				)
			}
			if (typeof request == "string") {
				return request
			}
			total += request
			return total
		},
		close() {
			if (data?.closed) {
				Atomics.store(new Int32Array(data.closed), 0, 1)
			}
			if (data?.close_error) {
				throw Error(data.close_error)
			}
		}
	}
}
/** @type {import("async-lube").OffloadSetup<undefined, never, never>} */
export default async () => {
	throw RangeError("setup failed")
}
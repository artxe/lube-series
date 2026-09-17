const real = {
	clear_timeout: globalThis.clearTimeout,
	set_timeout: globalThis.setTimeout
}
/**
 * @param {unknown[]} list
 * @returns {() => void}
 */
export function catch_unhandled(list) {
	const listeners = process.listeners("unhandledRejection")
	process.removeAllListeners("unhandledRejection")
	/**
	 * @param {unknown} error
	 * @returns {void}
	 */
	function collect(error) {
		list.push(error)
	}
	process.on("unhandledRejection", collect)
	return () => {
		process.off("unhandledRejection", collect)
		for (const listener of listeners) process.on("unhandledRejection", listener)
	}
}
/**
 * @param {string} mode
 * @param {number} count
 * @returns {number[]}
 */
export function sim_seeds(mode, count) {
	const {
		SIM_FROM,
		SIM_MODE,
		SIM_SEED,
		SIM_SEEDS
	} = process.env
	if (SIM_MODE && SIM_MODE != mode) return []
	if (SIM_SEED) return [ Number(SIM_SEED) ]
	const from = Number(SIM_FROM ?? 1)
	return Array.from(
		{
			length: Number(SIM_SEEDS ?? count)
		},
		(_, index) => from + index
	)
}
/**
 * @template T
 * @param {string} label
 * @param {Promise<T>} work
 * @returns {Promise<T>}
 */
export function within(label, work) {
	const ms = Number(
		process.env["SIM_TIMEOUT"] ?? 60000
	)
	if (!(ms > 0)) return work
	/** @type {ReturnType<typeof setTimeout>} */
	let timer
	return Promise.race(
		[
			work,
			/** @type {Promise<never>} */(new Promise(
				(_, reject) => timer = real.set_timeout(
					() => reject(
						Error(
							`${label} did not finish within ${ms} ms`
						)
					),
					ms
				)
			))/**/
		]
	)
		.finally(
			() => real.clear_timeout(timer)
		)
}
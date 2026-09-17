/**
 * @param {number} count
 * @returns {number[]}
 */
export function fuzz_seeds(count) {
	const { SIM_FROM, SIM_SEED, SIM_SEEDS } = process.env
	if (SIM_SEED) return [ Number(SIM_SEED) ]
	return Array.from(
		{
			length: Number(SIM_SEEDS || count)
		},
		(_, index) => Number(SIM_FROM || 1) + index
	)
}
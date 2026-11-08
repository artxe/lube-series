/**
 * @param {Pick<import("../../private.js").OrderEntry, "name" | "rank">} a
 * @param {Pick<import("../../private.js").OrderEntry, "name" | "rank">} b
 * @returns {number}
 */
function compare(a, b) {
	const rank = (a.rank ?? 1) - (b.rank ?? 1)
	if (rank) {
		return rank
	}
	return a.name < b.name
		? -1
		: a.name > b.name
			? 1
			: 0
}
export { compare }
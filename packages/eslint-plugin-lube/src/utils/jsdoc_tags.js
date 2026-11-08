const letter_regex = /[A-Za-z]/
const space_regex = /\s/
const tag_name_regex = /^@([A-Za-z]+)/
/**
 * @param {string} tag
 * @returns {string}
 */
export function tag_name(tag) {
	return tag_name_regex.exec(tag)?.[1] ?? ""
}
/**
 * @param {string} text
 * @returns {number[]}
 */
export function tag_starts(text) {
	/** @type {number[]} */
	const starts = []
	let depth = 0
	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i)
		if (char == "{") {
			depth++
		} else if (char == "}") {
			depth = Math.max(0, depth - 1)
		} else if (char == "@" && depth == 0 && letter_regex.test(text.charAt(i + 1)) && (i == 0 || space_regex.test(text.charAt(i - 1)))) {
			starts.push(i)
		}
	}
	return starts
}
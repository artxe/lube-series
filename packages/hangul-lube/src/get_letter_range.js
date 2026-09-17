import compound_consonant_letters from "./compound_consonant_letters.js"
import first_consonant_letters from "./first_consonant_letters.js"
import letter_growths from "./letter_growths.js"
const final_kept = [ 0, 0, 0, 1, 0, 4, 4, 0, 0, 8, 8, 8, 8, 8, 8, 8, 0, 0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
const final_growths = [ 0, 2, 0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
const final_moved = " ㄱㄲㅅㄴㅈㅎㄷㄹㄱㅁㅂㅅㅌㅍㅎㅁㅂㅅㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
const medial_growths = [ 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0 ]
const special_character_regex = /[$()*+.?[\\\]^{|}]/
/**
 * @param {string} letter
 * @param {(letters: string) => string} gap
 * @param {boolean} last
 * @returns {string}
 */
export default function(letter, gap, last) {
	const compound = compound_consonant_letters[letter]
	if (compound) {
		const [ first, second ] = compound
		return `(?:${letter}|[${first}${first_consonant_letters[first]}]${gap(second)}[${second}${first_consonant_letters[second]}])`
	}
	const consonant = first_consonant_letters[letter]
	const growth = letter_growths[letter]
	if (consonant || growth) return `[${letter}${growth ?? ""}${consonant ?? ""}]`
	const code = letter.charCodeAt(0)
	if (code < 0xAC00 || code > 0xD7A3) return special_character_regex.test(letter) ? "\\" + letter : letter
	if (!last) return letter
	const syllable = code - 0xAC00
	const final = syllable % 28
	if (!final) {
		const medial = syllable / 28 % 21
		return `[${letter}-${String.fromCharCode(code + 28 * /** @type {number} */(medial_growths[medial])/**/ + 27)}]`
	}
	const final_growth = final_growths[final]
	const range = final_growth
		? final === 1
			? `[${letter}${String.fromCharCode(code + 2)}]`
			: `[${letter}-${String.fromCharCode(code + final_growth)}]`
		: letter
	const kept = String.fromCharCode(
		code - final + /** @type {number} */(final_kept[final])/**/
	)
	return `(?:${range}|${kept}${gap("")}[${first_consonant_letters[/** @type {string} */(final_moved[final])/**/]}])`
}
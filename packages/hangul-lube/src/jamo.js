import compound_consonant_letters from "./compound_consonant_letters.js"
const HANGUL = 0xac00
const HANGUL_END = 0xd7a3
export const final_letters = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
export const initial_letters = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
export const medial_letters = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
/** @type {Record<string, string | undefined>} */
export const joined_finals = Object.fromEntries(
	Object.entries(compound_consonant_letters).flatMap(
		([ joined, pair ]) => pair ? [ [ pair.join(""), joined ] ] : []
	)
)
/** @type {Record<string, string | undefined>} */
export const joined_vowels = {
	ㅗㅏ: "ㅘ",
	ㅗㅐ: "ㅙ",
	ㅗㅣ: "ㅚ",
	ㅜㅓ: "ㅝ",
	ㅜㅔ: "ㅞ",
	ㅜㅣ: "ㅟ",
	ㅡㅣ: "ㅢ"
}
/** @type {Record<string, [ first: string, second: string ] | undefined>} */
export const split_vowels = Object.fromEntries(
	Object.entries(joined_vowels).map(
		([ pair, joined ]) => [
			joined,
			[ pair.charAt(0), pair.charAt(1) ]
		]
	)
)
/**
 * @param {string} char
 * @returns {{ final: number, initial: number, medial: number } | null}
 */
export function parts_of(char) {
	const code = char.charCodeAt(0)
	if (!(code >= HANGUL && code <= HANGUL_END)) {
		return null
	}
	const index = code - HANGUL
	return {
		final: index % 28,
		initial: Math.floor(index / 28 / 21),
		medial: Math.floor(index / 28) % 21
	}
}
/**
 * @param {number} initial
 * @param {number} medial
 * @param {string} final
 * @returns {string}
 */
export function syllable(initial, medial, final) {
	return String.fromCharCode(
		HANGUL + (initial * 21 + medial) * 28 + (final ? final_letters.indexOf(final) + 1 : 0)
	)
}
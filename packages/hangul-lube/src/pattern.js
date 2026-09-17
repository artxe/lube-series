import get_letter_range from "./get_letter_range.js"
import letters_of from "./letters_of.js"
/**
 * Generates the regular expression source that finds Korean text while it is still being typed.
 * A consonant matches itself and every syllable it starts, and the last syllable also matches every
 * syllable it grows into with more keys, with its final consonant moved to the next syllable too;
 * earlier syllables match only themselves. Special characters are escaped and white space is kept.
 * An empty text gives `""`, which matches everything; `searcher` gives `null` instead.
 * @param {string} text
 * @returns {string}
 * @example pattern("ㄱㅊㅉㄱ") //=> "[ㄱㄳ가-깋][ㅊ차-칳][ㅉ짜-찧][ㄱㄳ가-깋]"
 *
 * pattern("된자") //=> "된[자-잫]"
 *
 * pattern("오리") //=> "오[리-맇]"
 *
 * pattern("공") //=> "(?:공|고[아-잏])"
 *
 * pattern("1+1") //=> "1\\+1"
 *
 * pattern("") //=> ""
 */
export default function(text) {
	const letters = letters_of(text)
	const last = letters.length - 1
	return letters.map(
		(letter, index) => get_letter_range(letter, () => "", index == last)
	)
		.join("")
}
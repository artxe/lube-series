import compound_consonant_letters from "./compound_consonant_letters.js"
import get_letter_range from "./get_letter_range.js"
import letter_growths from "./letter_growths.js"
import letters_of from "./letters_of.js"
const class_special_character_regex = /[()/[\\\]^{|}-]/
const non_word_class = "^가-힣0-9A-Za-z"
const non_word_separator = `[${non_word_class}]*?`
const non_word_letter_regex = /^[^가-힣0-9A-Za-z]/
const ignored_regex = /[\p{Default_Ignorable_Code_Point}\s]/u
const max_letters = 1000
const never_source = "(?!)"
/**
 * @param {string} letters
 * @returns {string}
 */
function gap(letters) {
	return letters ? `[${non_word_class}${letters}]*?` : non_word_separator
}
/**
 * @param {string} letter
 * @returns {string}
 */
function separator(letter) {
	if (!non_word_letter_regex.test(letter)) return non_word_separator
	if (letter.length > 1) return `(?:(?!${letter})[${non_word_class}])*?`
	const compound = compound_consonant_letters[letter]
	if (compound) return gap(letter + compound[0])
	return gap(
		`${class_special_character_regex.test(letter) ? "\\" : ""}${letter}${letter_growths[letter] ?? ""}`
	)
}
/**
 * Compiles a case-insensitive regular expression for a Korean search box, matching the text while it
 * is still being typed, as `pattern` does. White space and invisible characters in the query are dropped,
 * and anything but Korean syllables, digits and Latin letters may stand between the letters of the text.
 * An empty query, or one of white space only, gives `null`, and one of more than 1000 letters,
 * such as a page pasted into the box, gives a regular expression that finds nothing, since the
 * expression such a query needs is longer than an engine compiles.
 * The text is matched as it is, so compose decomposed text with `normalize("NFC")` before testing it.
 * @param {string} text
 * @returns {RegExp?}
 * @example searcher("ㄱㅊㅉㄱ") //=>
 * /[ㄱㄳ가-깋][^가-힣0-9A-Za-zㅊ]*?[ㅊ차-칳][^가-힣0-9A-Za-zㅉ]*?[ㅉ짜-찧][^가-힣0-9A-Za-zㄱㄳ]*?[ㄱㄳ가-깋]/i
 *
 * searcher("1+1") //=> /1[^가-힣0-9A-Za-z+]*?\+[^가-힣0-9A-Za-z]*?1/i
 *
 * searcher("ㄸㅂ")?.exec("매운 떡볶이") //=> index 3, "떡볶" (the span to highlight)
 *
 * searcher(" ") //=> null
 */
export default function(text) {
	const letters = letters_of(text).filter(
		letter => !ignored_regex.test(letter)
	)
	if (letters.length > max_letters) return RegExp(never_source, "i")
	const last = letters.length - 1
	let source = ""
	for (const [ index, letter ] of letters.entries()) {
		if (index) source += separator(letter)
		source += get_letter_range(letter, gap, index == last)
	}
	return source ? RegExp(source, "i") : null
}
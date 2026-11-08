import compound_consonant_letters from "./compound_consonant_letters.js"
import {
	final_letters,
	initial_letters,
	joined_finals,
	joined_vowels,
	medial_letters,
	parts_of,
	syllable
} from "./jamo.js"
/**
 * @param {string} head
 * @param {{ final: number, initial: number, medial: number }} parts
 * @param {number} medial
 * @returns {string}
 */
function moved_final(head, parts, medial) {
	const final = /** @type {string} */(final_letters[parts.final - 1])/**/
	const [ keep, move ] = compound_consonant_letters[final] ?? [ "", final ]
	return head + syllable(parts.initial, parts.medial, keep) + syllable(
		initial_letters.indexOf(move),
		medial,
		""
	)
}
/**
 * Types one key on a two-set (dubeolsik) Korean keyboard: returns the text with the key composed into
 * its last character, as an input method does. `letter` is a compatibility jamo (`ㄱ`, `ㅏ`, and
 * the double `ㄲ`, `ㅒ` that the shift key gives); any other string is appended as it is.
 * A consonant and a vowel make a syllable, two vowels join (`ㅗ` and `ㅏ` into `ㅘ`), a consonant
 * after a syllable becomes its final and joins the final before it when the two make a compound
 * final (`ㄹ` and `ㄱ` into `ㄺ`), and a vowel after a final moves it onto a new syllable (a compound
 * final moves only its second consonant). Two lone consonants join the same way (`ㄱ` and `ㅅ` into
 * `ㄳ`), and a vowel splits them again. The same key never makes a double consonant: `ㄱ` after
 * `각` is appended, since `ㄲ` needs the shift key.
 * @param {string} text
 * @param {string} letter
 * @returns {string}
 * @example typeLetter("ㄱ", "ㅏ") //=> "가"
 *
 * typeLetter("가", "ㄱ") //=> "각"
 *
 * typeLetter("각", "ㅏ") //=> "가가"
 *
 * typeLetter("고", "ㅏ") //=> "과"
 *
 * typeLetter("갈", "ㄱ") //=> "갉"
 */
export default function(text, letter) {
	const chars = Array.from(text)
	const last = chars.pop() ?? ""
	const head = chars.join("")
	const parts = parts_of(last)
	const single = letter.length == 1
	const medial = single ? medial_letters.indexOf(letter) : -1
	if (medial >= 0 && last) {
		if (initial_letters.includes(last)) {
			return head + syllable(
				initial_letters.indexOf(last),
				medial,
				""
			)
		}
		const pair = compound_consonant_letters[last]
		if (pair) {
			return head + pair[0] + syllable(
				initial_letters.indexOf(pair[1]),
				medial,
				""
			)
		}
		if (parts && parts.final > 0) {
			return moved_final(head, parts, medial)
		}
		const joined = joined_vowels[(parts ? medial_letters.charAt(parts.medial) : last) + letter]
		if (joined) {
			return head + (parts
				? syllable(
					parts.initial,
					medial_letters.indexOf(joined),
					""
				)
				: joined)
		}
	} else if (single && initial_letters.includes(letter) && last) {
		if (parts) {
			const final = parts.final > 0
				? joined_finals[final_letters.charAt(parts.final - 1) + letter]
				: final_letters.includes(letter)
					? letter
					: undefined
			if (final) {
				return head + syllable(parts.initial, parts.medial, final)
			}
		} else {
			const joined = joined_finals[last + letter]
			if (joined) {
				return head + joined
			}
		}
	}
	return text + letter
}
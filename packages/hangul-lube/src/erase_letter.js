import compound_consonant_letters from "./compound_consonant_letters.js"
import {
	final_letters,
	initial_letters,
	medial_letters,
	parts_of,
	split_vowels,
	syllable
} from "./jamo.js"
/**
 * Takes back one key on a two-set (dubeolsik) Korean keyboard: returns the text after one
 * backspace, undoing what `typeLetter` composed. A compound final loses its second consonant, a
 * single final goes, a joined vowel splits back into its first vowel, a syllable with a simple
 * vowel and no final leaves its initial consonant, and a lone joined vowel or compound consonant
 * loses its second part. Anything else loses its last code point, so an emoji goes whole.
 * @param {string} text
 * @returns {string}
 * @example eraseLetter("갉") //=> "갈"
 *
 * eraseLetter("각") //=> "가"
 *
 * eraseLetter("과") //=> "고"
 *
 * eraseLetter("가") //=> "ㄱ"
 *
 * eraseLetter("ㅘ") //=> "ㅗ"
 */
export default function(text) {
	const chars = Array.from(text)
	const last = chars.pop() ?? ""
	const head = chars.join("")
	const parts = parts_of(last)
	if (parts) {
		if (parts.final > 0) {
			const pair = compound_consonant_letters[final_letters.charAt(parts.final - 1)]
			return head + syllable(
				parts.initial,
				parts.medial,
				pair ? pair[0] : ""
			)
		}
		const split = split_vowels[medial_letters.charAt(parts.medial)]
		return head + (split
			? syllable(
				parts.initial,
				medial_letters.indexOf(split[0]),
				""
			)
			: initial_letters.charAt(parts.initial))
	}
	return head + (split_vowels[last]?.[0] ?? compound_consonant_letters[last]?.[0] ?? "")
}
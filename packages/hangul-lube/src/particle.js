const CONSONANT = 1
const DIGIT_SOUNDS = "1201001220"
/** @type {Record<string, [ after_consonant: string, after_vowel: string ]>} */
const FORMS = {
	"(으)": [ "으", "" ],
	"(이)": [ "이", "" ],
	"과(와)": [ "과", "와" ],
	"아(야)": [ "아", "야" ],
	"은(는)": [ "은", "는" ],
	"을(를)": [ "을", "를" ],
	"이(가)": [ "이", "가" ]
}
const GYEONG_ZEROS = 16
const HANGUL = 0xac00
const HANGUL_END = 0xd7a3
const JO_ZEROS = 12
const LATIN_END = /[A-Za-z]+$/
const NAMED_CONSONANT = "MN"
const NAMED_RIEUL = "LR"
const NUMBER_END = /(\d\.)?([\d,]*\d)$/
const RIEUL = 2
const RIEUL_FINAL = 8
const SEPARATORS = /,/g
const SPELLED_CONSONANT = /(?:m|n|ng)$/
const TRAILING_MARKS = /[^\p{L}\p{N}]+$/u
const TRAILING_ZEROS = /0+$/
const VOWEL = 0
/**
 * @param {string} digits
 * @returns {number}
 */
function digit_sound(digits) {
	return Number(
		DIGIT_SOUNDS[Number(digits.slice(-1))]
	)
}
/**
 * @param {string} text
 * @returns {number}
 */
function final_sound(text) {
	const word = text.replace(TRAILING_MARKS, "")
	const number = NUMBER_END.exec(word)
	if (number) {
		const digits = /** @type {string} */(number[2])/**/.replace(SEPARATORS, "")
		const zeros = digits.length - digits.replace(TRAILING_ZEROS, "").length
		if (number[1] || zeros == 0 || zeros == digits.length) {
			return digit_sound(digits)
		}
		return zeros >= JO_ZEROS && zeros < GYEONG_ZEROS ? VOWEL : CONSONANT
	}
	const code = word.charCodeAt(word.length - 1)
	if (code >= HANGUL && code <= HANGUL_END) {
		const final = (code - HANGUL) % 28
		return final == 0
			? VOWEL
			: final == RIEUL_FINAL
				? RIEUL
				: CONSONANT
	}
	const latin = LATIN_END.exec(word)
	if (!latin) {
		return VOWEL
	}
	const run = latin[0]
	if (run.length == 1 || run == run.toUpperCase()) {
		const letter = run.slice(-1).toUpperCase()
		return NAMED_RIEUL.includes(letter)
			? RIEUL
			: NAMED_CONSONANT.includes(letter)
				? CONSONANT
				: VOWEL
	}
	const lower = run.toLowerCase()
	return lower.endsWith("l")
		? RIEUL
		: SPELLED_CONSONANT.test(lower)
			? CONSONANT
			: VOWEL
}
/**
 * The Korean particle that follows a word, chosen by how the word is read aloud: by the final
 * consonant of its last Hangul syllable, by the Korean reading of a number (`1` is 일, `3` is 삼,
 * `10` is 십), and by the Korean name of a Latin letter (`HP` is 에이치피, `URL` ends in ㄹ) or,
 * for a word spelled in lower case, by how its spelling ends (`l` is ㄹ, `m`, `n` and `ng` a consonant).
 * Marks at the end of the word are passed over. Anything else reads as ending in a vowel.
 * The notation is one of `"은(는)"`, `"이(가)"`, `"을(를)"`, `"과(와)"`, `"아(야)"`, `"(이)"` and `"(으)"`;
 * the last two give the syllable that goes between the word and the next one, and nothing after a vowel.
 * `"(으)"` gives nothing after ㄹ too, as `(으)로` needs. Any other notation throws a `TypeError`.
 * @param {string} word
 * @param {string} notation
 * @returns {string}
 * @example particle("사과", "이(가)") //=> "가"
 *
 * particle("밤", "은(는)") //=> "은"
 *
 * "서울" + particle("서울", "(으)") + "로" //=> "서울로"
 *
 * "HP" + particle("HP", "을(를)") //=> "HP를"
 */
export default function(word, notation) {
	if (!Object.prototype.hasOwnProperty.call(FORMS, notation)) {
		throw new TypeError(
			`Unknown notation ${JSON.stringify(notation)}, expected one of ${Object.keys(FORMS).join(", ")}`
		)
	}
	const sound = final_sound(word)
	const [ after_consonant, after_vowel ] = /** @type {[ string, string ]} */(FORMS[notation])/**/
	return sound == VOWEL || sound == RIEUL && notation == "(으)"
		? after_vowel
		: after_consonant
}
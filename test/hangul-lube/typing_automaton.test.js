import { eraseLetter, typeLetter } from "hangul-lube"
import { assert, describe, it } from "vitest"
/**
 * @param {string} text
 * @param {number} times
 * @returns {string}
 */
function erased(text, times) {
	let result = text
	for (let count = 0; count < times; count++) {
		result = eraseLetter(result)
	}
	return result
}
/**
 * @param {string} keys
 * @returns {string}
 */
function typed(keys) {
	return Array.from(keys).reduce(typeLetter, "")
}
describe(
	"eraseLetter",
	() => {
		it(
			"drops a single final and the second jamo of a compound final",
			() => {
				assert.equal(eraseLetter("각"), "가")
				assert.equal(eraseLetter("갉"), "갈")
				assert.equal(eraseLetter("값"), "갑")
				assert.equal(eraseLetter("갂"), "가")
			}
		)
		it(
			"drops the last code point of anything else, a surrogate pair whole",
			() => {
				assert.equal(eraseLetter("ab"), "a")
				assert.equal(eraseLetter("a😀"), "a")
				assert.equal(eraseLetter("가 "), "가")
				assert.equal(eraseLetter(""), "")
			}
		)
		it(
			"leaves the initial of a syllable with a simple vowel",
			() => {
				assert.equal(eraseLetter("가"), "ㄱ")
				assert.equal(eraseLetter("까"), "ㄲ")
				assert.equal(eraseLetter("한가"), "한ㄱ")
			}
		)
		it(
			"splits a joined vowel of a syllable without a final",
			() => {
				assert.equal(eraseLetter("과"), "고")
				assert.equal(eraseLetter("귀"), "구")
				assert.equal(eraseLetter("긔"), "그")
				assert.equal(eraseLetter("관"), "과")
			}
		)
		it(
			"takes back one key at a time",
			() => {
				assert.equal(
					erased("한글 달가 과", 3),
					"한글 달가 "
				)
				assert.equal(eraseLetter("닭"), "달")
				assert.equal(erased("닭", 2), "다")
				assert.equal(erased("닭", 3), "ㄷ")
				assert.equal(erased("닭", 4), "")
			}
		)
		it(
			"takes the second part of a lone joined vowel or compound consonant",
			() => {
				assert.equal(eraseLetter("ㅘ"), "ㅗ")
				assert.equal(eraseLetter("ㄳ"), "ㄱ")
				assert.equal(eraseLetter("ㅗ"), "")
				assert.equal(eraseLetter("ㄱ"), "")
			}
		)
	}
)
describe(
	"typeLetter",
	() => {
		it(
			"appends anything else and composes into the last character only",
			() => {
				assert.equal(typeLetter("", "ㅏ"), "ㅏ")
				assert.equal(typeLetter("", "ㄱ"), "ㄱ")
				assert.equal(typeLetter("가", "a"), "가a")
				assert.equal(typeLetter("a", "ㅏ"), "aㅏ")
				assert.equal(typeLetter("ㄱ ", "ㅏ"), "ㄱ ㅏ")
				assert.equal(typeLetter("가", "ㄳ"), "가ㄳ")
				assert.equal(
					typeLetter("가", "ㅏㅏ"),
					"가ㅏㅏ"
				)
				assert.equal(typeLetter("😀", "ㅏ"), "😀ㅏ")
			}
		)
		it(
			"composes a word typed key by key as a two-set keyboard does",
			() => {
				assert.equal(
					typed(
						"ㅎㅏㄴㄱㅡㄹ ㄷㅏㄹㄱㅏ ㄱㅗㅏ"
					),
					"한글 달가 과"
				)
				assert.equal(typed("ㄷㅏㄹㄱ"), "닭")
			}
		)
		it(
			"joins a second consonant to a final",
			() => {
				assert.equal(typeLetter("갈", "ㄱ"), "갉")
				assert.equal(typeLetter("갈", "ㅎ"), "갏")
				assert.equal(typeLetter("각", "ㅅ"), "갃")
				assert.equal(typeLetter("간", "ㅈ"), "갅")
				assert.equal(typeLetter("간", "ㅎ"), "갆")
				assert.equal(typeLetter("갈", "ㅁ"), "갊")
				assert.equal(typeLetter("갈", "ㅂ"), "갋")
				assert.equal(typeLetter("갈", "ㅅ"), "갌")
				assert.equal(typeLetter("갈", "ㅌ"), "갍")
				assert.equal(typeLetter("갈", "ㅍ"), "갎")
				assert.equal(typeLetter("갑", "ㅅ"), "값")
				assert.equal(typeLetter("간", "ㄱ"), "간ㄱ")
			}
		)
		it(
			"joins two lone consonants and splits them again at a vowel",
			() => {
				assert.equal(typeLetter("ㄱ", "ㅅ"), "ㄳ")
				assert.equal(typeLetter("ㄹ", "ㅎ"), "ㅀ")
				assert.equal(typeLetter("ㅂ", "ㅅ"), "ㅄ")
				assert.equal(typeLetter("ㄳ", "ㅣ"), "ㄱ시")
				assert.equal(typeLetter("ㅀ", "ㅏ"), "ㄹ하")
				assert.equal(typeLetter("ㄱ", "ㅂ"), "ㄱㅂ")
			}
		)
		it(
			"joins two lone vowels into one",
			() => {
				assert.equal(typeLetter("ㅗ", "ㅏ"), "ㅘ")
				assert.equal(typeLetter("ㅡ", "ㅣ"), "ㅢ")
				assert.equal(typeLetter("ㅏ", "ㅏ"), "ㅏㅏ")
			}
		)
		it(
			"joins two vowels into one",
			() => {
				assert.equal(typeLetter("고", "ㅏ"), "과")
				assert.equal(typeLetter("고", "ㅐ"), "괘")
				assert.equal(typeLetter("고", "ㅣ"), "괴")
				assert.equal(typeLetter("구", "ㅓ"), "궈")
				assert.equal(typeLetter("구", "ㅔ"), "궤")
				assert.equal(typeLetter("구", "ㅣ"), "귀")
				assert.equal(typeLetter("그", "ㅣ"), "긔")
				assert.equal(typeLetter("가", "ㅏ"), "가ㅏ")
			}
		)
		it(
			"moves the final onto a new syllable when a vowel follows",
			() => {
				assert.equal(typeLetter("각", "ㅏ"), "가가")
				assert.equal(typeLetter("값", "ㅏ"), "갑사")
				assert.equal(typeLetter("갉", "ㅏ"), "갈가")
				assert.equal(typeLetter("갂", "ㅏ"), "가까")
				assert.equal(typeLetter("과", "ㅏ"), "과ㅏ")
			}
		)
		it(
			"never makes a double consonant from the same key twice",
			() => {
				assert.equal(typeLetter("ㄱ", "ㄱ"), "ㄱㄱ")
				assert.equal(typeLetter("각", "ㄱ"), "각ㄱ")
				assert.equal(typeLetter("ㅅ", "ㅅ"), "ㅅㅅ")
			}
		)
		it(
			"puts a consonant before a vowel into a syllable",
			() => {
				assert.equal(typeLetter("ㄱ", "ㅏ"), "가")
				assert.equal(typeLetter("ㄲ", "ㅏ"), "까")
				assert.equal(typeLetter("한ㄱ", "ㅡ"), "한그")
			}
		)
		it(
			"takes a consonant after a syllable as its final",
			() => {
				assert.equal(typeLetter("가", "ㄱ"), "각")
				assert.equal(typeLetter("가", "ㄲ"), "갂")
				assert.equal(typeLetter("가", "ㄸ"), "가ㄸ")
				assert.equal(typeLetter("가", "ㅃ"), "가ㅃ")
				assert.equal(typeLetter("가", "ㅉ"), "가ㅉ")
			}
		)
	}
)
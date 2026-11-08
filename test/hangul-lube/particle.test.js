import { particle } from "hangul-lube"
import { assert, describe, it } from "vitest"
/**
 * @param {string} word
 * @returns {string}
 */
function ending(word) {
	return particle(word, "이(가)") == "이"
		? particle(word, "(으)") == "으"
			? "consonant"
			: "ㄹ"
		: "vowel"
}
describe(
	"particle",
	() => {
		it(
			"Latin capitals and a lone letter read by the letters' Korean names: L and R end in ㄹ, M and N in a consonant",
			() => {
				assert.deepEqual(
					[ "HP", "URL", "R", "NPC", "m", "TEAM" ].map(ending),
					[
						"vowel",
						"ㄹ",
						"ㄹ",
						"vowel",
						"consonant",
						"consonant"
					]
				)
			}
		)
		it(
			"a Hangul syllable reads by its final consonant, none a vowel, ㄹ its own",
			() => {
				assert.deepEqual(
					[ "나무", "바람", "하늘", "빛" ].map(ending),
					[
						"vowel",
						"consonant",
						"ㄹ",
						"consonant"
					]
				)
			}
		)
		it(
			"a Latin word reads by how its spelling ends: l is ㄹ, m, n and ng a consonant, anything else a vowel",
			() => {
				assert.deepEqual(
					[
						"Bell",
						"Tom",
						"Ann",
						"King",
						"Peter",
						"Alex"
					].map(ending),
					[
						"ㄹ",
						"consonant",
						"consonant",
						"consonant",
						"vowel",
						"vowel"
					]
				)
			}
		)
		it(
			"a digit reads by its Korean name: 영 삼 육 end in a consonant, 일 칠 팔 in ㄹ, 이 사 오 구 in a vowel",
			() => {
				assert.deepEqual(
					[ "0", "1", "2", "3", "4", "5", "6", "7", "8", "9" ].map(ending),
					[
						"consonant",
						"ㄹ",
						"vowel",
						"consonant",
						"vowel",
						"vowel",
						"consonant",
						"ㄹ",
						"ㄹ",
						"vowel"
					]
				)
			}
		)
		it(
			"a fraction reads digit by digit after its point",
			() => {
				assert.deepEqual(
					[ "1.5", "2.10", "0.7" ].map(ending),
					[ "vowel", "consonant", "ㄹ" ]
				)
			}
		)
		it(
			"a whole number ending in zeros reads by its last unit: 십 백 천 만 억 경 end in a consonant, 조 in a vowel",
			() => {
				assert.deepEqual(
					[
						"10",
						"300",
						"2000",
						"50000",
						"1000000",
						"100000000",
						"1000000000000",
						"1000000000000000",
						"10000000000000000",
						"1,000",
						"00"
					].map(ending),
					[
						"consonant",
						"consonant",
						"consonant",
						"consonant",
						"consonant",
						"consonant",
						"vowel",
						"vowel",
						"consonant",
						"consonant",
						"consonant"
					]
				)
			}
		)
		it(
			"an unknown notation throws a TypeError naming the accepted ones",
			() => {
				assert.throws(
					() => particle("밤", "로"),
					TypeError,
					"은(는)"
				)
			}
		)
		it(
			"each form: 이/가, 을/를, 은/는, 과/와, 아/야, (이) and (으) before what follows",
			() => {
				assert.deepEqual(
					[
						"이(가)",
						"을(를)",
						"은(는)",
						"과(와)",
						"아(야)",
						"(이)",
						"(으)"
					].map(
						notation => [
							particle("밤", notation),
							particle("새", notation)
						]
					),
					[
						[ "이", "가" ],
						[ "을", "를" ],
						[ "은", "는" ],
						[ "과", "와" ],
						[ "아", "야" ],
						[ "이", "" ],
						[ "으", "" ]
					]
				)
			}
		)
		it(
			"marks at the end are passed over, and what is neither Hangul, a digit nor a Latin letter reads as a vowel",
			() => {
				assert.deepEqual(
					[
						"'바람'",
						"「하늘」",
						"Lv.10!",
						"さくら",
						"!!",
						""
					].map(ending),
					[
						"consonant",
						"ㄹ",
						"consonant",
						"vowel",
						"vowel",
						"vowel"
					]
				)
			}
		)
	}
)
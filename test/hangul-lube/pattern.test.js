import { pattern } from "hangul-lube"
import { assert, describe, it } from "vitest"
describe(
	"pattern",
	() => {
		it(
			"compound final consonants",
			() => {
				const regex = pattern("갑안일")
				assert.equal(
					regex,
					"갑안(?:[일-잃]|이[라-맇])"
				)
				assert.isTrue(
					new RegExp(pattern("각")).test("갃")
				)
				assert.isFalse(
					new RegExp(pattern("각")).test("갂")
				)
				assert.isFalse(
					new RegExp(pattern("갓")).test("갔")
				)
				assert.isFalse(
					new RegExp(pattern("갇")).test("갈")
				)
			}
		)
		it(
			"compound letters split",
			() => {
				assert.equal(
					pattern("ㄳ"),
					"(?:ㄳ|[ㄱ가-깋][ㅅ사-싷])"
				)
				for (const text of [ "ㄳ", "감사", "ㄱ시" ]) {
					assert.isTrue(
						new RegExp(pattern("ㄳ")).test(text),
						text
					)
				}
				assert.isTrue(
					new RegExp(pattern("ㅀ")).test("ㄹ허")
				)
				assert.isFalse(
					new RegExp(pattern("ㄳ")).test("가")
				)
			}
		)
		it(
			"compound medial vowels",
			() => {
				const regex = new RegExp("^" + pattern("고") + "$")
				for (const syllable of [
					"고",
					"곤",
					"곰",
					"과",
					"괒",
					"괘",
					"괴",
					"괳"
				]) {
					assert.isTrue(regex.test(syllable), syllable)
				}
				for (const syllable of [ "교", "구", "그", "가", "꼬" ]) {
					assert.isFalse(regex.test(syllable), syllable)
				}
				assert.isTrue(
					new RegExp(pattern("구")).test("귀")
				)
				assert.isTrue(
					new RegExp(pattern("그")).test("긔")
				)
				assert.isFalse(
					new RegExp(pattern("기")).test("긔")
				)
			}
		)
		it(
			"consonant letters match themselves",
			() => {
				assert.isTrue(
					new RegExp(pattern("ㅋㅋ")).test("ㅋㅋㅋ")
				)
				assert.isTrue(
					new RegExp(pattern("ㄱ")).test("ㄱ")
				)
				assert.isFalse(
					new RegExp(pattern("각")).test("가ㄱ")
				)
			}
		)
		it(
			"decomposed text",
			() => {
				assert.equal(
					pattern("동해".normalize("NFD")),
					pattern("동해")
				)
				assert.equal(
					pattern("ᄃᄒᄆᄀ"),
					pattern("ㄷㅎㅁㄱ")
				)
				assert.equal(
					pattern("ᅡᅵᆨᆪᇂᄁ"),
					pattern("ㅏㅣㄱㄳㅎㄲ")
				)
				assert.equal(
					pattern("동ᄒ"),
					pattern("동ㅎ")
				)
			}
		)
		it(
			"double consonant letters",
			() => {
				const regex = pattern("ㄲㄸㅃㅆㅉ")
				assert.equal(
					regex,
					"[ㄲ까-낗][ㄸ따-띻][ㅃ빠-삫][ㅆ싸-앃][ㅉ짜-찧]"
				)
				assert.isTrue(
					new RegExp(regex).test("꿈땅뿔쌀짱")
				)
				assert.isFalse(
					new RegExp(pattern("ㄱ")).test("까")
				)
			}
		)
		it(
			"earlier syllables match as they are",
			() => {
				assert.equal(pattern("바지"), "바[지-짛]")
				assert.equal(
					pattern("ㅂ지"),
					"[ㅂㅄ바-빟][지-짛]"
				)
				/** @type {[string, string[], string[]][]} */
				const cases = [
					[
						"바지",
						[ "바지", "바징" ],
						[ "반징", "반지", "금 반지" ]
					],
					[
						"ㅂ지",
						[ "바지", "바징", "반징", "반지" ],
						[ "바자", "ㅈ지" ]
					],
					[
						"ㅂㅈ",
						[ "바지", "바징", "반징", "반지", "ㅂㅈ" ],
						[]
					],
					[
						"고기",
						[ "고기", "고깃국" ],
						[ "공기청정기", "과기" ]
					],
					[
						"시계",
						[ "시계", "시곗바늘" ],
						[ "신계약" ]
					],
					[ "갑사", [ "갑사" ], [ "값사" ] ],
					[
						"과자",
						[ "과자" ],
						[ "괘자", "곽자" ]
					]
				]
				for (const [ query, found, missed ] of cases) {
					for (const text of found) {
						assert.isTrue(
							new RegExp(pattern(query)).test(text),
							query + " " + text
						)
					}
					for (const text of missed) {
						assert.isFalse(
							new RegExp(pattern(query)).test(text),
							query + " " + text
						)
					}
				}
			}
		)
		it(
			"empty text",
			() => {
				assert.equal(pattern(""), "")
				assert.isTrue(
					RegExp(pattern("")).test("아무 text")
				)
			}
		)
		it(
			"escapes special characters",
			() => {
				const special = "a.b*c+d?e^f$g(h)i[j]k{l}m|n\\o/p-q"
				const regex = new RegExp("^" + pattern(special) + "$")
				assert.isTrue(regex.test(special))
				assert.isFalse(
					regex.test(special.replace(".", "x"))
				)
				assert.doesNotThrow(
					() => new RegExp(pattern("(["), "u")
				)
			}
		)
		it(
			"final consonant of the last syllable moves on",
			() => {
				assert.equal(
					pattern("각"),
					"(?:[각갃]|가[가-깋])"
				)
				/** @type {[string, string][]} */
				const found = [
					[ "각", "가게" ],
					[ "각", "갃" ],
					[ "값", "갑사" ],
					[ "값", "값" ],
					[ "닭", "달기" ],
					[ "앉", "안자" ],
					[ "갔", "가싸" ],
					[ "강", "가아" ],
					[ "고각", "고가게" ]
				]
				for (const [ query, text ] of found) {
					assert.isTrue(
						new RegExp(pattern(query)).test(text),
						query + " " + text
					)
				}
				/** @type {[string, string][]} */
				const missed = [
					[ "각", "가" ],
					[ "각", "가까" ],
					[ "값", "갑" ],
					[ "값", "가사" ],
					[ "닭", "달" ],
					[ "닭", "다기" ],
					[ "갔", "가사" ],
					[ "각하", "가게하" ],
					[ "각 ", "가게 " ]
				]
				for (const [ query, text ] of missed) {
					assert.isFalse(
						new RegExp(pattern(query)).test(text),
						query + " " + text
					)
				}
			}
		)
		it(
			"first complex letters search",
			() => {
				const regex = pattern("ㅎㅇ~ 테스트 123456789!")
				assert.equal(
					regex,
					"[ㅎ하-힣][ㅇ아-잏]~ 테스트 123456789!"
				)
				assert.isTrue(
					new RegExp(regex).test("하이~ 테스트 123456789!")
				)
				assert.isTrue(
					new RegExp(pattern("닭")).test("닭")
				)
				assert.isFalse(
					new RegExp(pattern("닭")).test("달")
				)
			}
		)
		it(
			"first consonant letters search",
			() => {
				const regex = pattern(
					"ㄷㅎㅁㄱ ㅂㄷㅅㅇ ㅁㄹㄱ ㄷㄷㄹ"
				)
				assert.equal(
					regex,
					"[ㄷ다-딯][ㅎ하-힣][ㅁ마-밓][ㄱㄳ가-깋] [ㅂㅄ바-빟][ㄷ다-딯][ㅅ사-싷][ㅇ아-잏] [ㅁ마-밓][ㄹㄺ-ㅀ라-맇][ㄱㄳ가-깋] [ㄷ다-딯][ㄷ다-딯][ㄹㄺ-ㅀ라-맇]"
				)
				assert.isTrue(
					new RegExp(regex).test(
						"동해물과 백두산이 마르고 닳도록"
					)
				)
			}
		)
		it(
			"lone letters grow into compound letters",
			() => {
				assert.equal(pattern("ㄱ"), "[ㄱㄳ가-깋]")
				assert.equal(pattern("ㅗ"), "[ㅗㅘ-ㅚ]")
				/** @type {[string, string][]} */
				const found = [
					[ "ㄱ", "ㄳ" ],
					[ "ㄴ", "ㄶ" ],
					[ "ㄹ", "ㅀ" ],
					[ "ㅂ", "ㅄ" ],
					[ "ㅗ", "ㅙ" ],
					[ "ㅜ", "ㅞ" ],
					[ "ㅡ", "ㅢ" ]
				]
				for (const [ query, text ] of found) {
					assert.isTrue(
						new RegExp(pattern(query)).test(text),
						query + " " + text
					)
				}
				assert.isFalse(
					new RegExp(pattern("ㄱ")).test("ㄲ")
				)
				assert.isFalse(
					new RegExp(pattern("ㅣ")).test("ㅢ")
				)
			}
		)
	}
)
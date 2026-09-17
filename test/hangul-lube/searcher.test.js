import { pattern, searcher } from "hangul-lube"
import { assert, describe, it } from "vitest"
describe(
	"searcher",
	() => {
		it(
			"a query too long to compile finds nothing instead of throwing",
			() => {
				const long = searcher("가".repeat(6000))
				assert.isNotNull(long)
				assert.isFalse(
					/** @type {RegExp} */(long)/**/.test("가")
				)
				assert.isFalse(
					/** @type {RegExp} */(long)/**/.test("")
				)
				const pasted = searcher(
					"대한민국 인천국제공항 ".repeat(400)
				)
				assert.isFalse(
					/** @type {RegExp} */(pasted)/**/.test("인천")
				)
				assert.isTrue(
					/** @type {RegExp} */(searcher("인천"))/**/.test("인천")
				)
			}
		)
		it(
			"compound letters split",
			() => {
				assert.equal(
					searcher("ㄳ")?.exec("정말 감사")?.[0],
					"감사"
				)
				assert.equal(
					searcher("ㄱㄳ")?.exec("ㄱ ㄳ")?.[0],
					"ㄱ ㄳ"
				)
				assert.isTrue(searcher("ㅄ")?.test("ㅂ-시"))
				assert.isFalse(searcher("ㄳ")?.test("감"))
			}
		)
		it(
			"compound letters while typing",
			() => {
				assert.isFalse(searcher("고ㅈ")?.test("과자"))
				assert.isTrue(searcher("고ㅈ")?.test("고자"))
				assert.isTrue(searcher("과ㅈ")?.test("과자"))
				assert.isFalse(searcher("교ㅈ")?.test("과자"))
				assert.isTrue(
					searcher("갑")?.test("값싸진 물건")
				)
				assert.isFalse(searcher("갓")?.test("갔다"))
				assert.isTrue(searcher("각")?.test("가-게"))
				assert.isTrue(searcher("값")?.test("갑 사"))
				assert.isFalse(
					searcher("각ㅎ")?.test("가게하")
				)
			}
		)
		it(
			"consonant letters match themselves",
			() => {
				assert.equal(
					searcher("ㅋ")?.exec("하하 ㅋㅋㅋ")?.[0],
					"ㅋ"
				)
				assert.equal(
					searcher("ㄱㅅ")?.exec("ㄱ ㅅ")?.[0],
					"ㄱ ㅅ"
				)
				assert.isTrue(searcher("ㅋㅋ")?.test("크ㅋ"))
			}
		)
		it(
			"decomposed text",
			() => {
				assert.equal(
					searcher("동해".normalize("NFD"))?.exec("동해물과")?.[0],
					"동해"
				)
				assert.isTrue(
					searcher("ᄃᄒᄆᄀ")?.test("동해물과")
				)
				assert.isTrue(
					searcher("닭갈비")?.test(
						"닭갈비".normalize("NFD").normalize("NFC")
					)
				)
			}
		)
		it(
			"earlier syllables match as they are",
			() => {
				assert.isFalse(
					searcher("바지")?.test("금 반지")
				)
				assert.isTrue(
					searcher("바지")?.test("바 징")
				)
				assert.isTrue(
					searcher("ㅂ지")?.test("금 반지")
				)
				assert.isTrue(
					searcher("ㅂㅈ")?.test("금 반징")
				)
				assert.isFalse(
					searcher("고기")?.test("공기청정기")
				)
				assert.isFalse(
					searcher("시계")?.test("신계약")
				)
				assert.isTrue(
					searcher("시 계")?.test("시계")
				)
			}
		)
		it(
			"empty text",
			() => {
				assert.isNull(searcher(""))
			}
		)
		it(
			"escapes special characters",
			() => {
				assert.isTrue(
					searcher("1$")?.test("가격 1$")
				)
				assert.isFalse(searcher("a.c")?.test("abc"))
				assert.doesNotThrow(() => searcher("(["))
			}
		)
		it(
			"first complex letters search",
			() => {
				const regex = searcher("ㅎㅇ 테스트123")
				assert.isTrue(
					regex?.test("하이~ 테스트 123456789!")
				)
				assert.isFalse(
					regex?.test("하이~ 테스터 123456789!")
				)
			}
		)
		it(
			"first consonant letters search",
			() => {
				const regex = searcher(
					"ㄷㅎㅁㄱㅂㄷㅅㅇㅁㄹㄱㄷㄷㄹ~"
				)
				assert.isTrue(
					regex?.test(
						"동해물과 ?백두산이 !마르고 @닳도록~"
					)
				)
				assert.isFalse(
					regex?.test("동해물과 백두산이")
				)
			}
		)
		it(
			"gives the span to highlight",
			() => {
				const match = searcher("ㅎㅅ")?.exec("홈 스윗 홈")
				assert.equal(match?.index, 0)
				assert.equal(match?.[0], "홈 스")
				const later = searcher("ㅎ")?.exec("hello 홈")
				assert.equal(later?.index, 6)
				assert.equal(later?.[0], "홈")
				assert.isNull(
					searcher("ㅎㅅㅇㅎ")?.exec("home sweet home")
				)
			}
		)
		it(
			"ignores case and separators",
			() => {
				assert.isTrue(searcher("abc")?.test("A-b_C"))
				assert.isTrue(searcher("😀a")?.test("😀 a"))
			}
		)
		it(
			"ignores invisible characters in the query",
			() => {
				for (const invisible of [
					"\u200b",
					"\u200c",
					"\u200d",
					"\ufeff",
					"\u00ad",
					"\u2060",
					"\ufe0f"
				]) {
					assert.equal(
						searcher(`김${invisible}민`)?.exec("팀장 김민수")?.[0],
						"김민",
						JSON.stringify(invisible)
					)
					assert.isTrue(
						searcher(`민수${invisible}`)?.test("김민수"),
						JSON.stringify(invisible)
					)
					assert.isNull(searcher(`${invisible} `))
				}
				assert.equal(
					searcher("김\u200b민")?.source,
					searcher("김민")?.source
				)
				assert.isTrue(
					searcher("김민")?.test("김\u200b민")
				)
				assert.isTrue(
					searcher("각")?.test("가\u200b게")
				)
				assert.isTrue(
					searcher("👨\u200d👩")?.test("👨\u200d👩\u200d👧")
				)
			}
		)
		it(
			"ignores whitespace in the text",
			() => {
				assert.isTrue(
					searcher("ㄷㅎ ㅁㄱ")?.test("동해물과")
				)
				assert.isTrue(
					searcher("동해 물과")?.test("동해물과")
				)
				assert.isTrue(searcher("ab")?.test("a b"))
				assert.isNull(searcher(" \t\n"))
			}
		)
		it(
			"matches the spans of a plain separator between letters",
			() => {
				const alphabet = [
					"ㅠ",
					"!",
					"-",
					"😀",
					"😁",
					"a",
					"A",
					"가",
					"각",
					"ㅗ",
					"ㅘ",
					"$",
					"]",
					"[",
					"\\",
					"^",
					"(",
					"|",
					"/",
					"é",
					"É",
					"\uD83D"
				]
				let seed = 7
				/**
				 * @param {number} length
				 * @returns {string}
				 */
				function make(length) {
					return Array.from(
						{ length },
						() => /** @type {string} */(alphabet[Math.floor(random() * alphabet.length)])/**/
					).join("")
				}
				/** @returns {number} */
				function random() {
					seed = seed + 0x6d2b79f5 | 0
					let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
					value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
					return ((value ^ value >>> 14) >>> 0) / 4294967296
				}
				for (let index = 0; index < 3000; index++) {
					const query = make(1 + Math.floor(random() * 4))
					const text = make(Math.floor(random() * 10))
					const expected = new RegExp(
						[ ...query ].map(
							(letter, position, letters) => position == letters.length - 1
								? pattern(letter)
								: pattern(letter + " ").slice(0, -1)
						)
							.join("[^가-힣0-9A-Za-z]*?")
							.replace(
								/\|(.)\[(.)-(.)\]\)$/,
								"|$1[^가-힣0-9A-Za-z]*?[$2-$3])"
							),
						"i"
					).exec(text)
					const actual = searcher(query)?.exec(text)
					assert.deepEqual(
						[ actual?.index, actual?.[0] ],
						[ expected?.index, expected?.[0] ],
						`${query} ${text}`
					)
				}
			}
		)
		it(
			"repeated letters between separators do not backtrack",
			() => {
				const start = performance.now()
				assert.isFalse(
					searcher("ㅠ".repeat(12) + "a")?.test("ㅠ".repeat(60))
				)
				assert.isFalse(
					searcher("!".repeat(12) + "가")?.test("!".repeat(60))
				)
				assert.isFalse(
					searcher("ㅋ".repeat(12) + "a")?.test("ㅋ".repeat(60))
				)
				assert.isFalse(
					searcher("ㄱ".repeat(12) + "a")?.test("ㄳ".repeat(60))
				)
				assert.isFalse(
					searcher("ㄳ".repeat(12) + "a")?.test("ㄱㅅㄳ".repeat(30))
				)
				assert.isFalse(
					searcher("ㅗ".repeat(12) + "a")?.test("ㅘ".repeat(60))
				)
				assert.isFalse(
					searcher("😀".repeat(12) + "a")?.test("😀".repeat(60))
				)
				assert.isBelow(performance.now() - start, 1000)
			}
		)
		it(
			"source compiles with the u and v flags",
			() => {
				const query = "a$(-)[]{}/|\\^!&😀ㅠ"
				for (const flags of [ "iu", "iv" ]) {
					const regex = new RegExp(
						/** @type {RegExp} */(searcher(query))/**/.source,
						flags
					)
					assert.isTrue(regex.test(query), flags)
				}
			}
		)
		it(
			"source keeps its meaning without the i flag",
			() => {
				const source = /** @type {RegExp} */(searcher("ㅎㅅ"))/**/.source
				assert.isFalse(
					new RegExp(source).test("홈a스")
				)
				assert.isTrue(
					new RegExp(source).test("홈-스")
				)
				assert.isTrue(
					new RegExp(source, "i").test("홈스")
				)
			}
		)
	}
)
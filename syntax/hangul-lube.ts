import { pattern, searcher } from "hangul-lube"
const text = "ㄷㅎㅁㄱ"
const source: string = pattern(text)
const regex: RegExp | null = searcher(text)
new RegExp(source, "i").test("동해물과")
regex?.test("동해물과")
// @ts-expect-error: text is required
pattern()
// @ts-expect-error: text is a string
searcher(1)
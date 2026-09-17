# Hangul Lube
Korean search that works while people type. `ㄱㅊㅉㄱ` finds `김치찌개`, and `공` already finds `고양이`, because `공` is what the screen shows halfway through typing it. The result is a regular expression, so the same query works in a search box, for highlighting and in a database.

Where `includes` misses a half-typed syllable and an initial consonant (초성) search compares against a second string of initials, one regular expression matches initials, half-typed syllables and whole words in the text as it is.

## Installation
```bash
npm i hangul-lube
```

## Usage
### Search box
```ts
import { searcher } from "hangul-lube"

searcher("ㄸㅂㅇ")?.test("국물 떡볶이") //=> true
searcher("김치 찌개")?.test("김치찌개") //=> true
searcher("iphone")?.test("iPhone 16") //=> true
searcher(" ") //=> null

const match = searcher("ㄸㅂ")?.exec("매운 떡볶이")
match?.index //=> 3
match?.[0] //=> "떡볶", the span to highlight
```
- White space and invisible characters in the query, such as a zero-width space, a joiner, a soft hyphen or a byte order mark pasted with it, are dropped, case is ignored, and anything but Korean syllables, digits and Latin letters may stand between the letters of the text.
- An empty query, or one of white space only, gives `null`. A query of more than 1000 letters, such as a page pasted into the box, gives an expression that finds nothing, since the one it would need is longer than an engine compiles.
- Korean letters never match Latin text. To find `iPhone` with `ㅇㅇㅍ`, store a Korean alias such as `아이폰` next to it and test both; a match in the alias has no span to highlight in the original.

The span of a match is all a highlight needs, as in this list that filters while the query is typed:
```ts
import { searcher } from "hangul-lube"

const menu = [ "김치찌개", "된장찌개", "돼지국밥", "떡볶이" ]
const input = document.querySelector("input")!
input.addEventListener("input", () => {
    const search = searcher(input.value)
    document.querySelector("ul")!.replaceChildren(...menu.flatMap(text => {
        const match = search?.exec(text)
        if (!match) return []
        const mark = document.createElement("mark")
        mark.textContent = match[0]
        const item = document.createElement("li")
        item.append(text.slice(0, match.index), mark, text.slice(match.index + match[0].length))
        return [ item ]
    }))
})
// typing ㄷㅈ lists <li><mark>된장</mark>찌개</li><li><mark>돼지</mark>국밥</li>
```

### Pattern
```ts
import { pattern } from "hangul-lube"

pattern("ㄱㅊㅉㄱ") //=> "[ㄱㄳ가-깋][ㅊ차-칳][ㅉ짜-찧][ㄱㄳ가-깋]"
pattern("된자") //=> "된[자-잫]"
pattern("오리") //=> "오[리-맇]"
pattern("공") //=> "(?:공|고[아-잏])"
pattern("몫") //=> "(?:몫|목[사-싷])"
pattern("ㄳ") //=> "(?:ㄳ|[ㄱ가-깋][ㅅ사-싷])"
pattern("1+1") //=> "1\\+1"
```
- `pattern` translates each letter of the query as it is, with the same [typing rules](#typing-rules) as `searcher`, which is the forgiving one.
- Regular expression special characters are escaped, so `1+1` finds the `1+1` of a sale, and the rest of the text, white space included, is kept as it is.
- An empty text gives `""`, which matches every text, so skip the search for an empty query.

`searcher(query)?.source` is the source a database can run case-insensitively: `~*` in PostgreSQL, `REGEXP_LIKE(column, searcher_source, 'i')` in MySQL or `$regex` with `$options: "i"` in MongoDB. Use it, not `pattern(query)`, wherever the search box is what the row must match: `pattern` keeps the white space and the invisible characters of the query and lets nothing stand between its letters, so `"도쿄하네다"` misses `"도쿄 하네다"` and a pasted byte order mark makes it match nothing. Such a query reads every row, since a regular expression cannot use an index.

### Typing rules
- A consonant matches itself and every syllable it starts, and the last syllable matches the syllables it grows into while typing: `된자` matches `된장찌개` and `도` matches `돼지국밥`. A lone letter grows the same way: `ㄱ` matches `ㄳ` and `ㅗ` matches `ㅘ`.
- Every earlier syllable is finished and matches only itself: `오리` matches `오리털` but not `올리브`, while `ㅇ리` and `ㅇㄹ` match both.
- The final consonant of the last syllable may still move to the next syllable, as it does when a vowel is typed after it: `공` matches `고양이`, and `몫` matches `목소리`, whose `ㅅ` joins the `ㄱ` until the vowel comes.
- A double final consonant typed alone, such as `ㄳ` from `ㄱ` and `ㅅ` typed in a row, also matches the two consonants it is made of: `ㄳ`, chat shorthand for thanks, matches `감사`.
- What needs the shift key never grows: `ㄷㅂㅇ` does not match `떡볶이`, which `ㄸㅂㅇ` finds.

## Details
- A decomposed (NFD) query, as pasted from macOS, is composed first, and a leftover conjoining letter such as `ᄃ` (U+1103) is read as the letter `ㄷ`.
- The text is matched as it is, so decomposed text, such as a macOS file name, finds nothing. Compose it with `text.normalize("NFC")` before matching; the span of a match is then an index into the composed text.

## What it is not
- **Not a transliterator.** Text in another script is found through a Korean alias stored next to it, not by converting one script to the other.
- **Not a highlighting API.** The span to mark is the `index` and length of the `exec` result, as the usage above shows.
- **Not a database adapter.** `pattern` and `searcher(...).source` are the query's regular expression as it is, with `a-z` spelled out so the source does not depend on the `i` flag.

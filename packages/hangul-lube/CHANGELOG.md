# Changelog

## 2.0.0

### Breaking

- **The last syllable matches every syllable it grows into while typing.** `pattern("된자")` is
  `된[자-잫]`, so it finds `된장찌개`, and `도` finds `돼지국밥`. A lone letter grows the same way:
  `ㄱ` finds `ㄳ`, `ㄹ` finds `ㅀ` and `ㅗ` finds `ㅘ`. Only what a keyboard reaches without the
  shift key grows, so `ㄷㅂㅇ` does not find `떡볶이`, which `ㄸㅂㅇ` finds.
- **Every earlier syllable is finished and matches only itself.** `pattern("오리")` is `오[리-맇]`,
  so `오리` finds `오리털` but not `올리브`. A lone consonant still matches the syllables it starts
  wherever it stands, so `ㅇ리` and `ㅇㄹ` find `올리브`.
- **The final consonant of the last syllable may move to the next syllable,** as it does when a
  vowel is typed after it: `pattern("공")` is `(?:공|고[아-잏])`, so `공` finds `고양이`, and `몫`
  finds `목소리`; the earlier syllables of the query match as they are.
- **A consonant matches itself as well as the syllables it starts.** `pattern("ㅋ")` is
  `[ㅋ카-킿]`, so `searcher("ㅋ")` finds `ㅋㅋㅋ`. The consonant that moves to the next syllable
  matches syllables only, so `공` does not find `고ㅇ`.
- **`searcher` ignores white space in the text.** `searcher("김치 찌개")` matches `김치찌개`.
  Invisible characters pasted with a query, such as a zero-width space (U+200B), a joiner, a soft
  hyphen or a byte order mark, are ignored too: `searcher("김치\u200b찌개")` matches `김치찌개`.
  `pattern` keeps white space as it is.
- **Regular expression special characters are escaped.** `pattern("1+1")` returns `1\+1`, where
  `+` used to be regular expression syntax. Callers that escaped the input themselves now escape it twice.
- **The package is an ES module only.** `import` loads `src/index.js`, and there is no CommonJS
  build: `require("hangul-lube")` works on Node.js 20.19+ and 22.12+, which load ES modules with `require`.
  Jest loads it once its ESM mode is on or the package is transformed.

### Fixed

- `searcher` gave a regular expression that threw a `SyntaxError` when it was used, for a query of
  about five thousand letters or more, such as a page pasted into the search box: the expression it needs
  is longer than an engine compiles. A query of more than 1000 letters now gives an expression that finds
  nothing.
- `searcher` threw on input containing `(` or `[`, and `.` or `$` acted as regular expression
  syntax.
- `pattern("")` threw a `TypeError`. It returns `""` now, which matches every text, while
  `searcher("")` returns `null`.
- A decomposed (NFD) query, as pasted from macOS, matched nothing. `pattern` and `searcher` compose
  the query to NFC first and read a leftover conjoining letter, such as `ᄃ` (U+1103), as the
  letter `ㄷ`. The text is matched as it is, so compose decomposed text with `normalize("NFC")`.
- `searcher` hung on a query that repeats a letter which may also stand between two letters, such as
  `ㅠ`, `!` or an emoji: `searcher("ㅠㅠㅠㅠㅠㅠㅠㅠㅠㅠa")` took seconds on a text of 40 `ㅠ`, and each
  letter more multiplied the time. The class before such a letter now leaves the letter out, so the
  expression never backtracks over it and finds the same matches and spans as before.

### Changed

- `searcher` spells out lowercase letters in the class between two letters, `[^가-힣0-9A-Za-z]`, so
  its `source` means the same without the `i` flag, for example in a database query.

### Added

- `package.json` declares `engines.node` as `>=14`, the oldest Node.js release line it runs on.
- Double consonants match the syllables they start: `pattern("ㄸㅂㅇ")` is
  `[ㄸ따-띻][ㅂㅄ바-빟][ㅇ아-잏]`, so it finds `떡볶이`, and likewise for `ㄲ`, `ㅃ`, `ㅆ` and `ㅉ`.
- A double final consonant typed alone, such as `ㄳ` for `ㄱ` and `ㅅ` typed in a row, also matches
  the two consonants it is made of: `pattern("ㄳ")` is `(?:ㄳ|[ㄱ가-깋][ㅅ사-싷])`, so it finds `감사`,
  and `ㄱ시`, which it becomes when a vowel is typed after it.

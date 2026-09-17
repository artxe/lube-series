import { fuzz_seeds } from "../seeds.js"
import { pattern, searcher } from "hangul-lube"
import { assert, describe, it } from "vitest"
const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
const medials = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
const finals = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
const keys = [
	..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ"
]
/** @type {Record<string, string | undefined>} */
const compound_medials = {
	ㅗㅏ: "ㅘ",
	ㅗㅐ: "ㅙ",
	ㅗㅣ: "ㅚ",
	ㅜㅓ: "ㅝ",
	ㅜㅔ: "ㅞ",
	ㅜㅣ: "ㅟ",
	ㅡㅣ: "ㅢ"
}
/** @type {Record<string, string | undefined>} */
const compound_consonants = {
	ㄱㅅ: "ㄳ",
	ㄴㅈ: "ㄵ",
	ㄴㅎ: "ㄶ",
	ㄹㄱ: "ㄺ",
	ㄹㅁ: "ㄻ",
	ㄹㅂ: "ㄼ",
	ㄹㅅ: "ㄽ",
	ㄹㅌ: "ㄾ",
	ㄹㅍ: "ㄿ",
	ㄹㅎ: "ㅀ",
	ㅂㅅ: "ㅄ"
}
/** @type {Record<string, string | undefined>} */
const split_medials = Object.fromEntries(
	Object.entries(compound_medials).map(
		([ pair, compound ]) => [ compound, pair ]
	)
)
/** @type {Record<string, string | undefined>} */
const split_consonants = Object.fromEntries(
	Object.entries(compound_consonants).map(
		([ pair, compound ]) => [ compound, pair ]
	)
)
/** @type {Record<string, string | undefined>} */
const medial_growths = {
	ㅗ: "ㅗㅘㅙㅚ",
	ㅜ: "ㅜㅝㅞㅟ",
	ㅡ: "ㅡㅢ"
}
/** @type {Record<string, string | undefined>} */
const final_growths = {
	ㄱ: "ㄱㄳ",
	ㄴ: "ㄴㄵㄶ",
	ㄹ: "ㄹㄺㄻㄼㄽㄾㄿㅀ",
	ㅂ: "ㅂㅄ"
}
/**
 * @param {number} seed
 */
function check_word(seed) {
	const random = create_random(seed)
	/**
	 * @param {string} word
	 * @returns {string}
	 */
	function near(word) {
		const letters = [ ...word ]
		const index = Math.floor(random() * letters.length)
		const [ initial, medial, final ] = /** @type {[string, string, string]} */(jamo(letters[index]))/**/
		const change = Math.floor(random() * 5)
		if (change == 0) letters[index] = syllable(
			initial,
			medial,
			pick([ ...finals ])
		)
		else if (change == 1) letters[index] = syllable(
			initial,
			pick([ ...medials ]),
			final
		)
		else if (change == 2) letters[index] = syllable(
			pick([ ...initials ]),
			medial,
			final
		)
		else if (change == 3) letters.splice(
			index + 1,
			0,
			random_syllable(true)
		)
		else letters[index] = pick(
			[
				initial,
				medial,
				...final == " " ? [] : [ final ]
			]
		)
		if (random() < 0.3) letters.splice(
			Math.floor(
				random() * (letters.length + 1)
			),
			0,
			pick(
				[ "ㄱ", "ㄳ", "ㅘ", "a", "1", " " ]
			)
		)
		return letters.join("")
	}
	/**
	 * @template T
	 * @param {readonly T[]} items
	 * @returns {T}
	 */
	function pick(items) {
		return /** @type {T} */(items[Math.floor(random() * items.length)])/**/
	}
	/**
	 * @param {boolean} rich
	 * @returns {string}
	 */
	function random_syllable(rich) {
		return syllable(
			pick(
				[
					...rich ? initials : "ㄱㄴㄷㄹㅁㅂㅅㅇㅈ"
				]
			),
			pick(
				[
					...rich ? medials : "ㅏㅗㅜㅡㅣㅘㅢ"
				]
			),
			random() < 0.45
				? pick([ ...finals.slice(1) ])
				: " "
		)
	}
	/** @returns {string} */
	function random_word() {
		const rich = random() < 0.5
		let word = ""
		for (let count = 1 + Math.floor(random() * 4); count > 0; count--) word += random_syllable(rich)
		return word
	}
	const word = random_word()
	const latin = random() < 0.2
		? pick(
			[ "CNC-3", "cnc3", "A-", "no.7 " ]
		)
		: ""
	const by_initials = random() < 0.3
	const states = type(
		[
			...latin,
			...by_initials
				? [ ...word ].map(
					letter => /** @type {string} */(jamo(letter)?.[0])/**/
				)
				: keys_of(word)
		]
	)
	if (!by_initials) assert.equal(
		states.at(-1),
		latin + word,
		`seed ${seed}`
	)
	const text = `${pick([ "", "CNC-3호기 ", "(주)", "A라인/" ])}${latin.toUpperCase()}${word}${pick([ "", " 정비", "#2" ])}`
	const spaced = [ ...text ].join(random() < 0.5 ? " " : "-")
	for (const state of states) {
		const at = `seed ${seed}: ${JSON.stringify(state)} in ${JSON.stringify(text)}`
		assert.isTrue(
			RegExp(pattern(state), "i").test(text),
			`pattern ${at}`
		)
		const compiled = searcher(state)
		assert.isTrue(
			compiled?.test(text),
			`searcher ${at}`
		)
		assert.isTrue(
			compiled?.test(spaced),
			`searcher ${at} ${spaced}`
		)
		assert.equal(
			searcher(
				state.replace(
					/(?<=.)./gu,
					letter => random() < 0.2 ? `​${letter}` : letter
				)
			)?.source,
			compiled?.source,
			at
		)
		for (let count = 0; count < 4; count++) {
			const other = latin + (random() < 0.2 ? random_word() : near(word))
			assert.equal(
				RegExp(pattern(state), "i").test(other),
				reference_matches(state, other),
				`seed ${seed}: ${JSON.stringify(state)} on ${JSON.stringify(other)}`
			)
		}
	}
}
/**
 * @param {number} seed
 * @returns {() => number}
 */
function create_random(seed) {
	return () => {
		seed = seed + 0x6d2b79f5 | 0
		let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
		value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
		return ((value ^ value >>> 14) >>> 0) / 4294967296
	}
}
/**
 * @param {string | undefined} letter
 * @returns {[string, string, string] | undefined}
 */
function jamo(letter) {
	const code = (letter ?? "").charCodeAt(0) - 0xAC00
	if (!(code >= 0 && code < 11172)) return undefined
	return [
		/** @type {string} */(initials[Math.floor(code / 588)])/**/,
		/** @type {string} */(medials[Math.floor(code / 28) % 21])/**/,
		/** @type {string} */(finals[code % 28])/**/
	]
}
/**
 * @param {string} word
 * @returns {string[]}
 */
function keys_of(word) {
	return [ ...word ].flatMap(
		letter => {
			const parts = jamo(letter)
			if (!parts) return [ letter ]
			const [ initial, medial, final ] = parts
			return [
				initial,
				...split_medials[medial] ?? medial,
				...final == " " ? "" : split_consonants[final] ?? final
			]
		}
	)
}
/**
 * @param {string} query
 * @param {string} text
 * @returns {boolean}
 */
function reference_matches(query, text) {
	const letters = [ ...text ]
	const last = [ ...query ].length - 1
	/**
	 * @param {number} start
	 * @returns {boolean}
	 */
	function match_at(start) {
		let positions = [ start ]
		for (const [ index, letter ] of [ ...query ].entries()) {
			/** @type {number[]} */
			const next = []
			for (const position of positions) {
				const current = letters[position]
				const parts = jamo(letter)
				if (parts) {
					const [ initial, medial, final ] = parts
					const found = jamo(current)
					if (index < last) {
						if (current == letter) next.push(position + 1)
					} else if (final == " ") {
						if (found?.[0] == initial && (medial_growths[medial] ?? medial).includes(found[1])) next.push(position + 1)
					} else {
						if (found?.[0] == initial && found[1] == medial && (final_growths[final] ?? final).includes(found[2])) next.push(position + 1)
						const pair = split_consonants[final]
						if (current == syllable(
							initial,
							medial,
							pair ? pair[0] : " "
						) && jamo(letters[position + 1])?.[0] == (pair ? pair[1] : final)) next.push(position + 2)
					}
				} else if (split_consonants[letter]) {
					const pair = /** @type {string} */(split_consonants[letter])/**/
					if (current == letter) next.push(position + 1)
					if (starts_with(
						current,
						/** @type {string} */(pair[0])/**/
					) && starts_with(
						letters[position + 1],
						/** @type {string} */(pair[1])/**/
					)) next.push(position + 2)
				} else if (initials.includes(letter)) {
					if (starts_with(current, letter) || (final_growths[letter] ?? "").includes(current ?? "@")) next.push(position + 1)
				} else if (medials.includes(letter)) {
					if ((medial_growths[letter] ?? letter).includes(current ?? "@")) next.push(position + 1)
				} else if (current?.toLowerCase() == letter.toLowerCase()) next.push(position + 1)
			}
			positions = next
			if (!positions.length) return false
		}
		return true
	}
	return last < 0 || letters.some((_, index) => match_at(index))
}
/**
 * @param {string | undefined} letter
 * @param {string} initial
 * @returns {boolean}
 */
function starts_with(letter, initial) {
	return letter == initial || jamo(letter)?.[0] == initial
}
/**
 * @param {string} initial
 * @param {string} medial
 * @param {string=} final
 * @returns {string}
 */
function syllable(initial, medial, final = " ") {
	return String.fromCharCode(
		0xAC00 + (initials.indexOf(initial) * 21 + medials.indexOf(medial)) * 28 + finals.indexOf(final)
	)
}
/**
 * @param {string[]} typed
 * @returns {string[]}
 */
function type(typed) {
	let done = ""
	let initial = ""
	let medial = ""
	let final = ""
	/** @type {string[]} */
	const states = []
	/**
	 * @param {string} next_initial
	 * @param {string} next_medial
	 */
	function commit(next_initial, next_medial) {
		done += composing()
		initial = next_initial
		medial = next_medial
		final = ""
	}
	/** @returns {string} */
	function composing() {
		return initial && medial ? syllable(initial, medial, final || " ") : initial || medial
	}
	for (const key of typed) {
		if (!initials.includes(key) && !medials.includes(key)) {
			done += composing() + key
			initial = medial = final = ""
		} else if (!medials.includes(key)) {
			const compound = compound_consonants[(final || initial) + key]
			if (initial && !medial && compound) initial = compound
			else if (medial && final && compound) final = compound
			else if (initial && medial && !final && finals.includes(key)) final = key
			else commit(key, "")
		} else if (initial && !medial) {
			const pair = split_consonants[initial]
			if (pair) {
				done += pair[0]
				initial = /** @type {string} */(pair[1])/**/
			}
			medial = key
		} else if (final) {
			const pair = split_consonants[final]
			const moved = pair ? /** @type {string} */(pair[1])/**/ : final
			final = pair ? /** @type {string} */(pair[0])/**/ : ""
			commit(moved, key)
		} else if (medial && compound_medials[medial + key]) medial = /** @type {string} */(compound_medials[medial + key])/**/
		else commit("", key)
		states.push(done + composing())
	}
	return states
}
describe(
	"typing",
	() => {
		const words = fuzz_seeds(1000)
		const typings = fuzz_seeds(5000)
		it(
			"every state while typing a word finds it in a longer text, and nothing the rule rejects",
			() => {
				for (const seed of words) check_word(seed)
			},
			60000 + words.length * 5
		)
		it(
			"every state while typing finds the text",
			() => {
				for (const seed of typings) {
					const random = create_random(seed)
					const states = type(
						Array.from(
							{
								length: 1 + Math.floor(random() * 8)
							},
							() => /** @type {string} */(keys[Math.floor(random() * keys.length)])/**/
						)
					)
					const text = /** @type {string} */(states.at(-1))/**/
					for (const state of states) {
						assert.isTrue(
							new RegExp(`^(?:${pattern(state)})`).test(text),
							`seed ${seed}: pattern ${state} ${text}`
						)
						assert.isTrue(
							new RegExp(
								`^(?:${/** @type {RegExp} */(searcher(state))/**/.source})`,
								"i"
							).test(text),
							`seed ${seed}: searcher ${state} ${text}`
						)
					}
				}
			},
			60000 + typings.length * 5
		)
	}
)
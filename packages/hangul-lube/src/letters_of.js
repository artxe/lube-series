const final_letters = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
const initial_letters = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
/**
 * @param {string} text
 * @returns {string[]}
 */
export default function(text) {
	return [ ...text.normalize("NFC") ].map(
		letter => {
			const code = letter.charCodeAt(0)
			return code >= 0x1100 && code <= 0x1112
				? /** @type {string} */(initial_letters[code - 0x1100])/**/
				: code >= 0x1161 && code <= 0x1175
					? String.fromCharCode(code - 0x1161 + 0x314f)
					: code >= 0x11a8 && code <= 0x11c2
						? /** @type {string} */(final_letters[code - 0x11a8])/**/
						: letter
		}
	)
}
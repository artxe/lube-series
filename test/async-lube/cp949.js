/** @type {Map<string, number> | undefined} */
let codes
/**
 * @param {string} text
 * @returns {string | undefined}
 */
export function encode_cp949(text) {
	const table = get_codes()
	let bytes = ""
	for (const char of text) {
		const code = char.charCodeAt(0)
		if (code < 0x80) {
			bytes += char
			continue
		}
		const pair = table.get(char)
		if (pair == null) return
		bytes += String.fromCharCode(pair >> 8, pair & 0xff)
	}
	return bytes
}
/**
 * @returns {Map<string, number>}
 */
function get_codes() {
	if (codes) return codes
	const decoder = new TextDecoder("euc-kr", { fatal: true })
	/** @type {Map<string, number>} */
	const found = new Map()
	for (let lead = 0x81; lead <= 0xfe; lead++) {
		for (let trail = 0x41; trail <= 0xfe; trail++) {
			let char
			try {
				char = decoder.decode(
					new Uint8Array([ lead, trail ])
				)
			} catch {
				continue
			}
			if (char.length == 1 && char.charCodeAt(0) >= 0xa0 && !found.has(char)) found.set(char, lead * 256 + trail)
		}
	}
	codes = found
	return found
}
/**
 * @param {unknown} options
 * @param {readonly string[]} keys
 * @param {string} kind
 * @param {string=} prefix
 * @returns {void}
 */
export function check_options(options, keys, kind, prefix = "") {
	if (options == null || typeof options != "object") return
	for (const key of Object.keys(options)) {
		if (!keys.includes(key)) throw TypeError(
			`Unknown ${kind} option "${prefix}${key}"`
		)
	}
}
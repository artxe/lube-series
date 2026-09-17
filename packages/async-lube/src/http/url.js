const absolute_regex = /^(?:[a-z][\d+\-.a-z]*:)?\/\//i
const dot_segment_regex = /^\.\.?$/
const leading_slash_regex = /^\/+/
const path_param_regex = /\/:([_a-z]\w*)/gi
const trailing_slash_regex = /\/+$/
/**
 * @param {string} url
 * @param {string} query
 * @param {boolean} first
 * @returns {string}
 */
function add_query(url, query, first) {
	if (!query) return url
	const hash_index = url.indexOf("#")
	const without_hash = hash_index < 0 ? url : url.slice(0, hash_index)
	const hash = hash_index < 0 ? "" : url.slice(hash_index)
	const query_index = without_hash.indexOf("?")
	if (query_index < 0) return without_hash + "?" + query + hash
	if (!first) return without_hash + "&" + query + hash
	const existing = without_hash.slice(query_index + 1)
	return without_hash.slice(0, query_index + 1) + query + (existing ? "&" + existing : "") + hash
}
/**
 * @param {[string, string][]} pairs
 * @param {string} key
 * @param {import("../../public.js").QueryValue} value
 * @returns {void}
 */
function append_query(pairs, key, value) {
	if (value == null) return
	if (Array.isArray(value)) {
		for (const item of /** @type {readonly import("../../public.js").QueryValue[]} */(value)/**/) append_query(pairs, key, item)
	} else if (value instanceof Date) pairs.push([ key, value.toISOString() ])
	else if (typeof value == "object") {
		for (const name of Object.keys(value)) append_query(
			pairs,
			`${key}[${name}]`,
			/** @type {{ readonly [key: string]: import("../../public.js").QueryValue }} */(value)/**/[name]
		)
	} else pairs.push([ key, String(value) ])
}
/**
 * @param {string | undefined} base
 * @param {string} path
 * @param {import("../../public.js").QueryParams | undefined} params
 * @param {((params: import("../../public.js").QueryParams) => string)=} serialize
 * @returns {string}
 */
export function build_url(
	base,
	path,
	params,
	serialize = serialize_query
) {
	const source = params ?? {}
	/** @type {Record<string, import("../../public.js").QueryValue>} */
	const rest = { ...source }
	/** @type {string[]} */
	const used = []
	/**
	 * @param {string} text
	 * @returns {string}
	 */
	function fill(text) {
		const split_index = text.search(/[?#]/)
		const path_part = split_index < 0 ? text : text.slice(0, split_index)
		const filled = path_part.replace(
			path_param_regex,
			(_, /** @type {string} */ name) => {
				const value = Object.prototype.hasOwnProperty.call(source, name) ? source[name] : void 0
				const value_text = value == null
					? ""
					: value instanceof Date
						? value.toISOString()
						: String(value)
				if (!value_text) throw TypeError(
					`Missing path parameter "${name}" for ${text}`
				)
				if (dot_segment_regex.test(value_text)) throw TypeError(
					`Path parameter "${name}" cannot be "${value_text}"`
				)
				used.push(name)
				return "/" + encodeURIComponent(value_text)
			}
		)
		return split_index < 0 ? filled : filled + text.slice(split_index)
	}
	let url = fill(path)
	if (base && !absolute_regex.test(url)) {
		const split_index = base.search(/[?#]/)
		const base_path = fill(
			split_index < 0 ? base : base.slice(0, split_index)
		)
		const base_query = split_index < 0 || base[split_index] != "?"
			? ""
			: base.slice(split_index + 1).split("#")[0] ?? ""
		const trimmed = url.replace(leading_slash_regex, "")
		url = base_path.replace(trailing_slash_regex, "") + (trimmed && !trimmed.startsWith("?") ? "/" : "") + trimmed
		url = add_query(url, base_query, true)
	}
	for (const name of used) delete rest[name]
	return add_query(url, serialize(rest), false)
}
/**
 * @param {import("../../public.js").QueryParams} params
 * @returns {string}
 */
export function serialize_query(params) {
	/** @type {[string, string][]} */
	const pairs = []
	for (const key of Object.keys(params)) append_query(pairs, key, params[key])
	return pairs.map(
		([ key, value ]) => encodeURIComponent(key) + "=" + encodeURIComponent(value)
	)
		.join("&")
}
import {
	property_for_shorthand,
	shorthand_for_declaration,
	shorthand_for_properties,
	shorthand_for_values
} from "./click_css_tables.js"
import { css_properties } from "./css_properties.js"
const bang_regex = /!+$/
const has_value_regex = /.[:=]./
const property_name_regex = /^[A-Za-z-][\w-]*$/
const whitespace_regex = /\s+/
const sensitive_segments = new Set(
	[
		"animation",
		"background",
		"border",
		"columns",
		"flex",
		"font",
		"grid",
		"inset",
		"list",
		"margin",
		"mask",
		"outline",
		"overscroll",
		"padding",
		"scroll",
		"transition"
	]
)
const explicit_families = new Map(
	[
		[ "align-content", "content" ],
		[ "align-items", "items" ],
		[ "align-self", "self" ],
		[ "bottom", "inset" ],
		[ "column-gap", "gap" ],
		[ "gap", "gap" ],
		[ "justify-content", "content" ],
		[ "justify-items", "items" ],
		[ "justify-self", "self" ],
		[ "left", "inset" ],
		[ "place-content", "content" ],
		[ "place-items", "items" ],
		[ "place-self", "self" ],
		[ "right", "inset" ],
		[ "row-gap", "gap" ],
		[ "top", "inset" ]
	]
)
/**
 * @param {string} value
 * @param {string} line_prefix
 * @returns {import("../../private.js").ClickClassReport | null}
 */
function analyze_class(value, line_prefix) {
	const tokens = value.split(whitespace_regex).filter(Boolean)
	if (!tokens.length) {
		return null
	}
	const infos = tokens.map(analyze_token)
	/** @type {Set<string>} */
	const seen = new Set()
	/** @type {string[]} */
	const duplicates = []
	for (const info of infos) {
		for (const property of info.properties) {
			const key = info.context + "\0" + property
			if (seen.has(key)) {
				duplicates.push(property)
			}
			seen.add(key)
		}
	}
	const selectors = pick(infos, [ "selector" ])
	const bases = [
		...pick(infos, [ "base", "plain" ]),
		...pick(infos, [ "media" ])
	]
	const base = bases.join(" ")
	const lines = base ? [ base, ...selectors ] : selectors
	return {
		changes: infos.flatMap(info => info.changes),
		duplicates,
		formatted: lines.join("\n" + line_prefix),
		reordered: infos.some(info => info.reordered) || [ ...bases, ...selectors ].join(" ") != infos.map(info => info.text).join(" "),
		unknown: infos.flatMap(info => info.unknown)
	}
}
/**
 * @param {string} token
 * @returns {import("../../private.js").ClickToken}
 */
function analyze_token(token) {
	/** @type {import("../../private.js").ClickToken} */
	const plain = {
		changes: [],
		context: "",
		kind: "plain",
		properties: [],
		reordered: false,
		text: token,
		unknown: []
	}
	const bangs = bang_regex.exec(token)?.[0] ?? ""
	const body = bangs ? token.slice(0, -bangs.length) : token
	let head = ""
	let rest = body
	if (body[0] == "@") {
		const i = body.indexOf("@", 2)
		if (i < 0 || i == body.length - 1) {
			return plain
		}
		head = body.slice(0, i + 1)
		rest = body.slice(i + 1)
	}
	const first = rest[0]
	if (first === undefined || is_open(token)) {
		return plain
	}
	let selector = ""
	let declarations = rest
	if (!(first == "-" || first >= "a" && first <= "z")) {
		const i = selector_end(rest)
		if (i < 0) {
			return plain
		}
		selector = rest.slice(0, i + 1)
		declarations = rest.slice(i + 1)
	}
	if (!(has_value_regex.test(declarations) || shorthand_for_values.has(declarations))) {
		return plain
	}
	const kind = selector
		? "selector"
		: head
			? "media"
			: "base"
	const parsed = split_declarations(declarations).map(parse_declaration)
	if (parsed.includes(null)) {
		return { ...plain, kind }
	}
	const list = /** @type {import("../../private.js").ClickDeclaration[]} */(parsed)/**/
	const properties = list.map(item => item.property)
	const entangled = properties.some(
		(left, i) => properties.some(
			(right, j) => i < j && is_related(left, right)
		)
	)
	const texts = list.map(item => item.text)
	const sorted = entangled ? texts : texts.slice().sort(compare_text)
	return {
		changes: list.flatMap(
			item => item.change ? [ item.change ] : []
		),
		context: head + selector + bangs,
		kind,
		properties,
		reordered: sorted.some((text, i) => text != texts[i]),
		text: head + selector + sorted.join(";") + bangs,
		unknown: list.filter(item => item.unknown).map(item => item.property)
	}
}
/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compare_text(left, right) {
	return left < right
		? -1
		: left > right
			? 1
			: 0
}
/**
 * @param {string} property
 * @returns {string | undefined}
 */
function family_of(property) {
	const segment = /** @type {string} */(property.split("-")[0])/**/
	return sensitive_segments.has(segment)
		? segment
		: explicit_families.get(property)
}
/**
 * @param {string} token
 * @returns {boolean}
 */
function is_open(token) {
	let quote = ""
	let depth = 0
	for (let i = 0; i < token.length; i++) {
		const c = token[i]
		if (c == "\\") {
			i++
		} else if (quote) {
			quote = c == quote ? "" : quote
		} else if (c == "'" || c == "\"") {
			quote = c
		} else if (c == "(" || c == "[" || c == "{") {
			depth++
		} else if ((c == ")" || c == "]" || c == "}") && depth-- < 1 || c == "/" && token[i + 1] == "*") {
			return true
		}
	}
	return !!quote || depth != 0 || token.endsWith("\\")
}
/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function is_related(left, right) {
	if (left == right || left.startsWith(right + "-") || right.startsWith(left + "-")) {
		return true
	}
	const family = family_of(left)
	return family !== undefined && family == family_of(right)
}
/**
 * @param {string} part
 * @returns {import("../../private.js").ClickDeclaration | null}
 */
function parse_declaration(part) {
	let at = -1
	for (let i = 0; i < part.length; i++) {
		const c = part[i]
		if (c == "\\") {
			i++
		} else if (c == "=" || c == ":") {
			at = i
			break
		}
	}
	if (at < 0) {
		const declaration = shorthand_for_values.get(part)
		return declaration
			? {
				change: null,
				property: /** @type {string} */(declaration.split(":")[0])/**/,
				text: part,
				unknown: false
			}
			: null
	}
	const name = part.slice(0, at)
	const value = part.slice(at + 1)
	if (!value || !property_name_regex.test(name)) {
		return null
	}
	const property = shorthand_for_properties.get(name) ?? name
	const known = property != name || css_properties.has(name) || name.startsWith("-")
	if (!known) {
		return {
			change: null,
			property,
			text: part,
			unknown: true
		}
	}
	const word = shorthand_for_declaration.get(property + ":" + value)
	if (word) {
		return {
			change: name + "=" + value + " -> " + word,
			property,
			text: word,
			unknown: false
		}
	}
	const code = property_for_shorthand.get(property)
	if (code && code != name) {
		return {
			change: name + " -> " + code,
			property,
			text: code + part.slice(at),
			unknown: false
		}
	}
	return {
		change: null,
		property,
		text: part,
		unknown: false
	}
}
/**
 * @param {import("../../private.js").ClickToken[]} infos
 * @param {import("../../private.js").ClickToken["kind"][]} kinds
 * @returns {string[]}
 */
function pick(infos, kinds) {
	return infos.filter(
		info => kinds.includes(info.kind)
	).map(info => info.text)
		.sort(compare_text)
}
/**
 * @param {string} token
 * @returns {number}
 */
function selector_end(token) {
	let quote = ""
	let depth = 0
	for (let i = 0; i < token.length; i++) {
		const c = token[i]
		if (c == "\\") {
			i++
		} else if (quote) {
			quote = c == quote ? "" : quote
		} else if (c == "'" || c == "\"") {
			quote = c
		} else if (c == "(" || c == "[") {
			depth++
		} else if (c == ")" || c == "]") {
			depth--
		} else if (c == "/" && !depth) {
			return i
		}
	}
	return -1
}
/**
 * @param {string} text
 * @returns {string[]}
 */
function split_declarations(text) {
	/** @type {string[]} */
	const parts = []
	let quote = ""
	let depth = 0
	let start = 0
	for (let i = 0; i < text.length; i++) {
		const c = text[i]
		if (c == "\\") {
			i++
		} else if (quote) {
			quote = c == quote ? "" : quote
		} else if (c == "'" || c == "\"") {
			quote = c
		} else if (c == "(" || c == "[" || c == "{") {
			depth++
		} else if (c == ")" || c == "]" || c == "}") {
			depth--
		} else if (c == ";" && !depth) {
			parts.push(text.slice(start, i))
			start = i + 1
		}
	}
	parts.push(text.slice(start))
	return parts
}
export { analyze_class }
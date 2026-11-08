import { lower_bound } from "./source_text.js"
const block_types = new Set(
	[
		"BlockStatement",
		"ClassBody",
		"StaticBlock",
		"TSEnumBody",
		"TSInterfaceBody",
		"TSModuleBlock"
	]
)
/** @type {WeakMap<import("eslint").SourceCode, Map<string, import("../../private.js").IndentModel>>} */
const cache = new WeakMap()
const class_property_types = new Set(
	[
		"AccessorProperty",
		"PropertyDefinition",
		"TSAbstractAccessorProperty",
		"TSAbstractPropertyDefinition"
	]
)
const closers = new Set([ ")", "]", "}" ])
const flag_force = 1
const flag_keep = 2
const flag_lock = 4
const flag_managed = 8
const flag_param = 16
const function_types = new Set(
	[
		"FunctionDeclaration",
		"FunctionExpression",
		"TSCallSignatureDeclaration",
		"TSConstructSignatureDeclaration",
		"TSConstructorType",
		"TSDeclareFunction",
		"TSEmptyBodyFunctionExpression",
		"TSFunctionType",
		"TSMethodSignature"
	]
)
const line_break_regex = /\r\n|[\n\r\u2028\u2029]/g
const openers = new Set([ "(", "[", "{" ])
const statement_lists = new Set(
	[
		"BlockStatement",
		"Program",
		"StaticBlock",
		"SvelteScriptElement",
		"SwitchCase",
		"TSModuleBlock"
	]
)
/**
 * @param {import("eslint").SourceCode} source_code
 * @param {import("../../private.js").IndentSettings} settings
 * @returns {import("../../private.js").IndentModel}
 */
function build_model(source_code, settings) {
	const text = source_code.text
	const unit = settings.unit
	const ast = /** @type {import("../../private.js").IndentNode} */(/** @type {unknown} */(source_code.ast))/**/
	const tokens = source_code.ast.tokens
	const comments = /** @type {import("../../private.js").Comment[]} */(source_code.getAllComments())/**/
	const count = tokens.length
	/** @type {number[]} */
	const starts = []
	/** @type {number[]} */
	const ends = []
	const start_lines = new Int32Array(count)
	const end_lines = new Int32Array(count)
	for (const [ index, token ] of tokens.entries()) {
		starts.push(token.range[0])
		ends.push(token.range[1])
		start_lines[index] = token.loc.start.line
		end_lines[index] = token.loc.end.line
	}
	/** @type {number[]} */
	const line_starts = [ 0 ]
	for (const match of text.matchAll(line_break_regex)) {
		line_starts.push(match.index + match[0].length)
	}
	const bases = new Int32Array(count).fill(-1)
	const levels = new Int32Array(count)
	const flags = new Uint8Array(count)
	const skips = new Int32Array(count).fill(-1)
	const matches = new Int32Array(count).fill(-1)
	const heads = new Int32Array(count)
	const jsx_parents = new Int32Array(count).fill(-1)
	const case_heads = new Int32Array(count).fill(-1)
	const token_firsts = new Uint8Array(count)
	const body_opens = new Uint8Array(count)
	/** @type {number[]} */
	const order = []
	/** @type {(string | undefined)[]} */
	const memo = []
	/** @type {(boolean | undefined)[]} */
	const starred_comments = []
	const stamps = new Int32Array(count)
	let stamp = 0
	/** @type {import("../../private.js").IndentLine[] | null} */
	let lines = null
	mark_firsts()
	for (let index = 1; index < count; index++) {
		heads[index] = at(start_lines, index - 1) == at(start_lines, index)
			? at(heads, index - 1)
			: index
	}
	/** @type {import("../../private.js").IndentEntry[]} */
	const entries = []
	/** @type {[number, number][]} */
	const roots = []
	let opener = -1
	visit(ast, -1)
	for (const entry of entries) {
		apply(entry)
	}
	for (const [ first, base ] of roots) {
		set(first, base, 1, 0)
	}
	add_parens()
	return {
		get_lines() {
			lines ??= build_lines()
			return lines
		},
		get_token_indent(position) {
			const token = token_at(position)
			return token < count ? indent_of(token) : ""
		}
	}
	/**
	 * @param {number} index
	 * @returns {boolean}
	 */
	function above_case(index) {
		const comment = /** @type {import("../../private.js").Comment} */(comments[index])/**/
		const next = token_at(comment.range[1])
		return next < count
			&& at(case_heads, next) >= 0
			&& !punctuator(next, "}")
			&& physical_at(comment.range[0]) == indent_of(next)
			&& !text.slice(
				comment.range[1],
				at(starts, next)
			).split(line_break_regex)
				.slice(1, -1)
				.some(line => !line.trim())
	}
	/**
	 * @param {number} token
	 * @param {number} flag
	 * @returns {void}
	 */
	function add_flag(token, flag) {
		flags[token] = at(flags, token) | flag
	}
	/**
	 * @param {number} open
	 * @param {number} close
	 * @param {(import("../../private.js").IndentNode | null | undefined)[]} elements
	 * @param {number} level
	 * @returns {void}
	 */
	function add_list(open, close, elements, level) {
		span(open + 1, close - 1, open, level, 0)
		set(close, open, 0, 0)
		let previous = elements[0]
		for (const element of elements.slice(1)) {
			if (element && previous && list_end_line(previous) > at(end_lines, open)) {
				span(
					last_of(previous) + 1,
					last_of(element),
					first_with_parens(previous, open),
					0,
					0
				)
			}
			previous = element
		}
	}
	/** @returns {void} */
	function add_parens() {
		/** @type {number[]} */
		const stack = []
		for (let index = 0; index < count; index++) {
			const token = /** @type {import("eslint").AST.Token} */(tokens[index])/**/
			if (token.type != "Punctuator" || !(at(flags, index) & flag_managed)) {
				continue
			}
			if (openers.has(token.value)) {
				stack.push(index)
			} else if (closers.has(token.value)) {
				const open = stack.pop()
				if (open !== undefined && pair_of(open) == token.value) {
					matches[open] = index
					matches[index] = open
				}
			}
		}
		/** @type {number[]} */
		const groups = []
		for (let index = 0; index < count; index++) {
			const token = /** @type {import("eslint").AST.Token} */(tokens[index])/**/
			const group = groups[groups.length - 1]
			if (token.type == "Punctuator" && token.value == ")" && at(matches, index) >= 0) {
				const open = at(matches, index)
				if (group === open) {
					groups.pop()
				}
				if (!(at(flags, index) & flag_lock)) {
					set(index, open, 0, 0)
				}
				continue
			}
			if (group !== undefined && at(flags, index) & flag_managed && !(at(flags, index) & flag_lock)) {
				const base = at(bases, index)
				if (base <= group || base >= at(matches, group)) {
					set(index, group, 1, 0)
				}
			}
			if (token.type == "Punctuator" && token.value == "(" && at(matches, index) >= 0 && !(at(flags, index) & flag_param)) {
				groups.push(index)
			}
		}
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @returns {boolean}
	 */
	function aligned(entry) {
		const position = entry.node.range[0]
		let index = position
		while (index > 0 && (text[index - 1] == " " || text[index - 1] == "\t")) {
			index--
		}
		return index == 0 || "\n\r\u2028\u2029".includes(
			/** @type {string} */(text[index - 1])/**/
		)
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @returns {void}
	 */
	function apply(entry) {
		const { first, last, node } = entry
		if (first > last) {
			return
		}
		const type = node.type
		if (type == "Program") {
			if (/** @type {import("../../private.js").IndentNode[]} */(node.body)/**/.some(
				item => item.type.startsWith("Svelte")
			)) {
				return
			}
			set(first, -1, 0, 0)
		}
		if (type == "SvelteScriptElement") {
			apply_script(node)
			return
		}
		span(
			Math.max(first, entry.inner) + 1,
			last,
			first,
			0,
			0
		)
		if (block_types.has(type)) {
			const open = type == "StaticBlock" ? first + 1 : first
			const parent = entries[entry.parent]
			if (type != "StaticBlock" && parent && !statement_lists.has(parent.node.type)) {
				set(open, parent.first, 0, 0)
				body_opens[open] = 1
			}
			add_list(
				open,
				last,
				/** @type {import("../../private.js").IndentNode[]} */(node.members ?? node.body)/**/,
				1
			)
		} else if (function_types.has(type) || type == "ArrowFunctionExpression") {
			apply_function(node, first, last)
		} else if (class_property_types.has(type)) {
			apply_class_property(node, first, last)
		} else {
			apply_other(entry)
		}
	}
	/**
	 * @param {number} operator
	 * @returns {void}
	 */
	function apply_assignment(operator) {
		set(operator, operator - 1, 1, 0)
		set(operator + 1, operator, 1, 0)
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @param {import("../../private.js").IndentNode} left
	 * @param {string} value
	 * @returns {void}
	 */
	function apply_binary(entry, left, value) {
		apply_operator(
			entry,
			scan(
				last_of(left) + 1,
				entry.last,
				index => token_value(index) == value
			),
			settings.operator
		)
	}
	/**
	 * @param {number} body_first
	 * @param {number} body_last
	 * @returns {void}
	 */
	function apply_blockless(body_first, body_last) {
		let start = body_first
		let end = body_last
		while (punctuator(start - 1, "(") && punctuator(end + 1, ")")) {
			start--
			end++
		}
		const parent = scan(
			start - 1,
			-1,
			index => !punctuator(index, "(")
		)
		span(start, end, parent, 1, 0)
	}
	/**
	 * @param {import("../../private.js").IndentNode | import("../../private.js").IndentNode[] | null | undefined} body
	 * @returns {void}
	 */
	function apply_body(body) {
		if (body && !Array.isArray(body) && body.type != "BlockStatement") {
			apply_blockless(first_of(body), last_of(body))
		}
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} last
	 * @returns {void}
	 */
	function apply_call(node, last) {
		const callee = /** @type {import("../../private.js").IndentNode} */(node.callee)/**/
		const before = node.typeArguments ?? callee
		const open = node.arguments?.length
			? scan(
				last_of(before) + 1,
				last,
				index => punctuator(index, "(")
			)
			: last - 1
		if (open < 0 || !punctuator(open, "(") || !punctuator(last, ")")) {
			return
		}
		add_flag(open, flag_param)
		add_flag(last, flag_param)
		if (node.optional) {
			const dot = scan(
				last_of(callee) + 1,
				open,
				index => punctuator(index, "?.")
			)
			if (dot >= 0) {
				const parens = dot - last_of(callee) - 1
				const callee_first = first_of(callee) - parens
				const callee_last = dot - 1
				set(
					dot,
					at(end_lines, callee_last) == at(start_lines, open) ? callee_last : callee_first,
					1,
					0
				)
			}
		}
		set(
			open,
			node.typeArguments ? first_of(node.typeArguments) - 1 : open - 1,
			0,
			0
		)
		add_list(open, last, node.arguments ?? [], 1)
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} first
	 * @param {number} last
	 * @returns {void}
	 */
	function apply_class_property(node, first, last) {
		const key = /** @type {import("../../private.js").IndentNode} */(node.key)/**/
		let key_last = first_of(key)
		if (node.computed) {
			const open = scan(
				first_of(key) - 1,
				first - 1,
				index => punctuator(index, "[")
			)
			const close = scan(
				last_of(key) + 1,
				last + 1,
				index => punctuator(index, "]")
			)
			if (open != first) {
				set(open, first, 0, 0)
			}
			span(open + 1, close - 1, open, 1, 0)
			set(close, open, 0, 0)
			key_last = close
		} else if (!node.decorators?.length && key_last != first) {
			set(key_last, first, 1, 0)
		}
		const semicolon = punctuator(last, ";")
		if (node.value) {
			const operator = scan(
				first_of(node.value) - 1,
				first,
				index => punctuator(index, "=")
			)
			apply_assignment(operator)
			if (semicolon) {
				set(last, operator, 1, 0)
			}
		} else if (semicolon) {
			set(last, key_last, 1, 0)
		}
	}
	/**
	 * @param {number} first
	 * @param {number} after
	 * @param {number} last
	 * @param {import("../../private.js").IndentNode} node
	 * @returns {void}
	 */
	function apply_from(first, after, last, node) {
		const source = node.source
		const end = punctuator(last, ";") ? last - 1 : last
		const from = scan(
			after,
			end + 1,
			index => tokens[index]?.type == "Identifier" && token_value(index) == "from"
		)
		if (from >= 0) {
			span(from, end, first, 1, 0)
		}
		const attributes = node.attributes ?? []
		if (source && attributes.length) {
			const open = scan(
				last_of(source) + 1,
				end + 1,
				index => punctuator(index, "{")
			)
			if (from < 0) {
				span(open - 1, end, first, 1, 0)
			}
			add_list(open, end, attributes, 1)
		}
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} first
	 * @param {number} last
	 * @returns {void}
	 */
	function apply_function(node, first, last) {
		const params = node.params ?? []
		const after = node.returnType ?? (Array.isArray(node.body) ? null : node.body)
		const limit = after ? first_of(after) - 1 : last
		const close = scan(
			limit,
			first - 1,
			index => punctuator(index, ")")
		)
		const first_param = params[0]
		const open = first_param
			? scan(
				first_of(
					first_param.decorators?.[0] ?? first_param
				) - 1,
				first - 1,
				index => punctuator(index, "(")
			)
			: close - 1
		const is_arrow = node.type == "ArrowFunctionExpression"
		if (close >= 0 && open >= 0 && punctuator(open, "(") && (!is_arrow || open == first + (node.async ? 1 : 0))) {
			add_flag(open, flag_param)
			add_flag(close, flag_param)
			add_list(open, close, params, 1)
			if (node.returnType && !is_arrow) {
				span(
					first_of(node.returnType),
					last_of(node.returnType),
					close,
					1,
					0
				)
			}
		}
		if (is_arrow && node.body && !Array.isArray(node.body)) {
			apply_blockless(
				first_of(node.body),
				last_of(node.body)
			)
		}
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @param {import("../../private.js").IndentNode} object
	 * @param {import("../../private.js").IndentNode} property
	 * @param {boolean} computed
	 * @returns {void}
	 */
	function apply_member(entry, object, property, computed) {
		const object_last_token = last_of(object)
		const first_non_object = scan(
			object_last_token + 1,
			entry.last + 1,
			index => !punctuator(index, ")")
		)
		if (first_non_object < 0) {
			return
		}
		const parens = first_non_object - object_last_token - 1
		const first_object = first_of(object) - parens
		const last_object = first_non_object - 1
		const second = first_non_object + 1
		const first_property = computed ? first_non_object : second
		if (computed) {
			set(entry.last, first_non_object, 0, 0)
			span(
				first_of(property),
				last_of(property),
				first_non_object,
				1,
				0
			)
		}
		const base = at(end_lines, last_object) == at(start_lines, first_property)
			? last_object
			: first_object
		set(first_non_object, base, 1, 0)
		set(
			second,
			computed ? first_non_object : base,
			1,
			0
		)
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @param {number} operator
	 * @param {number} level
	 * @returns {void}
	 */
	function apply_operator(entry, operator, level) {
		if (operator < 0) {
			return
		}
		set(operator + 1, operator, 0, 0)
		const head = at(heads, entry.first)
		if (at(token_firsts, operator)) {
			set(operator, head, level, flag_lock)
		} else if (at(token_firsts, operator + 1)) {
			set(operator + 1, head, level, flag_lock)
		}
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @returns {void}
	 */
	function apply_other(entry) {
		const { first, last, node } = entry
		switch (node.type) {
		case "ArrayExpression":
		case "ArrayPattern":
		case "TSTupleType": {
			const elements = node.elementTypes ?? node.elements ?? []
			const tail = elements.findLast(element => element)
			const close = scan(
				tail ? last_of(tail) + 1 : first + 1,
				last + 1,
				index => punctuator(index, "]")
			)
			add_list(first, close, elements, 1)
			break
		}
		case "AssignmentExpression":
		case "AssignmentPattern": {
			const left = /** @type {import("../../private.js").IndentNode} */(node.left)/**/
			const value = node.type == "AssignmentPattern" ? "=" : /** @type {string} */(node.operator)/**/
			apply_assignment(
				scan(
					last_of(left) + 1,
					last,
					index => token_value(index) == value
				)
			)
			break
		}
		case "BinaryExpression":
		case "LogicalExpression":
			apply_binary(
				entry,
				/** @type {import("../../private.js").IndentNode} */(node.left)/**/,
				/** @type {string} */(node.operator)/**/
			)
			break
		case "CallExpression":
		case "NewExpression":
			if (node.type == "CallExpression" || node.arguments?.length || punctuator(last, ")") && punctuator(last - 1, "(")) {
				apply_call(node, last)
			}
			break
		case "ClassDeclaration":
		case "ClassExpression":
		case "TSInterfaceDeclaration": {
			const heritage = node.superClass ?? node.extends?.[0]
			if (heritage) {
				const keyword = scan(
					first_of(heritage) - 1,
					first,
					index => !punctuator(index, "(")
				)
				span(
					keyword,
					first_of(
						/** @type {import("../../private.js").IndentNode} */(node.body)/**/
					) - 1,
					first,
					1,
					0
				)
			}
			break
		}
		case "ConditionalExpression":
			apply_ternary(
				entry,
				/** @type {import("../../private.js").IndentNode} */(node.test)/**/,
				/** @type {import("../../private.js").IndentNode} */(node.consequent)/**/
			)
			break
		case "DoWhileStatement":
		case "ForInStatement":
		case "ForOfStatement":
		case "WhileStatement":
		case "WithStatement":
			apply_body(node.body)
			break
		case "ExportAllDeclaration":
			apply_from(first, first + 1, last, node)
			break
		case "ExportNamedDeclaration":
			if (!node.declaration) {
				const open = scan(
					first + 1,
					last + 1,
					index => punctuator(index, "{")
				)
				const close = node.source
					? scan(
						first_of(node.source) - 1,
						first,
						index => punctuator(index, "}")
					)
					: scan(
						last,
						first,
						index => punctuator(index, "}")
					)
				if (open >= 0 && close > open) {
					add_list(
						open,
						close,
						node.specifiers ?? [],
						1
					)
				}
				if (node.source) {
					apply_from(first, close + 1, last, node)
				}
			}
			break
		case "ForStatement": {
			const open = first + 1
			for (const part of [ node.init, node.test, node.update ]) {
				if (part) {
					span(
						first_of(part),
						last_of(part),
						open,
						1,
						0
					)
				}
			}
			apply_body(node.body)
			break
		}
		case "IfStatement":
			apply_body(node.consequent)
			apply_body(node.alternate)
			break
		case "ImportDeclaration": {
			const all = node.specifiers ?? []
			const specifiers = all.filter(
				specifier => specifier.type == "ImportSpecifier"
			)
			if (specifiers.length) {
				const open = scan(
					first + 1,
					last + 1,
					index => punctuator(index, "{")
				)
				const close = scan(
					first_of(
						/** @type {import("../../private.js").IndentNode} */(node.source)/**/
					) - 1,
					first,
					index => punctuator(index, "}")
				)
				add_list(open, close, specifiers, 1)
			}
			const tail = all[all.length - 1]
			apply_from(
				first,
				tail ? last_of(tail) + 1 : first + 1,
				last,
				node
			)
			break
		}
		case "ImportExpression": {
			const open = first + 1
			add_flag(open, flag_param)
			add_flag(last, flag_param)
			set(open, first, 0, 0)
			add_list(open, last, [ node.source ], 1)
			break
		}
		case "JSXAttribute":
			if (node.value) {
				apply_assignment(
					scan(
						last_of(
							/** @type {import("../../private.js").IndentNode} */(node.name)/**/
						) + 1,
						last,
						index => punctuator(index, "=")
					)
				)
			}
			break
		case "JSXClosingElement":
			span_node(
				/** @type {import("../../private.js").IndentNode} */(node.name)/**/,
				first,
				1
			)
			break
		case "JSXClosingFragment":
		case "JSXOpeningFragment": {
			span(first + 1, last, first, 1, 0)
			const slash = node.type == "JSXClosingFragment"
				? scan(
					last,
					first,
					index => punctuator(index, "/")
				)
				: -1
			copy(
				first,
				slash >= 0 && at(start_lines, slash) == at(start_lines, last) ? slash : last
			)
			break
		}
		case "JSXElement":
		case "JSXFragment": {
			const opening = /** @type {import("../../private.js").IndentNode} */(node.openingElement ?? node.openingFragment)/**/
			const closing = node.closingElement ?? node.closingFragment
			if (closing) {
				add_list(
					first_of(opening),
					first_of(closing),
					node.children ?? [],
					1
				)
			}
			break
		}
		case "JSXExpressionContainer":
		case "JSXSpreadAttribute":
		case "JSXSpreadChild":
			span(first + 1, last - 1, first, 1, 0)
			break
		case "JSXMemberExpression":
		case "MemberExpression":
		case "MetaProperty":
		case "TSIndexedAccessType":
		case "TSQualifiedName":
			apply_member(
				entry,
				/** @type {import("../../private.js").IndentNode} */(node.object ?? node.meta ?? node.objectType ?? node.left)/**/,
				/** @type {import("../../private.js").IndentNode} */(node.property ?? node.indexType ?? node.right)/**/,
				node.type == "TSIndexedAccessType" || Boolean(node.computed)
			)
			break
		case "JSXOpeningElement": {
			const close = node.selfClosing ? last - 1 : last
			if (node.selfClosing) {
				set(last, close, 0, 0)
			}
			span_node(
				/** @type {import("../../private.js").IndentNode} */(node.name)/**/,
				first,
				0
			)
			add_list(
				first,
				close,
				node.attributes ?? [],
				1
			)
			break
		}
		case "JSXText": {
			const parent = entries[entry.parent]
			if (parent && (parent.node.type == "JSXElement" || parent.node.type == "JSXFragment")) {
				jsx_parents[first] = parent.first
			}
			break
		}
		case "ObjectExpression":
		case "ObjectPattern":
		case "TSTypeLiteral": {
			const items = node.properties ?? node.members ?? []
			const tail = items[items.length - 1]
			const close = node.type == "TSTypeLiteral"
				? last
				: scan(
					tail ? last_of(tail) + 1 : first + 1,
					last + 1,
					index => punctuator(index, "}")
				)
			add_list(first, close, items, 1)
			break
		}
		case "Property":
			if (!node.shorthand && !node.method && node.kind == "init" && node.value) {
				const colon = scan(
					first_of(node.value) - 1,
					first,
					index => punctuator(index, ":")
				)
				set(colon + 1, first, 1, 0)
			}
			break
		case "SwitchCase": {
			const consequent = /** @type {import("../../private.js").IndentNode[]} */(node.consequent)/**/
			if (consequent.length != 1 || consequent[0]?.type != "BlockStatement") {
				span(first + 1, last, first, 1, 0)
				case_heads[last + 1] = first
			}
			break
		}
		case "SwitchStatement": {
			const open = scan(
				last_of(
					/** @type {import("../../private.js").IndentNode} */(node.discriminant)/**/
				) + 1,
				last,
				index => punctuator(index, "{")
			)
			body_opens[open] = 1
			span(
				open + 1,
				last - 1,
				open,
				settings.switch_case,
				0
			)
			break
		}
		case "TSAsExpression":
		case "TSSatisfiesExpression":
			apply_binary(
				entry,
				/** @type {import("../../private.js").IndentNode} */(node.expression)/**/,
				node.type == "TSAsExpression" ? "as" : "satisfies"
			)
			break
		case "TSConditionalType":
			apply_ternary(
				entry,
				/** @type {import("../../private.js").IndentNode} */(node.extendsType)/**/,
				/** @type {import("../../private.js").IndentNode} */(node.trueType)/**/
			)
			break
		case "TSEnumMember":
		case "TSImportEqualsDeclaration":
		case "TSTypeAliasDeclaration":
		case "TSTypeParameter":
		case "VariableDeclarator": {
			const value = node.initializer ?? node.moduleReference ?? node.typeAnnotation ?? node.default ?? node.init
			if (value && (node.type != "TSTypeParameter" || node.default)) {
				const operator = scan(
					first_of(value) - 1,
					first,
					index => !punctuator(index, "(")
				)
				if (punctuator(operator, "=")) {
					apply_assignment(operator)
				}
			}
			if (node.type != "TSEnumMember" && node.type != "TSTypeParameter" && punctuator(last, ";")) {
				add_flag(last, flag_keep)
			}
			break
		}
		case "TSMappedType": {
			const open = scan(
				first,
				last,
				index => punctuator(index, "{")
			)
			span(open + 1, last - 1, open, 1, 0)
			set(last, open, 0, 0)
			break
		}
		case "TSIntersectionType":
		case "TSUnionType":
			for (const item of (node.types ?? []).slice(1)) {
				const operator = first_with_parens(item, first) - 1
				if (operator > first) {
					apply_operator(
						entry,
						operator,
						aligned(entry) ? 0 : settings.operator
					)
				}
			}
			break
		case "TSTypeParameterDeclaration":
		case "TSTypeParameterInstantiation":
			if (node.params?.length) {
				add_list(first, last, node.params, 1)
			}
			break
		case "TemplateLiteral": {
			const quasis = node.quasis ?? []
			for (const [ index, quasi ] of quasis.slice(1).entries()) {
				const open = first_of(
					/** @type {import("../../private.js").IndentNode} */(quasis[index])/**/
				)
				const close = first_of(quasi)
				span(open + 1, close - 1, open, 1, 0)
				set(close, open, 0, 0)
			}
			break
		}
		case "VariableDeclaration": {
			const declarations = node.declarations ?? []
			const tail = declarations[declarations.length - 1]
			if (tail) {
				const force = at(start_lines, first_of(tail)) > at(start_lines, first)
				span(
					first + 1,
					last,
					first,
					1,
					force ? flag_force : 0
				)
				if (punctuator(last, ";")) {
					add_flag(last, flag_keep)
				}
			}
			break
		}
		default:
		}
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @returns {void}
	 */
	function apply_script(node) {
		const body = /** @type {import("../../private.js").IndentNode[]} */(node.body)/**/
		const top = body[0] ? first_of(body[0]) : -1
		for (const statement of body) {
			const first = first_of(statement)
			if (first == top) {
				set(first, -1, 0, flag_keep)
			} else {
				set(first, top, 0, 0)
			}
		}
	}
	/**
	 * @param {import("../../private.js").IndentEntry} entry
	 * @param {import("../../private.js").IndentNode} test
	 * @param {import("../../private.js").IndentNode} consequent
	 * @returns {void}
	 */
	function apply_ternary(entry, test, consequent) {
		const first = entry.first
		const question = scan(
			last_of(test) + 1,
			entry.last,
			index => punctuator(index, "?")
		)
		const colon = scan(
			last_of(consequent) + 1,
			entry.last,
			index => punctuator(index, ":")
		)
		if (question < 0 || colon < 0) {
			return
		}
		set(question, first, 1, 0)
		set(colon, first, 1, 0)
		set(question + 1, first, 1, 0)
		if (at(end_lines, colon - 1) == at(start_lines, colon + 1)) {
			set(colon + 1, question + 1, 0, 0)
		} else {
			set(colon + 1, first, 1, 0)
		}
	}
	/**
	 * @template {ArrayLike<number>} T
	 * @param {T} array
	 * @param {number} index
	 * @returns {number}
	 */
	function at(array, index) {
		return /** @type {number} */(array[index])/**/
	}
	/** @returns {import("../../private.js").IndentLine[]} */
	function build_lines() {
		/** @type {import("../../private.js").IndentLine[]} */
		const result = []
		/** @type {(string | undefined)[]} */
		const comment_expected = []
		let pointer = 0
		for (let line = 1; line <= line_starts.length; line++) {
			const start = at(line_starts, line - 1)
			const next = line < line_starts.length ? at(line_starts, line) : text.length + 1
			while (pointer < order.length && item_end(at(order, pointer)) <= start) {
				pointer++
			}
			if (pointer >= order.length) {
				break
			}
			let item = at(order, pointer)
			if (item_start(item) < start) {
				const inside = inside_line(item, line, start, comment_expected)
				if (inside) {
					result.push(inside)
					continue
				}
				if (item < 0 || tokens[item]?.type != "JSXText" || text.slice(start, item_end(item)).trim() || pointer + 1 >= order.length) {
					continue
				}
				item = at(order, pointer + 1)
			}
			if (item_start(item) >= next) {
				continue
			}
			const end = item_start(item)
			const expected = item >= 0
				? managed(item)
					? indent_of(item)
					: null
				: comment_indent(-item - 1)
			if (expected !== null) {
				const value = item < 0 && above_case(-item - 1)
					? text.slice(start, end)
					: expected
				if (item < 0) {
					comment_expected[-item - 1] = value
				}
				result.push(
					{ end, expected: value, line, start }
				)
			}
		}
		return result
	}
	/**
	 * @param {number} index
	 * @returns {string | null}
	 */
	function comment_indent(index) {
		const comment = /** @type {import("../../private.js").Comment} */(comments[index])/**/
		if (comment.type != "Block" && comment.type != "Line") {
			return null
		}
		const next = token_at(comment.range[1])
		const previous = next - 1
		if (next < count && at(case_heads, next) >= 0) {
			return indent_of(at(case_heads, next)) + unit
		}
		if (next < count && managed(next)) {
			const indent = indent_of(next)
			const open = at(matches, next)
			return closers.has(token_value(next)) && open >= 0 && at(start_lines, open) < comment.loc.start.line
				? indent + unit
				: indent
		}
		if (previous >= 0 && managed(previous)) {
			return indent_of(at(heads, previous))
		}
		return null
	}
	/**
	 * @param {number} from
	 * @param {number} to
	 * @returns {void}
	 */
	function copy(from, to) {
		bases[to] = at(bases, from)
		levels[to] = at(levels, from)
		flags[to] = at(flags, from) & ~flag_lock | flag_managed
	}
	/**
	 * @param {{ range: [number, number] }} node
	 * @returns {number}
	 */
	function first_of(node) {
		return lower_bound(
			starts,
			start => start,
			node.range[0]
		)
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} open
	 * @returns {number}
	 */
	function first_with_parens(node, open) {
		let index = first_of(node)
		while (index - 1 != open && punctuator(index - 1, "(")) {
			index--
		}
		return index
	}
	/**
	 * @param {number} token
	 * @returns {string}
	 */
	function indent_of(token) {
		stamp++
		/** @type {number[]} */
		const chain = []
		let current = token
		let value = ""
		for (;;) {
			const known = memo[current]
			if (known !== undefined) {
				value = known
				break
			}
			const flag = at(flags, current)
			if (at(stamps, current) == stamp || !(flag & flag_managed) || flag & flag_keep && at(token_firsts, current)) {
				value = physical(at(start_lines, current))
				memo[current] = value
				break
			}
			stamps[current] = stamp
			const base = at(bases, current)
			if (base < 0) {
				value = unit.repeat(at(levels, current))
				memo[current] = value
				break
			}
			if (multiline_template(base)) {
				value = physical(at(end_lines, base)) + (offsets(current, base) ? unit.repeat(at(levels, current)) : "")
				memo[current] = value
				break
			}
			const head = at(heads, current)
			if (!at(token_firsts, current) && !at(body_opens, current) && at(token_firsts, head) && at(start_lines, base) < at(start_lines, current) && tokens[current]?.type != "JSXText") {
				current = head
				continue
			}
			chain.push(current)
			current = base
		}
		for (let index = chain.length - 1; index >= 0; index--) {
			const item = at(chain, index)
			if (offsets(item, at(bases, item))) {
				value += unit.repeat(at(levels, item))
			}
			memo[item] = value
		}
		return value
	}
	/**
	 * @param {number} item
	 * @param {number} line
	 * @param {number} start
	 * @param {(string | undefined)[]} comment_expected
	 * @returns {import("../../private.js").IndentLine | null}
	 */
	function inside_line(item, line, start, comment_expected) {
		let end = start
		while (text[end] == " " || text[end] == "\t") {
			end++
		}
		if (end >= item_end(item) || "\n\r\u2028\u2029".includes(text[end] ?? "\n")) {
			return null
		}
		if (item < 0) {
			const index = -item - 1
			const comment = /** @type {import("../../private.js").Comment} */(comments[index])/**/
			if (comment.type != "Block" || text[end] != "*" || !starred(index)) {
				return null
			}
			return {
				end,
				expected: (comment_expected[index] ?? physical(comment.loc.start.line)) + " ",
				line,
				start
			}
		}
		const parent = at(jsx_parents, item)
		if (tokens[item]?.type != "JSXText" || parent < 0) {
			return null
		}
		return {
			end,
			expected: indent_of(at(heads, parent)) + unit,
			line,
			start
		}
	}
	/**
	 * @param {number} item
	 * @returns {number}
	 */
	function item_end(item) {
		return item >= 0
			? at(ends, item)
			: /** @type {import("../../private.js").Comment} */(comments[-item - 1])/**/.range[1]
	}
	/**
	 * @param {number} item
	 * @returns {number}
	 */
	function item_start(item) {
		return item >= 0
			? at(starts, item)
			: /** @type {import("../../private.js").Comment} */(comments[-item - 1])/**/.range[0]
	}
	/**
	 * @param {{ range: [number, number] }} node
	 * @returns {number}
	 */
	function last_of(node) {
		return lower_bound(
			starts,
			start => start,
			node.range[1]
		) - 1
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @returns {number}
	 */
	function list_end_line(node) {
		const last = last_of(node)
		const token = /** @type {import("eslint").AST.Token} */(tokens[last])/**/
		if (token.type != "JSXText") {
			return at(end_lines, last)
		}
		const trailing = /\s*$/.exec(token.value)?.[0] ?? ""
		return at(end_lines, last) - (trailing.match(line_break_regex)?.length ?? 0)
	}
	/**
	 * @param {number} token
	 * @returns {boolean}
	 */
	function managed(token) {
		return Boolean(
			at(flags, token) & flag_managed
		)
	}
	/** @returns {void} */
	function mark_firsts() {
		let taken = 0
		let token = 0
		let comment = 0
		while (token < count || comment < comments.length) {
			const next_comment = comments[comment]
			const is_comment = next_comment !== undefined && (token >= count || next_comment.range[0] < at(starts, token))
			const item = is_comment ? -comment - 1 : token
			const loc = is_comment
				? /** @type {import("../../private.js").Comment} */(next_comment)/**/.loc
				: /** @type {import("eslint").AST.Token} */(tokens[token])/**/.loc
			if (loc.start.line > taken && !is_comment) {
				token_firsts[token] = 1
			}
			const end_line = loc.end.line > loc.start.line && !text.slice(
				at(line_starts, loc.end.line - 1),
				item_end(item)
			).trim()
				? loc.end.line - 1
				: loc.end.line
			taken = Math.max(taken, end_line)
			order.push(item)
			if (is_comment) {
				comment++
			} else {
				token++
			}
		}
	}
	/**
	 * @param {number} token
	 * @returns {boolean}
	 */
	function multiline_template(token) {
		return tokens[token]?.type == "Template" && at(end_lines, token) > at(start_lines, token)
	}
	/**
	 * @param {number} token
	 * @param {number} base
	 * @returns {boolean}
	 */
	function offsets(token, base) {
		if (at(levels, token) <= 0) {
			return false
		}
		if (at(flags, token) & flag_force) {
			return true
		}
		const base_line = multiline_template(base) ? at(end_lines, base) : at(start_lines, base)
		if (base_line != at(start_lines, token)) {
			return true
		}
		const value = /** @type {import("eslint").AST.Token} */(tokens[token])/**/
		return value.type == "JSXText" && /^\s*?\n/.test(value.value)
	}
	/**
	 * @param {number} open
	 * @returns {string}
	 */
	function pair_of(open) {
		const value = token_value(open)
		return value == "("
			? ")"
			: value == "["
				? "]"
				: "}"
	}
	/**
	 * @param {number} line
	 * @returns {string}
	 */
	function physical(line) {
		const start = at(line_starts, line - 1)
		let end = start
		while (text[end] == " " || text[end] == "\t") {
			end++
		}
		return text.slice(start, end)
	}
	/**
	 * @param {number} position
	 * @returns {string}
	 */
	function physical_at(position) {
		let start = position
		while (start > 0 && (text[start - 1] == " " || text[start - 1] == "\t")) {
			start--
		}
		return text.slice(start, position)
	}
	/**
	 * @param {number} index
	 * @param {string} value
	 * @returns {boolean}
	 */
	function punctuator(index, value) {
		const token = tokens[index]
		return token?.type == "Punctuator" && token.value == value
	}
	/**
	 * @param {number} from
	 * @param {number} to
	 * @param {(index: number) => boolean} test
	 * @returns {number}
	 */
	function scan(from, to, test) {
		const step = from <= to ? 1 : -1
		for (let index = from; index != to && index >= 0 && index < count; index += step) {
			if (test(index)) {
				return index
			}
		}
		return -1
	}
	/**
	 * @param {number} token
	 * @param {number} base
	 * @param {number} level
	 * @param {number} flag
	 * @returns {void}
	 */
	function set(token, base, level, flag) {
		if (token < 0 || token >= count) {
			return
		}
		bases[token] = base
		levels[token] = level
		flags[token] = at(flags, token) & (flag_keep | flag_param) | flag | flag_managed
	}
	/**
	 * @param {number} from
	 * @param {number} to
	 * @param {number} base
	 * @param {number} level
	 * @param {number} flag
	 * @returns {void}
	 */
	function span(from, to, base, level, flag) {
		let index = Math.max(from, 0)
		while (index <= to && index < count) {
			set(index, base, level, flag)
			index = Math.max(
				Math.min(at(skips, index), to),
				index
			) + 1
		}
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} base
	 * @param {number} level
	 * @returns {void}
	 */
	function span_node(node, base, level) {
		span(
			first_of(node),
			last_of(node),
			base,
			level,
			0
		)
	}
	/**
	 * @param {number} index
	 * @returns {boolean}
	 */
	function starred(index) {
		const known = starred_comments[index]
		if (known !== undefined) {
			return known
		}
		const comment = /** @type {import("../../private.js").Comment} */(comments[index])/**/
		const value = comment.value.split(line_break_regex).slice(1)
			.every(
				line => /^[ \t]*(?:\*|$)/.test(line)
			)
		starred_comments[index] = value
		return value
	}
	/**
	 * @param {number} position
	 * @returns {number}
	 */
	function token_at(position) {
		return lower_bound(starts, start => start, position)
	}
	/**
	 * @param {number} index
	 * @returns {string}
	 */
	function token_value(index) {
		return tokens[index]?.value ?? ""
	}
	/**
	 * @param {import("../../private.js").IndentNode} node
	 * @param {number} parent
	 * @returns {void}
	 */
	function visit(node, parent) {
		const type = node.type
		if (type == "SvelteReactiveStatement") {
			return
		}
		if (type.startsWith("Svelte") && type != "SvelteScriptElement") {
			const record = /** @type {Record<string, unknown>} */(/** @type {unknown} */(node))/**/
			const outer = opener
			const start = first_of(node)
			if (punctuator(start, "{")) {
				opener = start
			} else if (punctuator(start, "<")) {
				opener = -1
			}
			for (const key of source_code.visitorKeys[type] ?? []) {
				const value = record[key]
				for (const child of Array.isArray(value) ? value : [ value ]) {
					if (is_node(child)) {
						if (!child.type.startsWith("Svelte")) {
							const first = first_of(child)
							roots.push(
								[
									first,
									punctuator(first - 1, "{") || opener < 0 ? first - 1 : opener
								]
							)
						}
						visit(child, -1)
					}
				}
			}
			opener = outer
			return
		}
		const first = first_of(node)
		const last = last_of(node)
		const index = entries.length
		/** @type {import("../../private.js").IndentEntry} */
		const entry = { first, inner: -1, last, node, parent }
		entries.push(entry)
		if (first <= last && at(skips, first) < last) {
			skips[first] = last
		}
		const record = /** @type {Record<string, unknown>} */(/** @type {unknown} */(node))/**/
		const keys = type == "SvelteScriptElement" ? [ "body" ] : source_code.visitorKeys[type] ?? []
		for (const key of keys) {
			const value = record[key]
			for (const child of Array.isArray(value) ? value : [ value ]) {
				if (is_node(child)) {
					const child_index = entries.length
					visit(child, index)
					const child_entry = entries[child_index]
					if (child_entry && child_entry.first == first && child_entry.last > entry.inner) {
						entry.inner = child_entry.last
					}
				}
			}
		}
	}
}
/**
 * @param {import("eslint").SourceCode} source_code
 * @param {import("../../private.js").IndentSettings} settings
 * @returns {import("../../private.js").IndentModel}
 */
function get_indent_model(source_code, settings) {
	let models = cache.get(source_code)
	if (!models) {
		models = new Map()
		cache.set(source_code, models)
	}
	const key = `${settings.unit}|${settings.switch_case}|${settings.operator}`
	let model = models.get(key)
	if (!model) {
		model = build_model(source_code, settings)
		models.set(key, model)
	}
	return model
}
/**
 * @param {unknown} value
 * @returns {value is import("../../private.js").IndentNode}
 */
function is_node(value) {
	return typeof value == "object" && value !== null && "type" in value && "range" in value
}
/**
 * @param {import("eslint").Rule.RuleContext["options"]} options
 * @returns {import("../../private.js").IndentSettings}
 */
function read_indent_options(options) {
	/** @type {number | "tab" | undefined} */
	const size = options[0]
	/** @type {{ SwitchCase?: number, binaryOperator?: number } | undefined} */
	const settings = options[1]
	return {
		operator: settings?.binaryOperator ?? 1,
		switch_case: settings?.SwitchCase ?? 1,
		unit: size === undefined || size == "tab" ? "\t" : " ".repeat(size)
	}
}
export {
	get_indent_model,
	read_indent_options
}
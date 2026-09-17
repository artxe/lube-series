import { create_source_text } from "../utils/source_text.js"
const not_static = Symbol("not static")
const portable_flags_regex = /^[gimsuy]*$/
const regexp_group_name_regex = /\(\?<([^!=>]+)>/g
const regexp_modifier_regex = /\(\?[-A-Za-z]/
const constant_globals = new Set(
	[ "Infinity", "NaN", "undefined" ]
)
const pass_through_parents = new Set(
	[
		"ArrayExpression",
		"ConditionalExpression",
		"JSXExpressionContainer",
		"LogicalExpression",
		"SequenceExpression"
	]
)
const test_functions = new Set([ "describe", "it", "test" ])
const type_wrappers = new Set(
	[
		"TSAsExpression",
		"TSNonNullExpression",
		"TSSatisfiesExpression",
		"TSTypeAssertion"
	]
)
const safe_constructors = new Set(
	[
		"Array",
		"ArrayBuffer",
		"BigInt64Array",
		"BigUint64Array",
		"DataView",
		"Date",
		"Error",
		"EvalError",
		"Float32Array",
		"Float64Array",
		"Int16Array",
		"Int32Array",
		"Int8Array",
		"Map",
		"RangeError",
		"ReferenceError",
		"RegExp",
		"Set",
		"SyntaxError",
		"TypeError",
		"URIError",
		"URL",
		"Uint16Array",
		"Uint32Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"WeakMap",
		"WeakSet"
	]
)
const closers = new Set([ ")", "]", "}" ])
const member_separators = new Set([ ",", ";" ])
const shebang_types = new Set([ "Hashbang", "Shebang" ])
/**
 * @param {import("../../private.js").OrderEntry} a
 * @param {import("../../private.js").OrderEntry} b
 * @returns {number}
 */
function compare(a, b) {
	const rank = (a.rank ?? 1) - (b.rank ?? 1)
	if (rank) return rank
	return a.name < b.name
		? -1
		: a.name > b.name
			? 1
			: 0
}
/**
 * @param {import("../../private.js").Comment[]} comments
 * @param {number} line
 * @returns {number}
 */
function count_same_line(comments, line) {
	let count = 0
	for (const comment of comments) {
		if (comment.loc.start.line != line) break
		line = comment.loc.end.line
		count++
	}
	return count
}
/**
 * @param {import("eslint").Rule.RuleContext} context
 */
function create_reorder(context) {
	const source_code = context.sourceCode
	const source = create_source_text(source_code)
	const text = source.text
	/**
	 * @param {import("../../private.js").OrderEntry} entry
	 * @param {import("../../private.js").OrderLayout} layout
	 * @param {((node: import("../../private.js").OrderNode) => number)=} get_level
	 * @returns {import("../../private.js").OrderItem | undefined}
	 */
	function get_item(entry, layout, get_level) {
		const first_token = /** @type {import("eslint").AST.Token} */(source_code.getFirstToken(
			/** @type {import("estree").Node} */(entry.first)/**/
		))/**/
		const before = source_code.getTokenBefore(first_token)
		const leading = /** @type {import("../../private.js").Comment[]} */(source_code.getCommentsBefore(first_token))/**/.filter(
			comment => !shebang_types.has(comment.type)
		)
		const head = before ? count_same_line(leading, before.loc.end.line) : 0
		const start = leading[head]?.range[0] ?? first_token.range[0]
		let last_token = /** @type {import("eslint").AST.Token} */(source_code.getLastToken(
			/** @type {import("estree").Node} */(entry.last)/**/
		))/**/
		/** @type {import("eslint").AST.Token | null} */
		let separator = null
		if (layout == "member" && member_separators.has(last_token.value)) {
			separator = last_token
			last_token = /** @type {import("eslint").AST.Token} */(source_code.getTokenBefore(last_token))/**/
		} else if (layout == "sequence") {
			const next = source_code.getTokenAfter(last_token)
			if (next?.value == ",") separator = next
		}
		const inner = /** @type {import("../../private.js").Comment[]} */(source_code.getCommentsAfter(last_token))/**/
		let code_end = last_token.range[1]
		let line = last_token.loc.end.line
		/** @type {import("../../private.js").Comment[]} */
		let tail
		if (separator) {
			if (inner.some(
				comment => comment.type == "Line"
			)) return undefined
			code_end = inner[inner.length - 1]?.range[1] ?? code_end
			line = separator.loc.end.line
			tail = /** @type {import("../../private.js").Comment[]} */(source_code.getCommentsAfter(separator))/**/
		} else {
			let index = 0
			for (let comment = inner[0]; comment?.type == "Block" && comment.range[0] == code_end; comment = inner[++index]) {
				code_end = comment.range[1]
				line = comment.loc.end.line
			}
			tail = inner.slice(index)
		}
		const sep_end = separator ? separator.range[1] : code_end
		const tail_count = count_same_line(tail, line)
		const last_comment = tail[tail_count - 1]
		const after = last_comment ? last_comment.range[1] : sep_end
		let next = after
		while (text[next] == " " || text[next] == "\t") next++
		let previous = start
		while (text[previous - 1] == " " || text[previous - 1] == "\t") previous--
		const declaration = entry.last.type == "ExportNamedDeclaration"
			? entry.last.declaration
			: entry.last
		return {
			after,
			break_after: next == text.length || text[next] == "\n" || text[next] == "\r",
			break_before: previous == 0 || text[previous - 1] == "\n" || text[previous - 1] == "\r",
			closes: closers.has(text[next] ?? ""),
			code_end,
			entry,
			head: head > 0,
			header: !before && leading.length > 0,
			leading: start < first_token.range[0],
			level: get_level ? get_level(entry.first) : 0,
			semicolon: last_token.value == ";",
			sep_end,
			start,
			tail_line: last_comment?.type == "Line",
			tail_start: tail[0] && last_comment ? tail[0].range[0] : after,
			terminated: last_token.value == ";" || declaration?.type == "FunctionDeclaration"
		}
	}
	/**
	 * @param {import("../../private.js").OrderEntry[]} entries
	 * @param {import("../../private.js").OrderLayout} layout
	 * @param {import("../../private.js").OrderEntry} reported
	 * @param {((node: import("../../private.js").OrderNode) => number)=} get_level
	 * @returns {{ range: [number, number], text: string } | import("../../private.js").OrderItem | null}
	 */
	function get_replacement(entries, layout, reported, get_level) {
		/** @type {import("../../private.js").OrderItem[]} */
		const items = []
		for (const entry of entries) {
			const item = get_item(entry, layout, get_level)
			if (!item) return null
			items.push(item)
		}
		const sorted = items.slice().sort(
			(a, b) => compare(a.entry, b.entry)
		)
		const blocker = find_blocker(items, sorted, reported)
		if (blocker) return blocker
		const last_index = items.length - 1
		let result = ""
		for (let i = 0; i <= last_index; i++) {
			const slot = /** @type {import("../../private.js").OrderItem} */(items[i])/**/
			const item = /** @type {import("../../private.js").OrderItem} */(sorted[i])/**/
			const has_tail = item.tail_start < item.after
			if (
				item.leading && !slot.break_before
				|| i == 0 && slot.head && !slot.break_before
				|| slot.header && item != slot
				|| slot.tail_start < slot.after && !slot.break_after && (i < last_index || !slot.closes)
				|| has_tail && !slot.break_after && (i < last_index || item.tail_line)
				|| layout == "statement" && i < last_index && !item.terminated && !slot.break_after
			) return null
			result += source.render(item.start, item.code_end) + source.render(slot.code_end, slot.sep_end)
			if (has_tail) result += " " + source.render(item.tail_start, item.after)
			if (i < last_index) {
				result += source.render(
					slot.after,
					/** @type {import("../../private.js").OrderItem} */(items[i + 1])/**/.start
				)
			}
		}
		const first = /** @type {import("../../private.js").OrderItem} */(items[0])/**/
		const last = /** @type {import("../../private.js").OrderItem} */(items[last_index])/**/
		if (last.semicolon && !(/** @type {import("../../private.js").OrderItem} */(sorted[last_index])/**/).semicolon) return null
		source.edit(first.start, last.after, result)
		return {
			range: [ first.start, last.after ],
			text: result
		}
	}
	/**
	 * @param {import("../../private.js").OrderNode} node
	 * @returns {string}
	 */
	function get_snippet(node) {
		const value = node.type == "Property"
			? node.computed && node.key.type != "Literal"
				? node.key
				: node.value
			: node
		const snippet = source_code.getText(
			/** @type {import("estree").Node} */(value)/**/
		).replace(/\s+/g, " ")
		return snippet.length > 30 ? snippet.slice(0, 29) + "…" : snippet
	}
	/**
	 * @param {import("../../private.js").OrderEntry[]} entries
	 * @param {string} message_id
	 * @param {import("../../private.js").OrderLayout} layout
	 * @param {((node: import("../../private.js").OrderNode) => number)=} get_level
	 * @returns {void}
	 */
	function verify(
		entries,
		message_id,
		layout,
		get_level
	) {
		const index = entries.findIndex(
			(entry, i) => i > 0 && compare(
				/** @type {import("../../private.js").OrderEntry} */(entries[i - 1])/**/,
				entry
			) > 0
		)
		const entry = entries[index]
		const previous = entries[index - 1]
		if (!entry || !previous) return
		const replacement = get_replacement(entries, layout, entry, get_level)
		const fix = replacement && "range" in replacement ? replacement : null
		const blocker = replacement && "entry" in replacement ? replacement : null
		context.report(
			{
				data: {
					name: entry.name,
					previous: previous.name,
					reason: fix
						? ""
						: blocker
							? "; it is not fixed automatically because moving `" + get_snippet(blocker.entry.first) + "` could change the order of side effects, so reorder it by hand"
							: "; it is not fixed automatically because a comment or statement next to it would end up in the wrong place, so reorder it by hand"
				},
				fix: fix && (
					fixer => fixer.replaceTextRange(fix.range, fix.text)
				),
				messageId: message_id,
				node: entry.report
			}
		)
	}
	return { verify }
}
/**
 * @param {import("../../private.js").OrderItem[]} items
 * @param {import("../../private.js").OrderItem[]} sorted
 * @param {import("../../private.js").OrderEntry} reported
 * @returns {import("../../private.js").OrderItem | undefined}
 */
function find_blocker(items, sorted, reported) {
	const positions = new Map(
		sorted.map((item, i) => [ item, i ])
	)
	const blockers = items.filter(
		(a, i) => a.level > 1 && items.some(
			(b, j) => b.level && i != j && i < j != /** @type {number} */(positions.get(a))/**/ < /** @type {number} */(positions.get(b))/**/
		)
	)
	return blockers.find(
		blocker => blocker.entry == reported
	) ?? blockers[0]
}
/**
 * @param {import("../../private.js").OrderNode} node
 * @returns {string | undefined}
 */
function get_name(node) {
	switch (node.type) {
	case "Identifier":
		return node.name
	case "Literal":
		return String(node.value)
	case "TemplateLiteral":
		return node.expressions.length
			? undefined
			: /** @type {import("estree").TemplateElement} */(node.quasis[0])/**/.value.cooked ?? undefined
	}
	return undefined
}
/**
 * @param {unknown} value
 * @returns {boolean}
 */
function is_large(value) {
	if (typeof value == "object" && value) {
		return !Array.isArray(value) && Object.values(value).some(
			property => typeof property == "object" && property || is_large(property)
		)
	}
	return Number(value) > 65536
}
/**
 * @param {unknown[]} args
 * @returns {boolean}
 */
function is_portable_regexp(args) {
	const [ pattern, flags ] = args
	const source = pattern instanceof RegExp ? pattern.source : pattern
	const flag_text = flags === undefined && pattern instanceof RegExp ? pattern.flags : flags
	if (typeof source != "string" && source !== undefined || typeof flag_text != "string" && flag_text !== undefined) return false
	if (flag_text && !portable_flags_regex.test(flag_text) || source && regexp_modifier_regex.test(source)) return false
	/** @type {Set<string>} */
	const names = new Set()
	for (const match of source?.matchAll(regexp_group_name_regex) ?? []) {
		const name = /** @type {string} */(match[1])/**/
		if (names.has(name)) return false
		names.add(name)
	}
	return true
}
/**
 * @param {import("../../private.js").OrderNode} parent
 * @param {import("../../private.js").OrderNode} child
 * @returns {boolean}
 */
function passes_through(parent, child) {
	switch (parent.type) {
	case "BinaryExpression":
		return parent.operator == "===" || parent.operator == "!=="
	case "Property":
		return parent.value == child
	case "UnaryExpression":
		return parent.operator == "!" || parent.operator == "typeof" || parent.operator == "void"
	}
	return pass_through_parents.has(parent.type)
}
/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["ascii-order"]} */
		const option = context.options[0]
		const check_declarations = option?.checkDeclarations ?? true
		const check_imports = option?.checkImports ?? true
		const check_keys = option?.checkKeys ?? true
		const check_names = option?.checkNames ?? true
		const check_tests = option?.checkTests ?? true
		const visitor_keys = context.sourceCode.visitorKeys
		const { verify } = create_reorder(context)
		/** @type {Set<string | undefined>} */
		const default_exports = new Set()
		/** @type {Parameters<typeof verify>[]} */
		const pending = []
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {number}
		 */
		function classify(node) {
			switch (node.type) {
			case "ArrowFunctionExpression":
			case "FunctionExpression":
				return 0
			case "AssignmentExpression":
			case "AwaitExpression":
			case "CallExpression":
			case "ClassExpression":
			case "ImportExpression":
			case "TaggedTemplateExpression":
			case "UpdateExpression":
			case "YieldExpression":
				return 2
			case "Identifier":
				return is_constant_reference(node) ? 0 : 1
			case "ThisExpression":
				return 1
			case "NewExpression":
				return is_safe_construction(node) ? 1 : 2
			case "Property":
				return node.computed
					? Math.max(
						classify(node.key),
						classify(node.value)
					)
					: classify(node.value)
			case "TSAsExpression":
			case "TSNonNullExpression":
			case "TSSatisfiesExpression":
			case "TSTypeAssertion":
				return classify(node.expression)
			case "UnaryExpression":
				if (node.operator == "delete") return 2
				break
			}
			let level = 0
			some_child(
				node,
				child => {
					level = Math.max(level, classify(child))
					return level == 2
				}
			)
			return level
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {number}
		 */
		function classify_pattern(node) {
			return node.type == "MemberExpression" || node.type == "AssignmentPattern" && classify(node.right) || some_child(
				node,
				child => classify_pattern(child) == 2
			)
				? 2
				: 1
		}
		/**
		 * @param {import("estree").Program} program
		 * @returns {void}
		 */
		function collect_default_exports(program) {
			for (const statement of program.body) {
				if (statement.type == "ExportDefaultDeclaration" && statement.declaration.type == "Identifier") {
					default_exports.add(statement.declaration.name)
				} else if (statement.type == "ExportNamedDeclaration" && !statement.source) {
					for (const specifier of statement.specifiers) {
						if (get_name(specifier.exported) == "default") default_exports.add(get_name(specifier.local))
					}
				}
			}
		}
		/**
		 * @param {import("../../private.js").OrderNode | null} node
		 * @param {string[]} names
		 * @returns {string[]}
		 */
		function collect_targets(node, names) {
			switch (node?.type) {
			case "ArrayPattern":
				for (const element of node.elements) collect_targets(element, names)
				break
			case "AssignmentPattern":
				collect_targets(node.left, names)
				break
			case "Identifier":
				names.push(node.name)
				break
			case "ObjectPattern":
				for (const property of node.properties) collect_targets(property, names)
				break
			case "Property":
				collect_targets(node.value, names)
				break
			case "RestElement":
				collect_targets(node.argument, names)
				break
			}
			return names
		}
		/**
		 * @param {import("estree").NewExpression} node
		 * @returns {unknown}
		 */
		function construct(node) {
			const callee = node.callee
			if (callee.type != "Identifier" || !safe_constructors.has(callee.name) || !is_global(callee)) return not_static
			const args = node.arguments.map(static_value)
			if (
				args.includes(not_static)
				|| (callee.name.includes("Array") || callee.name == "DataView") && args.some(is_large)
				|| callee.name == "RegExp" && !is_portable_regexp(args)
			) return not_static
			try {
				return new (/** @type {new (...values: unknown[]) => unknown} */(/** @type {Record<string, unknown>} */(/** @type {unknown} */(globalThis))/**/[callee.name])/**/)(...args)
			} catch {
				return not_static
			}
		}
		/**
		 * @param {Parameters<typeof verify>} check
		 * @returns {void}
		 */
		function defer(...check) {
			pending.push(check)
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {number}
		 */
		function get_condition_rank(node) {
			const name = get_key_name(node)
			return name == "types"
				? 0
				: name == "default"
					? 2
					: 1
		}
		/**
		 * @param {import("../../private.js").OrderNode} statement
		 * @returns {import("estree").Identifier | null | undefined}
		 */
		function get_function_id(statement) {
			const node = statement.type == "ExportNamedDeclaration" ? statement.declaration : statement
			return node?.type == "FunctionDeclaration" || node?.type == "TSDeclareFunction"
				? node.id
				: undefined
		}
		/**
		 * @param {import("../../private.js").OrderNode} statement
		 * @returns {import("estree").Literal | undefined}
		 */
		function get_import_source(statement) {
			return statement.type == "ImportDeclaration" && statement.specifiers.length
				? statement.source
				: undefined
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {string | undefined}
		 */
		function get_key_name(node) {
			const type = node.type
			if (type != "Property" && type != "TSMethodSignature" && type != "TSPropertySignature") return undefined
			return node.computed && node.key.type != "Literal" ? undefined : get_name(node.key)
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {string | undefined}
		 */
		function get_specifier_name(node) {
			if (node.type == "ImportSpecifier") return get_name(node.imported)
			return node.type == "ExportSpecifier" ? get_name(node.local) : undefined
		}
		/**
		 * @param {import("../../private.js").OrderNode} statement
		 * @returns {import("estree").Literal | import("estree").TemplateLiteral | undefined}
		 */
		function get_test_title(statement) {
			const call = statement.type == "ExpressionStatement" ? statement.expression : undefined
			if (call?.type != "CallExpression") return undefined
			let callee = call.callee
			while (callee.type == "MemberExpression" && !callee.computed) callee = callee.object
			const title = call.arguments[0]
			if (callee.type != "Identifier" || !test_functions.has(callee.name)) return undefined
			return title?.type == "Literal" && typeof title.value == "string" || title?.type == "TemplateLiteral"
				? title
				: undefined
		}
		/**
		 * @param {import("estree").Identifier} node
		 * @returns {boolean}
		 */
		function is_constant_binding(node) {
			const scope = context.sourceCode.getScope(node)
			const variable = scope.references.find(
				reference => reference.identifier == node
			)?.resolved
			if (!variable?.defs.length) return constant_globals.has(node.name) && is_global(node)
			if (variable.defs.length > 1) return false
			const def = /** @type {import("eslint").Scope.Definition} */(variable.defs[0])/**/
			switch (def.type) {
			case "ClassName":
				return variable.references.every(
					reference => !reference.isWrite()
				) && is_initialized_before(node, scope, variable, def.node)
			case "FunctionName":
				return variable.references.every(
					reference => !reference.isWrite()
				)
			case "ImportBinding":
				return def.node.type == "ImportNamespaceSpecifier"
			case "Variable":
				return def.parent.kind == "const" && is_initialized_before(node, scope, variable, def.node)
			}
			return false
		}
		/**
		 * @param {import("estree").Identifier} node
		 * @returns {boolean}
		 */
		function is_constant_reference(node) {
			/** @type {import("../../private.js").OrderNode} */
			let child = node
			/** @type {import("../../private.js").OrderNode | null} */
			let parent = /** @type {import("eslint").Rule.Node} */(node)/**/.parent
			while (parent && type_wrappers.has(parent.type)) {
				child = parent
				parent = /** @type {import("eslint").Rule.Node} */(/** @type {unknown} */(parent))/**/.parent
			}
			return !!parent && passes_through(parent, child) && is_constant_binding(node)
		}
		/**
		 * @param {import("estree").Identifier} node
		 * @returns {boolean}
		 */
		function is_global(node) {
			let scope = context.sourceCode.getScope(node)
			while (scope.upper && !scope.set.has(node.name)) scope = scope.upper
			return !scope.set.get(node.name)?.defs.length
		}
		/**
		 * @param {import("estree").Identifier} node
		 * @param {import("eslint").Scope.Scope} scope
		 * @param {import("eslint").Scope.Variable} variable
		 * @param {import("estree").Node} declaration
		 * @returns {boolean}
		 */
		function is_initialized_before(node, scope, variable, declaration) {
			const parent = /** @type {import("eslint").Rule.Node} */(declaration)/**/.parent
			if (
				parent?.type == "SwitchCase"
				|| parent?.parent?.type == "SwitchCase"
				|| /** @type {[number, number]} */(node.range)/**/[0] < /** @type {[number, number]} */(declaration.range)/**/[1]
			) return false
			for (let current = /** @type {import("eslint").Scope.Scope | null} */(scope)/**/; current && current != variable.scope; current = current.upper) {
				if (current.block.type == "FunctionDeclaration") return false
			}
			return true
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {boolean}
		 */
		function is_package_condition(node) {
			if (!/(?:^|[/\\])package\.json$/.test(context.filename)) return false
			let parent = /** @type {import("eslint").Rule.Node} */(node)/**/.parent
			while (parent && parent.type != "Program") {
				const name = get_key_name(parent)
				if (name == "exports" || name == "imports") return true
				parent = parent.parent
			}
			return false
		}
		/**
		 * @param {import("estree").NewExpression} node
		 * @returns {boolean}
		 */
		function is_safe_construction(node) {
			return construct(node) !== not_static
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @param {(child: import("../../private.js").OrderNode) => boolean} predicate
		 * @returns {boolean}
		 */
		function some_child(node, predicate) {
			for (const key of visitor_keys[node.type] ?? []) {
				const value = /** @type {Record<string, import("../../private.js").OrderNode | import("../../private.js").OrderNode[] | null | undefined>} */(/** @type {unknown} */(node))/**/[key]
				for (const child of Array.isArray(value) ? value : [ value ]) {
					if (child?.type && predicate(child)) return true
				}
			}
			return false
		}
		/**
		 * @param {import("../../private.js").OrderNode} node
		 * @returns {unknown}
		 */
		function static_value(node) {
			switch (node.type) {
			case "ArrayExpression": {
				const values = node.elements.map(
					element => element ? static_value(element) : undefined
				)
				return values.includes(not_static) ? not_static : values
			}
			case "Identifier":
				return constant_globals.has(node.name) && is_global(node)
					? /** @type {Record<string, unknown>} */(/** @type {unknown} */(globalThis))/**/[node.name]
					: not_static
			case "Literal":
				return "regex" in node && node.value === null ? not_static : node.value
			case "NewExpression":
				return construct(node)
			case "ObjectExpression": {
				/** @type {Record<string, unknown>} */
				const object = {}
				for (const property of node.properties) {
					if (property.type != "Property" || property.kind != "init" || property.computed || property.shorthand) return not_static
					const value = static_value(property.value)
					if (value === not_static) return not_static
					object[String(get_name(property.key))] = value
				}
				return object
			}
			case "TSAsExpression":
			case "TSSatisfiesExpression":
				return static_value(node.expression)
			case "TemplateLiteral":
				return node.expressions.length ? not_static : node.quasis[0]?.value.cooked
			case "UnaryExpression":
				return node.operator == "-" && node.argument.type == "Literal"
					? -(/** @type {number} */(node.argument.value)/**/)
					: not_static
			}
			return not_static
		}
		/**
		 * @param {import("../../private.js").OrderNode[]} nodes
		 * @param {(node: import("../../private.js").OrderNode) => string | undefined} get_node_name
		 * @param {"conditions" | "keys" | "names"} message_id
		 * @param {import("../../private.js").OrderLayout} layout
		 * @param {((node: import("../../private.js").OrderNode) => number)=} get_level
		 * @param {((node: import("../../private.js").OrderNode) => number)=} get_rank
		 * @returns {void}
		 */
		function verify_nodes(
			nodes,
			get_node_name,
			message_id,
			layout,
			get_level,
			get_rank
		) {
			/** @type {import("../../private.js").OrderEntry[]} */
			let entries = []
			for (const node of [ ...nodes, null ]) {
				const name = node && get_node_name(node)
				if (name != null) {
					entries.push(
						{
							first: /** @type {import("../../private.js").OrderNode} */(node)/**/,
							last: /** @type {import("../../private.js").OrderNode} */(node)/**/,
							name,
							rank: get_rank?.(
								/** @type {import("../../private.js").OrderNode} */(node)/**/
							),
							report: (/** @type {import("../../private.js").OrderNode & { key?: import("../../private.js").OrderNode }} */(node)/**/).key ?? /** @type {import("../../private.js").OrderNode} */(node)/**/
						}
					)
				} else {
					if (entries.length > 1) defer(
						entries,
						message_id,
						layout,
						get_level
					)
					entries = []
				}
			}
		}
		/**
		 * @param {import("../../private.js").OrderNode & { type: "BlockStatement" | "Program" | "StaticBlock" | "TSModuleBlock" }} node
		 * @returns {void}
		 */
		function verify_statements(node) {
			if (!check_declarations && !check_imports && !check_tests) return
			/** @type {import("../../private.js").OrderEntry[]} */
			let entries = []
			/** @type {"declarations" | "imports" | "tests" | undefined} */
			let kind
			for (const statement of [ ...node.body, null ]) {
				let id = statement && check_declarations ? get_function_id(statement) : undefined
				if (node.type == "Program" && default_exports.has(id?.name)) id = undefined
				const source = statement && check_imports ? get_import_source(statement) : undefined
				const title = statement && check_tests && !id ? get_test_title(statement) : undefined
				const report = id ?? source ?? title
				const name = report && get_name(report)
				const next_kind = name == null
					? undefined
					: id
						? "declarations"
						: source
							? "imports"
							: "tests"
				const last = entries[entries.length - 1]
				if (id && last && kind == next_kind && last.name == name) {
					last.last = /** @type {import("../../private.js").OrderNode} */(statement)/**/
					continue
				}
				if (kind != next_kind) {
					if (kind && entries.length > 1) defer(entries, kind, "statement")
					entries = []
					kind = next_kind
				}
				if (name != null) {
					entries.push(
						{
							first: /** @type {import("../../private.js").OrderNode} */(statement)/**/,
							last: /** @type {import("../../private.js").OrderNode} */(statement)/**/,
							name,
							report: /** @type {import("../../private.js").OrderNode} */(report)/**/
						}
					)
				}
			}
		}
		/** @type {import("../../private.js").OrderRuleListener} */
		const listener = {
			BlockStatement: verify_statements,
			ExportNamedDeclaration: node => {
				if (check_names) verify_nodes(
					node.specifiers,
					get_specifier_name,
					"names",
					"sequence"
				)
			},
			ImportDeclaration: node => {
				if (check_names) verify_nodes(
					node.specifiers,
					get_specifier_name,
					"names",
					"sequence"
				)
			},
			ObjectExpression: node => {
				if (!check_keys) return
				const condition = is_package_condition(node)
				verify_nodes(
					node.properties,
					get_key_name,
					condition ? "conditions" : "keys",
					"sequence",
					classify,
					condition ? get_condition_rank : undefined
				)
			},
			ObjectPattern: node => {
				if (check_keys) {
					/** @type {Map<import("../../private.js").OrderNode, string[]>} */
					const targets = new Map()
					/** @type {Set<string>} */
					const seen = new Set()
					/** @type {Set<string>} */
					const repeated = new Set()
					for (const property of node.properties) {
						const names = collect_targets(property, [])
						for (const name of new Set(names)) {
							if (seen.has(name)) repeated.add(name)
							seen.add(name)
						}
						targets.set(property, names)
					}
					verify_nodes(
						node.properties,
						get_key_name,
						"keys",
						"sequence",
						property => targets.get(property)?.some(name => repeated.has(name))
							? 2
							: classify_pattern(property)
					)
				}
			},
			Program: node => {
				collect_default_exports(node)
				verify_statements(node)
			},
			"Program:exit": () => {
				for (let i = pending.length - 1; i >= 0; i--) {
					verify(
						.../** @type {Parameters<typeof verify>} */(pending[i])/**/
					)
				}
			},
			StaticBlock: verify_statements,
			TSInterfaceBody: node => {
				if (check_keys) verify_nodes(
					node.body,
					get_key_name,
					"keys",
					"member"
				)
			},
			TSModuleBlock: verify_statements,
			TSTypeLiteral: node => {
				if (check_keys) verify_nodes(
					node.members,
					get_key_name,
					"keys",
					"member"
				)
			}
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
	},
	meta: {
		docs: {
			description: "Enforces ASCII order of import statements, import and export names, object keys, function declarations and test cases.",
			recommended: true,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/ascii-order.md"
		},
		fixable: "code",
		messages: {
			conditions: "Move condition \"{{name}}\" before \"{{previous}}\" to keep \"types\" first, \"default\" last and the others in ASCII order{{reason}}",
			declarations: "Move function \"{{name}}\" before \"{{previous}}\" to keep functions in ASCII order{{reason}}",
			imports: "Move the import of \"{{name}}\" before \"{{previous}}\" to keep imports in ASCII order{{reason}}",
			keys: "Move key \"{{name}}\" before \"{{previous}}\" to keep keys in ASCII order{{reason}}",
			names: "Move \"{{name}}\" before \"{{previous}}\" to keep names in ASCII order{{reason}}",
			tests: "Move test \"{{name}}\" before \"{{previous}}\" to keep tests in ASCII order{{reason}}"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					checkDeclarations: { default: true, type: "boolean" },
					checkImports: { default: true, type: "boolean" },
					checkKeys: { default: true, type: "boolean" },
					checkNames: { default: true, type: "boolean" },
					checkTests: { default: true, type: "boolean" }
				},
				type: "object"
			}
		],
		type: "suggestion"
	}
}
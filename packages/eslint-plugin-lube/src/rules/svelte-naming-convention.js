/** @type {import("eslint").Rule.RuleModule} */
export default {
	create(context) {
		/** @type {import("../../private.js").RuleOptions["svelte-naming-convention"]} */
		const option = context.options[0]
		const fix_same_names = option?.fixSameNames ?? true
		const source = context.sourceCode
		const function_types = new Set(
			[
				"ArrowFunctionExpression",
				"FunctionDeclaration",
				"FunctionExpression",
				"TSDeclareFunction",
				"TSEmptyBodyFunctionExpression"
			]
		)
		const jsdoc_param_regex = /@(?:arg|argument|param)(?![\w$])/g
		const lowercase_regex = /^[a-z]/
		const space_regex = /\s/
		const store_regex = /^\$[^$]/
		const svelte_expression_parents = new Set(
			[
				"SvelteAwaitBlock",
				"SvelteEachBlock",
				"SvelteIfBlock",
				"SvelteKeyBlock"
			]
		)
		const svelte_usage_parents = new Set(
			[
				"SvelteDebugTag",
				"SvelteMustacheTag",
				"SvelteSpecialDirective",
				"SvelteSpreadAttribute",
				"SvelteStyleDirective"
			]
		)
		const word_character_regex = /[\w$]/
		const allow_regex = /^[_$]?[_$]?(?:[\da-z]+(?:_[\da-z]+)*\$?\$?)?$|^[A-Z](?:_?[\dA-Z]+)*$|^(?:[\dA-Z][\da-z]*)+$/
		const camel_case_regex = /^[\da-z]+([A-Z][\da-z]*)*$/
		const fix_regex = /([\da-z]?)([A-Z][\dA-Z]*)/g
		const fixable_name_regex = /^[_$]?[_$]?(?:[\dA-Za-z]+(?:_[\dA-Za-z]+)*\$?\$?)?$/
		/** @type {Set<string>} */
		const blocked = new Set()
		const is_svelte = !!(/** @type {{ isSvelte?: boolean } | undefined} */(source.parserServices)/**/)?.isSvelte
		/** @type {Map<string, import("../../private.js").NamingIdentifier[]>} */
		const store_usages = new Map()
		/** @type {Set<import("../../private.js").NamingIdentifier>} */
		const svelte_shorthands = new Set()
		/** @type {Map<string, (import("../../private.js").AstNode & import("estree").Identifier)[]>} */
		const declarations = new Map()
		/** @type {Set<import("../../private.js").AstNode>} */
		const default_exports = new Set()
		/** @type {Map<string, (import("../../private.js").AstNode & import("estree").Identifier)[]>} */
		const export_locals = new Map()
		/** @type {Set<import("../../private.js").AstNode>} */
		const export_shorthands = new Set()
		/** @type {Set<import("../../private.js").AstNode>} */
		const import_shorthands = new Set()
		/** @type {Set<import("../../private.js").AstNode & import("estree").Identifier>} */
		const jsx_objects = new Set()
		/** @type {Set<import("../../private.js").AstNode>} */
		const shorthand_properties = new Set()
		/** @type {Map<string, (import("../../private.js").AstNode & import("estree").Identifier)[]>} */
		const usages = new Map()
		/** @type {Set<import("../../private.js").AstNode>} */
		const visited = new Set()
		/** @type {import("../../private.js").DisableDirective[] | undefined} */
		let disable_directives
		/**
		 * @param {Map<string, (import("../../private.js").AstNode & import("estree").Identifier)[]>} map
		 * @param {import("../../private.js").AstNode & import("estree").Identifier} node
		 * @returns {void}
		 */
		function add(map, node) {
			const nodes = map.get(node.name)
			if (nodes) nodes.push(node)
			else map.set(node.name, [ node ])
		}
		/**
		 * @param {import("../../private.js").Comment} comment
		 * @param {string} name
		 * @param {boolean} names_params
		 * @returns {import("../../private.js").RenameEdit[]}
		 */
		function comment_edits(comment, name, names_params) {
			if (comment.type != "Block" || !comment.value.startsWith("*")) return []
			const text = comment.value
			const start = comment.range[0] + 2
			const fixed_name = to_snake_case(name)
			const escaped = name.replace(/\$/g, "\\$")
			/** @type {import("../../private.js").RenameEdit[]} */
			const edits = []
			for (const match of text.matchAll(
				RegExp(
					`(?<=(?:asserts|typeof)\\s+)${escaped}(?![\\w$])|(?<![\\w$.])${escaped}(?=\\s+is(?![\\w$]))`,
					"g"
				)
			)) {
				if (!in_braces(text, match.index)) continue
				edits.push(
					{
						range: [
							start + match.index,
							start + match.index + name.length
						],
						text: fixed_name
					}
				)
			}
			if (!names_params) return edits
			for (const match of text.matchAll(jsdoc_param_regex)) {
				let index = skip_space(
					text,
					match.index + match[0].length
				)
				if (text[index] == "{") {
					for (let depth = 0; index < text.length; index++) {
						if (text[index] == "{") depth++
						else if (text[index] == "}" && !--depth) break
					}
					index = skip_space(text, index + 1)
				}
				if (text[index] == "[") index = skip_space(text, index + 1)
				if (text.startsWith(name, index) && !word_character_regex.test(
					text[index + name.length] ?? ""
				)) {
					edits.push(
						{
							range: [
								start + index,
								start + index + name.length
							],
							text: fixed_name
						}
					)
				}
			}
			return edits
		}
		/**
		 * @param {import("../../private.js").NamingIdentifier} node
		 * @param {Map<import("../../private.js").AstNode, import("eslint").Scope.Variable | null>} resolution
		 * @returns {import("../../private.js").RenameEdit[]}
		 */
		function declaration_edits(node, resolution) {
			/** @type {import("../../private.js").RenameEdit[]} */
			const edits = [ rename_edit(node) ]
			const block = /** @type {import("../../private.js").AstNode | undefined} */(resolution.get(node)?.scope.block)/**/
			const func = function_of_param(node)
			const leading = func && leading_comment(func)
			/** @type {Set<import("../../private.js").Comment>} */
			const comments = new Set(
				block
					? /** @type {import("../../private.js").Comment[]} */(source.getAllComments())/**/.filter(
						comment => block.type == "Program" || comment.range[0] >= block.range[0] && comment.range[1] <= block.range[1]
					)
					: []
			)
			if (leading) comments.add(leading)
			for (const comment of comments) edits.push(
				...comment_edits(
					comment,
					node.name,
					comment == leading
				)
			)
			return edits
		}
		/**
		 * @param {import("../../private.js").AstNode & import("estree").Identifier} node
		 * @returns {void}
		 */
		function declare(node) {
			add(declarations, node)
		}
		/**
		 * @param {import("../../private.js").AstNode & import("estree").Identifier} node
		 * @returns {void}
		 */
		function defer(node) {
			add(usages, node)
		}
		/**
		 * @param {string} _
		 * @param {string} a
		 * @param {string} b
		 * @returns {string}
		 */
		function fix_handler(_, a, b) {
			return a + (a ? "_" : "") + b.toLowerCase()
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {import("../../private.js").AstNode | undefined}
		 */
		function function_of_param(node) {
			const child = node.parent.type == "AssignmentPattern" && node.parent.left == node || node.parent.type == "RestElement"
				? node.parent
				: node
			const func = /** @type {import("../../private.js").AstNode & { params?: import("../../private.js").AstNode[] }} */(child.parent)/**/
			return function_types.has(func.type) && func.params?.includes(child) ? func : void 0
		}
		/**
		 * @param {string} text
		 * @param {number} index
		 * @returns {boolean}
		 */
		function in_braces(text, index) {
			let depth = 0
			for (let i = 0; i < index; i++) {
				if (text[i] == "{") depth++
				else if (text[i] == "}" && depth) depth--
			}
			return depth > 0
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {boolean}
		 */
		function is_declaration(node) {
			for (let parent = node.parent; parent; parent = parent.parent) {
				switch (parent.type) {
				case "ArrayPattern":
				case "AssignmentPattern":
				case "ObjectPattern":
				case "Property":
				case "RestElement":
					break
				case "AssignmentExpression":
				case "ForInStatement":
				case "ForOfStatement":
					return false
				default:
					return true
				}
			}
			return true
		}
		/**
		 * @param {import("../../private.js").AstNode} node
		 * @returns {boolean}
		 */
		function is_disabled(node) {
			const { column, line } = /** @type {import("estree").SourceLocation} */(node.loc)/**/.start
			let disabled = false
			disable_directives ??= (/** @type {import("../../private.js").DirectiveSource} */(/** @type {unknown} */(source))/**/).getDisableDirectives?.().directives ?? []
			for (const directive of disable_directives) {
				const rule_ids = directive.value.split(",").map(rule_id => rule_id.trim())
					.filter(Boolean)
				if (rule_ids.length && !rule_ids.includes(context.id)) continue
				const comment_loc = directive.node.loc
				switch (directive.type) {
				case "disable":
				case "enable":
					if (comment_loc.start.line < line || comment_loc.start.line == line && comment_loc.start.column < column) {
						disabled = directive.type == "disable"
					}
					break
				case "disable-line":
					if (comment_loc.start.line == line) return true
					break
				case "disable-next-line":
					if (comment_loc.end.line + 1 == line) return true
				}
			}
			return disabled
		}
		/**
		 * @param {import("../../private.js").AstNode} func
		 * @returns {import("../../private.js").Comment | undefined}
		 */
		function leading_comment(func) {
			let anchor = func
			const parent = func.parent
			switch (parent.type) {
			case "MethodDefinition":
			case "Property":
			case "PropertyDefinition":
				anchor = parent
				break
			case "VariableDeclarator":
				if (parent.init == func) anchor = parent.parent
			}
			if (anchor.parent.type == "ExportDefaultDeclaration" || anchor.parent.type == "ExportNamedDeclaration") anchor = anchor.parent
			return /** @type {import("../../private.js").Comment[]} */(source.getCommentsBefore(
				/** @type {import("estree").Node} */(anchor)/**/
			))/**/.at(-1)
		}
		/**
		 * @param {import("../../private.js").NamingIdentifier} target
		 * @returns {import("../../private.js").RenameEdit}
		 */
		function rename_edit(target) {
			const name = target.name
			const fixed_name = to_snake_case(name)
			const parent = target.parent
			const decorators = target.decorators
			const start = source.text.indexOf(
				name,
				decorators?.length
					? /** @type {import("../../private.js").AstNode} */(decorators[decorators.length - 1])/**/.range[1]
					: target.range[0]
			)
			const range = /** @type {[number, number]} */([ start, start + name.length ])/**/
			if (svelte_shorthands.has(target)) return {
				range: /** @type {[number, number]} */(parent.range)/**/,
				text: name + "={" + fixed_name + "}"
			}
			if (shorthand_properties.has(target)) return {
				range,
				text: name + ": " + fixed_name
			}
			if (import_shorthands.has(target)) return {
				range,
				text: name + " as " + fixed_name
			}
			if (export_shorthands.has(target)) return {
				range,
				text: fixed_name + " as " + name
			}
			if (parent.type == "ImportSpecifier" && parent.imported.type == "Identifier" && parent.imported.name == fixed_name) {
				return {
					range: [
						/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(parent.imported))/**/.range[0],
						range[1]
					],
					text: fixed_name
				}
			}
			if (parent.type == "ExportSpecifier" && parent.local == target && parent.exported.type == "Identifier" && parent.exported.name == fixed_name) {
				return {
					range: [
						range[0],
						/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(parent.exported))/**/.range[1]
					],
					text: fixed_name
				}
			}
			return { range, text: fixed_name }
		}
		/**
		 * @param {import("../../private.js").NamingIdentifier} node
		 * @param {import("../../private.js").RenameEdit[] | null} edits
		 * @returns {void}
		 */
		function report(node, edits) {
			context.report(
				{
					data: {
						expected: to_snake_case(node.name),
						name: node.name
					},
					fix(fixer) {
						if (!edits) return null
						/** @type {Set<number>} */
						const starts = new Set()
						return edits.filter(
							edit => !starts.has(edit.range[0]) && !!starts.add(edit.range[0])
						)
							.map(
								edit => fixer.replaceTextRange(edit.range, edit.text)
							)
					},
					messageId: fixable_name_regex.test(node.name) && allow_regex.test(to_snake_case(node.name))
						? "rename"
						: "case",
					node: /** @type {import("estree").Node} */(node)/**/
				}
			)
		}
		/**
		 * @param {string} text
		 * @param {number} index
		 * @returns {number}
		 */
		function skip_space(text, index) {
			while (index < text.length && space_regex.test(
				/** @type {string} */(text[index])/**/
			)) index++
			return index
		}
		/**
		 * @param {string} name
		 * @returns {string}
		 */
		function to_snake_case(name) {
			return name.replace(fix_regex, fix_handler)
		}
		/** @type {import("../../private.js").RuleListener} */
		const listener = {
			/** @param {import("../../private.js").AstNode & import("estree").Identifier} node */
			Identifier(node) {
				const name = node.name
				if (store_regex.test(name)) {
					const store = name.slice(1)
					if (is_svelte) {
						const nodes = store_usages.get(store)
						if (nodes) nodes.push(node)
						else store_usages.set(store, [ node ])
					} else blocked.add(store)
				}
				if (allow_regex.test(name) || visited.has(node)) return
				visited.add(node)
				const parent = /** @type {import("../../private.js").NamingParent} */(node.parent)/**/
				switch (parent.type) {
				case "AccessorProperty":
				case "TSAbstractAccessorProperty":
				case "TSAbstractMethodDefinition":
				case "TSAbstractPropertyDefinition":
				case "TSMethodSignature":
				case "TSPropertySignature":
					if (parent.computed || parent.value == node) defer(node)
					break
				case "ArrayExpression":
					defer(node)
					break
				case "ArrayPattern":
					if (is_declaration(node)) declare(node)
					else defer(node)
					break
				case "ArrowFunctionExpression":
					if (parent.body == node) defer(node)
					else declare(node)
					break
				case "AssignmentExpression":
					defer(node)
					break
				case "AssignmentPattern":
					if (parent.left != node) defer(node)
					else if (parent.parent?.type == "Property" && parent.parent.shorthand) {
						shorthand_properties.add(node)
						defer(node)
					} else if (is_declaration(node)) declare(node)
					else defer(node)
					break
				case "AwaitExpression":
					defer(node)
					break
				case "BinaryExpression":
				case "Decorator":
				case "JSXExpressionContainer":
				case "JSXSpreadAttribute":
				case "JSXSpreadChild":
				case "TSAsExpression":
				case "TSExportAssignment":
				case "TSInstantiationExpression":
				case "TSNonNullExpression":
				case "TSSatisfiesExpression":
				case "TSTypeAssertion":
				case "TSTypePredicate":
				case "TSTypeQuery":
				case "WithStatement":
					defer(node)
					break
				case "BreakStatement":
				case "ContinueStatement":
				case "ImportAttribute":
				case "LabeledStatement":
				case "MetaProperty":
				case "TSCallSignatureDeclaration":
				case "TSConstructSignatureDeclaration":
				case "TSConstructorType":
				case "TSEmptyBodyFunctionExpression":
				case "TSEnumDeclaration":
				case "TSFunctionType":
				case "TSIndexSignature":
				case "TSInterfaceDeclaration":
				case "TSMappedType":
				case "TSModuleDeclaration":
				case "TSNamespaceExportDeclaration":
				case "TSTypeAliasDeclaration":
				case "TSTypeParameter":
					break
				case "CallExpression":
					defer(node)
					break
				case "CatchClause":
					declare(node)
					break
				case "ClassDeclaration":
				case "ClassExpression":
					if (parent.id == node) declare(node)
					else defer(node)
					break
				case "ConditionalExpression":
					defer(node)
					break
				case "DoWhileStatement":
					defer(node)
					break
				case "ExportAllDeclaration":
					break
				case "ExportDefaultDeclaration":
					default_exports.add(node)
					defer(node)
					break
				case "ExportSpecifier":
					if (parent.local == node && !(/** @type {import("estree").ExportNamedDeclaration} */(parent.parent)/**/).source) {
						const is_shorthand = parent.exported == node || parent.exported.range?.[0] == node.range[0]
						if (is_shorthand) export_shorthands.add(node)
						add(export_locals, node)
					}
					break
				case "ExpressionStatement":
					defer(node)
					break
				case "ForInStatement":
					defer(node)
					break
				case "ForOfStatement":
					defer(node)
					break
				case "ForStatement":
					defer(node)
					break
				case "FunctionDeclaration":
				case "TSDeclareFunction":
					if (parent.id != node) {
						if (parent.type == "FunctionDeclaration") declare(node)
					} else if (parent.parent?.type != "ExportNamedDeclaration" || !camel_case_regex.test(name)) declare(node)
					break
				case "FunctionExpression":
					declare(node)
					break
				case "IfStatement":
					defer(node)
					break
				case "ImportDefaultSpecifier":
					declare(node)
					break
				case "ImportExpression":
					defer(node)
					break
				case "ImportNamespaceSpecifier":
					declare(node)
					break
				case "ImportSpecifier":
					if (parent.local == node) {
						if (parent.imported.type == "Identifier" && parent.imported.name == name) {
							import_shorthands.add(node)
							defer(node)
						} else declare(node)
					}
					break
				case "LogicalExpression":
					defer(node)
					break
				case "MemberExpression":
					if (parent.object == node || parent.computed) defer(node)
					break
				case "MethodDefinition":
					if (parent.computed) defer(node)
					break
				case "NewExpression":
					defer(node)
					break
				case "Property":
					if (parent.value == node) {
						const is_shorthand = parent.shorthand
						if (is_shorthand) shorthand_properties.add(node)
						const declares = !is_shorthand && parent.parent?.type == "ObjectPattern" && is_declaration(node)
						if (declares) declare(node)
						else defer(node)
					} else if (parent.computed) defer(node)
					break
				case "PropertyDefinition":
					if (parent.value == node || parent.computed) defer(node)
					break
				case "RestElement":
					if (is_declaration(node)) declare(node)
					else defer(node)
					break
				case "ReturnStatement":
					defer(node)
					break
				case "SequenceExpression":
					defer(node)
					break
				case "SpreadElement":
					defer(node)
					break
				case "SwitchCase":
					defer(node)
					break
				case "SwitchStatement":
					defer(node)
					break
				case "TSEnumMember":
					if (parent.initializer == node) defer(node)
					break
				case "TSImportEqualsDeclaration":
					if (parent.id == node) declare(node)
					else defer(node)
					break
				case "TSQualifiedName":
					if (parent.left == node) defer(node)
					break
				case "TaggedTemplateExpression":
					defer(node)
					break
				case "TemplateLiteral":
					defer(node)
					break
				case "ThrowStatement":
					defer(node)
					break
				case "UnaryExpression":
					defer(node)
					break
				case "UpdateExpression":
					defer(node)
					break
				case "VariableDeclarator":
					if (parent.id == node) {
						if (
							parent.parent?.parent?.type != "ExportNamedDeclaration"
							|| !camel_case_regex.test(name)
						) {
							declare(node)
						}
					} else defer(node)
					break
				case "WhileStatement":
					defer(node)
					break
				case "YieldExpression":
					defer(node)
					break
				default: {
					const type = /** @type {string} */(parent.type)/**/
					const svelte_parent = /** @type {{ expression?: unknown, kind?: string, value?: unknown }} */(/** @type {unknown} */(parent))/**/
					if (type == "SvelteShorthandAttribute") {
						if (svelte_parent.value == node) {
							svelte_shorthands.add(node)
							defer(node)
						}
					} else if (
						svelte_usage_parents.has(type)
						|| type == "SvelteDirective" && svelte_parent.kind != "Let"
						|| svelte_expression_parents.has(type) && svelte_parent.expression == node
					) defer(node)
					else blocked.add(name)
				}
				}
			},
			/** @param {import("../../private.js").AstNode & import("estree").Identifier} node */
			JSXIdentifier(node) {
				const name = node.name
				const parent = /** @type {{ object?: unknown, type: string }} */(/** @type {unknown} */(node.parent))/**/
				if (parent.type == "JSXMemberExpression" && parent.object == node) {
					if (allow_regex.test(name)) return
					jsx_objects.add(node)
					defer(node)
				} else if ((parent.type == "JSXOpeningElement" || parent.type == "JSXClosingElement") && !lowercase_regex.test(name)) {
					blocked.add(name)
				}
			},
			"Program:exit": () => {
				if (!declarations.size) return
				/** @type {Map<import("../../private.js").AstNode, import("eslint").Scope.Variable | null>} */
				const resolution = new Map()
				/** @type {Map<string, import("eslint").Scope.Variable[]>} */
				const variables_by_name = new Map()
				const scopes = source.scopeManager?.scopes ?? []
				for (const scope of scopes) {
					for (const variable of scope.variables) {
						const same_names = variables_by_name.get(variable.name)
						if (same_names) same_names.push(variable)
						else variables_by_name.set(variable.name, [ variable ])
						for (const identifier of variable.identifiers) resolution.set(
							/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(identifier))/**/,
							variable
						)
					}
				}
				for (const scope of scopes) {
					for (const reference of scope.references) {
						const identifier = /** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(reference.identifier))/**/
						if (!resolution.has(identifier)) resolution.set(identifier, reference.resolved)
					}
				}
				for (const node of jsx_objects) {
					if (!resolution.has(node)) blocked.add(node.name)
				}
				/** @type {Set<import("eslint").Scope.Variable>} */
				const renamable = new Set()
				/** @type {Set<import("../../private.js").AstNode>} */
				const declared = new Set()
				for (const nodes of declarations.values()) {
					for (const node of nodes) {
						declared.add(node)
						const variable = resolution.get(node)
						if (variable) renamable.add(variable)
					}
				}
				/** @type {Map<string, Set<import("eslint").Scope.Scope>>} */
				const scopes_by_target = new Map()
				for (const variable of renamable) {
					const target = to_snake_case(variable.name)
					const target_scopes = scopes_by_target.get(target)
					if (target_scopes) target_scopes.add(variable.scope)
					else scopes_by_target.set(
						target,
						new Set([ variable.scope ])
					)
				}
				/** @type {Set<string>} */
				const nested_targets = new Set()
				for (const variable of renamable) {
					const target = to_snake_case(variable.name)
					const target_scopes = /** @type {Set<import("eslint").Scope.Scope>} */(scopes_by_target.get(target))/**/
					for (let scope = variable.scope.upper; scope; scope = scope.upper) {
						if (target_scopes.has(scope)) nested_targets.add(target)
					}
				}
				/**
				 * @param {import("../../private.js").AstNode} node
				 * @returns {boolean}
				 */
				function belongs(node) {
					if (!resolution.has(node)) return true
					const variable = resolution.get(node)
					return !!variable && renamable.has(variable)
				}
				/**
				 * @param {string} name
				 * @returns {boolean}
				 */
				function collides(name) {
					const others = variables_by_name.get(to_snake_case(name)) ?? []
					if (!others.length) return false
					for (const variable of variables_by_name.get(name) ?? []) {
						if (!renamable.has(variable)) continue
						for (const scope of [
							variable.scope,
							...variable.references.map(reference => reference.from)
						]) {
							for (let current = /** @type {import("eslint").Scope.Scope | null} */(scope)/**/; current; current = current.upper) {
								if (others.some(
									other => other.scope == current
								)) return true
								if (current == variable.scope) break
							}
						}
						for (const other of others) {
							for (const reference of other.references) {
								for (let current = /** @type {import("eslint").Scope.Scope | null} */(reference.from)/**/; current && current != other.scope; current = current.upper) {
									if (current == variable.scope) return true
								}
							}
						}
					}
					return false
				}
				/**
				 * @param {string} name
				 * @returns {boolean}
				 */
				function has_foreign_declaration(name) {
					return (variables_by_name.get(name) ?? []).some(
						variable => renamable.has(variable) && variable.identifiers.some(
							identifier => !declared.has(
								/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(identifier))/**/
							)
						)
					)
				}
				/** @type {Set<import("../../private.js").AstNode>} */
				const held = new Set(default_exports)
				for (const variable of renamable) {
					for (const reference of variable.references) {
						if (reference.isWrite() && !reference.init) held.add(
							/** @type {import("../../private.js").AstNode} */(/** @type {unknown} */(reference.identifier))/**/
						)
					}
				}
				/** @type {Map<string, import("../../private.js").RenamePlan>} */
				const plans = new Map()
				for (const [ name, nodes ] of declarations) {
					const target = to_snake_case(name)
					const used = (usages.get(name) ?? []).filter(belongs)
					plans.set(
						name,
						{
							atomic: !fix_same_names || variables_by_name.has(target) || nested_targets.has(target) || store_usages.has(name),
							exported: (export_locals.get(name) ?? []).filter(belongs),
							fixable: !blocked.has(name)
								&& fixable_name_regex.test(name)
								&& !collides(name)
								&& !has_foreign_declaration(name)
								&& !nodes.some(is_disabled),
							held: used.filter(node => held.has(node)),
							used: used.filter(node => !held.has(node))
						}
					)
				}
				/**
				 * @param {import("../../private.js").NamingIdentifier} node
				 * @param {import("../../private.js").NamingIdentifier[]} nodes
				 * @param {import("../../private.js").NamingIdentifier[]} usages_held
				 * @returns {import("../../private.js").RenameEdit[]}
				 */
				function declaration_fix(node, nodes, usages_held) {
					const variable = resolution.get(node)
					return [
						...declaration_edits(node, resolution),
						...nodes.find(
							other => resolution.get(other) == variable
						) == node
							? usages_held.filter(
								usage => resolution.get(usage) == variable
							).map(rename_edit)
							: []
					]
				}
				/** @type {import("../../private.js").RenameEdit[]} */
				const atomic = []
				/** @type {import("../../private.js").NamingIdentifier | undefined} */
				let atomic_node
				for (const [ name, nodes ] of declarations) {
					const plan = /** @type {import("../../private.js").RenamePlan} */(plans.get(name))/**/
					if (!plan.exported.length || !plan.fixable || !plan.atomic && plan.used.length) continue
					atomic_node ??= nodes[0]
					for (const node of nodes) atomic.push(
						...declaration_edits(node, resolution)
					)
					for (const node of [
						...plan.exported,
						...plan.used,
						...plan.held,
						...store_usages.get(name) ?? []
					]) atomic.push(rename_edit(node))
				}
				for (const [ name, nodes ] of declarations) {
					const {
						atomic: renames_at_once,
						exported,
						fixable,
						held: usages_held,
						used
					} = /** @type {import("../../private.js").RenamePlan} */(plans.get(name))/**/
					if (exported.length) {
						for (const node of nodes) report(
							node,
							node == atomic_node ? atomic : null
						)
					} else if (!renames_at_once) {
						for (const node of nodes) report(
							node,
							fixable && !used.length ? declaration_fix(node, nodes, usages_held) : null
						)
					} else {
						report(
							/** @type {import("../../private.js").NamingIdentifier} */(nodes[0])/**/,
							fixable
								? [
									...nodes.flatMap(
										node => declaration_edits(node, resolution)
									),
									...used.map(rename_edit),
									...usages_held.map(rename_edit),
									...(store_usages.get(name) ?? []).map(rename_edit)
								]
								: null
						)
						for (const node of nodes.slice(1)) report(node, null)
					}
					if (!fix_same_names) continue
					for (const node of exported) report(node, null)
					for (const node of usages_held) report(node, null)
					for (const node of used) report(
						node,
						fixable && !renames_at_once ? [ rename_edit(node) ] : null
					)
				}
			}
		}
		return /** @type {import("eslint").Rule.RuleListener} */(/** @type {unknown} */(listener))/**/
	},
	meta: {
		docs: {
			description: "Enforces snake_case with some symbols for variable declaration.",
			recommended: false,
			url: "https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/svelte-naming-convention.md"
		},
		fixable: "code",
		messages: {
			case: "Rename '{{name}}' to snake_case, UPPER_SNAKE_CASE or PascalCase, following the Svelte code conventions",
			rename: "Rename '{{name}}' to '{{expected}}': declarations are snake_case, following the Svelte code conventions"
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					fixSameNames: { default: true, type: "boolean" }
				},
				type: "object"
			}
		],
		type: "suggestion"
	}
}
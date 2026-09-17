import ts_parser from "@typescript-eslint/parser"
const identifier_regex = /[$\w]+/g
/** @type {import("eslint").Linter.LanguageOptions} */
const ts_options = {
	parser: ts_parser,
	parserOptions: { sourceType: "module" }
}
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		valid_case(
			"[ fooBar ] = list; ({ key: fooBar } = object)"
		),
		valid_case("for (fooBar of list) {}"),
		valid_case(
			"import { fooBar } from 'module'; var value = () => fooBar; class A extends fooBar {}"
		)
	)
	invalid.push(
		invalid_case(
			"[ ...camelCase ] = value; var camelCase",
			[ "camelCase" ],
			"[ ...camel_case ] = value; var camel_case"
		),
		invalid_case(
			"[ pendingA ] = value; ({ key: pendingB } = value); var pendingA, pendingB",
			[ "pendingA", "pendingB" ],
			"[ pending_a ] = value; ({ key: pendingB } = value); var pending_a, pendingB"
		),
		invalid_case(
			"({ key: camelCase = 1 } = value); var camelCase",
			[ "camelCase" ],
			"({ key: camel_case = 1 } = value); var camel_case"
		),
		invalid_case(
			"class A { [pendingA]() {} } var pendingA",
			[ "pendingA" ],
			"class A { [pending_a]() {} } var pendingA"
		),
		invalid_case(
			"do {} while (pendingA); var pendingA",
			[ "pendingA" ],
			"do {} while (pending_a); var pendingA"
		),
		invalid_case(
			"export function camelCase(camelParam) {}",
			[ "camelParam" ],
			"export function camelCase(camel_param) {}"
		),
		invalid_case(
			"for ([ camelCase ] of list) {} var camelCase",
			[ "camelCase" ],
			"for ([ camel_case ] of list) {} var camel_case"
		),
		invalid_case(
			"for ({ key: camelCase } in list) {} var camelCase",
			[ "camelCase" ],
			"for ({ key: camel_case } in list) {} var camel_case"
		),
		invalid_case(
			"function func({ camelCase = 1 }) {} var camelCase",
			[ 41 ],
			"function func({ camelCase = 1 }) {} var camel_case"
		),
		invalid_case(
			"function func({ key: camelCase = 1 }) {}",
			[ "camelCase" ],
			"function func({ key: camel_case = 1 }) {}"
		),
		invalid_case(
			"import(pendingA); var pendingA",
			[ "pendingA" ],
			"import(pending_a); var pendingA"
		),
		invalid_case(
			"try {} catch (camelCase) {}",
			[ "camelCase" ],
			"try {} catch (camel_case) {}"
		),
		invalid_case(
			"var _CamelCase = 1",
			[ "_CamelCase" ],
			"var _camel_case = 1"
		),
		invalid_case(
			"var camelCase = 1; var value = { camelCase: camelCase }",
			[ 5, 45 ],
			"var camelCase = 1; var value = { camelCase: camel_case }"
		),
		invalid_case(
			"var camelCase; export { camelCase as other }",
			[ "camelCase" ],
			"var camel_case; export { camel_case as other }"
		),
		invalid_case(
			"var camelCase; export { camelCase }",
			[ "camelCase" ],
			"var camel_case; export { camel_case as camelCase }"
		),
		invalid_case(
			"var value = () => pendingA; class A extends pendingA {} var pendingA",
			[ "pendingA" ],
			"var value = () => pending_a; class A extends pending_a {} var pendingA"
		),
		invalid_case(
			"var value = function camelCase(camelCase2) {}",
			[ "camelCase", "camelCase2" ],
			"var value = function camel_case(camel_case2) {}"
		),
		invalid_case(
			"var value = { [pendingA]: 1 }; var pendingA",
			[ "pendingA" ],
			"var value = { [pending_a]: 1 }; var pendingA"
		),
		invalid_case(
			"var { key: camelCase } = value",
			[ "camelCase" ],
			"var { key: camel_case } = value"
		),
		invalid_case(
			"var camelCase; camel_case",
			[ "camelCase" ],
			"var camel_case; camel_case"
		),
		invalid_case(
			"import { camelCase } from 'module'; function func(camelCase) {}",
			[ 51 ],
			"import { camelCase } from 'module'; function func(camel_case) {}"
		),
		invalid_case(
			"function a(requestAnimationFrame) { return requestAnimationFrame } function b() { return requestAnimationFrame(() => {}) }",
			[ 12, 44 ],
			"function a(requestAnimationFrame) { return request_animation_frame } function b() { return requestAnimationFrame(() => {}) }"
		),
		invalid_case(
			"export function flushSync() {} function a(flushSync) { flushSync() } flushSync()",
			[ 43, 56 ],
			"export function flushSync() {} function a(flushSync) { flush_sync() } flushSync()"
		),
		{
			...invalid_case(
				"const item_count = 1; function f(itemCount) { return item_count + itemCount }",
				[ "itemCount" ],
				""
			),
			output: null
		},
		{
			...invalid_case(
				"const userStore = writable(0); $userStore",
				[ "userStore" ],
				""
			),
			output: null
		},
		invalid_case(
			"export function rest_props(props) { const restProps = {}; return restProps }",
			[ "restProps" ],
			"export function rest_props(props) { const rest_props = {}; return rest_props }"
		),
		invalid_case(
			"function a(event_name) { return event_name } function b(eventName) {}",
			[ "eventName" ],
			"function a(event_name) { return event_name } function b(event_name) {}"
		),
		{
			...invalid_case(
				"const foo_bar = 1; function f(fooBar) { return () => foo_bar }",
				[ "fooBar" ],
				""
			),
			output: null
		},
		{
			...invalid_case(
				"function f(fooBar) { const foo_bar = 1; return foo_bar }",
				[ "fooBar" ],
				""
			),
			output: null
		},
		invalid_case(
			"import { foo_bar as fooBar } from 'module'; var foo; export { foo as foo_baz }",
			[ "fooBar" ],
			"import { foo_bar } from 'module'; var foo; export { foo as foo_baz }"
		),
		invalid_case(
			"var fooBar; export { fooBar as foo_bar }",
			[ 5, 22 ],
			"var foo_bar; export { foo_bar }"
		),
		invalid_case(
			"/** @param {(key: K) => V} callbackFn @returns {callbackFn is F} */ function get(callbackFn) {}",
			[ 82 ],
			"/** @param {(key: K) => V} callback_fn @returns {callback_fn is F} */ function get(callback_fn) {}"
		),
		invalid_case(
			"class A { /** @param {{ a: string }} [newValue] @param {string} newValue.a */ changed(newValue) {} }",
			[ 87 ],
			"class A { /** @param {{ a: string }} [new_value] @param {string} new_value.a */ changed(new_value) {} }"
		),
		invalid_case(
			"/** @param {number} [itemCount=1] */ export const count = (itemCount) => { /** @type {typeof itemCount} */ const a = 1; return a }",
			[ 60 ],
			"/** @param {number} [item_count=1] */ export const count = (item_count) => { /** @type {typeof item_count} */ const a = 1; return a }"
		),
		invalid_case(
			"/** @param {number} itemCount */ function f(itemCount) { return itemCount }",
			[ 45, 65 ],
			"/** @param {number} itemCount */ function f(itemCount) { return item_count }"
		),
		invalid_case(
			"import { 'camel-case' as camelCase } from 'module'",
			[ "camelCase" ],
			"import { 'camel-case' as camel_case } from 'module'"
		),
		invalid_case(
			"var camelCase; export { camelCase as camelCase }",
			[ 5, 25 ],
			"var camel_case; export { camel_case as camelCase }"
		),
		invalid_case(
			"export { camelCase }; var camelCase",
			[ "camelCase" ],
			"export { camel_case as camelCase }; var camel_case"
		),
		invalid_case(
			"function camelCase() {} export { camelCase }; camelCase()",
			[ "camelCase" ],
			"function camelCase() {} export { camelCase }; camel_case()"
		),
		invalid_case(
			"var camelCase; export { camelCase }; var camelCase",
			[ "camelCase" ],
			"var camel_case; export { camel_case as camelCase }; var camel_case"
		),
		{
			...invalid_case(
				"var camelCase; <a b={camelCase} {...camelCase}>{camelCase}</a>",
				[ "camelCase" ],
				"var camelCase; <a b={camel_case} {...camel_case}>{camel_case}</a>"
			),
			languageOptions: {
				parserOptions: { ecmaFeatures: { jsx: true } }
			}
		},
		{
			...invalid_case(
				"var camelCase; var a = camelCase as A, b = camelCase!, c = <A>camelCase, d = camelCase satisfies A, e = camelCase<A>, f: typeof camelCase.b",
				[ "camelCase" ],
				"var camelCase; var a = camel_case as A, b = camel_case!, c = <A>camel_case, d = camel_case satisfies A, e = camel_case<A>, f: typeof camel_case.b"
			),
			languageOptions: ts_options
		},
		{
			...invalid_case(
				"var camelCase; @camelCase class A {} enum E { a = camelCase } export = camelCase",
				[ "camelCase" ],
				"var camelCase; @camel_case class A {} enum E { a = camel_case } export = camel_case"
			),
			languageOptions: ts_options
		},
		{
			...invalid_case(
				"class B { run(itemCount: number, maxSize?: string, @A() lastValue: A = itemCount) { let other!: string; let nextValue: A = lastValue } }",
				[
					"itemCount",
					"maxSize",
					"lastValue",
					"nextValue"
				],
				"class B { run(itemCount: number, max_size?: string, @A() lastValue: A = item_count) { let other!: string; let next_value: A = last_value } }"
			),
			languageOptions: ts_options
		},
		{
			...invalid_case(
				"function camelCase(a: string): void; function camelCase(a) {}",
				[ "camelCase" ],
				"function camel_case(a: string): void; function camel_case(a) {}"
			),
			languageOptions: ts_options
		},
		{
			...invalid_case(
				"import camelCase from 'module'; var a: camelCase",
				[ 8 ],
				"import camelCase from 'module'; var a: camelCase"
			),
			languageOptions: ts_options,
			output: null
		},
		{
			...invalid_case(
				"function isCamel(camelCase): camelCase is A {}",
				[ 10, 18, 30 ],
				"function is_camel(camelCase): camel_case is A {}"
			),
			languageOptions: ts_options
		},
		{
			...invalid_case(
				"declare namespace camelCase { type A = 1 } declare function camelCase(): camelCase.A",
				[ 61, 74 ],
				""
			),
			languageOptions: ts_options,
			output: null
		},
		{
			...invalid_case(
				"var camelCase = 1; export var camelCase = 2",
				[ 5 ],
				""
			),
			output: null
		},
		{
			...invalid_case(
				"function camelCase() {} camelCase(); function f(camelCase) { return camelCase() }",
				[ 10, 25, 49, 69 ],
				"function camel_case() {} camel_case(); function f(camel_case) { return camel_case() }"
			)
		},
		{
			code: "// eslint-disable-next-line\nvar camelCase = 1\ncamelCase()",
			errors: [
				{
					column: 1,
					line: 3,
					messageId: "rename"
				}
			],
			output: null
		},
		{
			code: "/* eslint-disable */\nvar camelCase = 1\n/* eslint-enable */\ncamelCase()",
			errors: [
				{
					column: 1,
					line: 4,
					messageId: "rename"
				}
			],
			output: null
		},
		{
			code: "/* eslint-disable no-console */\nvar camelCase = 1\ncamelCase()",
			errors: [
				{
					column: 5,
					line: 2,
					messageId: "rename"
				},
				{
					column: 1,
					line: 3,
					messageId: "rename"
				}
			],
			output: "/* eslint-disable no-console */\nvar camelCase = 1\ncamel_case()"
		},
		{
			...invalid_case(
				"function f(camelCase) { return <camelCase.A>{camelCase.b}</camelCase.A> }",
				[ 12, 33, 46, 60 ],
				"function f(camelCase) { return <camel_case.A>{camel_case.b}</camel_case.A> }"
			),
			filename: "a.tsx",
			languageOptions: {
				...ts_options,
				parserOptions: { jsx: true, sourceType: "module" }
			}
		},
		{
			...invalid_case(
				"function f(camelCase) { return <camelCase.A>{camelCase.b}</camelCase.A> }",
				[ 12, 33, 46, 60 ],
				""
			),
			languageOptions: {
				parserOptions: { ecmaFeatures: { jsx: true } }
			},
			output: null
		},
		{
			...invalid_case(
				"import { A as Camel_Case } from 'module'; var a = <Camel_Case />",
				[ 15 ],
				""
			),
			languageOptions: {
				parserOptions: { ecmaFeatures: { jsx: true } }
			},
			output: null
		},
		invalid_case(
			"let lastBid = 1; function bump() { lastBid += 1 } bump(); log(lastBid)",
			[ "lastBid" ],
			"let lastBid = 1; function bump() { lastBid += 1 } bump(); log(last_bid)"
		),
		invalid_case(
			"let lastBid = 1; function bump() { lastBid += 1 } bump(); log(last_bid)",
			[ "lastBid" ],
			"let last_bid = 1; function bump() { last_bid += 1 } bump(); log(last_bid)"
		),
		invalid_case(
			"let lastBid; lastBid = 1; log(lastBid)",
			[ "lastBid" ],
			"let lastBid; lastBid = 1; log(last_bid)"
		),
		invalid_case(
			"let lastBid; lastBid = 1; log(last_bid)",
			[ "lastBid" ],
			"let last_bid; last_bid = 1; log(last_bid)"
		),
		invalid_case(
			"function camelCase() {} export default camelCase; camelCase()",
			[ "camelCase" ],
			"function camelCase() {} export default camelCase; camel_case()"
		),
		invalid_case(
			"let [ itemCount ] = value; itemCount++",
			[ "itemCount" ],
			"let [ item_count ] = value; item_count++"
		),
		invalid_case(
			"for (let index = 0; index < 1; index++) { let lastBid = index; lastBid ||= 1 }",
			[ "lastBid" ],
			"for (let index = 0; index < 1; index++) { let last_bid = index; last_bid ||= 1 }"
		),
		invalid_case(
			"let lastBid = 1; export { lastBid }; lastBid = 2",
			[ "lastBid" ],
			"let last_bid = 1; export { last_bid as lastBid }; last_bid = 2"
		),
		invalid_case(
			"let lastBid = 1; log(lastBid)",
			[ "lastBid" ],
			"let lastBid = 1; log(last_bid)"
		),
		{
			...invalid_case(
				"/** The camelCase is { typeof camelCase } */ var camelCase = 1",
				[ 50 ],
				"/** The camelCase is { typeof camel_case } */ var camel_case = 1"
			)
		}
	)
}
/**
 * @param {string} code
 * @param {number[] | string[]} names
 * @param {string} output
 * @returns {import("eslint").RuleTester.InvalidTestCase}
 */
function invalid_case(code, names, output) {
	const columns = typeof names[0] == "number"
		? /** @type {number[]} */(names)/**/
		: [
			...code.matchAll(identifier_regex)
		]
			.filter(
				match => /** @type {string[]} */(names)/**/.includes(match[0])
			)
			.map(match => match.index + 1)
	return {
		code,
		errors: columns.map(
			column => ({
				column,
				line: 1,
				messageId: "rename"
			})
		),
		output
	}
}
/**
 * @param {string} code
 * @returns {import("eslint").RuleTester.ValidTestCase}
 */
function valid_case(code) {
	return { code }
}
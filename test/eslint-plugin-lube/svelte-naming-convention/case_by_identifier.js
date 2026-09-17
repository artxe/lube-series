const identifier_regex = /[$\w]+/g
const snake_regex = /([\da-z]?)([A-Z][\dA-Z]*)/g
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} _valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(_valid, invalid) {
	invalid.push(
		invalid_case(
			`
			var value = [ deferA ]
			var value = [ pendingA ]
			var pendingA
			var value = [ pendingA ]
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			"var [ camelCase ] = value",
			[ "camelCase" ]
		),
		invalid_case(
			"(camelCase) => {}",
			[ "camelCase" ]
		),
		invalid_case(
			`
			deferA = deferB
			pendingA = pendingB
			var pendingA, pendingB
			pendingA = pendingB
			`,
			[ "pendingA", "pendingB" ],
			{
				output: `
			deferA = deferB
			pending_a = pendingB
			var pending_a, pendingB
			pending_a = pending_b
			`
			}
		),
		invalid_case(
			`
			(camelCase = deferA) => {}
			(snake_case = pendingA) => {}
			var pendingA
			(snake_case = pendingA) => {}
			`,
			[ "camelCase", "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			await deferA
			await pendingA
			var pendingA
			await pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			deferA = deferB
			pendingA - pendingB
			var pendingA, pendingB
			pendingA / pendingB
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			deferA()
			pendingA()
			var pendingA
			pendingA()
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			"class camelCase {}",
			[ "camelCase" ]
		),
		invalid_case(
			`
			test ? deferA : deferB
			test ? pendingA : pendingB
			var pendingA, pendingB
			test ? pendingA : pendingB
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			export * as camelCase from "module"
			var camelCase
			`,
			[ "camelCase" ],
			{ skip: [ 2 ] }
		),
		invalid_case(
			`
			export default camelCase
			var camelCase
			`,
			[ "camelCase" ],
			{
				options: [ { fixSameNames: false } ],
				output: `
			export default camel_case
			var camel_case
			`,
				skip: [ 2 ]
			}
		),
		invalid_case(
			`
			export default camelCase
			var camelCase
			`,
			[ "camelCase" ]
		),
		invalid_case(
			`
			export { default as camelCase, camelCase2 } from 'module'
			var camelCase, camelCase2
			`,
			[ "camelCase", "camelCase2" ],
			{ skip: [ 2 ] }
		),
		invalid_case(
			`
			deferA
			pendingA
			var pendingA
			pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			for (camelCase in deferA) {}
			for (pendingB in pendingA) {}
			var pendingA, pendingB
			for (pendingB of pendingA) {}
			`,
			[ "pendingA", "pendingB" ],
			{
				output: `
			for (camelCase in deferA) {}
			for (pending_b in pendingA) {}
			var pendingA, pending_b
			for (pending_b of pending_a) {}
			`
			}
		),
		invalid_case(
			`
			for (deferA; deferB; deferC) {}
			for (pendingA; pendingB; pendingC) {}
			var pendingA, pendingB, pendingC
			for (pendingA; pendingB; pendingC) {}
			`,
			[ "pendingA", "pendingB", "pendingC" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			function camelCase() {}
			export function camelCase2() {}
			export function camelCase$() {}
			`,
			[ "camelCase", "camelCase$" ]
		),
		invalid_case(
			`
			if (deferA) {}
			if (pendingA) {}
			var pendingA
			if (pendingA) {}
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			"import camelCase from 'module'",
			[ "camelCase" ]
		),
		invalid_case(
			"import * as camelCase from 'module'",
			[ "camelCase" ]
		),
		invalid_case(
			`
			import { imported as camelCase, camelCase2, camelCase3 } from "module"
			camelCase
			camelCase2
			`,
			[ "camelCase" ],
			{ declared: [ 2 ] }
		),
		invalid_case(
			`
			deferA && deferB
			pendingA || pendingB
			var pendingA, pendingB
			pendingA ?? pendingB
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			deferA.camelCase
			pendingA.camelCase
			var pendingA
			pendingA.camelCase
			object[deferB]
			object[pendingB]
			var pendingB
			object[pendingB]
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4, 8 ] }
		),
		invalid_case(
			`
			class ObjectB { camelCase() {} }
			var camelCase
			`,
			[ "camelCase" ],
			{ skip: [ 2 ] }
		),
		invalid_case(
			`
			new deferA
			new pendingA
			var pendingA
			new pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			var value = { camelCase: deferA }
			var value = { key: pendingA }
			var pendingA
			var value = { key: pendingA }
			var value = { pendingA }
			`,
			[ "pendingA" ],
			{
				output: `
			var value = { camelCase: deferA }
			var value = { key: pending_a }
			var pendingA
			var value = { key: pending_a }
			var value = { pendingA: pending_a }
			`
			}
		),
		invalid_case(
			`
			class ObjectB { camelCase = 1 }
			class ObjectC { [camelCase2] = camelCase3 }
			var camelCase
			var camelCase2, camelCase3
			`,
			[
				"camelCase",
				"camelCase2",
				"camelCase3"
			],
			{ declared: [ 5 ], skip: [ 2 ] }
		),
		invalid_case(
			`
			var [ ...camelCaseA ] = value
			var { ...camelCaseB } = value
			`,
			[ "camelCaseA", "camelCaseB" ]
		),
		invalid_case(
			`
			function func_a() { return deferA }
			function func_b() { return pendingA }
			var pendingA
			function func_c() { return pendingA }
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			a, b, deferA
			a, b, pendingA
			var pendingA
			a, b, pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			var value = [ ...deferA, deferB ]
			var value = [ ...pendingA, pendingB ]
			var pendingA, pendingB
			var value = [ ...pendingA, pendingB ]
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			switch (deferA) {}
			switch (pendingA) {}
			var pendingA
			switch (pendingA) {}
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			switch (cond) { case deferA: break }
			switch (cond) { case pendingA: break }
			var pendingA
			switch (cond) { case pendingA: break }
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			deferA\`quasis\${deferB}quasis\`
			pendingA\`quasis\${pendingB}quasis\`
			var pendingA, pendingB
			pendingA\`quasis\${pendingB}quasis\`
			`,
			[ "pendingA", "pendingB" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			throw deferA
			throw pendingA
			var pendingA
			throw pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			+deferA
			-pendingA
			var pendingA
			~pendingA
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			++deferA
			--pendingA
			var pendingA
			pendingA++
			`,
			[ "pendingA" ],
			{
				output: `
			++deferA
			--pending_a
			var pending_a
			pending_a++
			`
			}
		),
		invalid_case(
			`
			var camelCase = deferA
			var snake_case = pendingA
			var pendingA
			var snake_case = pendingA
			export var camelCase2
			export var camelCase$
			`,
			[
				"camelCase",
				"camelCase$",
				"pendingA"
			],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			while (deferA) {}
			while (pendingA) {}
			var pendingA
			while (pendingA) {}
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		),
		invalid_case(
			`
			function* func_a() { yield deferA }
			function* func_b() { yield pendingA }
			var pendingA
			function* func_c() { yield pendingA }
			`,
			[ "pendingA" ],
			{ declared: [ 4 ] }
		)
	)
}
/**
 * @param {string} code
 * @param {string[]} names
 * @param {{ declared?: number[], options?: unknown[], output?: string, skip?: number[] }} [extra]
 * @returns {import("eslint").RuleTester.InvalidTestCase}
 */
function invalid_case(code, names, extra) {
	const declared = new Set(extra?.declared)
	/** @type {import("eslint").RuleTester.TestCaseError[]} */
	const errors = []
	const reported = new Set(names)
	const skip = new Set(extra?.skip)
	const output = code.split("\n")
		.map(
			(line, index) => skip.has(index + 1)
				? line
				: line.replace(
					identifier_regex,
					(name, offset) => {
						if (!reported.has(name)) return name
						errors.push(
							{
								column: offset + 1,
								line: index + 1,
								messageId: "rename"
							}
						)
						return declared.has(index + 1) ? name : name.replace(snake_regex, snake_handler)
					}
				)
		)
		.join("\n")
	/** @type {import("eslint").RuleTester.InvalidTestCase} */
	const test_case = {
		code,
		errors,
		output: extra?.output ?? output
	}
	if (extra?.options) test_case.options = extra.options
	return test_case
}
/**
 * @param {string} _
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function snake_handler(_, a, b) {
	return a + (a ? "_" : "") + b.toLowerCase()
}
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} _valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(_valid, invalid) {
	invalid.push(
		{
			code: `
			var value = [a, b, c]
			var value = [ aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc ]
			var value = []
			`,
			errors: [
				{
					column: 17,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 17,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			var value = [ a, b, c ]
			var value = [
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			]
			var value = []
			`
		},
		{
			code: "var value = [aaaaaaaaaaaaaaaaaaaa,,bbbbbbbbbbbbbbbbbbbb,,]",
			errors: [ { messageId: "multiline" } ],
			output: "var value = [\n\taaaaaaaaaaaaaaaaaaaa,\n\t,\n\tbbbbbbbbbbbbbbbbbbbb,\n\t,\n]"
		},
		{
			code: `
			var [a, b, c] = value
			var [ aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc ] = value
			var [] = value
			`,
			errors: [
				{
					column: 9,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 9,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			var [ a, b, c ] = value
			var [
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			] = value
			var [] = value
			`
		},
		{
			code: `
			var value = ( a, b, c ) => {
				//
			}
			var value = (aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc) => {
				//
			}
			var value = () => {}
			var value = a => b
			var value = async a => b
			var value = async (a, b, c) => {}
			`,
			errors: [
				{
					column: 17,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 17,
					line: 5,
					messageId: "multiline"
				}
			],
			output: `
			var value = (a, b, c) => {
				//
			}
			var value = (
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			) => {
				//
			}
			var value = () => {}
			var value = a => b
			var value = async a => b
			var value = async (a, b, c) => {}
			`
		},
		{
			code: `
			function func( a, b, c ) {
				//
			}
			function func2(aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc) {
				//
			}
			function func3() {}
			async function func4() {}
			`,
			errors: [
				{
					column: 18,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 19,
					line: 5,
					messageId: "multiline"
				}
			],
			output: `
			function func(a, b, c) {
				//
			}
			function func2(
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			) {
				//
			}
			function func3() {}
			async function func4() {}
			`
		},
		{
			code: "function func(a, b,) {}",
			errors: [ { messageId: "single_line" } ],
			output: "function func(a, b) {}"
		},
		{
			code: `
			var value = function ( a, b, c ) {
				//
			}
			var value = function (aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc) {
				//
			}
			var value = function () {}
			var value = async function () {}
			`,
			errors: [
				{
					column: 26,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 26,
					line: 5,
					messageId: "multiline"
				}
			],
			output: `
			var value = function (a, b, c) {
				//
			}
			var value = function (
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			) {
				//
			}
			var value = function () {}
			var value = async function () {}
			`
		},
		{
			code: `
			func( a, b, c )
			func(aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc)
			func()
			`,
			errors: [
				{
					column: 9,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 9,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			func(a, b, c)
			func(
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			)
			func()
			`
		},
		{
			code: `
			new A( a, b, c )
			new A(aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc)
			new A()
			`,
			errors: [
				{
					column: 10,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 10,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			new A(a, b, c)
			new A(
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			)
			new A()
			`
		},
		{
			code: `
			var value = {a, b, c}
			var value = { aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc }
			var value = {}
			`,
			errors: [
				{
					column: 17,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 17,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			var value = { a, b, c }
			var value = {
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			}
			var value = {}
			`
		},
		{
			code: `
			var {a, b, c} = value
			var { aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc } = value
			var {} = value
			`,
			errors: [
				{
					column: 9,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 9,
					line: 3,
					messageId: "multiline"
				}
			],
			output: `
			var { a, b, c } = value
			var {
				aaaaaaaaaa,
				bbbbbbbbbbb,
				ccccccccccc
			} = value
			var {} = value
			`
		},
		{
			code: `
			a,
			b,
			c

			aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc
			`,
			errors: [
				{
					column: 4,
					line: 2,
					messageId: "single_line"
				},
				{
					column: 4,
					line: 6,
					messageId: "multiline"
				}
			],
			output: `
			a, b, c

			aaaaaaaaaa,
			bbbbbbbbbbb,
			ccccccccccc
			`
		}
	)
}
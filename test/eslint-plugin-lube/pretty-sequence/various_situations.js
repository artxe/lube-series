/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: `
			var value = {
				aaaaaaaaaa_aaaaaaaaaa_aaaaaaaaaa
			}
			`
		},
		{
			code: "func(a, /* a */(b)/* b */)"
		},
		{
			code: `
			var value = {
				// aaa
				a,
				b,
				c
			}
			`
		},
		{ code: "func(v => f(a, b, c))" },
		{
			code: `
			func(
				aaaaaaaaaa_bbbbbbbbbb_cccccccccc
			)
				.a(
					aaaaaaaaaa_bbbbbbbbbb_cccccccccc
				)
				.b(
					aaaaaaaaaa_bbbbbbbbbb_cccccccccc
				)
				.c(
					aaaaaaaaaa_bbbbbbbbbb_cccccccccc
				)
			`
		},
		{
			code: `
			export default function(abc) {
				return [ abc, abc ]
			}
			`
		},
		{
			code: "let i = [\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t], a = 1"
		},
		{
			code: "let i = [\n\taaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbb\n], a = 1"
		},
		{
			code: "f(\n\t\t\taaaaaaaaaaaaaaaaaaaaaaaa,\n\t\t\tbbbbbbbbbbbbbbbbbbbbbbbb\n)"
		},
		{
			code: "let a = 1, i = [\n\taaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbb\n]"
		},
		{
			code: "function f() {\n\tconst a = b()\n;(c || d).forEach(\n\t\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\t)\n}"
		},
		{
			code: "switch (x) {\ncase 1:\n\tconst a = b()\n;[\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t].forEach(f)\n}"
		}
	)
	invalid.push(
		{
			code: `
			var value = {
				a: [a,b,c],
				b: true,
				c: {
					aaaaaaaaaa: a, bbbbbbbbbb: b, c: [ aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc ],
					d: { aaaaaaaaaa, bbbbbbbbbbb, ccccccccccc }
				}
			}
			`,
			errors: [
				{
					column: 9,
					line: 3,
					messageId: "single_line"
				},
				{
					column: 9,
					line: 5,
					messageId: "multiline"
				},
				{
					column: 40,
					line: 6,
					messageId: "multiline"
				},
				{
					column: 10,
					line: 7,
					messageId: "multiline"
				}
			],
			output: `
			var value = {
				a: [ a, b, c ],
				b: true,
				c: {
					aaaaaaaaaa: a,
					bbbbbbbbbb: b,
					c: [
						aaaaaaaaaa,
						bbbbbbbbbbb,
						ccccccccccc
					],
					d: {
						aaaaaaaaaa,
						bbbbbbbbbbb,
						ccccccccccc
					}
				}
			}
			`
		},
		{
			code: `
			var value = {a:{b:{c:{d:{e:{f:{g:gggggggggg_gggggggggg_gggggggggg}}}}}}}
			`,
			errors: [
				{
					column: 17,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 20,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 23,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 26,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 29,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 32,
					line: 2,
					messageId: "multiline"
				},
				{
					column: 35,
					line: 2,
					messageId: "multiline"
				}
			],
			output: `
			var value = {
				a:{
					b:{
						c:{
							d:{
								e:{
									f:{
										g:gggggggggg_gggggggggg_gggggggggg
									}
								}
							}
						}
					}
				}
			}
			`
		},
		{
			code: "let i = [\n\taaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbb\n], a = 1",
			errors: [ { messageId: "indent" } ],
			options: [ { fixIndent: true } ],
			output: "let i = [\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t], a = 1"
		},
		{
			code: "const a = f(g(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb)),\n\tb = 1",
			errors: [
				{ messageId: "multiline" },
				{ messageId: "multiline" }
			],
			output: "const a = f(\n\t\tg(\n\t\t\taaaaaaaaaaaaaaaaa,\n\t\t\tbbbbbbbbbbbbbbbbb\n\t\t)\n\t),\n\tb = 1"
		},
		{
			code: "let i = [aaaaaaaaaaaaaaaaa, {\n\t\txxxxxxxxxxxxxxxxxxxxxxxx: 1,\n\t\tyyyyyyyyyyyyyyyyyyyyyyy: 2\n\t}], a = 1",
			errors: [ { messageId: "multiline" } ],
			output: "let i = [\n\t\taaaaaaaaaaaaaaaaa,\n\t\t{\n\t\t\txxxxxxxxxxxxxxxxxxxxxxxx: 1,\n\t\t\tyyyyyyyyyyyyyyyyyyyyyyy: 2\n\t\t}\n\t], a = 1"
		},
		{
			code: "function f() {\n\tconst a = b()\n;(c || d).forEach(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)\n}",
			errors: [ { messageId: "multiline" } ],
			output: "function f() {\n\tconst a = b()\n;(c || d).forEach(\n\t\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\t)\n}"
		},
		{
			code: "function f() {\n\tconst a = b()\n;(c || d).forEach(x => {\n\t\tg(x)\n\t}, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)\n}",
			errors: [ { messageId: "multiline" } ],
			output: "function f() {\n\tconst a = b()\n;(c || d).forEach(\n\t\tx => {\n\t\t\tg(x)\n\t\t},\n\t\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\t)\n}"
		},
		{
			code: "class A {\n\tx = 1\n;[y] = [aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb]\n}",
			errors: [ { messageId: "multiline" } ],
			output: "class A {\n\tx = 1\n;[y] = [\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t]\n}"
		},
		{
			code: "a()\n;[aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb].forEach(f)",
			errors: [ { messageId: "multiline" } ],
			output: "a()\n;[\n\taaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbb\n].forEach(f)"
		},
		{
			code: "function f() {\n\treturn (a\n\t\t|| b).catch(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb)\n}",
			errors: [ { messageId: "multiline" } ],
			output: "function f() {\n\treturn (a\n\t\t|| b).catch(\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t)\n}"
		},
		{
			code: "function f() {\n\tx = (a\n\t\t? b\n\t\t: \"\") + g(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb)\n}",
			errors: [ { messageId: "multiline" } ],
			output: "function f() {\n\tx = (a\n\t\t? b\n\t\t: \"\") + g(\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t)\n}"
		},
		{
			code: "f(a, function() {\n\ta()\n\n\tb()\n})",
			errors: [ { messageId: "multiline" } ],
			output: "f(\n\ta,\n\tfunction() {\n\t\ta()\n\n\t\tb()\n\t}\n)"
		},
		{
			code: "/**\n */ const a = [aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb]",
			errors: [ { messageId: "multiline" } ],
			output: "/**\n */ const a = [\n\taaaaaaaaaaaaaaaaa,\n\tbbbbbbbbbbbbbbbbb\n]"
		},
		{
			code: "function f() {\n\t/*\n\t */ const a = [aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbb]\n}",
			errors: [ { messageId: "multiline" } ],
			output: "function f() {\n\t/*\n\t */ const a = [\n\t\taaaaaaaaaaaaaaaaa,\n\t\tbbbbbbbbbbbbbbbbb\n\t]\n}"
		}
	)
}
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "import {\n\ta,\n\tb\n} from \"c\""
		},
		{
			code: "const a = {\n\tb: [\n\t\t1,\n\t\t2\n\t],\n\tc() {\n\t\treturn 1\n\t}\n}"
		},
		{
			code: "f(\n\ta,\n\tb => {\n\t\treturn b\n\t}\n)"
		},
		{
			code: "const a = b\n\t? c\n\t: d"
		},
		{ code: "a\n\t.b()\n\t.c()" },
		{
			code: "class A extends B {\n\tc = 1\n\td() {}\n}"
		},
		{
			code: "for (const a of b) {\n\tc()\n}\nwhile (a) {\n\tb()\n}"
		},
		{
			code: "try {\n\ta()\n} catch {\n\tb()\n} finally {\n\tc()\n}"
		},
		{
			code: "if (a) b()\nelse\n\tc()"
		},
		{ code: "const a =\n\tb" },
		{
			code: "label: {\n\tbreak label\n}"
		},
		{
			code: "g(f(\n\ta\n), b, {\n\tc\n})"
		},
		{
			code: "for (const {\n\ta\n} of f(\n\tb\n)) {\n\tc()\n}"
		},
		{
			code: "while (a) {\n\tif (a\n\t\t? b\n\t\t: c) {\n\t\tcontinue\n\t} else {\n\t\td()\n\t}\n}"
		},
		{
			code: "for (const x of a\n\t? b\n\t: c) {\n\td()\n}"
		},
		{
			code: "switch (a\n\t? b\n\t: c) {\n\tcase 1:\n\t\td()\n}"
		},
		{
			code: "function f(a = b\n\t? c\n\t: d) {\n\treturn a\n}"
		},
		{
			code: "x.then(a\n\t|| b, () => {\n\t\tc()\n\t})"
		}
	)
	invalid.push(
		{
			code: "function f(\na,\nb\n) {\nreturn a\n}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				},
				{
					line: 5,
					messageId: "wrongIndentation"
				}
			],
			output: "function f(\n\ta,\n\tb\n) {\n\treturn a\n}"
		},
		{
			code: "const a = [\n\t\t1,\n\t\t2\n\t]",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				},
				{
					line: 4,
					messageId: "wrongIndentation"
				}
			],
			output: "const a = [\n\t1,\n\t2\n]"
		},
		{
			code: "f(a, {\n\t\tb\n\t})",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			output: "f(a, {\n\tb\n})"
		},
		{
			code: "if (a) {\n\tb(\n\tc\n\t)\n}",
			errors: [
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			output: "if (a) {\n\tb(\n\t\tc\n\t)\n}"
		},
		{
			code: "for (const {\n\ta\n} of f(\n\t\tb\n\t)) {\n\tc()\n}",
			errors: [
				{
					line: 4,
					messageId: "wrongIndentation"
				},
				{
					line: 5,
					messageId: "wrongIndentation"
				}
			],
			output: "for (const {\n\ta\n} of f(\n\tb\n)) {\n\tc()\n}"
		},
		{
			code: "for (const x of a\n\t? b\n\t: c) {\n\t\td()\n\t}",
			errors: [
				{
					line: 4,
					messageId: "wrongIndentation"
				},
				{
					line: 5,
					messageId: "wrongIndentation"
				}
			],
			output: "for (const x of a\n\t? b\n\t: c) {\n\td()\n}"
		}
	)
}
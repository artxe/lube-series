/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 * @returns {void}
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "const a = `\n  x\n      y\n`\nconst b = 1"
		},
		{
			code: "const a = \"x\\\n    y\""
		},
		{
			code: "const a = f(\n\t`${b}\n  c`,\n\td\n)"
		},
		{
			code: "/*\n    free text\n*/\nconst a = 1"
		},
		{
			code: "Array.from(\n\t/** @type {Iterable<unknown>} */(source)/**/\n)"
		},
		{
			code: "f(\n\ta,\n\t// b\n\tc\n)"
		},
		{
			code: "function f() {\n\ta()\n\t// done\n}"
		},
		{
			code: "switch (a) {\ncase 1:\n// b\ncase 2:\n\tc()\n}",
			options: [ "tab", { SwitchCase: 0 } ]
		},
		{
			code: "switch (a) {\ncase 1:\n\tb()\n// c\n// d\ncase 2:\n\tc()\n}",
			options: [ "tab", { SwitchCase: 0 } ]
		}
	)
	invalid.push(
		{
			code: "f(\n/** @type {A} */(a)/**/[b],\n\t/** @type {A} */(c)/**/[b]\n)",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			output: "f(\n\t/** @type {A} */(a)/**/[b],\n\t/** @type {A} */(c)/**/[b]\n)"
		},
		{
			code: "\t/**\n\t * @param {number} a\n\t */\nfunction f(a) {}",
			errors: [
				{
					line: 1,
					messageId: "wrongIndentation"
				},
				{
					line: 2,
					messageId: "wrongIndentation"
				},
				{
					line: 3,
					messageId: "wrongIndentation"
				}
			],
			output: "/**\n * @param {number} a\n */\nfunction f(a) {}"
		},
		{
			code: "if (a) {\n\t/**\n\t\t * b\n\t\t */\n\tb()\n}",
			errors: [
				{
					line: 3,
					messageId: "wrongIndentation"
				},
				{
					line: 4,
					messageId: "wrongIndentation"
				}
			],
			output: "if (a) {\n\t/**\n\t * b\n\t */\n\tb()\n}"
		},
		{
			code: "if (a) {\n// b\n\tb()\n}",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			output: "if (a) {\n\t// b\n\tb()\n}"
		},
		{
			code: "switch (a) {\ncase 1:\n\tb()\n// falls through\n\ncase 2:\n\tc()\n/* done */\n}",
			errors: [
				{
					line: 4,
					messageId: "wrongIndentation"
				},
				{
					line: 8,
					messageId: "wrongIndentation"
				}
			],
			options: [ "tab", { SwitchCase: 0 } ],
			output: "switch (a) {\ncase 1:\n\tb()\n\t// falls through\n\ncase 2:\n\tc()\n\t/* done */\n}"
		},
		{
			code: "switch (a) {\n\tcase 1:\n\t\tb()\n\t// c\n}",
			errors: [
				{
					line: 4,
					messageId: "wrongIndentation"
				}
			],
			options: [ "tab", { SwitchCase: 1 } ],
			output: "switch (a) {\n\tcase 1:\n\t\tb()\n\t\t// c\n}"
		},
		{
			code: "const a = `${\nb\n}`",
			errors: [
				{
					line: 2,
					messageId: "wrongIndentation"
				}
			],
			output: "const a = `${\n\tb\n}`"
		}
	)
}
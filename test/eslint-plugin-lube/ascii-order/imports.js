/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "import { A, B, a } from \"m\""
		},
		{
			code: "import d, { a, b } from \"m\""
		},
		{
			code: "import * as n from \"m\""
		},
		{
			code: "import { a as b, b as a } from \"m\""
		},
		{
			code: "export { default as flow, each } from \"m\""
		},
		{
			code: "var a, b\nexport { a as z, b as y }"
		},
		{
			code: "import { b, a } from \"m\"",
			options: [ { checkNames: false } ]
		},
		{
			code: "import z from \"../z.js\"\nimport y from \"./y.js\"\nimport B from \"B\"\nimport a from \"a\""
		},
		{
			code: "import b from \"b\"\nimport \"polyfill\"\nimport a from \"a\""
		},
		{
			code: "import {} from \"b\"\nimport a from \"a\""
		},
		{
			code: "import { z } from \"./z.js\"\nimport \"./setup.js\"\nimport { a } from \"./a.js\""
		},
		{
			code: "import b from \"b\"\nvar x\nimport a from \"a\""
		},
		{
			code: "export { b } from \"b\"\nexport { a } from \"a\""
		},
		{
			code: "import b from \"b\"\nimport a from \"a\"",
			options: [ { checkImports: false } ]
		},
		{
			code: "import { d, c } from \"b\"\nimport a from \"a\"",
			options: [
				{
					checkImports: false,
					checkNames: false
				}
			]
		}
	)
	invalid.push(
		{
			code: "import { b, a } from \"m\"",
			errors: [
				{
					column: 13,
					data: {
						name: "a",
						previous: "b",
						reason: ""
					},
					messageId: "names"
				}
			],
			output: "import { a, b } from \"m\""
		},
		{
			code: "import d, { c as a, b } from \"m\"",
			errors: [ { messageId: "names" } ],
			output: "import d, { b, c as a } from \"m\""
		},
		{
			code: "import { a, A, B } from \"m\"",
			errors: [ { messageId: "names" } ],
			output: "import { A, B, a } from \"m\""
		},
		{
			code: "import { \"b-c\" as x, \"a\" as y } from \"m\"",
			errors: [ { messageId: "names" } ],
			output: "import { \"a\" as y, \"b-c\" as x } from \"m\""
		},
		{
			code: "export { b, a } from \"m\"",
			errors: [ { messageId: "names" } ],
			output: "export { a, b } from \"m\""
		},
		{
			code: "var a, b\nexport { b as a, a as b }",
			errors: [ { messageId: "names" } ],
			output: "var a, b\nexport { a as b, b as a }"
		},
		{
			code: "import {\n\tc, // c\n\tb,\n\ta\n} from \"m\"",
			errors: [ { messageId: "names" } ],
			output: "import {\n\ta,\n\tb,\n\tc // c\n} from \"m\""
		},
		{
			code: "import b from \"b\"\nimport a from \"a\"",
			errors: [
				{
					column: 15,
					data: {
						name: "a",
						previous: "b",
						reason: ""
					},
					line: 2,
					messageId: "imports"
				}
			],
			output: "import a from \"a\"\nimport b from \"b\""
		},
		{
			code: "import { b } from \"node:vm\"\nimport * as a from \"data-lube\"\nimport c from \"./c.js\" with { type: \"json\" }",
			errors: [ { messageId: "imports" } ],
			output: "import c from \"./c.js\" with { type: \"json\" }\nimport * as a from \"data-lube\"\nimport { b } from \"node:vm\""
		},
		{
			code: "import { d, c } from \"b\"\nimport a from \"a\"",
			errors: [
				{ messageId: "names" },
				{ messageId: "imports" }
			],
			output: "import a from \"a\"\nimport { c, d } from \"b\""
		},
		{
			code: "import { d, c } from \"b\"\nimport a from \"a\"",
			errors: [ { messageId: "names" } ],
			options: [ { checkImports: false } ],
			output: "import { c, d } from \"b\"\nimport a from \"a\""
		},
		{
			code: "#!/usr/bin/env node\nimport b from \"b\"\nimport a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: "#!/usr/bin/env node\nimport a from \"a\"\nimport b from \"b\""
		},
		{
			code: "#!/usr/bin/env node\n// header\nimport b from \"b\"\nimport a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: null
		},
		{
			code: "import b from \"b\"; import a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: null
		},
		{
			code: "import b from \"b\";\nimport a from \"a\";",
			errors: [ { messageId: "imports" } ],
			output: "import a from \"a\";\nimport b from \"b\";"
		},
		{
			code: "var x\nimport b from \"b\" // b\n/** a */\nimport a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: "var x\n/** a */\nimport a from \"a\"\nimport b from \"b\" // b"
		},
		{
			code: "import c from \"c\"\nimport b from \"b\"\nimport \"polyfill\"\nimport a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: "import b from \"b\"\nimport c from \"c\"\nimport \"polyfill\"\nimport a from \"a\""
		},
		{
			code: "import \"./setup.js\"\nimport { z } from \"./z.js\"\nimport { a } from \"./a.js\"",
			errors: [ { messageId: "imports" } ],
			output: "import \"./setup.js\"\nimport { a } from \"./a.js\"\nimport { z } from \"./z.js\""
		},
		{
			code: "// @ts-check\nimport b from \"b\"\nimport a from \"a\"",
			errors: [ { messageId: "imports" } ],
			output: null
		},
		{
			code: "/** @import { A } from \"a\" */\nimport a from \"a\"\nimport c from \"c\"\nimport b from \"b\"",
			errors: [ { messageId: "imports" } ],
			output: "/** @import { A } from \"a\" */\nimport a from \"a\"\nimport b from \"b\"\nimport c from \"c\""
		}
	)
}
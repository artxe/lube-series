import ascii_order from "../../packages/eslint-plugin-lube/src/rules/ascii-order.js"
import pretty_imports from "../../packages/eslint-plugin-lube/src/rules/pretty-imports.js"
import pretty_jsdoc_casting from "../../packages/eslint-plugin-lube/src/rules/pretty-jsdoc-casting.js"
import pretty_sequence from "../../packages/eslint-plugin-lube/src/rules/pretty-sequence.js"
import pretty_ternary from "../../packages/eslint-plugin-lube/src/rules/pretty-ternary.js"
import svelte_naming_convention from "../../packages/eslint-plugin-lube/src/rules/svelte-naming-convention.js"
import { RuleTester } from "eslint"
import { describe, it } from "vitest"
RuleTester.describe = describe
RuleTester.it = it
new RuleTester().run(
	"ascii-order messages",
	ascii_order,
	{
		invalid: [
			{
				code: "var o = { b: 1, a: 2 }",
				errors: [
					{
						message: "Move key \"a\" before \"b\" to keep keys in ASCII order"
					}
				],
				output: "var o = { a: 2, b: 1 }"
			},
			{
				code: "var o = { b: new Foo(), a: f() }",
				errors: [
					{
						message: "Move key \"a\" before \"b\" to keep keys in ASCII order; it is not fixed automatically because moving `f()` could change the order of side effects, so reorder it by hand"
					}
				],
				output: null
			},
			{
				code: "var o = { b: x, a: build(\n\t\"a long argument\", \"another one\"\n) }",
				errors: [
					{
						message: "Move key \"a\" before \"b\" to keep keys in ASCII order; it is not fixed automatically because moving `build( \"a long argument\", \"an…` could change the order of side effects, so reorder it by hand"
					}
				],
				output: null
			},
			{
				code: "var { b: x, a: x } = o",
				errors: [
					{
						message: "Move key \"a\" before \"b\" to keep keys in ASCII order; it is not fixed automatically because moving `x` could change the order of side effects, so reorder it by hand"
					}
				],
				output: null
			},
			{
				code: "var o = { b: 1, /* a */ a: 2 }",
				errors: [
					{
						message: "Move key \"a\" before \"b\" to keep keys in ASCII order; it is not fixed automatically because a comment or statement next to it would end up in the wrong place, so reorder it by hand"
					}
				],
				output: null
			},
			{
				code: "import b from \"b\"; import a from \"a\"",
				errors: [
					{
						message: "Move the import of \"a\" before \"b\" to keep imports in ASCII order; it is not fixed automatically because a comment or statement next to it would end up in the wrong place, so reorder it by hand"
					}
				],
				output: null
			},
			{
				code: "import b from \"b\"\nimport a from \"a\"",
				errors: [
					{
						message: "Move the import of \"a\" before \"b\" to keep imports in ASCII order"
					}
				],
				output: "import a from \"a\"\nimport b from \"b\""
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"pretty-imports messages",
	pretty_imports,
	{
		invalid: [
			{
				code: "import { aaaaa_bbbbb, aaaaa_ccccc, aaaaa_ddddd } from \"m\"",
				errors: [
					{
						message: "Put each name of this import on a line of its own, since the names are longer than 30 characters together"
					}
				],
				output: "import {\n\taaaaa_bbbbb,\n\taaaaa_ccccc,\n\taaaaa_ddddd\n} from \"m\""
			},
			{
				code: "var a, b\nexport {a,b}",
				errors: [
					{
						message: "Write the names of this export on one line as `{ a, b }`, since the names are 2 characters together, within the 30 allowed"
					}
				],
				output: "var a, b\nexport { a, b }"
			},
			{
				code: "import { a } from \"m\";",
				errors: [
					{
						message: "Remove the semicolon at the end of this import"
					}
				],
				output: "import { a } from \"m\""
			},
			{
				code: "import { a } from \"m\"",
				errors: [
					{
						message: "Add a semicolon at the end of this import"
					}
				],
				options: [ { semicolon: true } ],
				output: "import { a } from \"m\";"
			},
			{
				code: "import {\n  aaaaa_bbbbb,\n  aaaaa_ccccc,\n  aaaaa_ddddd\n} from \"m\"",
				errors: [
					{
						message: "Indent each name of this import one level deeper than the statement"
					}
				],
				options: [ { fixIndent: true } ],
				output: "import {\n\taaaaa_bbbbb,\n\taaaaa_ccccc,\n\taaaaa_ddddd\n} from \"m\""
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"pretty-jsdoc-casting messages",
	pretty_jsdoc_casting,
	{
		invalid: [
			{
				code: "var v = /** @type {A} */(a)",
				errors: [
					{
						message: "Put one empty comment `/**/` right after the closing parenthesis of the outermost cast"
					}
				],
				output: "var v = /** @type {A} */(a)/**/"
			},
			{
				code: "var v = /** @type {A} */( a )/**/",
				errors: [
					{
						message: "Write this cast as `/** @type {T} */(value)/**/`, without white space or extra parentheses around the value"
					}
				],
				output: "var v = /** @type {A} */(a)/**/"
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"pretty-sequence messages",
	pretty_sequence,
	{
		invalid: [
			{
				code: "f(aaaaaaaaaa, bbbbbbbbbb, cccccccccc, d)",
				errors: [
					{
						message: "Put each item and the closing bracket on a line of its own, since the items are longer than 30 characters together"
					}
				],
				output: "f(\n\taaaaaaaaaa,\n\tbbbbbbbbbb,\n\tcccccccccc,\n\td\n)"
			},
			{
				code: "f(a, b // note\n)",
				errors: [
					{
						message: "Put each item and the closing bracket on a line of its own, since an item spans lines or is followed by a line comment"
					}
				],
				output: "f(\n\ta,\n\tb // note\n)"
			},
			{
				code: "var a = [b,c]",
				errors: [
					{
						message: "Write these items on one line as `[ b, c ]`, since the items are 2 characters together, within the 30 allowed"
					}
				],
				output: "var a = [ b, c ]"
			},
			{
				code: "var a = [\nb,\nc\n]",
				errors: [
					{
						message: "Write these items on one line as `[ b, c ]`, since the items are 2 characters together, within the 30 allowed"
					}
				],
				output: "var a = [ b, c ]"
			},
			{
				code: "var a = [\n  bbbbbbbbbbbb,\n  cccccccccccc,\n  dddddddddddd\n]",
				errors: [
					{
						message: "Indent each item one level deeper than the line the brackets open on"
					}
				],
				options: [ { fixIndent: true } ],
				output: "var a = [\n\tbbbbbbbbbbbb,\n\tcccccccccccc,\n\tdddddddddddd\n]"
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"pretty-ternary messages",
	pretty_ternary,
	{
		invalid: [
			{
				code: "var v = a ? b : c ? d : e",
				errors: [
					{
						message: "Break this ternary before `?` and `:`, since a branch is another ternary"
					}
				],
				output: "var v = a\n\t? b\n\t: c\n\t\t? d\n\t\t: e"
			},
			{
				code: "var v = aaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccccccc",
				errors: [
					{
						message: "Break this ternary before `?` and `:`, since it is longer than 80 characters"
					}
				],
				output: "var v = aaaaaaaaaaaaaaaaaaaaaaaaa\n\t? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n\t: cccccccccccccccccccccccccccccc"
			},
			{
				code: "var v = a ? b\n\t: c",
				errors: [
					{
						message: "Break this ternary before `?` and `:`, since it spans lines"
					}
				],
				output: "var v = a\n\t? b\n\t: c"
			},
			{
				code: "var v = a ?  b : c",
				errors: [
					{
						message: "Put one space before and after `?` and `:` of this ternary"
					}
				],
				output: "var v = a ? b : c"
			}
		],
		valid: []
	}
)
new RuleTester().run(
	"svelte-naming-convention messages",
	svelte_naming_convention,
	{
		invalid: [
			{
				code: "var isV = 1",
				errors: [
					{
						message: "Rename 'isV' to 'is_v': declarations are snake_case, following the Svelte code conventions"
					}
				],
				output: "var is_v = 1"
			},
			{
				code: "var NO_SNAKE__CASE = 1",
				errors: [
					{
						message: "Rename 'NO_SNAKE__CASE' to snake_case, UPPER_SNAKE_CASE or PascalCase, following the Svelte code conventions"
					}
				],
				output: null
			}
		],
		valid: []
	}
)
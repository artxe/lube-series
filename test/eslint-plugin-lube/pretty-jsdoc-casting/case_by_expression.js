/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} _valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(_valid, invalid) {
	invalid.push(
		test_case("ArrayExpression", "[a, b, c]"),
		test_case(
			"ArrowFunctionExpression",
			"(a, b) => c"
		),
		test_case("AssignmentExpression", "a = b"),
		{
			code: `
			async function a() {
				/** @type {A} */(await b);
				/** @type {B} */(await b); // comment...
				/** @type {C} */(
					await b // comment...
				);
				/** @type {D} */((await b));
				((/** @type {E} */(await b)));
			}
			`,
			errors: [
				{
					column: 24,
					line: 2,
					messageId: "marker"
				},
				{
					column: 31,
					line: 3,
					messageId: "marker"
				},
				{
					column: 31,
					line: 4,
					messageId: "format"
				},
				{
					column: 7,
					line: 7,
					messageId: "marker"
				},
				{
					column: 33,
					line: 8,
					messageId: "marker"
				}
			],
			output: `
			async function a() {
				/** @type {A} */(await b)/**/;
				/** @type {B} */(await b)/**/; // comment...
				/** @type {C} */(await b)/**/ // comment...
				;
				/** @type {D} */((await b))/**/;
				((/** @type {E} */(await b)/**/));
			}
			`
		},
		test_case("BinaryExpression", "a / b"),
		test_case("CallExpression", "a(b, c)"),
		test_case("ChainExpression", "a?.b?.c"),
		test_case(
			"ClassExpression",
			"class { b = c }"
		),
		test_case(
			"ConditionalExpression",
			"a ? b : c"
		),
		test_case(
			"FunctionExpression",
			"function(a, b) { return c }"
		),
		test_case("Identifier", "a"),
		test_case(
			"ImportExpression",
			"import('a')"
		),
		test_case("Literal", "'a'"),
		test_case("LogicalExpression", "a ?? b"),
		test_case("MemberExpression", "a.b"),
		{
			code: `
			function a() {
				/** @type {A} */(new.target);
				/** @type {B} */(new.target); // comment...
				/** @type {C} */(
					new.target // comment...
				);
				/** @type {D} */((new.target));
				((/** @type {E} */(new.target)));
			}
			`,
			errors: [
				{
					column: 18,
					line: 2,
					messageId: "marker"
				},
				{
					column: 34,
					line: 3,
					messageId: "marker"
				},
				{
					column: 34,
					line: 4,
					messageId: "format"
				},
				{
					column: 7,
					line: 7,
					messageId: "marker"
				},
				{
					column: 36,
					line: 8,
					messageId: "marker"
				}
			],
			output: `
			function a() {
				/** @type {A} */(new.target)/**/;
				/** @type {B} */(new.target)/**/; // comment...
				/** @type {C} */(new.target)/**/ // comment...
				;
				/** @type {D} */((new.target))/**/;
				((/** @type {E} */(new.target)/**/));
			}
			`
		},
		test_case("NewExpression", "new a(b, c)"),
		test_case(
			"ObjectExpression",
			"{ a: b, c }"
		),
		test_case("SequenceExpression", "a, b, c"),
		test_case(
			"TaggedTemplateExpression",
			"a`b${c}`"
		),
		test_case("TemplateLiteral", "`a${b}c`"),
		test_case("ThisExpression", "this"),
		test_case("UnaryExpression", "!a"),
		test_case("UpdateExpression", "++a"),
		{
			code: `
			function* a() {
				/** @type {A} */(yield b);
				/** @type {B} */(yield b); // comment...
				/** @type {C} */(
					yield b // comment...
				);
				/** @type {D} */((yield b));
				((/** @type {E} */(yield b)));
			}
			`,
			errors: [
				{
					column: 19,
					line: 2,
					messageId: "marker"
				},
				{
					column: 31,
					line: 3,
					messageId: "marker"
				},
				{
					column: 31,
					line: 4,
					messageId: "format"
				},
				{
					column: 7,
					line: 7,
					messageId: "marker"
				},
				{
					column: 33,
					line: 8,
					messageId: "marker"
				}
			],
			output: `
			function* a() {
				/** @type {A} */(yield b)/**/;
				/** @type {B} */(yield b)/**/; // comment...
				/** @type {C} */(yield b)/**/ // comment...
				;
				/** @type {D} */((yield b))/**/;
				((/** @type {E} */(yield b)/**/));
			}
			`
		}
	)
}
/**
 * @param {keyof import("estree").ExpressionMap} _type
 * @param {string} value
 * @returns {import("eslint").RuleTester.InvalidTestCase}
 */
function test_case(_type, value) {
	return {
		code: `
	var value = /** @type {A} */(${value})
	var value = /** @type {B} */(${value}) // comment...
	var value = /** @type {C} */(
		${value} // comment...
	)
	var value = /** @type {D} */((${value}))
	var value = ((/** @type {E} */(${value})))
	`,
		errors: [
			{
				column: 13,
				line: 2,
				messageId: "marker"
			},
			{
				column: 13,
				line: 3,
				messageId: "marker"
			},
			{
				column: 13,
				line: 4,
				messageId: "format"
			},
			{
				column: 13,
				line: 7,
				messageId: "marker"
			},
			{
				column: 13,
				line: 8,
				messageId: "marker"
			}
		],
		output: `
	var value = /** @type {A} */(${value})/**/
	var value = /** @type {B} */(${value})/**/ // comment...
	var value = /** @type {C} */(${value})/**/ // comment...
	
	var value = /** @type {D} */((${value}))/**/
	var value = ((/** @type {E} */(${value})/**/))
	`
	}
}
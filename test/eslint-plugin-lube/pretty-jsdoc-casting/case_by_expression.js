/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} _valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(_valid, invalid) {
	invalid.push(
		test_case("a"),
		test_case("(a, b) => c"),
		test_case("a = b"),
		test_case("a, b, c"),
		test_case("{ a: b, c }"),
		test_case("class { b = c }"),
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
		}
	)
}
/**
 * @param {string} value
 * @returns {import("eslint").RuleTester.InvalidTestCase}
 */
function test_case(value) {
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
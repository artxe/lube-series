/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: `export default /** @type {A} */(
				/**
				 * @param {*} value
				 */
				function(value) {
					return value
				}
			)/**/`
		},
		{
			code: "var v = /** @type {A} */(/* note */ a)"
		},
		{
			code: "var v = /** @type {A} */(// note\na)"
		},
		{
			code: "var v = /** @type {A} */(/** @type {B} */(/* note */ b)/**/)"
		},
		{
			code: `func(
				a
			)`
		},
		{ code: "a((b - c) / d)" },
		{
			code: "var v = 1\n/** @type {A} */(f(a, b))"
		},
		{
			code: "var v = 1\n/** @type {A} */(b).c()"
		},
		{
			code: "var v = new C\n/** @type {A} */(b)"
		},
		{
			code: "function a() { return /** @type {A} */(\n// note\nb)/**/ }"
		},
		{
			code: "function a() { throw /** @type {A} */(\n/* note\nnote */ b)/**/ }"
		},
		{
			code: "var v = /** @type {A} */(/** @type {B} *//** @type {C} */(a))"
		},
		{
			code: "var v = /** @type {{}} */(a)/**/"
		},
		{
			code: "var v = /**\n * @type {A}\n */(a)/**/"
		},
		{
			code: "var v = /* @type {A} */ (a)"
		},
		...[ "a.cts", "a.mts", "a.ts", "a.tsx" ].map(
			filename => ({
				code: "var v = /** @type {A} */( a )",
				filename
			})
		),
		{
			code: "var v = /** @type {A} */(/** @type {B} */(/** @type {C} */(a)))/**/"
		},
		{
			code: "var v = /** @type {A} */(a)/**/()"
		},
		{
			code: "var v = { b: /** @type {A} */(a)/**/ }"
		},
		{
			code: "a = /** @type {A} */((b.c || d).e(f))/**/"
		},
		{
			code: `var v = /** @type {V} */({
				a: /** @type {A} */([/** @type {B} */(b)/**/, /** @type {C} */(c)/**/, /** @type {D} */(d)/**/])/**/,
				e: /** @type {F} */(f)/**/(/** @type {G} */(g)/**/, /** @type {E} */(E)/**/, /** @type {I} */(i)/**/),
				j: /** @type {K} */(k)/**/,
				l: [.../** @type {M} */(m)/**/, .../** @type {N} */(n)/**/, .../** @type {O} */(o)/**/],
				p: /** @type {Q} */(q.r)/**/,
				s: /** @type {S} */(t())/**/,
				u: /** @type {U} */({ v: /** @type {W} */(w)/**/ })/**/,
				.../** @type {X} */(x)/**/
			})/**/;
			/** @type {Y} */(y, /** @type {Z} */(z[/** @type {123} */(123)/**/])/**/)/**/`
		}
	)
	invalid.push(
		{
			code: "var v = /** @type {A} @deprecated */ (a)",
			errors: [ { messageId: "format" } ],
			output: "var v = /** @type {A} @deprecated */(a)/**/"
		},
		{
			code: "var v = /**\n * @type {A}\n */ (a)",
			errors: [ { messageId: "format" } ],
			output: "var v = /**\n * @type {A}\n */(a)/**/"
		},
		{
			code: "var v = /** @type {A} */(/**\n * @type {B}\n */(b)/**/)",
			errors: [ { messageId: "marker" } ],
			output: "var v = /** @type {A} */(/**\n * @type {B}\n */(b))/**/"
		},
		{
			code: "var v = /* note */ /** @type {A} */(a /* note */)",
			errors: [ { messageId: "format" } ],
			output: "var v = /* note */ /** @type {A} */(a)/**/ /* note */"
		},
		{
			code: "var v = /**@type {A}*/(a)/**/",
			errors: [
				{
					column: 8,
					line: 1,
					messageId: "format"
				}
			],
			output: "var v = /** @type {A} */(a)/**/"
		},
		{
			code: "var v = /** @type {A} */(  /** @type {B} */(/** @type {C} */((a) /* block... */))) // line...",
			errors: [
				{
					column: 8,
					line: 1,
					messageId: "format"
				}
			],
			output: "var v = /** @type {A} */(/** @type {B} */(/** @type {C} */((a))))/**/ /* block... */ // line..."
		},
		{
			code: "var v = { b: /** @type {A} */(a) }",
			errors: [
				{
					column: 13,
					line: 1,
					messageId: "marker"
				}
			],
			output: "var v = { b: /** @type {A} */(a)/**/ }"
		},
		{
			code: `var v = /** @type {V} */({
				a: /** @type {A} */([/** @type {B} */(b), /** @type {C} */(c), /** @type {D} */(d)]),
				e: /** @type {F} */(f)(/** @type {G} */(g), /** @type {E} */(E), /** @type {I} */(i)),
				j: /** @type {K} */(k),
				l: [.../** @type {M} */(m), .../** @type {N} */(n), .../** @type {O} */(o)],
				p: /** @type {Q} */(q.r),
				s: /** @type {S} */(t()),
				u: /** @type {U} */({ v: /** @type {W} */(w) }),
				.../** @type {X} */(x)
			});
			/** @type {Y} */(y, /** @type {Z} */(z[/** @type {123} */(123)]))`,
			errors: [
				...new Array(21).fill({ messageId: "marker" })
			],
			output: `var v = /** @type {V} */({
				a: /** @type {A} */([/** @type {B} */(b)/**/, /** @type {C} */(c)/**/, /** @type {D} */(d)/**/])/**/,
				e: /** @type {F} */(f)/**/(/** @type {G} */(g)/**/, /** @type {E} */(E)/**/, /** @type {I} */(i)/**/),
				j: /** @type {K} */(k)/**/,
				l: [.../** @type {M} */(m)/**/, .../** @type {N} */(n)/**/, .../** @type {O} */(o)/**/],
				p: /** @type {Q} */(q.r)/**/,
				s: /** @type {S} */(t())/**/,
				u: /** @type {U} */({ v: /** @type {W} */(w)/**/ })/**/,
				.../** @type {X} */(x)/**/
			})/**/;
			/** @type {Y} */(y, /** @type {Z} */(z[/** @type {123} */(123)/**/])/**/)/**/`
		},
		{
			code: "function a() { return /** @type {A} */(\nb)/**/ }",
			errors: [
				{
					column: 22,
					line: 1,
					messageId: "format"
				}
			],
			output: "function a() { return /** @type {A} */(b)/**/ }"
		},
		{
			code: "function a() { throw /** @type {A} */(\nb)/**/ }",
			errors: [
				{
					column: 21,
					line: 1,
					messageId: "format"
				}
			],
			output: "function a() { throw /** @type {A} */(b)/**/ }"
		},
		{
			code: "function* a() { yield /** @type {A} */(\nb)/**/ }",
			errors: [
				{
					column: 22,
					line: 1,
					messageId: "format"
				}
			],
			output: "function* a() { yield /** @type {A} */(b)/**/ }"
		}
	)
}
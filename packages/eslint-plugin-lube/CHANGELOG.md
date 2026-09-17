# Changelog

## 0.6.0

### Breaking

- **Two configs replace `configs.plugins` and `configs.rules`.** `configs.strict` holds the rules
  `configs.rules` held, the house style with renaming, sorting and core rules, and
  `configs.recommended` is a lighter set that only formats and orders, with rules that all have a
  fix. Each is a flat config object with `plugins` and `rules`: replace
  `plugins: lube.configs.plugins, rules: { ...lube.configs.rules }` with
  `plugins: lube.configs.strict.plugins, rules: { ...lube.configs.strict.rules }`, or spread
  `...lube.configs.strict` into the config.
- **Every rule rejects options it does not know.** A misspelled option such as `maxLenght` is a
  configuration error instead of being ignored, and `pretty-jsdoc-casting` takes no options.
- **`svelte-naming-convention` is a `suggestion` rule, no longer `layout`,** since its fix renames
  identifiers: `eslint --fix --fix-type layout` leaves names alone now.
- **The package is an ES module only.** `import lube from "eslint-plugin-lube"` works as before on
  Node.js 18.18+, 20.9+ and 21.1+, the versions `@stylistic/eslint-plugin` supports. A CommonJS
  `eslint.config.cjs` still gets the plugin itself from `require("eslint-plugin-lube")` on Node.js
  20.19+ and 22.12+, which ESLint 10 requires anyway. Deep paths such as `eslint-plugin-lube/rules/ascii-order` are gone; the rules are
  `lube.rules`.
- **Both configs use `@stylistic/eslint-plugin` instead of the deprecated core formatting
  rules,** which ESLint 11 removes. Rename overrides of those rules:
  ```js
  // before
  rules: { ...lube.configs.rules, "indent": ["error", 4] }
  // after
  rules: { ...lube.configs.strict.rules, "@stylistic/indent": ["error", 4] }
  ```
  `func-call-spacing` is `@stylistic/function-call-spacing`. `@stylistic/indent` also checks
  TypeScript syntax, and `@stylistic/operator-linebreak` checks `=` of type aliases, which stays at the
  end of the line: `type Name =` followed by `| "a"`.
- **The strict config reports blank lines** with `@stylistic/no-multiple-empty-lines` (`max: 0`)
  and fixes `arrow-body-style`, `new-parens`, `no-extra-boolean-cast`, `no-extra-semi`,
  `no-unneeded-ternary`, `no-useless-computed-key`, `no-useless-rename`, `no-useless-return`,
  `prefer-exponentiation-operator`, `prefer-object-spread` and `yoda`. Run `eslint --fix` once.
- **The strict config reports functions assigned to variables** with `func-style`
  (`declaration`): write `function name() {}` instead of `const name = () => {}`. Callbacks and
  arrow functions that use `this` are not reported. It cannot be fixed.
- **The strict config sorts import statements, import and export names, object keys, function
  declarations and test cases** with the new `ascii-order`, all of its options on. Run
  `eslint --fix` once, then reorder by hand what it reports without a fix, or disable it where the
  order matters: `// eslint-disable-next-line lube/ascii-order`. A report without a fix says why,
  ``Move key "a" before "b" to keep keys in ASCII order; it is not fixed automatically because moving
  `f()` could change the order of side effects, so reorder it by hand``, or that a comment or statement
  next to the item would end up in the wrong place. Keys whose values construct a
  built-in from literals, such as `{ updatedAt: new Date(), createdAt: new Date() }` and
  `{ s: new Set([ 1 ]), m: new Map() }`, are fixed, and so are keys whose values are a `const`, a
  namespace import or a function or class declaration that is never assigned, which no call can
  change: `{ shadow: shadowed(), helper }`. A `const` or class counts only where the value comes
  after its declaration and outside a function declaration, which could run before it, so a read
  that throws in the temporal dead zone still throws after the calls written before it. A
  construction that always throws, such as `new RegExp("(")`, `new Array(-1)` or `new Map([ 1 ])`,
  is not moved, nor one that another runtime may reject or that allocates a lot while linting:
  `new RegExp` with a flag other than `gimsuy` or with syntax newer than ES2018, such as
  `new RegExp("a", "v")` or `(?i:a)`, and `new Array`, a buffer, a typed array or a `DataView` with a
  number over 65536 in its arguments, such as `new Set(new Array(1e8))`. Its fix assumes modules can run
  in any order and nothing reads key order: sorted keys change `Object.keys`, `JSON.stringify` and
  `for...in`, and an import without names, such as `import "./setup.js"`, is never moved and no
  import moves across it. Under `exports` and `imports` of a
  `package.json` it puts `types` first and `default` last, as TypeScript and Node.js read them.
- **Both configs break nested and long ternaries** with the new `pretty-ternary`: a
  ternary with a ternary branch, or longer than 80 characters, puts `?` and `:` at the start of their
  lines, one indent deeper per level. Run `eslint --fix` once.
- **`pretty-imports` checks imports with a default import** such as `import def, {a,b} from "m"`,
  which it skipped before.
- **`pretty-sequence` and `pretty-imports` leave the indentation of code that is already written over
  several lines to `@stylistic/indent`,** and write it only for the line breaks they insert themselves.
  The two rules owned the same lines before, so wherever the indent rule measures a line differently,
  `eslint --fix` never finished. Turn `fixIndent` on in a config without an indent rule.
- **Both configs wrap the `@stylistic` rules whose fixes break code or never settle:**
  `comma-style` leaves the comma of an array hole on its own line, `operator-linebreak` leaves an
  operator a comment follows, `object-curly-newline` and `object-curly-spacing` skip optional
  destructured parameters, `key-spacing`, `semi-spacing`, `space-unary-ops`, `generator-star-spacing`,
  `rest-spread-spacing` and `yield-star-spacing` keep the comments in the space they remove, every fix
  writes the line break of the file, and a fix that would change nothing is dropped.
- **`max-len` is in neither config,** since it cannot be fixed.
- **`svelte-naming-convention` reports more declarations.** Function expression names and
  parameters, `catch` parameters, parameters of exported camelCase functions, non-shorthand
  destructuring such as `const { key: camelCase } = value` and `import { "name" as camelCase }`
  are reported now. Expect new errors on existing code.
- **`svelte-naming-convention` treats `for...in` and `for...of` targets as usages.** They are fixed
  together with their declaration, like assignments, instead of being renamed on their own.
- **`pretty-jsdoc-casting` puts one empty comment after nested castings that end together,** after
  the outermost one: `/** @type {A} */(/** @type {unknown} */(a))/**/` instead of
  `/** @type {A} */(/** @type {unknown} */(a)/**/)/**/`. Run `eslint --fix` once.
- **Every rule message says what to change and why:** `Rename 'isV' to 'is_v'`,
  ``Write these items on one line as `[ a, b ]`, since they fit in 30 characters``,
  `Put each item and the closing bracket on a line of its own, since the items are longer than 30
  characters together`, ``Break this ternary before `?` and `:`, since a branch is another ternary``,
  `Move key "a" before "b" to keep keys in ASCII order`. The message IDs are new:
  `pretty-sequence` reports `multiline`, `single_line` and `indent`; `pretty-imports` `multiline`,
  `single_line`, `indent`, `semicolon` and `no_semicolon` for imports and exports alike;
  `pretty-ternary` `multiline` and `spacing`; `pretty-jsdoc-casting` `marker` and `format`; and
  `svelte-naming-convention` `rename` and `case`.

### Fixed

- The `maxLength` of `pretty-sequence` and `pretty-imports` counts a character that takes two
  columns, such as a Korean, Chinese or Japanese one, as two. A line of Korean strings and a line of
  Latin ones that take the same width on screen are now broken or joined alike, where the Korean one
  used to stay on one line at twice the width.
- The message that asks for one line said the items "fit in" the `maxLength`, although it measures
  the items alone, without the code around them, so the line it wrote could be much longer. It now
  names the width it measured: "since the items are 75 characters together, within the 80 allowed".
- `pretty-jsdoc-casting` added `/**/` after casts in TypeScript files, where a JSDoc cast means
  nothing. `.ts`, `.tsx`, `.mts` and `.cts` files are not checked now.
- The `one-var` fix of the strict config left `const a = 1; const b = 2` on one line, which
  `@stylistic/max-statements-per-line` reported without a fix. `eslint --fix` puts each of the
  declarations on a line of its own now.
- `no-duplicate-imports` of the strict config reported `import type { A } from "m"` next to
  `import { b } from "m"`. A separate type import is allowed now.
- The `@stylistic/space-unary-ops`, `rest-spread-spacing`, `generator-star-spacing`,
  `yield-star-spacing`, `semi-spacing` and `key-spacing` fixes of both configs deleted a
  comment in the space they remove, or moved a colon into one: `!/** @type {A} */(a)/**/` lost its
  type cast, `.../* @__PURE__ */ f()` its comment, and `a // note` followed by `: 1` became
  `a // note: 1`. Such a space is left unreported now.
- In a file whose line breaks are CRLF, CR, U+2028 or U+2029, `pretty-sequence`, `pretty-imports`
  and `pretty-ternary` counted only LF as a line break, so they indented from the wrong line, wrote
  LF line breaks into the file and never stopped fixing it; `pretty-sequence` also indented the lines
  inside a string or a template that spans such lines, changing its value, `` f(`a `` + U+2028 +
  `` b`, c) `` grew a tab in front of `b`, and `pretty-ternary` and `pretty-jsdoc-casting` read those
  line breaks as none. Every rule and the `@stylistic` fixes of both configs follow the
  line break of the file now.
- `ascii-order` sorted only the outermost of nested objects, patterns or import braces per
  `eslint --fix` pass, one pass per nesting level, so deeply nested files needed more than the 10
  passes ESLint runs. Nested ones are sorted in the same pass now.
- `ascii-order` swapped destructuring targets whose order matters: `var { b: x, a: x } = o` changed
  the value of `x`, and `({ b: this.b, a: this.a } = o)` the order of the setter calls. They are
  reported without a fix now.
- `pretty-imports` removed `type` from `import type` and `export type`, import attributes such as
  `with { type: "json" }`, and comments between the braces.
- `pretty-imports` removed a semicolon another statement needs: the one before a statement on the
  same line, `import { a } from "m";var b = 1` became `import { a } from "m"var b = 1`, and the one
  that starts the next line, `;[a].map(f)`. It also added a semicolon before the `}` that closes a
  namespace, which `@stylistic/semi` of both configs removed again on every fix.
- `pretty-jsdoc-casting` changed what a cast means: it moved the cast of an inner expression out of
  the parentheses, `/** @type {X} */(/** @type {A} */(a).b)` became
  `/** @type {A} *//** @type {X} */((a).b)`, deleted the text after the type of a type comment,
  `/** @type {A} @deprecated */ (a)` lost `@deprecated`, turned the plain comment
  `/* @type {A} */ (a)` into a type cast, and removed the empty comment after a type comment that
  spans lines. A type comment is kept as written now unless it holds only the type. It also mangled
  `/** @type {A} */(a)/**//**/`, left a double space for `/** @type {A} */ (a)` and moved a cast onto
  the next line when a line break followed the type comment.
- `pretty-jsdoc-casting` moved what stood between the cast parenthesis and the expression in front
  of the type comment: a line break, so `return /** @type {A} */(` followed by `b)/**/` returned
  `undefined`; the JSDoc of a function inside the cast, which landed between `export default` and
  the cast with broken indentation; and the white space of a cast written over several lines, which
  put the cast on a new line and left the old one empty, so with either config every
  `eslint --fix` added one more line and one more indent level. That white space is dropped now,
  unless a line comment ends there, and a cast is left unfixed when another comment stands there or
  when a line break after `return`, `throw` or `yield` would stay.
- `pretty-jsdoc-casting` read the argument parentheses of a call as cast parentheses when a type
  comment stood before them, so `var x = 1` followed by `/** @type {T} */(f(a))` (a call, because no
  semicolon ends the first line) got a `/**/` marker and never stopped fighting `pretty-sequence`.
  The parentheses of a call, `new` or `import()` are left alone now.
- `pretty-sequence` and `pretty-jsdoc-casting` took time quadratic in the file size, and
  `pretty-sequence` in the line length: a 258 KB file took about 40 seconds per rule and takes about
  0.1 seconds, and a 1.4 MB single-line file took 33 seconds and takes about 2 seconds, most of it
  parsing.
- `pretty-sequence` broke TypeScript: `({ a, b }: Props) => a` became `({ a, b s) => a`, the
  annotation of an array pattern was deleted, and `f<(x: number) => void>( a )` became `f<(a)`.
- `pretty-sequence` lost or moved comments and holes: a line comment after the last item commented
  out the closing bracket, `[ b, c // note` followed by `]` became `[ b, c // note ]`; comments after
  a trailing comma or inside empty brackets and the trailing hole of `[a, ,]` were deleted; and a
  line comment after an item's comma moved onto the next item's line. It stays with its item now.
- `pretty-sequence` changed the value of a multiline template literal, a string with a line
  continuation or a multiline JSX attribute string, `f(a, <div title="one` followed by `  two">)`,
  by re-indenting its lines. Such sequences are left unfixed.
- `pretty-sequence`: with `funcCallSpacing`, `a => b` gained more spaces on every fix.
- `pretty-sequence` wrote indentation onto the empty lines of a function it moved to a new line.
- `pretty-sequence` and `@stylistic/indent` fixed each other endlessly ("Circular fixes detected")
  for a sequence opening on the first line of a declaration whose last declarator starts on a later
  line, `let i = [` … `], a = 1`, for a line starting with `;` as `@stylistic/semi-style: first`
  writes it, for the arguments of a call that follows a multiline parenthesized expression on the
  same line, `(a` `|| b).catch(c, d)` or `(a ? b : "") + f(c, d)`, and for a sequence on a line that
  starts inside a block comment, `*/ const a = [b, c]`. `pretty-sequence` indents them like
  `@stylistic/indent` now.
- In `.svelte` files, `pretty-sequence` and `pretty-ternary` indented a template expression such as
  `{await f(` from the column where the markup before it started, and `@stylistic/indent` undid it
  on every fix.
- The `pretty-sequence` rule description was copied from `pretty-jsdoc-casting`.
- `svelte-naming-convention` renamed usages as if they were declarations, arrow function bodies and
  `extends` clauses among them, so references to imported or global names broke, and it left other
  usages with the old name: `do...while` conditions, computed keys, class field values, `import()`,
  JSX, decorators, TypeScript expressions such as `camelCase as T`, `camelCase!` and
  `typeof camelCase`, `export = camelCase`, enum member values, type predicates, the overloads of a
  function (only the implementation was renamed), the object of a JSX member tag such as
  `<routeModule.Layout>`, and the markup of a `.svelte` file, where every node was read as a name
  the rule must not touch, so `{camelCase}` in a mustache tag, an attribute, a directive or a block
  expression stopped the rename. Every usage that scope analysis reaches is renamed with its
  declaration now, a shorthand attribute becomes `camelCase={camel_case}`, what the markup declares,
  such as the context of `{#each}` or a `let:` property, is left alone, and a name is reported
  without a fix where the rule cannot tell a reference from a type or a property, such as
  `let a: camelCase`, or where it is a component tag, `<My_Comp />`, which a lowercase name would
  turn into an HTML tag.
- `svelte-naming-convention` broke destructuring and exports: `{ camelCase: camelCase }` was read as
  a shorthand property and became `{ camelCase: camelCase: camel_case }`, a shorthand with a default,
  `{ camelCase = 1 }` in a pattern, was never renamed while every other use of the name was, and
  `export { camelCase }` lost its binding. They become `{ camelCase: camel_case }`,
  `{ camelCase: camel_case = 1 }` and `export { camel_case as camelCase }` now, the declaration and
  its export specifier in one fix, since separate fixes in one pass could leave `export` pointing at
  a name that no longer exists, a syntax error.
- `svelte-naming-convention` matched usages to declarations by name only, so its fixes broke code
  that the Svelte code base holds: a global or an exported camelCase function used where a parameter
  of the same name was renamed elsewhere was renamed too, e.g. `requestAnimationFrame()` or
  `flushSync()` became undefined; the usages of an import, `import { fetchModule }`, were renamed
  with a same-named declaration elsewhere but not the import; a name whose snake_case form is already
  a variable was renamed into it, e.g. `itemCount` next to `item_count`; the type annotation and `?`
  of a TypeScript name were deleted, `itemCount?: number` became `item_count`; a parameter mentioned
  in the prose of a JSDoc comment was renamed while `@param {T} callbackFn`, `[superClass]`,
  `{callbackFn is F}` and `typeof callbackFn` kept the old name and failed type checking; and a store
  read as `$userStore` lost its declaration. Usages follow scope analysis now, an import becomes
  `import { fetchModule as fetch_module }` and `import { foo_bar as fooBar }` becomes
  `import { foo_bar }`, a colliding rename is reported without a fix, only `typeof`, `asserts` and
  `is` inside `{ }` of a JSDoc comment are renamed with the parameter, and in a `.svelte` file the
  `$camelCase` subscriptions are renamed with the store in one fix, while outside one `$camelCase`
  stays a name of its own and nothing is renamed.
- `svelte-naming-convention` renamed only part of a name and broke the code when another rule's fix
  overlapped a usage in the same `eslint --fix` pass, such as one inside an argument list
  `pretty-sequence` reformats, or when a declaration of the name is one the rule does not rename: a
  function merged with a TypeScript namespace of the same name, as in `.d.ts` files,
  `declare namespace pLimit` and `declare function pLimit(): pLimit.Limit`, a declaration exported
  with `export var` next to a `var` of the same name, a parameter that shadows a function of the same
  name, and a declaration turned off with `// eslint-disable-next-line`, `// eslint-disable-line` or
  `/* eslint-disable */`, whose usages were renamed anyway. With `fixSameNames`, usages are renamed
  first and the declaration in a later pass, once no usage of the old name is left, together with the
  assignments to it and an `export default` of it, so `prefer-const` of the strict config never
  turns `let lastBid = 1` into a `const` whose `lastBid += 1` was renamed in an earlier pass, and
  `ascii-order` never moves a default-exported function while the export names it differently; a
  name whose snake_case form is declared elsewhere is renamed in one fix with its usages; with
  `fixSameNames: false` a declaration is renamed with its usages instead of without them; and the
  other names are reported without a fix.

### Added

- `pretty-sequence` and `pretty-imports` take `fixIndent`. With it on, the rule reports a sequence or a
  list of specifiers whose lines differ from it only in their indentation, as it always did.
- `ascii-order`, in the strict config: sorts import statements by module path, names in import
  and export braces, object keys, function declarations next to each other and `describe`, `it` and
  `test` calls in ASCII order, each turned off with `checkImports`, `checkNames`, `checkKeys`,
  `checkDeclarations` or `checkTests`. Side-effect imports and a function exported with
  `export default name` keep their place. When moving an item could change what the code does, such
  as swapping two object values that call functions, it reports without a fix.
- `pretty-ternary`, in both configs: breaks a ternary or TypeScript conditional type
  before `?` and `:` when a branch is another ternary, when it is longer than `maxLength` (80) or
  when it already spans lines, indenting each nested level once more. Only the spaces around `?`
  and `:` change.
- `configs.recommended`, for format on save: the `@stylistic` formatting rules, `pretty-imports`,
  `pretty-jsdoc-casting`, `pretty-sequence` and `pretty-ternary` with items on one line up to 80
  characters, and `ascii-order` for the names inside import and export braces only. It ends a file
  with a line break, allows one blank line, never renames or moves statements or keys, and every
  rule in it has a fix: `{ ...lube.configs.recommended, files: ["**/*.js"] }`, or
  `extends: ["lube/recommended"]` with `defineConfig`.
- `configs.strict`, the house style: everything above plus `svelte-naming-convention`, every
  `ascii-order` check, `pretty-sequence` and `pretty-imports` at 30 characters, no blank lines, no
  line break at the end of a file, one statement per line and core rules such as `func-style`,
  `no-shadow` and `prefer-const`.
- `meta.version`, so ESLint can cache results per plugin version.
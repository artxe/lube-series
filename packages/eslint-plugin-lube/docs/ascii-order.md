# ascii-order
Sorts import statements, import and export names, object keys, function declarations and test cases in ASCII order, so uppercase before lowercase. The strict config turns all five on; the recommended config only sorts names inside import and export braces, which never changes what the code does.

- **Import statements** next to each other, by module path: `"../a.js"`, `"./b.js"`, `"c"`, `"node:d"`. Side-effect imports such as `import "polyfill"` keep their place and split the imports into groups.
- **Names** in import and export braces, by the name written first: `import def, { B, a as c }`, `export { a as z, b }`.
- **Keys** of object literals, destructuring patterns, TypeScript type literals and interfaces. Spread, rest, computed keys and index signatures split the keys into groups sorted on their own. Under `exports` and `imports` of a `package.json`, where conditions match in order, `types` goes first and `default` last, and the conditions between them are in ASCII order.
- **Function declarations** next to each other in the same block, TypeScript overloads included. A function exported with `export default name` keeps its place.
- **Test cases**: `describe`, `it` and `test` calls next to each other with a string title, `it.skip` and `test.only` included.

Comments on their own lines above an item and comments after it on the same line move with it.
Nested objects, patterns and braces are sorted in the same pass.

The fix assumes three things it cannot see, and changes behavior where they do not hold:
- **Modules evaluate in any order.** Moving an import statement changes the order in which its module and the modules it imports run their top-level code. A module whose top-level code has to run first, such as a polyfill or a setup file, is imported without names, `import "./setup.js"`, which the rule never moves and never moves another import across. Disable the rule for the other imports whose order matters.
- **Key order is not observed.** Sorting keys changes the order of `Object.keys`, `Object.entries`, `JSON.stringify` and `for...in`, so an object literal serialized or iterated in a written order changes its output, and a destructuring pattern reads the properties, running their getters, in the new order. Integer-like keys such as `2` and `10` are listed in numeric order by JavaScript anyway. A key written twice keeps its last value.
- **Tests do not depend on each other.**

Where the order matters, disable the rule for that statement, `// eslint-disable-next-line lube/ascii-order`, or turn off one kind with the options below.

Beyond that, only the error is reported, without a fix, when moving would change what the code evaluates or where comments end up. The message then says why and names the value that keeps it in place, as in ``Move key "a" before "b" to keep keys in ASCII order; it is not fixed automatically because moving `f()` could change the order of side effects, so reorder it by hand``:
- An object value that calls a function, constructs an object, assigns, updates, deletes, awaits or yields would change places with another value that is not a constant or a function. A variable is a constant when it is a `const`, a namespace import (`import * as x`), or a function or class declaration that is never assigned, and the value is the variable itself, also inside an array, `!x`, `typeof x`, `x === y`, `a ? x : y` or `x ?? y`; `x.y`, `` `${x}` ``, `-x`, `x + 1` and `...x` can run code of `x`. A `let`, `var`, parameter, global or named import, which the exporting module can reassign, still counts as a variable a call may change, so `{ b: f(), a: x }` is fixed only for such a constant `x`. A `const` or class counts only where the value comes after its declaration and not inside a function declaration, which can run before it: reading it earlier throws in its temporal dead zone, and moving the read before `f()` would throw before `f()` runs. Constructing a built-in counts as reading a variable: it reads the global of the constructor, which a call may replace, so it never moves across a call, while `{ updatedAt: new Date(), createdAt: new Date() }` and `{ s: new Set([ 1 ]), m: new Map() }` are fixed: `new` of `Array`, `ArrayBuffer`, `Date`, `Map`, `RegExp`, `Set`, `WeakMap`, `WeakSet`, the typed arrays such as `Uint8Array`, and `Error` and its subclasses except `AggregateError`, when the name is not declared in the file and every argument is built only from literals, `undefined`, `NaN`, `Infinity`, templates without expressions, negative numbers, array and object literals and such constructions, and when the construction does not throw with those arguments, which the rule tries while linting: `new RegExp("(")`, `new Array(-1)`, `new Set(1)`, `new Map([ 1 ])`, `new WeakSet([ 1 ])` and `new URL("/a")` would throw before the values moved in front of them run, and are not fixed. The runtime that lints is not the one that runs the code, so `new RegExp` is fixed only with the flags `g`, `i`, `m`, `s`, `u` and `y` and the syntax of ES2018: `new RegExp("a", "v")`, the `d` flag, modifiers such as `(?i:a)` and a group name used twice may throw in an older runtime, and are not fixed. The same goes for `DataView` and `URL`, as in `new DataView(new ArrayBuffer(8))` and `new URL("a", "https://example.com")`. An `Array`, `ArrayBuffer`, typed array or `DataView` with a number, a numeric string or an object property over 65536 in its arguments, as in `new Array(1e8)`, `new ArrayBuffer(8, { maxByteLength: 1e9 })` or `new Uint8Array({ length: 1e9 })`, is not tried and not fixed, since trying it would allocate that much while linting. Two `new Date()` values may then read the clock in the other order. `new Date(x)` and `new Set(items)` can run code of `x` and `items`, and are not fixed.
- A destructuring default that is not a constant would change places with another key.
- A destructuring target is assigned by two keys, or a member such as `this.a` would change places with another key.
- A comment shares a line with two items, or a line comment would end up before a closing bracket.
- The first statement of a file has comments before it and would move.
- A statement without a semicolon would end up on a line with the next one, as in `import b from "b"; import a from "a"`.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            checkDeclarations: { default: true, type: "boolean" },
            checkImports: { default: true, type: "boolean" },
            checkKeys: { default: true, type: "boolean" },
            checkNames: { default: true, type: "boolean" },
            checkTests: { default: true, type: "boolean" }
        },
        type: "object"
    }
]
```
### checkDeclarations
If it is `true`, it sorts function declarations.
### checkImports
If it is `true`, it sorts import statements.
### checkKeys
If it is `true`, it sorts object keys.
### checkNames
If it is `true`, it sorts the names in import and export braces.
### checkTests
If it is `true`, it sorts test cases.

## Valid
```js
import { A, B, a } from "a-module"
import value from "b-module"
const object = { a: 1, b: 2, ...rest, a_b: 3 }
function main() {}
function b() {}
function c() {}
export default main
it("a", () => {})
it("b", () => {})
```

## Invalid
```js
import other from "b-module"
import { y, x } from "a-module"
const value = { b: 1, a: 2 }
function b() {}
function a() {}
it("b", () => {})
it("a", () => {})
// reported without a fix: g() would run before f()
const later = { b: f(), a: g() }
// fixed: constructing a built-in from literals runs no code of the file
const empty = { s: new Set([ 1 ]), m: new Map() }
```
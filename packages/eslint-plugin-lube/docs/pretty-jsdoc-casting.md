# pretty-jsdoc-casting
Enforces an empty comment after a JSDoc type cast, `/** @type {T} */(value)/**/`, so the end of the cast is as visible as its start, and writes the cast on one line without white space inside its parentheses.

- TypeScript files, `.ts`, `.tsx`, `.mts` and `.cts`, are not checked, since TypeScript reads no type from a JSDoc cast there.
- A type comment is a `/**` comment with `@type {T}`. One holding only the type is written as `/** @type {T} */`; any other, such as one spanning lines, is kept as written.
- Nested castings that end together get one empty comment, after the outermost one.
- A casting of an inner expression is never moved out of its parentheses.
- The white space inside the parentheses it removes is dropped, unless a line comment ends there, so a casting written over several lines becomes one line.
- A casting after `return`, `throw` or `yield` is not checked when a line break stays between the keyword and the expression, such as one ending a line comment inside the parentheses.
- Parentheses holding the arguments of a call, `new` or `import()` are never read as a casting, even after a type comment: without a semicolon, `/** @type {T} */(a)` on a line of its own calls the expression above it.
- A casting is not checked when a comment other than a type comment sits between its opening parenthesis and the expression, such as the JSDoc of a function inside the cast, because the fix would move that comment in front of the type comment.

## options
None.

## Valid
```js
var v = func(
    a
)
var v = /** @type {A} */(/** @type {B} */(/** @type {C} */(a)))/**/
var v = /** @type {A} */(a)/**/()
var v = { b: /** @type {A} */(a)/**/ }
```

## Invalid
```js
var v = /** @type {A} */(  /** @type {B} */(/** @type {C} */((a))))
var v = { b: /** @type {A} */(a) }
var v = { b: /**@type {A}*/(a)/**/ }
var v = /** @type {A} */(/** @type {B} */(a)/**/)/**/
```
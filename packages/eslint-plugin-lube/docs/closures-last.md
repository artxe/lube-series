# closures-last
Enforces the function declarations inside a function body below all its other statements: below the `return`, or at the bottom of the body when there is none. A function declaration is hoisted, so moving it never changes what the code does.

- Checked are the statements directly in the body of a function declaration, a function expression or an arrow function.
- Not checked: the top level of a file, blocks inside a body (`if`, loops, `static` blocks, TypeScript namespaces), and arrow functions or function expressions assigned to variables, which are not hoisted.
- TypeScript overload signatures move with their implementation.
- The fix moves the declarations to the end of the body, keeping the comments above each one (JSDoc, `eslint-disable-next-line`, `@ts-expect-error`) and the comment after it on its line. The file's own line breaks are kept.
- A body whose statements share a line, `function f() { function a() {} return a }`, is reported without a fix.
- A statement starting with `(`, `[`, a template literal or an operator that moving a function would join to the statement before it, as a semicolon-free file reads them as one expression, gets a `;` at its start: `var x = 1\nfunction a() {}\n(x)` becomes `var x = 1\n;(x)\nfunction a() {}`. One after a statement ending with `;` or with the brace of a block, such as `if (x) {}`, stays as it is.
- With `ascii-order` enabled for the file and `checkDeclarations` on, the fix emits the moved declarations in `ascii-order`'s order (overloads of one name stay together), so that rule has nothing left to reorder; otherwise they keep their source order.

## options
None.

## Valid
```js
function outer() {
    return inner
    function inner() {}
}

function other() {
    const handler = () => 1
    return handler
}
```

## Invalid
```js
function outer() {
    function inner() {}
    return inner
}
```

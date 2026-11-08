# no-typedef
Disallows the JSDoc tags `@typedef` and `@callback`.

- Declare the type in a `.d.ts` file and use it through `import("./types.js").Name` or a `/** @import */` tag.
- A tag inside a `/* */` comment that is not JSDoc, a `//` comment or a string is not checked.
- It has no fix, since the type moves to another file.

## options
None.

## Valid
```js
/** @type {import("./types.js").Name} */
let name
```

## Invalid
```js
/** @typedef {string} Name */
/**
 * @callback Run
 * @returns {void}
 */
```

# require-returns
Requires a `@returns` tag in the JSDoc of every function declaration and every function held by a `const`.

- Methods, object members, callbacks and functions held by `let` or `var` are not checked.
- The fix adds `@returns {void}` (`@returns {Promise<void>}` for an async function), creating the block when there is none, only when the function returns no value. A function that returns a value, a generator, and one whose declaration or JSDoc does not start its line are reported without a fix, since the type is yours to write.
- `@return` counts as a tag too.

## options
None.

## Valid
```js
/** @returns {number} */
const count = () => 1
```

## Invalid
```js
function run() {}
const count = () => 1
```

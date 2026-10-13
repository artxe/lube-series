# prefer-param-tag
Enforces JSDoc `@param` tags on a function declaration, instead of inline `/** @type {T} */` comments inside its parameter list.

- Only function declarations are checked, `export` and `export default` ones too. Arrow functions and function expressions, such as `items.map((/** @type {string} */ x) => x)`, have no declaration to carry a tag and are left alone, and so are casts in a body.
- The fix removes the inline comments and adds one `@param {T} name` line per parameter to the JSDoc block above the declaration, in parameter order, after the existing `@param` tags and before `@returns` and the like. It creates the block when there is none, and keeps the indentation of the declaration. A `@param` tag that already names the parameter is not repeated.
- A default value, `/** @type {number} */ n = 1`, is typed by `@param {number} n` too.
- A destructured or rest parameter has no simple name to write in a tag and is reported without a fix. So is a declaration that does not start its line, where a block cannot be added.

## options
None.

## Valid
```js
/**
 * @param {string} tx
 */
function use(tx) {}
items.map((/** @type {string} */ x) => x)
```

## Invalid
```js
function use(/** @type {string} */ tx) {}
async function source(/** @type {unknown} */ n, /** @type {number} */ m = 1) {}
```

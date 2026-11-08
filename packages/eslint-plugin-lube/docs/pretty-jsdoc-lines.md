# pretty-jsdoc-lines
Enforces a JSDoc block of one tag on one line, and a block of two or more tags with one tag a line.

- A block of several lines that holds one tag and no description is joined into one line: `/** @returns {void} */`. A tag whose type spans lines, such as `@param {{\n * a: number\n * }} total`, is left alone, because the line breaks separate the members of a type literal. A block with a description, a blank line or an `@example` is left alone.
- A one-line block that holds two or more tags is split, one tag a line, a description first. A block that does not start its line is reported without a fix.
- Braces keep `{@link A}` and the types of the tags from being read as tags.

## options
None.

## Valid
```js
/** @returns {void} */
function f() {}
/**
 * @param {number} count
 * @returns {void}
 */
function g(count) {}
```

## Invalid
```js
/**
 * @returns {void}
 */
function f() {}
/** @param {number} count @returns {void} */
function g(count) {}
```

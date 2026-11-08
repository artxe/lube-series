# no-loose-types
Disallows `any`, `*`, `object` and `Object` in the type of a JSDoc tag (`@type`, `@param`, `@returns`, `@template`, ...) and in TypeScript type annotations.

- Use `unknown` where the value is really arbitrary, or its real type.
- A property or parameter named `any` or `object`, a member such as `obj.any` and text inside a string are not types and stay valid.
- It has no fix, since the type is yours to write.

## options
None.

## Valid
```js
/** @type {Record<string, unknown>} */
const bag = {}
```

## Invalid
```js
/** @type {any} */
let a
/** @param {*} value */
function f(value) {}
/** @returns {Promise<object>} */
async function g() {}
```

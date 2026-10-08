# prefer-type-tag
Enforces a JSDoc type tag on a declaration, `/** @type {T} */` on the line before it, instead of a type cast of its whole value, `const v = /** @type {T} */(value)/**/`, wherever the value is assignable to `T` and the tag says the same.

The rule needs type information: it reads the types of the value and of the cast from the TypeScript program of `@typescript-eslint/parser`, and checks nothing without one. Turn it on with `projectService`, for files that a `tsconfig.json` with `checkJs` includes:
```js
// eslint.config.js
import tsParser from "@typescript-eslint/parser"
import lube from "eslint-plugin-lube"

export default [
    {
        ...lube.configs.strict,
        files: ["**/*.js"],
        languageOptions: {
            parser: tsParser,
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
        }
    }
]
```

- TypeScript files, `.ts`, `.tsx`, `.mts` and `.cts`, are not checked, since TypeScript reads no type from a JSDoc cast there.
- A cast the value is not assignable to is kept: it narrows, as `/** @type {T} */(list[0])/**/` drops the `undefined` that `noUncheckedIndexedAccess` adds, and a tag would fail type checking. So is a cast through `unknown`, `/** @type {T} */(/** @type {unknown} */(value))/**/`, and an object literal with a property the type lacks.
- `/** @type {const} */` is kept, since a tag cannot make a value constant.
- A cast that widens the value to a union, `let found = /** @type {Item | null} */(null)/**/`, is kept: TypeScript narrows a variable typed by a union tag to the type of its value, so `found` would read as `null` even after a callback assigned an item, and a comparison with another member of the union would fail type checking.
- Only a cast of the whole value of a declaration with one variable is checked, and not one in the head of a `for` loop, where a tag has nowhere to go. A declaration that already has a `@type` tag is left alone.
- The tag goes on its own line before the declaration and any `eslint-disable-next-line`, `@ts-expect-error` or `@ts-ignore` comment above it. A declaration with a JSDoc comment of its own is reported without a fix: add the type to that comment by hand.

## options
None.

## Valid
```js
/** @type {string[]} */
const names = JSON.parse(text)
const first = /** @type {string} */(names[0])/**/
const units = /** @type {const} */([ "s", "m" ])/**/
let found = /** @type {Item | null} */(null)/**/
```

## Invalid
```js
const names = /** @type {string[]} */(JSON.parse(text))/**/
const empty = /** @type {string[]} */([])/**/
```

# pretty-imports
Formats import and export statements: the names on one line when they fit, or one per line. The order of imports is checked by [ascii-order](ascii-order.md).

- `import type`, `export type` and import attributes are kept, and a statement containing comments is not checked.
- A statement already written over several lines is left to `@stylistic/indent`, which owns the indentation of lines this rule did not write; `fixIndent` gives that back to this rule.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            checkExports: { default: true, type: "boolean" },
            checkImports: { default: true, type: "boolean" },
            fixIndent: { default: false, type: "boolean" },
            indent: { default: "\t", type: "string" },
            maxLength: { default: 30, type: "number" },
            semicolon: { default: false, type: "boolean" }
        },
        type: "object"
    }
]
```
### checkExports
If it is `true`, it checks export statements.
### checkImports
If it is `true`, it checks import statements.
### fixIndent
If it is `true`, it also reports a statement whose lines differ from this rule only in their indentation. Leave it off while `@stylistic/indent` is on, or the two rules keep rewriting each other's fixes.
### indent
The string of one indentation level. Match it to `@stylistic/indent`, or the two rules keep rewriting each other's fixes.
### maxLength
The names are written one per line when they are longer than this together, commas and spaces not counted, a character that takes two columns counting as two.
```js
// If maxLength is less than or equal to 20, an error occurs.
export { fff, ggg, hhh, iii, jjj, kkk, lll } from 'module/2'
```
### semicolon
If it is `true`, insert a semicolon explicitly.
A semicolon that separates the statement from the next one on the same line is kept either way, and so is one that starts the next line, as `@stylistic/semi-style` writes it.

## Valid
```js
export { a, b as c, d } from 'module'
export { fff, ggg, hhh, iii, jjj, kkk, lll } from 'module/2'
import {
    aaaaa_bbbbb,
    aaaaa_ccccc,
    aaaaa_ddddd
} from "module"
import def, { a, b } from "module/2"
```

## Invalid
```js
export { a, b as c, d } from 'module';
export {e, f as g, h} from 'module'
export {
    i,
    j as k,
    l
} from 'module'
import { aaaaa_bbbbb, aaaaa_ccccc, aaaaa_ddddd } from "module"
import def, {m, n} from "module/2"
// only with fixIndent: true
import {
    aaaaa_eeeee,
    aaaaa_fffff,
    aaaaa_ggggg
    } from "module"
```
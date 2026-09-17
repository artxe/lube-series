# pretty-ternary
Breaks nested and long ternaries, `a ? b : c` and TypeScript conditional types, before `?` and `:`.

- A ternary is broken when a branch is another ternary, when it is longer than `maxLength`, or when it already spans lines.
- A missing line break before `?` or `:` is inserted one level deeper than the line the ternary starts on, and one level deeper again for a ternary in a branch. A ternary inside parentheses is checked on its own.
- The indentation of a `?` or `:` that already starts a line is left to `@stylistic/indent`, which indents it the same way.
- Only the spaces around `?` and `:` are fixed, so the operands keep their text and comments. A ternary with a line comment right after `?` or `:` is not fixed.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            ignoreTemplateLiteral: { default: true, type: "boolean" },
            indent: { default: "\t", type: "string" },
            maxLength: { default: 80, type: "number" }
        },
        type: "object"
    }
]
```
### ignoreTemplateLiteral
If it is `true`, it ignores ternaries inside template literals.
### indent
The string of one indentation level. Match it to `@stylistic/indent`, or the two rules keep rewriting each other's fixes.
### maxLength
A ternary longer than this, counted as if written on one line, is broken over lines. A ternary with a ternary branch is broken at any length.

## Valid
```ts
var value = a ? b : c
var value = a
    ? b
    : c
        ? d
        : e
type MergeValue<A, B> = B extends NotPlain | Primitive
    ? B
    : B extends WeakKey
        ? A extends NotPlain | Primitive
            ? B
            : A extends WeakKey
                ? MergeObject<A, B>
                : B
        : B
```

## Invalid
```ts
var value = a ? b : c ? d : e
var value = a ? b
    : c
type M<A> = A extends string ? 1 : A extends number ? 2 : 3
```
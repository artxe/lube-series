# pretty-parens
Writes a bracket that holds an expression spanning lines in one of two forms: the closing bracket right after the last token when the opening bracket is followed by content, or on a line of its own when the opening bracket ends its line.

- It checks the grouping parentheses of an expression, the parentheses of `if`, `while`, `do ... while`, `for`, `for ... in`, `for ... of`, `switch`, `catch` and `with`, and the `${ }` of a template literal.
- A bracket whose content sits on one line is left alone. The arguments of calls, function parameters, arrays, objects and imports belong to `pretty-sequence`.
- If the opening bracket is followed by content on its line, the line break before the closing bracket is removed. If the opening bracket ends its line, a line break and the indent of the opening bracket's line are put before the closing bracket. A line comment right after the opening bracket counts as ending its line.
- When a line comment ends the content, the closing bracket cannot move up, so the fix breaks after the opening bracket instead.
- The parentheses of a JSDoc cast, `/** @type {T} */(value)/**/`, are left to `pretty-jsdoc-casting`, which writes them without white space inside.
- Only the white space next to the bracket changes, so the content keeps its text and comments.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            indent: { default: "\t", type: "string" }
        },
        type: "object"
    }
]
```
### indent
The string of one indentation level, used when the fix breaks after an opening bracket. Match it to `lube/indent`, or the two rules keep rewriting each other's fixes.

## Valid
```js
var value = (a
    || b)
var value = (
    a
    || b
)
if (a
    || b) {
}
if (
    a
    || b
) {
}
var text = `${a
    ? b
    : c}`
```

## Invalid
```js
var value = (a
    || b
)
var value = (
    a
    || b)
if (a
    || b
) {
}
```

# pretty-sequence
Formats arrays, objects, parameters and arguments: the items on one line when they fit, or one per line.

- Comments are never removed. A line comment after an item stays on the line of that item, and a sequence containing a multiline string, template literal or JSX attribute string that would have to be re-indented is not fixed.
- TypeScript type annotations and type arguments are supported, and parameters with decorators are not fixed.
- Items the rule moves to a line of their own are indented one level deeper than the line the sequence opens on, and the closing bracket returns to that line's indentation. Two cases follow `@stylistic/indent` instead: a sequence opening on the first line of a declaration whose last declarator starts on a later line gets one level more, and a line starting with `;`, as `@stylistic/semi-style: first` writes it, counts as indented like its statement.
- A sequence already written over several lines is left to `@stylistic/indent`, which owns the indentation of lines this rule did not write; `fixIndent` gives that back to this rule.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            arrayBracketSpacing: { default: true, type: "boolean" },
            checkArray: { default: true, type: "boolean" },
            checkCall: { default: true, type: "boolean" },
            checkObject: { default: true, type: "boolean" },
            checkSequence: { default: true, type: "boolean" },
            fixIndent: { default: false, type: "boolean" },
            funcCallSpacing: { default: false, type: "boolean" },
            ignoreTemplateLiteral: { default: true, type: "boolean" },
            indent: { default: "\t", type: "string" },
            maxLength: { default: 30, type: "number" },
            objectCurlySpacing: { default: true, type: "boolean" }
        },
        type: "object"
    }
]
```
### arrayBracketSpacing
If it is `true`, it writes a space inside array brackets: `[ a, b ]`.
### checkArray
If it is `true`, it checks arrays and array patterns.
### checkCall
If it is `true`, it checks the arguments of calls and `new`, and the parameters of functions.
### checkObject
If it is `true`, it checks objects and object patterns.
### checkSequence
If it is `true`, it checks sequence expressions, `a, b`.
### fixIndent
If it is `true`, it also reports a sequence whose lines differ from this rule only in their indentation. Leave it off while `@stylistic/indent` is on, or the two rules keep rewriting each other's fixes.
### funcCallSpacing
If it is `true`, it writes a space inside the parentheses of arguments and parameters: `f( a, b )`.
### ignoreTemplateLiteral
If it is `true`, it ignores sequences inside template literals.
### indent
The string of one indentation level. Match it to `@stylistic/indent`, or the two rules keep rewriting each other's fixes.
### maxLength
The items are written one per line when they are longer than this together, commas and spaces not counted, and on one line when they fit. A character that takes two columns, such as a Korean, Chinese or Japanese one, counts as two, so the number is the width the items take on screen. The default of 30, which the strict config keeps, breaks most calls with more than a couple of arguments; the recommended config sets 80. For another length, set it in the config, and `eslint --fix` rewrites the sequences it now reports both ways:
```js
rules: { ...lube.configs.recommended.rules, "lube/pretty-sequence": ["error", { maxLength: 100 }] }
```
```js
// If maxLength is less than or equal to 20, an error occurs.
var value = { fff, ggg, hhh, iii, jjj, kkk, lll }
```
### objectCurlySpacing
If it is `true`, it writes a space inside object braces: `{ a, b }`.

## Valid
```js
var value = [ a, b, c ]
var value = [
    aaaaaaaaaa,
    bbbbbbbbbb,
    cccccccccc,
    dddddddddd
]
var value = { a, b, c, d, e }
var value = {
    aaaaaaaaaa,
    bbbbbbbbbb,
    cccccccccc,
    dddddddddd
}
function func(a, b, c) {

}
function func2(
    aaaaaaaaaa,
    bbbbbbbbbb,
    cccccccccc,
    dddddddddd
) {

}
var value = `${[a,b,c]}`

func(
    aaaaaaaaaa_bbbbbbbbbb_cccccccccc
)
    .a(
        aaaaaaaaaa_bbbbbbbbbb_cccccccccc
    )
    .b(
        aaaaaaaaaa_bbbbbbbbbb_cccccccccc
    )
    .c(
        aaaaaaaaaa_bbbbbbbbbb_cccccccccc
    )

var value = {
    a: [ a, b, c ],
    b: true,
    c: {
        aaaaaaaaaa: a,
        bbbbbbbbbb: b,
        c: [
            aaaaaaaaaa,
            bbbbbbbbbbb,
            ccccccccccc
        ],
        d: {
            aaaaaaaaaa,
            bbbbbbbbbbb,
            ccccccccccc
        }
    }
}
```

## Invalid
```js
var value = [a,b,c]
var value = { aaaaaaaaaa, bbbbbbbbbb, cccccccccc, dddddddddd }
new Obj(

)
```
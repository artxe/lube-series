# pretty-click-css
Lays out the class tokens of [click-css](https://github.com/artxe/click-css), the CSS-by-class-tokens library, and reports properties it cannot fix. The rule is not in `recommended` or `strict`; turn it on where click-css classes are written.

- **Base tokens first**, on the first line in ASCII order: plain declarations (`c=red`, `flex`), class names click-css does not read (`card`), then media tokens that style the element itself (`@sm@c=red`).
- **One selector per line** after them, each in ASCII order: `:hover/c=red`, `>li/w=1`, and media tokens with a selector (`@sm@>li/w=1`).
- **Each token's declarations in ASCII order**: `w=1;c=red` becomes `c=red;w=1`. A token whose properties can overrule each other (`mt=4;m=0`, `top=0;inset=0`, any two properties of the margin, padding, border, grid, flex, font, background, transition or animation families, `gap` and its axes, `align-*` and `place-*`) keeps its order, since there the order is the meaning.
- **A shorthand wherever click-css has one**: `margin-top=4` is `mt=4`, `display=flex` and `d=flex` are `flex`, `position=absolute` is `absolute`. The separator you wrote (`=` or `:`) and the value stay as they are.
- **Unknown property names** are reported, never fixed: a name that is neither a click-css shorthand, a standard CSS property, a vendor-prefixed property (`-webkit-box-orient`) nor a custom property (`--gap`).
- **Repeated properties** are reported, never fixed: a property set twice in the same media query and selector with the same `!` weight, by one token or by two (`c=blue c=red`, `w=1;width=2`).

A token click-css does not compile (no `=` or `:` with a character on each side and no value shorthand, an unclosed quote or bracket) is kept as a plain class name. Strings with `${}` expressions are skipped.

The fix writes a string with selectors over several lines as a template literal, and a JSX attribute string with real line breaks. Continuation lines get the indentation of the line the string starts on plus the `indent` option.

## Where class strings are found
- A JSX attribute named in `attributes`: `<div className="...">`, `<div className={"..."}>`, and the branches of `{cond ? "..." : "..."}` and `{cond && "..."}`.
- A string assigned to a property named in `properties`: `element.className = "..."`.
- `element.setAttribute("class", "...")`.
- Every string argument of a call to a function named in `functions` (`cx("...", cond && "...")`), the name written as `fn(...)` or `object.fn(...)`.

Markup inside strings (`"<div class=\"...\">"`) and `classList` calls are not read.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            attributes: { default: ["class", "className"], items: { type: "string" }, type: "array" },
            functions: { default: [], items: { type: "string" }, type: "array" },
            indent: { default: "\t", type: "string" },
            properties: { default: ["className"], items: { type: "string" }, type: "array" }
        },
        type: "object"
    }
]
```
### attributes
JSX attribute names whose string is a class string.
### functions
Names of functions whose string arguments are class strings, such as `cx` or `clsx`.
### indent
What is added to the indentation of the line a string starts on for each continuation line.
### properties
Property names whose assigned string is a class string.

## Valid
```js
box.className = "btn c=red card w=1"
box.className = "flex g=8 @sm@c=red"
box.className = `c=red
	>li/w=1
	>li:hover/w=1`
box.className = "mt=4;m=0"
box.className = "--gap=12;p=--gap"
```

## Invalid
```js
box.className = "w=1 c=red"
box.className = "color=red"
box.className = "c=red >li/w=1"
box.className = "colr=red"
box.className = "c=blue c=red"
```
fixed to
```js
box.className = "c=red w=1"
box.className = "c=red"
box.className = `c=red
	>li/w=1`
```
The last two are reported without a fix.

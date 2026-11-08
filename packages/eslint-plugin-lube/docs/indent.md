# indent
Enforces the indentation of every line, computed from the syntax tree, and fixes it.

- A line is indented one level deeper than the line its enclosing block, bracket pair or expression starts on.
- A line that starts with a binary or logical operator (`&&`, `||`, `??`, `+`, ...) is indented `binaryOperator` levels deeper than the line its expression starts on.
- The `*` lines of a block comment align under the `/*` that opens it.
- In a `.svelte` file, a line inside a template expression is indented as JavaScript from the indent of the line that holds the expression's `{`. Markup lines and `$:` statements are left as they are.

## options
```js
schema: [
    {
        additionalProperties: false,
        anyOf: [
            { enum: ["tab"] },
            { minimum: 0, type: "integer" }
        ]
    },
    {
        additionalProperties: false,
        properties: {
            SwitchCase: { minimum: 0, type: "integer" },
            binaryOperator: { minimum: 0, type: "integer" }
        },
        type: "object"
    }
]
```
The first option is `"tab"` or the number of spaces of one level. The second is an object.
### SwitchCase
The levels a `case` is indented past its `switch`. The default is `1`; the `strict` and `recommended` configs set `0`.
### binaryOperator
The levels a line that starts with an operator is indented past the line its expression starts on. The default is `1`; with `0` such a line stays at the indent of its expression.

## Valid
```js
function f() {
	return 1
}
const a = b
	|| c
f(
	a
	|| b
)
switch (a) {
case 1:
	b()
}
/**
 * @param {number} a
 */
function g(a) {}
```
`switch` with `["error", "tab", { SwitchCase: 0 }]`. With `["error", "tab", { binaryOperator: 0 }]`, `const a = b\n|| c` is valid.
```svelte
<div>
	{a.map(b => {
		return b
	})}
	{#if a
		&& b}
		<p />
	{/if}
</div>
```

## Invalid
```js
function f() {
    return 1
}
const a = b
|| c
f(
	a
		|| b
)
if (a) {
	/**
		 * b
		 */
	b()
}
```
```svelte
<div>
	{a.map(b => {
	return b
	})}
</div>
{#if a
&& b}
	<p />
{/if}
{#snippet a(
		b,
		c
)}
	<p />
{/snippet}
```

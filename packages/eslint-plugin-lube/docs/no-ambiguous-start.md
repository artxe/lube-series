# no-ambiguous-start
Disallows an expression statement that starts with `(`, `[` or a template literal.

- Without semicolons such a statement joins the line above and becomes a call, an index or a tagged template of it.
- A JSDoc cast in front is not a token, so `/** @type {T} */(x).y = 1` counts too.
- Assign the value to a `const` first, or write the statement another way.
- It has no fix.

## options
None.

## Valid
```js
const result = (a || b).run()
foo()
```

## Invalid
```js
(a || b).run()
;[a, b] = [b, a]
`x`.trim()
```

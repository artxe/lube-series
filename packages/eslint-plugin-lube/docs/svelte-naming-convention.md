# svelte-naming-convention
Enforces snake_case declarations, following the [Svelte code conventions](https://github.com/sveltejs/svelte/blob/master/CONTRIBUTING.md#code-conventions).
The strict config turns it on and the recommended config leaves it off, since its fix renames identifiers.

- Declarations such as variables, parameters, catch clauses, array patterns and non-shorthand object patterns, `const { key: camelCase } = value`, are reported. A shorthand property, `const { camelCase } = value`, and a shorthand import, `import { camelCase } from "m"`, are not, because the name is the key or the export it reads; write `const { camelCase: camel_case } = value` or `import { camelCase as camel_case }` to rename it.
- The message names the expected name, `Rename 'camelCase' to 'camel_case'`, or, for a name without a snake_case form such as `NO_SNAKE__CASE`, asks for snake_case, UPPER_SNAKE_CASE or PascalCase.
- Usages such as assignments, function bodies, `extends` clauses, JSX and TypeScript expressions are only renamed along with their declaration; `fixSameNames` sets the order.
- Usages are matched to declarations by scope, so a global, an import or an exported camelCase function of the same name is left as it is.
- A declaration exported with `export { camelCase }` is renamed together with the export specifier, `export { camel_case as camelCase }`.
- The JSDoc of a renamed parameter follows it: `@param {T} [camelCase]`, `{camelCase is T}` and `{typeof camelCase}`.
- In a `.svelte` file, the store subscriptions of a renamed store are renamed with it, `$camelCase` into `$camel_case`, in the same fix, and so are the usages in the markup: mustache tags, attributes, directives and the expression of `{#if}`, `{#each}`, `{#await}` and `{#key}`. A shorthand attribute is written out, `{camelCase}` into `camelCase={camel_case}`, so the name of the property stays. Names the markup declares, the context of `{#each}`, the value of `{#await}` and a `let:` property, are not reported.
- A name is reported without a fix when it has no snake_case form, such as `NO_SNAKE__CASE`, when the snake_case name would shadow or capture another variable, when it is also declared where the rule does not rename, such as a TypeScript namespace merged with a function or `export var camelCase`, when a declaration of it is turned off with an `eslint-disable` comment, when it is used as a JSX or Svelte component tag, `<Camel_Case />`, which a lowercase name would turn into an HTML tag, when it also appears where the rule cannot tell a reference from a type or a property, such as `let a: camelCase` or markup of a Svelte parser, or when it is read as a store, `$camelCase`, outside a `.svelte` file, where `$camelCase` is a name of its own.

## options
```js
schema: [
    {
        additionalProperties: false,
        properties: {
            fixSameNames: { default: true, type: "boolean" }
        },
        type: "object"
    }
]
```
### fixSameNames
If it is `true`, every usage of a reported declaration is reported and fixed on its own, and the declaration is renamed in a later pass of `eslint --fix`, once no usage of the old name is left, so a fix another rule overrides in the same pass never leaves a usage behind.
Assignments to the variable and `export default` of it are renamed with the declaration, not on their own, so `prefer-const` never sees `let lastBid = 1` without its `lastBid += 1` and turns it into a `const`, and `ascii-order` never sees a default-exported function under another name and moves it.
The declaration and its usages are renamed in one fix instead when the snake_case name is already declared in the file or a variable of the same name is declared in a nested scope, so a half-renamed usage never resolves to another variable.
If it is `false`, only the declaration is reported, and its fix renames the declaration and every usage at once.
```js
myFunction() // Only in the case that fixSameNames is true, an error occurs.

// Rename 'myFunction' to 'my_function': declarations are snake_case, following the Svelte code conventions
function myFunction() {

}
```

## Valid
```js
var snake_case = 'Hello'
var snake1_2_3case_4 = 'Hello'
var SNAKE_CASE = 'Hello'
var SNAKE1_2_3CASE_4 = 'Hello'
var PascalCase = 'Hello'
var P1ascal2Case345 = 'Hello'
var __ = 'Hello'
var $$ = 'Hello'
var __snake_case$$ = 'Hello'
var $$snake_case$$ = 'Hello'
```

## Invalid
```js
var camelCase = 'Hello'
var NO_SNAKE__CASE = 'Hello'
var NO_SNAKE_CASE_ = 'Hello'
var __camelCase$$ = 'Hello'
```
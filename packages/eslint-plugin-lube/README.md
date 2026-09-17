# ESLint Plugin Lube
Fixable formatting and ordering rules, so `eslint --fix` formats a project without Prettier.

Instead of Prettier next to ESLint, with a second config and a plugin to keep the two from fighting, formatting is a set of ESLint rules: one `eslint --fix` formats and lints, and each rule can be tuned or turned off like any other.

## Installation
```bash
npm i -D eslint eslint-plugin-lube
```
Requires ESLint 9 or later and Node.js 18.18+, 20.9+ or 21.1+; a CommonJS `eslint.config.cjs` needs Node.js 20.19+ or 22.12+ to `require` it. `@stylistic/eslint-plugin` is installed with the plugin.

## Usage
```js
// eslint.config.js
import lube from "eslint-plugin-lube"

export default [
    {
        ...lube.configs.recommended,
        files: ["**/*.js", "**/*.ts"]
    }
]
```
`eslint --fix` with `recommended` turns this:
```js
import {writeFile,readFile} from 'node:fs/promises';

export async function copy(from,to){
  const text=await readFile(from,'utf8');
  await writeFile(to,text.replace(/\r\n/g,'\n'),{encoding:'utf8',flag:'wx',mode:0o644,flush:true});
  return text.length>1000?text.length>100000?'large':'medium':'small';
}
```
into this:
```js
import { readFile, writeFile } from "node:fs/promises"

export async function copy(from, to) {
	const text = await readFile(from, "utf8")
	await writeFile(
		to,
		text.replace(/\r\n/g, "\n"),
		{ encoding: "utf8", flag: "wx", mode: 0o644, flush: true }
	)
	return text.length > 1000
		? text.length > 100000
			? "large"
			: "medium"
		: "small"
}
```

For TypeScript files, add the parser from `@typescript-eslint/parser`:
```js
// eslint.config.js
import tsParser from "@typescript-eslint/parser"
import lube from "eslint-plugin-lube"

export default [
    {
        ...lube.configs.recommended,
        files: ["**/*.js", "**/*.ts"],
        languageOptions: { parser: tsParser }
    }
]
```
With `defineConfig`, extend the config by name:
```js
// eslint.config.js
import { defineConfig } from "eslint/config"
import lube from "eslint-plugin-lube"

export default defineConfig({
    extends: ["lube/recommended"],
    files: ["**/*.js"],
    plugins: { lube }
})
```

### Choosing a config
Both configs are flat config objects with `plugins` and `rules`, and differ in how much they decide for you. Start with `recommended`; take `strict` for a code base that follows the Svelte code conventions or wants every choice made for it.

**`configs.recommended`** only formats and orders, and every rule in it has a fix, so it suits format on save.
- The `@stylistic` formatting rules: tab indentation, double quotes, no semicolons, spacing and line breaks.
- `pretty-imports`, `pretty-jsdoc-casting`, `pretty-sequence` and `pretty-ternary`, with items on one line up to 80 characters.
- `ascii-order` for the names inside import and export braces only.
- A line break at the end of a file and at most one blank line, as editors write them.
- It never renames an identifier, never moves an import, key, function or test, and reports nothing about what the code does.

**`configs.strict`** is the house style of this repository, and several of its rules cannot be fixed. It is everything in `recommended` plus:
- `svelte-naming-convention`, which renames declarations to snake_case.
- `ascii-order` for import statements, object keys, function declarations and test cases too (see below).
- `pretty-sequence` and `pretty-imports` at 30 characters.
- No blank lines, no line break at the end of a file and one statement per line.
- Core rules such as `func-style` (declarations), `no-shadow`, `prefer-const`, `one-var` (never), `no-console` and `no-await-in-loop`.

In `strict`, `ascii-order` fixes import order assuming modules can run in any order, and key order assuming nothing reads it: sorted keys change `Object.keys`, `JSON.stringify` and `for...in`.
- Import a module that has to run first without names, `import "./setup.js"`, which is never moved.
- Disable the rule where key or import order matters; [ascii-order](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/ascii-order.md) lists what it does not fix.

### Changing a rule
Override a rule after the spread: `rules: { ...lube.configs.recommended.rules, "@stylistic/indent": ["error", 4] }`.
- Formatting rules go by their `@stylistic/` name.
- An indentation of your own also goes to the `indent` option of `pretty-imports`, `pretty-sequence` and `pretty-ternary`, or those rules and `@stylistic/indent` keep rewriting each other's fixes.
- `pretty-sequence` writes the items of an array, object or call one per line once they are longer than its `maxLength` together, 80 in `recommended` and 30 in `strict`: `"lube/pretty-sequence": ["error", { maxLength: 100 }]`.
- Every option of a rule is checked, so a misspelled option is a configuration error.

## Rules
| Rule | Enforces | `recommended` |
| --- | --- | --- |
| [ascii-order](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/ascii-order.md) | ASCII order of import statements, import and export names, object keys, function declarations and test cases | names only |
| [pretty-imports](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-imports.md) | Import and export names on one line when they fit, or one per line | yes |
| [pretty-jsdoc-casting](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-jsdoc-casting.md) | JSDoc type casts written as `/** @type {T} */(value)/**/` | yes |
| [pretty-sequence](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-sequence.md) | Items of arrays, objects, calls and parameters on one line when they fit, or one per line | yes |
| [pretty-ternary](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/pretty-ternary.md) | Nested and long ternaries broken before `?` and `:`, one indent deeper per level | yes |
| [svelte-naming-convention](https://github.com/artxe/lube-series/blob/master/packages/eslint-plugin-lube/docs/svelte-naming-convention.md) | snake_case declarations, following the Svelte code conventions | no |

## What it is not
- **Not a formatter you run on its own.** There is no CLI and no config file: the rules run inside `eslint --fix`, and a file ESLint does not lint is not formatted.
- **Not a whole style guide.** `recommended` only formats and orders, and every rule it turns on has a fix. The opinions, such as renaming and the core rules, are in `strict`, which is the house style of this repository rather than a recommendation.

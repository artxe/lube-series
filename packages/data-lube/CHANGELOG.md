# Changelog

## 2.0.0

### Breaking

- **The package is an ES module only.** `import` loads `src/index.js`, and there is no CommonJS
  build: `require("data-lube")` works on Node.js 20.19+ and 22.12+, which load ES modules with `require`.
  Jest loads it once its ESM mode is on or the package is transformed.
- **`deepCopy` keeps the prototype of class instances.** A copy is now `instanceof` its class and
  keeps its methods and getters; it used to be a plain object.
- **Inherited enumerable properties are ignored.** `deepCopy` used to copy them onto the result as
  own properties, and `deepFreeze` froze them.
- **`deepFreeze` freezes more.** It also freezes the keys and values of `Map` and `Set` and the
  objects under symbol and non-enumerable keys, so code that still mutates those objects now fails
  in strict mode. `DeepReadonly` types a `Map` as `ReadonlyMap` and a `Set` as `ReadonlySet`.
- **`deepEqual` compares arrays by index only.** Non-index properties of arrays are ignored.

### Fixed

- `deepCopy` of an object with an own `__proto__` key, such as the result of
  `JSON.parse('{"__proto__": {...}}')`, replaced the prototype of the copy instead of copying the
  key.
- `deepCopy` broke `Map`, `Set`, `RegExp`, `ArrayBuffer` and its views (including Node.js
  `Buffer`), `Error`, `DOMException`, boxed primitives, subclasses of built-ins and objects from
  another realm (`vm`, iframes), whose methods then threw, and `Date` lost its own properties.
  Views of one buffer now share one copied buffer, a detached `ArrayBuffer` and its views are
  copied as empty, and a length-tracking view of a resizable `ArrayBuffer` stays length-tracking.
  `Promise`, `SharedArrayBuffer`, `WeakMap`, `WeakRef` and `WeakSet` are kept by reference.
- `deepEqual` treated any two `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, `DataView`, `Error`,
  `DOMException`, boxed primitive, `Promise` or weak collection as equal — `deepEqual(new Date(1), new Date(2))`
  returned `true`. Audit comparisons of these types: the result changes rather than failing loudly.
  Their own enumerable keys are compared too, such as the fields of a `class extends Map`. Object
  keys of a `Map` and object values of a `Set` match a deeply equal counterpart in any order, and a
  detached or out-of-bounds view counts as empty.
- `deepEqual(NaN, NaN)` returned `false`.
- A `false` result of `deepEqual` narrowed its second argument to `never` when both arguments had the
  same type, so `if (!deepEqual(before, after)) after.version++` failed to type-check. It narrows only a
  second argument whose type is wider than the first, such as `unknown`.
- `deepEqual` compared arrays and typed arrays in quadratic time: seconds for a 100 KB `Uint8Array`.
- `deepFreeze` threw on an object containing a typed array. Typed arrays are skipped, since they
  cannot be frozen.
- `deepCopy`, `deepEqual` and `deepFreeze` overflowed the stack on circular references and on data
  nested thousands of levels deep.
- `DeepReadonly` made the functions and `Date` methods of a frozen object uncallable:
  `deepFreeze({ at: new Date() }).at.getTime()` failed to type-check.

### Added

- `package.json` declares `engines.node` as `>=16`, the oldest Node.js release line it runs on.
- `deepMerge(...values)` merges nested plain objects like a spread, without copying untouched values,
  and returns the first argument when every argument is `undefined` or `null`.
- `deepUpdate(value, draft => { ... })` returns the next version of a value from plain mutations on a
  draft, sharing everything that did not change. A frozen original gives a frozen result, also when the
  recipe returns a new value: new objects added under a frozen parent are deeply frozen in place, while
  objects of the original are never frozen, wherever the recipe moves them, and a copy of one is frozen
  only when it was. `has`, `get`, `set` and `delete` of a drafted `Map` or `Set` find a
  member by its draft reached through another path. `deepUpdate(value, recipe, { graph: true })` gives
  each object reached through several paths one draft, so `===`, `indexOf` and `includes` work across
  paths, and copies a changed object once and replaces it wherever a plain object, array, `Map` or `Set`
  of the value holds it, also where the recipe did not read it, so the result keeps the shared and
  circular references of the original; class instances keep their references.
  Without the option a value is assumed to be a tree, unless an earlier update returned it as a graph or
  the recipe reaches a drafted object through a second path, however many objects it drafted; sharing
  reached only through paths the recipe never reads may then split. A recipe that both changes the draft and returns a value
  throws a `TypeError` that tells to give the arrow function a block body. A class instance, `Date` or primitive
  is passed to the recipe as it is, so a recipe for one that returns `undefined` throws a `TypeError`, and so
  does passing a change list, which `deepPatch` applies.
  Inside a recipe, `deepEqual`, `deepDiff` and `deepCopy` read drafts, also inside other values and
  new objects that the draft holds, as the values they currently represent, keeping the shared and
  circular references between them; `deepCopy(draft)` returns an independent snapshot like immer's
  `current()` that keeps every class instance in it by reference, while a value holding no draft is
  copied as outside a recipe. `deepMerge` keeps the untouched parts of a draft as drafts, as a spread
  does, so `draft.config = deepMerge(draft.config, patch)` can be changed further through the draft
  without changing the original. `console.log(draft)` shows the current value. Options other than
  `graph` throw a `TypeError`.
- `deepDiff(before, after)` lists the changes between two values as `{ op, path, value }`.
- `deepPatch(value, changes)` applies changes listed by `deepDiff`, each at its own path, sharing
  every path they do not touch: a change whose path does not exist, or that removes the root, throws a
  `RangeError` that names the change's index, `op`, path and missing segment, and a change that is not
  an object, has an unknown `op` or a `path` that is not an array, or whose path runs through a value
  that is not a plain object, array, `Map` or `Set`, throws a `TypeError` that names its index. An
  object from a change is copied before it goes under a frozen parent or replaces a frozen root, so the
  value it came from stays unfrozen, except class instances, which are kept and frozen in place so they
  keep their private fields.
- The `Change`, `DeepEqual`, `DeepReadonly<T>`, `DeepUpdate`, `DeepUpdateOptions`, `Draft<T>` and
  `Merge<T>` types are exported: `import type { DeepReadonly } from "data-lube"`. `Draft<T>` and `DeepReadonly<T>` keep a
  class with private members as it is, so a draft of it can be passed where the class is expected and
  `deepCopy(state) as Draft<typeof state>` compiles. `Merge<T>` keeps a property optional when every
  value that has it makes it optional, also with `exactOptionalPropertyTypes`. A recipe may
  `return undefined` to keep the draft's changes.

# Data Lube
Copy, compare, merge, update, diff, patch and freeze nested data with plain JavaScript syntax.

Every function handles circular references, data nested at any depth, and the built-in types: `Date`, `RegExp`, `Map`, `Set`, `Error`, typed arrays, and class instances, which keep their prototype. `structuredClone` and `util.isDeepStrictEqual` throw a `RangeError` thousands of levels deep, drop the prototype of a class instance, and refuse a value holding a function; these do not.

## Installation
```bash
npm i data-lube
```

## Usage
### Immutable update
```ts
import { deepUpdate } from "data-lube"

const state = { settings: { theme: "dark" }, todos: [ { done: false, title: "read" } ] }
const next = deepUpdate(state, draft => {
    draft.todos[0].done = true
    draft.todos.push({ done: false, title: "write" })
})
next.todos //=> [ { done: true, title: "read" }, { done: false, title: "write" } ]
state.todos //=> [ { done: false, title: "read" } ]
next.settings === state.settings //=> true
deepUpdate(state, draft => { draft.settings.theme = "dark" }) === state //=> true
deepUpdate(1, count => count + 1) //=> 2
```
- **For data that shares objects or points back to itself, pass `{ graph: true }`.** Without it a shared object is copied once per path and a reference back to a changed object keeps pointing at the old one, with no error; see [Shared and circular data](#shared-and-circular-data).
- Plain objects, arrays, `Map` and `Set` are drafted: change them with plain mutations, and no value of the original changes.
- Only changed paths are copied and everything else is shared; when nothing changed, the original itself is returned.
- The recipe may return a new value instead, or be `async`. A recipe that both changes the draft and returns a value throws a `TypeError`, so give an arrow function that changes the draft a block body: `draft => { draft.list.push(1) }`, not `draft => draft.list.push(1)`.
- A value that cannot be drafted, such as a class instance, `Date` or primitive, is passed to the recipe as it is, so the recipe must return the next value; one that returns `undefined` throws a `TypeError`.
- A draft is only valid inside its recipe: keep the returned value, and `deepCopy` anything else you need later.
- A changed object that was frozen stays frozen, and new objects added to it are deeply frozen in place: copy an object before adding it if you will change it later.
- The rest of the recipe rules are under [Inside a recipe](#inside-a-recipe).

### Deep copy
```ts
import { deepCopy } from "data-lube"

class Point {
    x = 3
    y = 4
    get length() { return Math.hypot(this.x, this.y) }
}
const origin = { point: new Point(), tags: new Set([ "a" ]) }
const clone = deepCopy(origin)
clone.point.length //=> 5
clone.tags === origin.tags //=> false
```
- Class instances keep their prototype, so a method that reads only public fields keeps working on the copy.
- Arrays keep their holes, and `Date`, `RegExp`, `Map`, `Set`, `Error` (including `DOMException`), boxed primitives, `ArrayBuffer` and its views (including Node.js `Buffer`) are copied.
- Shared and circular references keep their shape, and views of one buffer share one copied buffer.
- Functions, `Promise`, `SharedArrayBuffer` and weak collections are kept by reference.
- Own enumerable string keys are copied, but symbol keys, private fields and the contents of objects such as `Blob` or `URL` are not, so a method that reads a private field throws on the copy.
- The copy has the type of the value, so a copy of a `DeepReadonly` value is typed readonly although it is not frozen; cast it with `deepCopy(state) as Draft<typeof state>` to change it.

### Deep equal
```ts
import { deepEqual } from "data-lube"

const input: unknown = JSON.parse('{ "tags": [ "a" ] }')
if (deepEqual({ tags: [ "a" ] }, input)) {
    const tags: string[] = input.tags
}
deepEqual(new Set([ { id: 1 }, { id: 2 } ]), new Set([ { id: 2 }, { id: 1 } ])) //=> true
deepEqual([ NaN ], [ NaN ]) //=> true
deepEqual([ 1, , 3 ], [ 1, undefined, 3 ]) //=> false
```
- Primitives are compared like `===`, except that `NaN` equals `NaN`.
- `Date`, `RegExp`, `Error`, boxed primitives, `ArrayBuffer` and its views are compared by content, and functions, `Promise` and weak collections by identity.
- Object keys of `Map` and object values of `Set` match a deeply equal counterpart in any order.
- Objects must have the same prototype and the same own enumerable string keys, so symbol keys, [private fields](#private-fields) and the contents of objects such as `Blob` or `URL` are not compared.
- A `true` result narrows the second argument to the type of the first when its type is wider, such as `unknown`. When both have the same type the result is a plain `boolean`, so `if (!deepEqual(before, draft)) draft.version++` keeps `draft` typed.

### Deep merge
```ts
import { deepMerge } from "data-lube"

const defaults = { headers: { accept: "json" }, retry: { count: 1, delay: 100 } }
const options = deepMerge(defaults, { retry: { count: 3 } })
//=> { headers: { accept: "json" }, retry: { count: 3, delay: 100 } }
options.headers === defaults.headers //=> true
```
- `deepMerge(a, b, c)` is `{ ...a, ...b, ...c }` with nested plain objects (including null-prototype ones) merged the same way; any other value, such as an array, `Map`, `Set`, `Date` or class instance, replaces the value on its left.
- Inputs are never changed, and untouched values are shared with them instead of copied.
- `undefined` and `null` arguments are skipped, while an `undefined` property still overrides. When every argument is `undefined` or `null`, the first one is returned: `deepMerge(null, undefined)` is `null`, as its type says.
- Symbol keys are assigned like a spread, not merged.
- An optional property of a later argument keeps `undefined` in the merged type unless `exactOptionalPropertyTypes` is on, because without it TypeScript lets the property hold `undefined`, which overrides the value on its left. A property that is optional in every argument that has it stays optional.

### Diff and patch
```ts
import { deepDiff, deepEqual, deepPatch } from "data-lube"

const before = { tags: [ "a", "b" ], user: { name: "Kim" } }
const after = { tags: [ "a" ], user: { age: 30, name: "Lee" } }
const changes = deepDiff(before, after)
//=> [
//     { op: "remove", path: [ "tags", 1 ] },
//     { op: "replace", path: [ "user", "name" ], value: "Lee" },
//     { op: "add", path: [ "user", "age" ], value: 30 }
//   ]
deepEqual(deepPatch(before, changes), after) //=> true
```
- Plain objects, arrays, `Map` and `Set` are walked, so a path holds object keys, array indexes, `Map` keys and `Set` values; any other value that is not `deepEqual` is replaced as a whole.
- Array items are matched by position, so an item inserted at the front replaces every item after it, and array holes are listed as `undefined`.
- `deepPatch` applies each change at its path without checking the value it replaces, so apply changes to the value they were listed from. Passing a change list to `deepUpdate` throws a `TypeError`.
- Changes sent as JSON keep only what JSON holds: a `Date` arrives as a string, `Map`, `Set` and `undefined` values are lost, and an object `Map` key or `Set` value arrives as a new object that matches nothing, so applying it throws a `RangeError`.
- Values in changes are references to `after`, not copies; [Patching details](#patching-details) covers frozen values, errors and shared data.

### Deep freeze
```ts
import { deepFreeze } from "data-lube"
import type { DeepReadonly } from "data-lube"

const frozen = deepFreeze({ list: [ 1, 2 ], user: { name: "Kim" } })
Object.isFrozen(frozen.list) //=> true
// @ts-expect-error Cannot assign to 'name' because it is a read-only property.ts(2540)
frozen.user.name = "Lee"

const config: DeepReadonly<{ hosts: string[] }> = deepFreeze({ hosts: [ "a" ] })
```
- The value is frozen in place along with every object reachable through own properties (including symbol and non-enumerable keys), array items and the keys and values of `Map` and `Set`; functions are not frozen.
- A `Map`, `Set` or `Date` can still be changed through its methods, but `Map` and `Set` are typed as `ReadonlyMap` and `ReadonlySet`.
- Typed arrays and `DataView` are skipped because their bytes cannot be frozen.
- `DeepReadonly<T>` and `Draft<T>` keep a class with private members as it is, since a readonly copy of its type would lose them, so its fields look writable although they are frozen.

`data-lube` also exports the `Change`, `DeepEqual`, `DeepReadonly<T>`, `DeepUpdate`, `DeepUpdateOptions`, `Draft<T>` and `Merge<T>` types.

## Details
### Arrays
Arrays are walked by index only, so their other properties are ignored, and a sparse array costs as much as the items it holds, not its length.

### Private fields
**Private fields are invisible to every function**: two instances that differ only in a `#private` field are `deepEqual`, `deepDiff` lists no change between them and `deepCopy` drops the field. So the functions disagree about such a value: `deepUpdate` returns a new version when the recipe replaces the instance, since it compares identity, while `deepEqual` and `deepDiff` report no change, so a change list shown to a user stays empty. Keep data you compare, diff or audit in public fields, or compare what a method returns, such as `deepEqual(before.toJSON(), after.toJSON())`.

### Frozen values in `deepUpdate`
New objects added under a frozen parent, or returned in place of a frozen original, are deeply frozen in place even when other code or an unfrozen part of the result holds them. Objects of the original are never frozen: one the recipe moves, even under a frozen parent, or returns keeps its frozen state, and a copy of it is frozen only when it was.

### Inside a recipe
- Take objects from the draft, not from the original value: `draft.b = draft.a`, not `draft.b = state.a`, and change values only through `deepUpdate`. It misses sharing added by changing a value in place, or by placing an original object that the recipe did not read through its draft.
- `deepEqual`, `deepDiff` and `deepCopy` read a draft, and a value holding drafts, as the value it currently represents, and `console.log(draft)` shows that value. `deepCopy(draft)` returns an independent snapshot that keeps every class instance in it by reference, as the next version does, so their private fields keep working.
- `deepMerge` keeps the untouched parts of a draft as drafts, as a spread does, so `draft.config = deepMerge(draft.config, patch)` can be changed further through `draft.config`. Such a result, like a draft, is only valid inside the recipe.
- `deepFreeze` throws a `TypeError` on a draft, which cannot be frozen.
- Class instances, `Date` and other objects that are not plain objects, arrays, `Map` or `Set` are not drafted, so replace them instead of mutating them, which changes the original or throws when it is frozen. `Draft<T>` keeps a class with private members as it is, so a draft can be passed where the class is expected, but its fields look writable. `Map` keys are not drafted either: delete an entry and set a new one instead of changing its key.
- `has`, `get`, `set` and `delete` of a drafted `Map` or `Set` also find a member by the draft of it reached through another path.
- A drafted `Map` or `Set` is a proxy that behaves like a built-in one: methods, getters and iterators a subclass overrides are not used on the draft or its copy, and a changed copy has no private fields. Call its methods on it (`draft.add(1)`), not built-in methods with it as `this` (`Set.prototype.add.call(draft, 1)` or `super.add(1)` in a subclass), which throw a `TypeError`.
- A draft placed in a new, unfrozen object under a property that is neither writable nor configurable cannot be replaced, so `deepUpdate` throws a `TypeError`; freeze that object or make the property writable.

### Shared and circular data
`deepUpdate(state, recipe, { graph: true })` treats the value as a graph, such as a node that both an index `Map` and a tree hold, or a parent that its children point back to.
- Each object has one draft, so `===`, `indexOf` and `includes` work across paths.
- A changed object is copied once and replaced wherever a plain object, array, `Map` or `Set` of the value holds it, under an own enumerable string key, an array item or a `Map` or `Set` entry, also where the recipe never read it; unchanged objects stay shared.
- Class instances keep their references, so an instance whose field holds a changed object still holds the original: hold graph nodes in plain objects, or replace the instance in the recipe.
- Each such change walks the whole value and copies every object that reaches the changed one: in a tree with parent links, that is the whole tree.

Without the option, a value `deepUpdate` has not seen is assumed to be a tree and is not walked. A recipe that reaches an object it already drafted through a second path switches to graph mode on its own, but **sharing reached only through paths the recipe never reads may split**: the changed copy sits where the recipe read it, and the old object stays everywhere else, such as `child.parent` after changing a child. Values returned by a graph update, or by any update that made a value share objects, are remembered as graphs, so updating them again needs no option; pass `{ graph: true }` for a graph you built yourself.

### Patching details
- Before an unfrozen object from a change goes under a frozen parent, or replaces a frozen root, `deepPatch` copies the plain objects, arrays and built-ins such as `Map`, `Set` and `Date` in it, so `after` stays unfrozen; class instances, including subclasses of built-ins, are kept and frozen in place, because a copy would lose their private fields.
- Errors name the change's index in the list:
  - a `RangeError` for a path that does not exist, with the missing segment: a missing key, `Map` key or `Set` value, or an array index out of range (`add` may append at the array's length); and for a change that removes the root (`{ op: "remove", path: [] }`), since the result must keep the type of the value: replace the root with `undefined` instead.
  - a `TypeError` for a change that is not an object, has an unknown `op` or a `path` that is not an array, or whose path runs through a value that is not a plain object, array, `Map` or `Set`, such as a `Date`, or through a `Set` before its last segment.
- Changes carry no identity. A change under a value shared by several paths is listed, and applied, under each path, so patching gives a changed shared object one copy per path, while circular data lists each change once, under the first path that reaches it, so it can be diffed but not patched back. To undo updates of shared or circular data, keep the previous versions instead: each version shares everything unchanged with the next, so `history.push(state); state = deepUpdate(state, recipe)` costs only the changed paths, and `state = history.pop()` undoes it.

## What it is not
- **Not for shallow, plain JSON.** When the data holds no shared or circular references, no `Map`, `Set` or class instance, and is not deeply nested, `structuredClone` copies it, `JSON.stringify` compares it and a spread merges it. The depth, cycle and built-in handling here is the size you pay for the cases those cannot do.
- **Not a state manager.** There is no store, no subscription and no history: `deepUpdate` returns the next value, and keeping it is yours to do.
- **Not JSON Patch.** A change's `path` is an array of keys, `Map` keys and `Set` values, not a string pointer, there is no `move`, `copy` or `test`, and the values in a change are references into the value it was listed from.

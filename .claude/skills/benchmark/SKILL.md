---
name: benchmark
description: Measure lube-series hot paths against native APIs and the popular libraries, before and after changing them. Use when touching data-lube or async-lube internals, or when a change could cost performance.
---
# Benchmark a lube-series change

Keep every script and dependency in the scratchpad directory, never in the repo.

## Baselines
- Native: `structuredClone`, `node:util`'s `isDeepStrictEqual`.
- Already in the workspace: `fast-deep-equal` and `lodash.merge` under `node_modules/.pnpm`.
- For deepUpdate, deepMerge and deepDiff: `npm i immer mutative deepmerge microdiff` in a
  scratchpad directory. immer needs `enableMapSet()` and `setAutoFreeze(false)` to compare fairly.

## Harness
- Warm up about 50 runs, then loop until 600 ms have passed and report microseconds per operation.
- Run each variant in its own `node` process, and repeat the whole comparison at least twice: single
  runs drift by 20-30 %. Treat a difference under that as noise.
- Never compare two shapes in one process without checking both orders. V8 feeds back element kinds
  and property shapes, so an array benchmark that runs after an object benchmark looks slower.
- Data that exposes regressions: 2000 shape-stable record objects, a 200k number array, an
  object with 5000 keys, a 1 MB `Uint8Array`, Sets and Maps of 5000 objects in same, reversed and
  shuffled order, class instances holding a Date, and a deeply frozen state tree.

## Profiling
- `node --cpu-prof --cpu-prof-dir=<dir> script.mjs`, then sum self time per function from the JSON
  (`nodes` plus `samples` and `timeDeltas`).
- A large "(garbage collector)" share means allocation, not slow logic: WeakMap entries, a closure
  per call, or a copy that the code did not need.
- Counting work instead of timing keeps a regression test deterministic: give the fixture getters
  that count reads and assert the count stays linear.

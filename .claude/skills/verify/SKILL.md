---
name: verify
description: Run the checks a lube-series change has to pass before it is done - tests, lint, generated types and the published tarball. Use after changing anything under packages/, test/ or syntax/.
---
# Verify a lube-series change

`pnpm lint`, `pnpm test` and `pnpm dts` don't run the steps below. Run each step from the repo root unless it
says otherwise, and keep going only while the step is clean.

Environment variables (`TZ`, `SIM_*`, `DATA_LUBE_*`) go in `.tmp/*.env` files as `shell.md` says; rewrite the file for the next setting.

1. **Tests.** `pnpm test` (vitest with coverage). Aim at full coverage of the lines you touched; the gaps
   the report prints are usually real paths, not noise. For datetime-lube also run the tests with
   `TZ` set to `America/New_York`, `Australia/Lord_Howe` and `America/Santiago` (a DST zone finds what
   the local zone hides): `.tmp/tz.env` holds `TZ=America/New_York`, and the run is
   `node --env-file=.tmp/tz.env node_modules/vitest/vitest.mjs run test/datetime-lube`.
2. **Browser tests.** `pnpm test` also runs the `browser` project of `vitest.config.js` (Playwright
   Chromium, `test/browser/`), whose coverage merges with the `node` project's; it matters for anything in
   `src/http/xhr.js`, `src/http/socket.js`, upload or download progress, `as: "file"` or CORS. They are
   the only run with a real `XMLHttpRequest`, `WebSocket` and cross-origin `fetch`. `test/browser/server.js` starts `test/async-lube/server.js` in Node and hands the tests
   its URL with `provide`/`inject`; that server sends CORS headers, and `/no-cors` deliberately does not.
3. **Large seeds.** The seeded harnesses run few seeds in `pnpm test`; for every changed package run
   its harnesses with the counts below, one file per command, each count in `.tmp/sim.env`
   (`SIM_SEEDS=2000`). `SIM_SEEDS` is the count, `SIM_FROM` the first seed
   (default 1; move it to reach new seeds), `SIM_SEED` replays one seed and `SIM_MODE` runs one mode.
   Extend the harness for new behavior. A seed of the simulations (`flow_sim`, `queue_sim`,
   `durable_sim`, `stream_fuzz`) that takes longer than `SIM_TIMEOUT` (60000 ms, `0` turns the budget
   off) fails with its own `SIM_MODE=... SIM_SEED=...` line: on a simulated clock a missed advance
   hangs forever and no vitest timeout is near, so never wait out a run that prints nothing. Check
   within two or three minutes that a long run is still moving, and treat silence past the budget as
   the harness itself hanging, not as slow progress.
   - async-lube: `stream_fuzz` 200000, `http_fuzz` 2000, `socket_fuzz` 1000, `flow_sim` and
     `queue_sim` 10000, `durable_sim` 3000 per mode, about 5 minutes a mode (all `test/async-lube/*.test.js`), e.g.
     `node --env-file=.tmp/sim.env node_modules/vitest/vitest.mjs run test/async-lube/http_fuzz.test.js`. Modes: `stream`,
     `http-single|dedupe|lock|latest|debounce|throttle|refresh`, `ws`, `sse`, `plain`, `finish`,
     `edges`, `goto`, `queue`, `memory`, `sqlite`, `memory-failures`, `sqlite-failures`, `memory-reads`,
     `sqlite-reads`. For more `durable_sim` seeds, run several processes, each with its own env file
     (`.tmp/sim_<n>.env`) holding one `SIM_MODE` and a disjoint `SIM_FROM` range.
   - datetime-lube: `test/datetime-lube/temporal.test.js` (against `@js-temporal/polyfill`) 100000,
     also under each `TZ` of step 1.
   - hangul-lube: `test/hangul-lube/typing.test.js` 200000.
   - eslint-plugin-lube: `test/eslint-plugin-lube/programs.test.js` (generated programs run before and
     after the fix of each config, LF and CRLF) 5000.
   - data-lube: `test/data-lube/oracle.test.js` has its own variables:
     `DATA_LUBE_SEEDS=5000` and `DATA_LUBE_SEED=2` in `.tmp/data.env` (`DATA_LUBE_SEED` changes the seed
     base, `DATA_LUBE_CASE=<seed>` replays one case). Copy `test/data-lube/properties.test.js` into
     `.tmp/` with larger counts.
4. **Lint.** `npx eslint --fix <changed paths>`, then run it again without `--fix` and expect no
   output. The `pretty-*` rules rewrite formatting, so never hand-format code first; write it, then
   let `--fix` settle it.
5. **Types.** `pnpm dts` inside the changed package, then `pnpm lint`, which runs `tsc` over the repo and
   checks each handwritten `public.d.ts` on its own with `--skipLibCheck false`, since the root config skips
   lib checks and errors inside those files show up no other way. The flag is not used repo-wide because a
   third-party `.d.ts` then fails the run. `syntax/<package>.ts` holds the type tests: add cases there for
   every new public type, including `@ts-expect-error` ones, and `test/readme.test.js` type checks every top
   level ```ts and ```js block of every README, counting the blocks it checked against the fences so one
   can never drop out unnoticed.
6. **Published tarball.** `prepack` rebuilds the gitignored `types/`.
   `pnpm pack --pack-destination .tmp` inside the package, extract the tarball into an
   empty directory as `node_modules/<name>`, and from there check an ESM `import` and a CommonJS
   `require` (Node.js `require(esm)`), and the types: a `.mts` file importing the package and its
   subpaths (`./durable`), values and types, compiled with
   `npx --prefix <repo> tsc --noEmit --strict --skipLibCheck false --module nodenext --moduleResolution nodenext`
   The workspace resolves types differently from an installed package, so this
   catches broken `exports`, missing files and d.ts paths that only work in the repo.

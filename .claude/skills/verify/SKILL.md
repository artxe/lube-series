---
name: verify
description: Run the checks a lube-series change has to pass before it is done - tests, lint, generated types, the CJS bundle and the published tarball. Use after changing anything under packages/, test/ or syntax/.
---
# Verify a lube-series change

`pnpm pre` chains test, lint (eslint, then tsc), dts and cjs, but it never runs the DST time zone,
`--skipLibCheck false` or the tarball check below. Run each step from the repo root unless it says
otherwise, and keep going only while the step is clean.

1. **Tests.** `npx vitest run --coverage`. Aim at full coverage of the lines you touched; the gaps the
   report prints are usually real paths, not noise. For datetime-lube also run the tests with `TZ`
   set to `America/New_York`, `Australia/Lord_Howe` and `America/Santiago` (a DST zone finds what
   the local zone hides). On Windows a `TZ=...` prefix in Git Bash never reaches node; run
   `$env:TZ = 'America/New_York'; npx vitest run test/datetime-lube` in PowerShell instead.
2. **Property tests.** For new behavior in data-lube, extend the seeded checks in
   `test/data-lube/properties.test.js`. Copy them into the scratchpad with far larger seed counts and
   run that copy too - the committed counts stay small so the suite stays fast.
3. **Lint.** `npx eslint --fix <changed paths>`, then run it again without `--fix` and expect no
   output. The `pretty-*` rules rewrite formatting, so never hand-format code first; write it, then
   let `--fix` settle it.
4. **Types.** `pnpm dts` inside the changed package, then at the root both `npx tsc -p .` and
   `npx tsc -p . --skipLibCheck false`. The root config skips lib checks, so errors inside a
   handwritten `public.d.ts` only show up with the flag. `syntax/<package>.ts` holds the type tests:
   add cases there for every new public type, including `@ts-expect-error` ones.
5. **CJS bundle.** `pnpm cjs` inside the package after any `src` change, so `<name>.cjs` stays in
   sync. eslint-plugin-lube is the one package without that script.
6. **Published tarball.** `pnpm pack --pack-destination <scratchpad dir>`, extract it into an empty
   directory as `node_modules/<name>`, and from there check an ESM `import`, a CJS `require` and
   `tsc --noEmit --strict --skipLibCheck false --module nodenext --moduleResolution nodenext` against
   it. The workspace resolves types differently from an installed package, so this catches broken
   `exports`, missing files and d.ts paths that only work in the repo.

# Verification

Formatting and every fix a linter can make are the linter's: write the code, run the project's fixer on the changed files (`npx eslint --fix <files>`, `cargo clippy --fix`), and edit by hand only what it reports and cannot fix. Never hand-format first.

While working, run only the tests the change touches: one test file, one class, one `--tests` filter, the fuzzer or simulation of the part changed. The project's full check (lint, the whole suite with coverage, a clean build) runs once when the task is done, and again only after fixing what it found. A slow measurement (a duel, a benchmark, a long fuzz run) runs only when the change can move it.

In JavaScript held to 100%, coverage counts the right side of `??` and `||` as a branch (`?.` is free), so an entry that is always there is cast (`/** @type {number} */(m[12])/**/`), not defaulted, and a default is left only where a test reaches it.

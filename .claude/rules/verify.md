# Verification

Formatting and every fix a linter can make are the linter's: write the code, run the project's fixer on the changed files (`npx eslint --fix <files>`, `cargo clippy --fix`), and edit by hand only what it reports and cannot fix. Never hand-format first.

While working, run only the tests the change touches: one test file, one class, one `--tests` filter, the fuzzer or simulation of the part changed. The project's full check (lint, the whole suite, a clean build) runs once when the task is done, and again only after fixing what it found. A slow measurement (a duel, a benchmark, a long fuzz run) runs only when the change can move it.

A test exists for one of two reasons: written first, it states a new behaviour the change then makes pass; kept, it stops a later change from breaking a behaviour that works (a fixed bug among them). So a test states what the code does for its user, at the outermost level that reaches it, one test per behaviour: never one written to reach a line or a branch, to repeat what another test states, or to pin how the code does it (a private helper, a call order, a message's wording). Coverage is no goal: it has no threshold and runs only when asked. A test found to break that is deleted, or rewritten to state the behaviour when no other test does.

# Verification

While working, run only the tests the change touches: one test file, one class, one `--tests` filter, the fuzzer or simulation of the part changed. The project's full check (lint, the whole suite with coverage, a clean build) runs once when the task is done, and again only after fixing what it found. A slow measurement (a duel, a benchmark, a long fuzz run) runs only when the change can move it.

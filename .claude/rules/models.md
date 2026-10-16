# Models

The main session (Opus or Fable) keeps the judgment: what to change, the project's rules, the edits that need them, and what proves the work done. Work it can hand off goes to a subagent (the Agent tool's `model`) on the cheapest model that does it well, even when the main session only waits for it: a turn of the main session costs more than a cheap subagent's whole run, the more so in a long session. Running builds, tests, checks and scripts and reporting their output, commits from a given list, and cleanups go down; the main session reads the report and judges it. It checks what comes back before using it:
- `haiku`: mechanical work with exact instructions: finding files or strings, running a script or a test command and reporting its output, bulk edits from a given list, renames.
- `sonnet`: read-only investigation of one area, and scoped changes or tests whose cause and fix are already decided.
- `opus`: root-cause hunts across several files or systems, and design work.
- `fable`: only what is hard and costly to get wrong: a bug that resisted Opus, an architecture decision, a subtle timing, concurrency or replay issue.

A main session on Fable still hands haiku, sonnet and opus work down; one on Opus hands fable-level work to a `fable` subagent. A lookup the main session can do in one or two tool calls stays in the main session.

Subagents run in the foreground (`run_in_background: false`), independent ones in parallel as several Agent calls in one message: the main session never ends its turn while one is working, since one left running when the turn ends looks stopped to the owner. A subagent's brief says the same for its own commands (`shell.md`).

A brief carries what the subagent cannot see: the decided design with file and line evidence, what it must not touch, and the rhythm of `verify.md` (its own tests while working, the full check once at the end).

Two subagents never build or test in the same working tree at once: independent work on one repository runs in parallel only in separate worktrees (`isolation: "worktree"`), otherwise one after another. A worktree starts from the local `HEAD`'s last commit (`worktree.baseRef` is `head` in `.claude/settings.json`), without uncommitted work or `node_modules`: Node finds the main tree's up the folders, so a Node project's tools run there by `npx` and `node`, never `pnpm`, which installs first. Its brief has the agent check with `git log -n 1` that it holds that commit, and commit on its branch; the main session merges the branches, runs the full check once and removes the worktrees. A follow-up to a finished subagent is a new foreground Agent call carrying the context it needs; SendMessage resumes it in the background, where the main session cannot wait for it.

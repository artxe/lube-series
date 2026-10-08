# Models

The main session (Opus or Fable) keeps the judgment: what to change, the project's rules, the edits that need them and the final verification. Work it can hand off goes to a subagent (the Agent tool's `model`) on the cheapest model that does it well, and the main session checks what comes back before using it:
- `haiku`: mechanical work with exact instructions: finding files or strings, running a script or a test command and reporting its output, bulk edits from a given list, renames.
- `sonnet`: read-only investigation of one area, and scoped changes or tests whose cause and fix are already decided.
- `opus`: root-cause hunts across several files or systems, and design work.
- `fable`: only what is hard and costly to get wrong: a bug that resisted Opus, an architecture decision, a subtle timing, concurrency or replay issue.

A main session on Fable still hands haiku, sonnet and opus work down; one on Opus hands fable-level work to a `fable` subagent. A lookup the main session can do in one or two tool calls stays in the main session.

Subagents run in the foreground (`run_in_background: false`), independent ones in parallel as several Agent calls in one message: the main session never ends its turn while one is working, since one left running when the turn ends looks stopped to the owner. A subagent's brief says the same for its own commands (`shell.md`).

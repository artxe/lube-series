# Instruction files

`CLAUDE.md`, `.claude/rules/`, `.claude/skills/` and `.claude/api/` are read on every PC that opens this repository, so they name no drive, absolute path or folder layout of one PC: paths in them are relative to the repository, and examples are generic (`cd sub/folder`).

`.claude/api/` holds what only sessions billed to API credits follow: a client on the API or the Agent SDK, attended or not, appends its files to its system prompt, and Claude Code never loads them.

What later sessions need to know goes briefly into these files, never into Claude's local memory (a `memory/` directory, `MEMORY.md`), which no other PC or cloud session sees.

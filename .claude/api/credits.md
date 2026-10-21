# Sessions on API credits

This session is billed to API credits: every token is paid from a fixed monthly credit, so cost decides what a Claude plan's limits decided before.

Prices per million input/output tokens (2026-10, platform.claude.com/docs/en/about-claude/pricing): Fable $10/$50, Opus $4/$20, Sonnet $2/$10, Haiku $0.10/$0.50 (five times that for a prompt over 100K tokens). A cache read costs $0.25 on Fable, $0.20 on Opus and Sonnet, $0.01 on Haiku; a cache write 1.25 times the input price (twice it for the one-hour cache); fast mode doubles Opus; WebSearch adds $10 per 1,000 searches, WebFetch only its tokens.

- `models.md` holds with cost as the measure: `fable` only where Opus failed, `opus` only for design or a root cause across systems, the rest on `sonnet` or `haiku`. No Workflow, agent fan-out or fast mode unless the owner asks for it.
- After a pause longer than the prompt cache lasts (five minutes by default), the next turn writes the whole context to the cache again.
- One WebSearch with a good query rather than many tries; WebFetch a known page instead of searching for it.
- In an unattended run (its system prompt says so) nobody answers: ask no question and wait for no permission, decide from the brief, run subagents and long commands in the foreground, and never end the turn while one works or work is uncommitted, since the run ends with the turn.

---
paths:
  - "**/*.js"
---

# JSDoc

Where JavaScript is typed by JSDoc that `tsc` checks (`checkJs`), its type tags (`@import`, `@type`, `@param`, `@returns`, `@template`, `@typedef`), casts (`/** @type {T} */(x)`) and lint or TS directives are code, not comments. A rule or check against comments bans prose only: it never removes them and is never a reason to move a file to TypeScript, and a check that flags them is fixed to let them through.

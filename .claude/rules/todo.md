# TODO

What is left lives in three files at the repository root, one plain list item each (`- ...`, no checkbox):
- `TODO.md`: Claude's tasks, in the order they can be done, each naming what it waits for (a task, a decision, a check). Work wanted someday, a known gap of a finished part included, is a task too, at the end.
- `TODO.decisions.md`: what the owner must decide before its work starts: the question, the options and the recommendation; the work waits in `TODO.md`.
- `TODO.checks.md`: work Claude finished that only a person can confirm (another platform or PC, a real account, a design's look, the feel in play): what to check, how to reach it (the command, page or setup) and what to expect.

A request with several tasks goes into `TODO.md` first, before the work starts. Each item is deleted as soon as it is done, in the same commit as the work, so the files only ever list what is left (an emptied section or file goes too). A task found on the way that the request needs becomes an item too. The owner may write notes at the top of `TODO.md` in any language: a session takes them first, turning each into items or answering it, and deletes it.

A session may stop at any moment (a token or usage limit) and its transcript is deleted later, so nothing left open lives only in the session or its final report: whatever a task leaves open goes into one of the three files in the task's commit (a follow-up offered, a flaw or an unchecked case found on the way). A task bigger than one part is committed part by part, each commit rewriting its item to say what is done, what comes next and where unmerged work is (a branch, a worktree), so a cut-off session loses at most the part in hand. Each item stands on its own for a session that never saw this one: what, the numbers, and where the known facts are (the file path and symbol, not a line number, which moves; the cause if it was found, or that it was not traced; the command that measures it). A request that does not say what it is about answers one of these items, so read `TODO.md` first.

`TODO.md` is always ready for a new session told only to proceed with it: such a session works the tasks from the top, skipping one whose wait is not met, and asks the owner the decisions its next task needs. An answer moves its work into `TODO.md` in the same commit, and a failed check becomes a task.

A public repository keeps none of these files once a task ends: the task does its follow-ups itself, asks the owner the decisions its work needs in the session, before the work that waits on them, and names its checks and any gap it leaves in its final report. Only a task cut off midway leaves them there, and the next session takes them first.

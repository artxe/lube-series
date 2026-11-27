import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { pathToFileURL } from "node:url"
const BIG_READ = 300
const BIG_CHARACTERS = 16000
const BIG_TODO_RANGE = 4000
const DEFAULT_LIMIT = 2000
const TODO_FILE = /^TODO.*\.md$/i
const WHOLE = new Set(
	[
		".gif",
		".ipynb",
		".jpeg",
		".jpg",
		".pdf",
		".png",
		".svg",
		".webp"
	]
)
/**
 * @param {string} input the hook's JSON from stdin
 * @returns {string} the hook's answer, empty when the read may go ahead
 */
export function answer(input) {
	/** @type {{ tool_input?: { file_path?: unknown, limit?: unknown, offset?: unknown } }} */
	let hook
	try {
		hook = JSON.parse(input)
	} catch {
		return ""
	}
	const { file_path: path, limit, offset } = hook.tool_input ?? {}
	if (typeof path != "string" || WHOLE.has(extname(path).toLowerCase())) {
		return ""
	}
	const ranged = limit != null || offset != null
	let lines = 1
	let characters = 0
	let rangeLines = 0
	let rangeCharacters = 0
	try {
		const text = readFileSync(path, "utf8")
		characters = text.length
		const all = text.split("\n")
		lines = all.length
		const start = typeof offset == "number" && offset > 1 ? offset - 1 : 0
		const count = typeof limit == "number" && limit > 0 ? limit : DEFAULT_LIMIT
		const range = all.slice(start, start + count)
		rangeLines = range.length
		rangeCharacters = range.join("\n").length
	} catch {
		return ""
	}
	const todo = TODO_FILE.test(basename(path))
	if (todo) {
		if (rangeCharacters <= BIG_TODO_RANGE) {
			return ""
		}
	} else if (ranged) {
		if (rangeCharacters <= BIG_CHARACTERS) {
			return ""
		}
	} else if (lines <= BIG_READ && characters <= BIG_CHARACTERS) {
		return ""
	}
	const size = `${path} has ${lines} lines, ${characters} characters.`
	const reason = todo
		? `${size} Run the level check its head names, if any; otherwise \`node .claude/scripts/todo_ready.js\` for the ready items, and Grep for the ids you need. Then Read only those lines with offset and limit. This range is ${rangeLines} lines, ${rangeCharacters} characters (limit ${BIG_TODO_RANGE}): one item is one line, so Grep \`-n\` its id, then Read with offset at its line and limit: 1.`
		: `${size} Grep first, then Read only the lines you need with offset and limit.`
	return JSON.stringify(
		{
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason
			}
		}
	)
}
if (process.argv[1] && import.meta.url == pathToFileURL(process.argv[1]).href) {
	const output = answer(readFileSync(0, "utf8"))
	if (output) {
		process.stdout.write(`${output}\n`)
	}
}
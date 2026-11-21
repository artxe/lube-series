import { readFileSync } from "node:fs"
import { basename, extname } from "node:path"
import { pathToFileURL } from "node:url"
const BIG_READ = 300
const BIG_CHARACTERS = 16000
const NEW_LINE = 10
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
	if (typeof path != "string" || limit != null || offset != null || WHOLE.has(extname(path).toLowerCase())) {
		return ""
	}
	let lines = 1
	let characters = 0
	try {
		const text = readFileSync(path, "utf8")
		characters = text.length
		for (let index = 0; index < text.length; index += 1) {
			if (text.charCodeAt(index) == NEW_LINE) {
				lines += 1
			}
		}
	} catch {
		return ""
	}
	if (lines <= BIG_READ && characters <= BIG_CHARACTERS) {
		return ""
	}
	const size = `${path} has ${lines} lines, ${characters} characters.`
	const todo = TODO_FILE.test(basename(path))
	const reason = todo
		? `${size} Run the level check its head names, if any, for the ready items; otherwise Grep its headings and the ids you need. Then Read only those lines with offset and limit.`
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
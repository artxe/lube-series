import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
// shipped alone into projects, so the types are declared here, not in a .d.ts
// eslint-disable-next-line lube/no-typedef
/** @typedef {{ [key: string]: any }} Entry */
const BACKSLASH = /\\/g
const BIG_OUTPUT = 20000
const BIG_READ = 300
const FAILED_FIXES = 3
const MANY_FAILURES = 5
const LIMIT_MAIN = 100000
const LIMIT_SUBAGENT = 120000
const LINE_BREAK = /\r?\n/
const MAX_LISTED = 10
const EDITS = new Set(
	[ "Edit", "NotebookEdit", "Write" ]
)
/**
 * @param {string} input the hook's JSON from stdin
 * @returns {string} the hook's answer, empty when there is none
 */
export function answer(input) {
	/** @type {Entry} */
	let hook
	try {
		hook = JSON.parse(input)
	} catch {
		return ""
	}
	if (hook.stop_hook_active) {
		return ""
	}
	const subagent = hook.hook_event_name == "SubagentStop"
	const path = subagent ? hook.agent_transcript_path : hook.transcript_path
	let text
	try {
		text = readFileSync(path, "utf8")
	} catch {
		return ""
	}
	const all = findings(parse(text), subagent)
	if (all.length == 0) {
		return ""
	}
	const listed = all.slice(0, MAX_LISTED).map(line => `- ${line}`)
	if (all.length > MAX_LISTED) {
		listed.push(
			`- and ${all.length - MAX_LISTED} more`
		)
	}
	const where = subagent
		? "in your final message: repeat your whole report, since only your last message reaches the main session, and add the reflection at its end"
		: "in your reply to the owner"
	const reason = `Token waste in this turn:\n${listed.join("\n")}\nBefore you stop, reflect briefly ${where}, at most three sentences: what was wasted, why, and what you do differently from here on, naming the rule it broke (models.md, shell.md, verify.md) or, when none covers it, the rule you propose. Do not redo or undo work for this and do not read files to answer it.`
	return JSON.stringify({ decision: "block", reason })
}
/**
 * @param {Entry[]} entries
 * @param {boolean} subagent
 * @returns {string[]}
 */
export function findings(entries, subagent) {
	let from = 0
	entries.forEach(
		(entry, index) => {
			if (entry.type == "system" && entry.subtype == "compact_boundary") {
				from = index + 1
			}
		}
	)
	const segment = entries.slice(from)
	let turn = 0
	segment.forEach(
		(entry, index) => {
			if (is_prompt(entry)) {
				turn = index
			}
		}
	)
	/** @type {Map<string, { entry: Entry, part: Entry }>} */
	const results = new Map()
	for (const entry of segment) {
		if (entry.type == "user") {
			for (const part of parts(entry)) {
				if (part.type == "tool_result") {
					results.set(
						part.tool_use_id,
						{ entry, part }
					)
				}
			}
		}
	}
	/** @type {string[]} */
	const found = []
	/** @type {Map<string, Set<string>>} */
	const reads = new Map()
	/** @type {Map<string, { count: number, edits: number, first: number }>} */
	const errored = new Map()
	/** @type {Map<string, Entry[]>} */
	const edited = new Map()
	let edit_count = 0
	let failures = 0
	/** @type {Set<string>} */
	const reported = new Set()
	/** @type {Set<string>} */
	const big_reads = new Set()
	/** @type {{ id: string, name: string }[]} */
	const turn_calls = []
	segment.forEach(
		(entry, index) => {
			if (entry.type != "assistant") {
				return
			}
			const in_turn = index >= turn
			for (const part of parts(entry)) {
				if (part.type != "tool_use") {
					continue
				}
				const { id, input = {}, name } = part
				const result = results.get(id)
				if (in_turn) {
					turn_calls.push({ id, name })
				}
				if (EDITS.has(name)) {
					reads.delete(
						normal(
							input.file_path ?? input.notebook_path
						)
					)
				}
				if (name == "Read") {
					const path = normal(input.file_path)
					const range = `${input.offset ?? ""}:${input.limit ?? ""}`
					const file = result?.entry.toolUseResult?.type == "text"
						? result.entry.toolUseResult.file
						: null
					if (file) {
						const seen = reads.get(path) ?? new Set()
						if (in_turn && seen.has(range)) {
							found.push(
								`Read of ${input.file_path} (${range == ":" ? "whole file" : `offset:limit ${range}`}) repeats an earlier read with no change in between: keep what you read in mind, or Grep then read with offset and limit.`
							)
						}
						seen.add(range)
						reads.set(path, seen)
						if (in_turn && range == ":" && file.totalLines > BIG_READ) {
							big_reads.add(id)
							found.push(
								`Read of ${input.file_path} took the whole file (${file.totalLines} lines): Grep first, then Read with offset and limit.`
							)
						}
					}
				}
				if (in_turn && EDITS.has(name)) {
					edit_count += 1
				}
				if (in_turn && name == "Edit" && typeof input.old_string == "string" && typeof input.new_string == "string") {
					const path = normal(input.file_path)
					const earlier = edited.get(path) ?? []
					if (
						!reported.has(`undo ${path}`) && earlier.some(
							before => before.new_string == input.old_string && before.old_string == input.new_string
						)
					) {
						reported.add(`undo ${path}`)
						found.push(
							`Edit of ${input.file_path} undid an earlier edit this turn: that change was a guess (verify.md).`
						)
					}
					earlier.push(input)
					edited.set(path, earlier)
				}
				if (in_turn && result?.part.is_error) {
					failures += 1
					const key = `${name} ${JSON.stringify(input)}`
					const last = errored.get(key)
					if (last != null && last.edits == edit_count && !reported.has(key)) {
						reported.add(key)
						found.push(
							`${name} failed again with the same input (${JSON.stringify(input).slice(0, 120)}): change the approach instead of retrying.`
						)
					}
					const count = (last?.count ?? 0) + 1
					errored.set(
						key,
						{
							count,
							edits: edit_count,
							first: last?.first ?? edit_count
						}
					)
					if (
						count >= FAILED_FIXES && (name == "Bash" || name == "PowerShell") && edit_count > (last?.first ?? edit_count) && !reported.has(`fix ${key}`)
					) {
						reported.add(`fix ${key}`)
						found.push(
							`${name} \`${String(input.command).slice(0, 120)}\` failed ${count} times with edits between: two failed fixes; measure the cause before the next try (verify.md).`
						)
					}
				}
				if (in_turn && name == "Agent" && !input.model && input.subagent_type != "fork") {
					found.push(
						"Agent call without a model: name the cheapest model that does the part well (models.md)."
					)
				}
			}
		}
	)
	if (failures >= MANY_FAILURES) {
		found.push(
			`${failures} tool calls failed this turn: stop trying variants and find the cause first (verify.md).`
		)
	}
	for (const { id, name } of turn_calls) {
		const result = results.get(id)
		const length = result ? result_text(result.part).length : 0
		if (length > BIG_OUTPUT && !big_reads.has(id)) {
			found.push(
				`${name} returned ${length} characters: shorten output by the tool's own options, or leave it to a subagent.`
			)
		}
	}
	const limit = subagent ? LIMIT_SUBAGENT : LIMIT_MAIN
	let before = 0
	let peak = 0
	segment.forEach(
		(entry, index) => {
			if (entry.type != "assistant" || !entry.message?.usage) {
				return
			}
			const size = prompt_size(entry)
			if (index < turn) {
				before = size
			} else {
				peak = Math.max(peak, size)
			}
		}
	)
	if (peak > limit && before <= limit) {
		found.push(
			subagent
				? `Context passed ${limit} tokens (${peak}): commit what works and stop, reporting what comes next.`
				: `Context passed ${limit} tokens (${peak}): commit, leave the rest in TODO.md and tell the owner to continue in a new session.`
		)
	}
	return found
}
/**
 * @param {Entry} entry
 * @returns {boolean}
 */
function is_prompt(entry) {
	if (entry.type != "user" || entry.isMeta) {
		return false
	}
	const content = entry.message?.content
	if (typeof content == "string") {
		return true
	}
	const all = parts(entry)
	return all.some(part => part.type == "text") && !all.some(
		part => part.type == "tool_result"
	)
}
/**
 * @param {unknown} path
 * @returns {string}
 */
function normal(path) {
	return String(path ?? "").replace(BACKSLASH, "/")
		.toLowerCase()
}
/**
 * @param {string} text
 * @returns {Entry[]}
 */
function parse(text) {
	/** @type {Entry[]} */
	const entries = []
	for (const line of text.split(LINE_BREAK)) {
		try {
			const entry = JSON.parse(line)
			if (entry && typeof entry == "object") {
				entries.push(entry)
			}
		} catch {
			// a bad line is skipped
		}
	}
	return entries
}
/**
 * @param {Entry} entry
 * @returns {Entry[]}
 */
function parts(entry) {
	const content = entry.message?.content
	return Array.isArray(content) ? content : []
}
/**
 * @param {Entry} entry
 * @returns {number}
 */
function prompt_size(entry) {
	const usage = entry.message?.usage ?? {}
	return (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
}
/**
 * @param {Entry} part a tool_result part
 * @returns {string}
 */
function result_text(part) {
	const { content } = part
	if (typeof content == "string") {
		return content
	}
	return Array.isArray(content)
		? content.map(
			item => typeof item?.text == "string" ? item.text : ""
		).join("")
		: ""
}
if (process.argv[1] && import.meta.url == pathToFileURL(process.argv[1]).href) {
	const output = answer(readFileSync(0, "utf8"))
	if (output) {
		process.stdout.write(`${output}\n`)
	}
}
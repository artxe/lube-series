import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
// shipped alone into projects, so the type is declared here, not in a .d.ts
// eslint-disable-next-line lube/no-typedef
/** @typedef {{ key: string, lines: string[] }} TodoUnit */
const BARE = /^- /
const BLANK = /^\s*$/
const CONTINUED = /^\s/
const CRLF = /\r\n/
const HEADING = /^#{2,3} (.+)$/
const ITEM = /^- \[([^\]]+)\] ?(.*)$/
const LINE_BREAK = /\r?\n/
const NOTES = /^#{2,3} Notes for /
const DRIVER = "node .claude/scripts/todo_merge.js %O %A %B"
const USAGE = "usage: node .claude/scripts/todo_merge.js <base> <ours> <theirs> (writes the merge into <ours>, exit 1 on a conflict) | --install"
/**
 * @param {TodoUnit | null} ours
 * @param {TodoUnit | null} theirs
 * @param {string} key
 * @returns {TodoUnit}
 */
function conflict(ours, theirs, key) {
	return {
		key,
		lines: [
			"<<<<<<< ours",
			...ours ? trimmed(ours.lines) : [],
			"=======",
			...theirs ? trimmed(theirs.lines) : [],
			">>>>>>> theirs"
		]
	}
}
/**
 * @param {TodoUnit} unit
 * @returns {string}
 */
function flat(unit) {
	return trimmed(unit.lines).join("\n")
}
/**
 * @param {string} text
 * @returns {Map<string, TodoUnit>}
 */
function index(text) {
	return new Map(
		parse_units(text).map(unit => [ unit.key, unit ])
	)
}
/**
 * Sets the merge driver in the git repository whose top level is `folder`; does nothing elsewhere.
 * @param {string} folder the project root
 * @returns {void}
 */
export function install(folder) {
	const root = resolve(folder)
	/** @type {string} */
	let top = ""
	try {
		top = execFileSync(
			"git",
			[ "rev-parse", "--show-toplevel" ],
			{
				cwd: root,
				encoding: "utf8",
				stdio: [ "ignore", "pipe", "ignore" ]
			}
		).trim()
	} catch {
		return
	}
	if (resolve(top).toLowerCase() !== root.toLowerCase()) {
		return
	}
	execFileSync(
		"git",
		[
			"config",
			"merge.todo.name",
			"TODO files by item"
		],
		{ cwd: root }
	)
	execFileSync(
		"git",
		[
			"config",
			"merge.todo.driver",
			DRIVER
		],
		{ cwd: root }
	)
}
/**
 * @param {string[]} args
 * @returns {void}
 */
function main(args) {
	if (args.includes("--help")) {
		process.stdout.write(`${USAGE}\n`)
		return
	}
	if (args.includes("--install")) {
		install(process.cwd())
		return
	}
	const [ base, ours, theirs ] = args
	if (!base || !ours || !theirs) {
		process.stderr.write(`${USAGE}\n`)
		process.exitCode = 2
		return
	}
	const result = merge_todo(
		readFileSync(base, "utf8"),
		readFileSync(ours, "utf8"),
		readFileSync(theirs, "utf8")
	)
	writeFileSync(ours, result.text)
	if (result.conflicts > 0) {
		process.exitCode = 1
	}
}
/**
 * @param {string} base
 * @param {string} ours_text
 * @param {string} theirs_text
 * @returns {{ text: string, conflicts: number }}
 */
export function merge_todo(base, ours_text, theirs_text) {
	const from_base = index(base)
	const from_ours = parse_units(ours_text)
	const from_theirs = parse_units(theirs_text)
	const theirs_by_key = new Map(
		from_theirs.map(unit => [ unit.key, unit ])
	)
	const ours_keys = new Set(
		from_ours.map(unit => unit.key)
	)
	/** @type {TodoUnit[]} */
	const result = []
	let conflicts = 0
	for (const unit of from_ours) {
		const old = from_base.get(unit.key)
		const other = theirs_by_key.get(unit.key)
		if (old === undefined) {
			if (other && flat(other) !== flat(unit)) {
				result.push(
					conflict(unit, other, unit.key)
				)
				conflicts++
			} else {
				result.push(unit)
			}
		} else if (!other) {
			if (flat(unit) === flat(old)) {
				continue
			}
			result.push(conflict(unit, null, unit.key))
			conflicts++
		} else if (flat(unit) === flat(old)) {
			result.push(other)
		} else if (flat(other) === flat(old) || flat(other) === flat(unit)) {
			result.push(unit)
		} else {
			result.push(
				conflict(unit, other, unit.key)
			)
			conflicts++
		}
	}
	/** @type {string | null} */
	let previous = null
	for (const unit of from_theirs) {
		if (result.some(
			entry => entry.key === unit.key
		)) {
			previous = unit.key
			continue
		}
		const old = from_base.get(unit.key)
		if (old !== undefined && !ours_keys.has(unit.key) && flat(old) === flat(unit)) {
			continue
		}
		let entry = unit
		if (old !== undefined) {
			entry = conflict(null, unit, unit.key)
			conflicts++
		}
		const at = previous === null
			? 0
			: result.findIndex(
				other => other.key === previous
			) + 1
		result.splice(at, 0, entry)
		previous = unit.key
	}
	const eol = CRLF.test(ours_text) ? "\r\n" : "\n"
	const lines = result.flatMap(entry => entry.lines)
	return {
		conflicts,
		text: lines.length ? `${lines.join(eol)}${eol}` : ""
	}
}
/**
 * @param {string} text
 * @returns {TodoUnit[]}
 */
function parse_units(text) {
	const lines = text.split(LINE_BREAK)
	if (lines.at(-1) === "") {
		lines.pop()
	}
	/** @type {TodoUnit[]} */
	const units = []
	/** @type {Map<string, number>} */
	const seen = new Map()
	let notes = false
	for (const line of lines) {
		const last = units.at(-1)
		const heading = HEADING.test(line)
		const starts = heading
			|| ITEM.test(line)
			|| BARE.test(line)
			|| !last
			|| !BLANK.test(line) && (notes || !CONTINUED.test(line))
		if (!starts) {
			last?.lines.push(line)
			continue
		}
		if (heading) {
			notes = NOTES.test(line)
		}
		const found = ITEM.exec(line)
		let key = `l:${line}`
		if (heading) {
			key = `h:${line.trim()}`
		} else if (!notes && found) {
			key = `id:${found[1]}`
		} else if (!notes && BARE.test(line)) {
			key = `i:${line.split(":")[0]}`
		}
		const count = (seen.get(key) ?? 0) + 1
		seen.set(key, count)
		units.push(
			{
				key: count > 1 ? `${key}#${count}` : key,
				lines: [ line ]
			}
		)
	}
	return units
}
/**
 * @param {string[]} lines
 * @returns {string[]}
 */
function trimmed(lines) {
	let end = lines.length
	while (end > 1 && BLANK.test(lines[end - 1] ?? "")) {
		end--
	}
	return lines.slice(0, end)
}
if (
	process.argv[1]
		&& import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main(process.argv.slice(2))
}
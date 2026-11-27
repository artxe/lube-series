import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
const CUT = 160
const ITEM = /^- (\[[^\]]+\])\s*((?:(?:after|apart)\s[^:]*:\s*)*)(.*)$/
/**
 * @param {string} text the TODO file's text
 * @returns {string} one line per Level 0 item, or one line saying the section is missing
 */
export function ready(text) {
	const lines = text.split(/\r?\n/)
	const start = lines.findIndex(
		line => line.trim() == "## Level 0"
	)
	if (start < 0) {
		return "no ## Level 0 section"
	}
	const out = []
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) {
			break
		}
		const match = ITEM.exec(line)
		if (match) {
			const head = match[2] ? `${match[1]} ${match[2].trim()} ` : `${match[1]} `
			const rest = (match[3] ?? "").trim()
			const room = Math.max(CUT - head.length, 0)
			out.push(
				rest.length > room
					? `${head}${rest.slice(0, room).trimEnd()}...`
					: `${head}${rest}`.trimEnd()
			)
		} else if (line.includes("apart")) {
			out.push(line)
		}
	}
	return out.join("\n")
}
/**
 * @param {string} text the TODO file's text
 * @returns {string} the lines before the first Level section, then each Waiting item cut to its first words
 */
export function head(text) {
	const lines = text.split(/\r?\n/)
	const level = lines.findIndex(line => line.trim() == "## Level 0")
	const out = lines.slice(0, level < 0 ? lines.length : level)
	while (out.length && out[out.length - 1]?.trim() == "") {
		out.pop()
	}
	const waiting = lines.findIndex(line => line.trim() == "## Waiting")
	if (waiting >= 0) {
		out.push("", "## Waiting")
		for (const line of lines.slice(waiting + 1)) {
			if (line.startsWith("## ")) {
				break
			}
			if (line.startsWith("- ")) {
				out.push(line.length > CUT ? `${line.slice(0, CUT).trimEnd()}...` : line)
			}
		}
	}
	return out.join("\n")
}
/**
 * @param {string} text the TODO file's text
 * @param {string} id an item's id without brackets
 * @returns {string} the item's whole line, or one line saying it is missing
 */
export function item(text, id) {
	const line = text.split(/\r?\n/).find(
		each => each.startsWith(`- [${id}]`)
	)
	return line ?? `no item [${id}]`
}
if (process.argv[1] && import.meta.url == pathToFileURL(process.argv[1]).href) {
	if (process.argv[2] == "--item") {
		process.stdout.write(
			`${item(readFileSync(process.argv[4] ?? "TODO.md", "utf8"), process.argv[3] ?? "")}\n`
		)
	} else if (process.argv[2] == "--head") {
		process.stdout.write(
			`${head(readFileSync(process.argv[3] ?? "TODO.md", "utf8"))}\n`
		)
	} else {
		process.stdout.write(
			`${ready(readFileSync(process.argv[2] ?? "TODO.md", "utf8"))}\n`
		)
	}
}
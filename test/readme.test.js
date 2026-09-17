import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { assert, describe, it } from "vitest"
const root = resolve(
	dirname(fileURLToPath(import.meta.url)),
	".."
)
const globals_path = join(
	root,
	"test",
	"readme_globals.d.ts"
)
const packages = readdirSync(join(root, "packages"))
const require_from_root = createRequire(join(root, "package.json"))
const implicit_any = new Set([ 7005, 7006, 7031, 7034 ])
/**
 * @param {string} source
 * @returns {{ code: string, line: number, ts: boolean }[]}
 */
function code_blocks(source) {
	/** @type {{ code: string, line: number, ts: boolean }[]} */
	const blocks = []
	for (const match of source.matchAll(
		/^(\t| *)```(js|ts)\n([\s\S]*?)^\1```/gm
	)) {
		const code = /** @type {string} */(match[3])/**/
		if (match[1] || !resolvable(code)) continue
		blocks.push(
			{
				code,
				line: source.slice(0, match.index).split("\n").length + 1,
				ts: match[2] == "ts"
			}
		)
	}
	return blocks
}
/**
 * @param {string} source
 * @returns {string}
 */
function normalize(source) {
	return source.split("\r\n")
		.join("\n")
}
/**
 * @param {string} code
 * @returns {boolean}
 */
function resolvable(code) {
	for (const [ , specifier ] of code.matchAll(
		/(?:from|import)\s*\(?\s*["']([^"']+)["']/g
	)) {
		const name = /** @type {string} */(specifier)/**/
		if (name.startsWith("node:")) continue
		try {
			require_from_root.resolve(name)
		} catch {
			return false
		}
	}
	return true
}
/**
 * @param {string} source
 * @returns {number}
 */
function skipped(source) {
	let count = 0
	for (const match of source.matchAll(
		/^(\t| *)```(?:js|ts)\n([\s\S]*?)^\1```/gm
	)) {
		const code = /** @type {string} */(match[2])/**/
		if (!match[1] && !resolvable(code)) count++
	}
	return count
}
describe(
	"readme examples",
	() => {
		for (const name of packages) {
			const dir = join(root, "packages", name)
			const readme_path = join(dir, "README.md")
			const source = normalize(
				readFileSync(readme_path, "utf8")
			)
			const blocks = code_blocks(source)
			const fences = (source.match(/^```(?:js|ts)\n/gm) ?? []).length
			it(
				name,
				() => {
					assert.equal(
						blocks.length + skipped(source),
						fences,
						"every top level js or ts block is either checked or skipped for a reason"
					)
					/** @type {Map<string, string>} */
					const files = new Map()
					/** @type {Map<string, { code: string, line: number, ts: boolean }>} */
					const origins = new Map()
					for (const [ index, block ] of blocks.entries()) {
						const path = join(
							dir,
							`readme_${index}.${block.ts ? "mts" : "mjs"}`
						)
							.split("\\")
							.join("/")
						files.set(
							path,
							`${block.code}\nexport {}\n`
						)
						origins.set(path, block)
					}
					const host = ts.createCompilerHost({}, true)
					const read_file = host.readFile.bind(host)
					const file_exists = host.fileExists.bind(host)
					const get_source = host.getSourceFile.bind(host)
					host.fileExists = path => files.has(path.split("\\").join("/")) || file_exists(path)
					host.readFile = path => files.get(path.split("\\").join("/")) ?? read_file(path)
					host.getSourceFile = (
						path,
						options,
						on_error,
						should_create
					) => {
						const code = files.get(path.split("\\").join("/"))
						return code === void 0
							? get_source(
								path,
								options,
								on_error,
								should_create
							)
							: ts.createSourceFile(path, code, options, true)
					}
					const program = ts.createProgram(
						[ globals_path, ...files.keys() ],
						{
							allowJs: true,
							checkJs: true,
							lib: [
								"lib.es2023.d.ts",
								"lib.dom.d.ts"
							],
							module: ts.ModuleKind.NodeNext,
							moduleResolution: ts.ModuleResolutionKind.NodeNext,
							noEmit: true,
							skipLibCheck: true,
							strict: true,
							target: ts.ScriptTarget.ES2023,
							types: [ "node" ]
						},
						host
					)
					/** @type {string[]} */
					const problems = []
					for (const diagnostic of [
						...program.getSemanticDiagnostics(),
						...program.getSyntacticDiagnostics()
					]) {
						const path = diagnostic.file?.fileName.split("\\").join("/") ?? ""
						const origin = origins.get(path)
						if (!origin) {
							problems.push(
								ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
							)
							continue
						}
						if (!origin.ts && implicit_any.has(diagnostic.code)) continue
						const inside = diagnostic.file && diagnostic.start != null
							? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line
							: 0
						problems.push(
							`README.md:${origin.line + inside}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`
						)
					}
					assert.deepEqual(problems, [])
				},
				60000
			)
		}
	}
)
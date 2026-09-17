import { execFileSync } from "node:child_process"
import {
	existsSync,
	readFileSync,
	readdirSync
} from "node:fs"
import { dirname, join, posix } from "node:path"
import { fileURLToPath } from "node:url"
import { assert, describe, it } from "vitest"
const packages_dir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../packages"
)
const packages = [
	"async-lube",
	"data-lube",
	"datetime-lube",
	"eslint-plugin-lube",
	"hangul-lube"
]
/**
 * @param {unknown} target
 * @returns {string[]}
 */
function entry_paths(target) {
	if (typeof target == "string") return [ posix.normalize(target) ]
	if (target && typeof target == "object") return Object.values(target).flatMap(entry_paths)
	return []
}
/**
 * @param {string} dir
 * @returns {string[]}
 */
function packed_files(dir) {
	const output = execFileSync(
		"npm",
		[
			"pack",
			"--dry-run",
			"--json",
			"--ignore-scripts"
		],
		{
			cwd: dir,
			encoding: "utf8",
			shell: true,
			stdio: [ "ignore", "pipe", "ignore" ]
		}
	)
	const [ result ] = /** @type {{ files: { path: string }[] }[]} */(JSON.parse(output))/**/
	return /** @type {{ files: { path: string }[] }} */(result)/**/.files.map(file => file.path)
}
describe(
	"published files",
	() => {
		for (const name of packages) {
			it(
				name,
				() => {
					const dir = join(packages_dir, name)
					const manifest = /** @type {Record<string, unknown>} */(JSON.parse(
						readFileSync(
							join(dir, "package.json"),
							"utf8"
						)
					))/**/
					const files = packed_files(dir)
					const packed = new Set(files)
					assert.isArray(manifest["files"])
					for (const doc of [
						"CHANGELOG.md",
						"LICENSE",
						"README.md"
					]) assert.include(files, doc)
					if (existsSync(join(dir, "docs"))) {
						assert.include(
							/** @type {string[]} */(manifest["files"])/**/,
							"docs"
						)
						for (const doc of readdirSync(join(dir, "docs"))) assert.include(files, `docs/${doc}`)
					}
					const readme = readFileSync(join(dir, "README.md"), "utf8")
					for (const [ , doc ] of readme.matchAll(
						new RegExp(
							`https://github\\.com/artxe/lube-series/blob/master/packages/${name}/(docs/[^)#]+)`,
							"g"
						)
					)) assert.include(files, doc)
					for (const file of files) {
						assert.notMatch(
							file,
							/^(?:test|types\/test)\/|^tsconfig\.json$|^node_modules\//,
							file
						)
					}
					for (const file of files) {
						assert.notMatch(file, /\.c(?:js|ts)$/, file)
						assert.notMatch(
							file,
							/(?:^|\/)private\.d\.ts$/,
							file
						)
					}
					const entries = [
						manifest["main"],
						manifest["types"],
						manifest["exports"]
					].flatMap(entry_paths)
					for (const entry of entries) {
						if (existsSync(join(dir, entry))) assert.isTrue(packed.has(entry), entry)
					}
					const engines = /** @type {{ node?: string } | undefined} */(manifest["engines"])/**/
					assert.isString(engines?.node, "engines.node")
					assert.equal(manifest["author"], "artxe")
					assert.equal(
						manifest["homepage"],
						`https://github.com/artxe/lube-series/tree/master/packages/${name}#readme`
					)
					assert.deepEqual(
						manifest["bugs"],
						{
							url: "https://github.com/artxe/lube-series/issues"
						}
					)
					assert.isNotEmpty(manifest["keywords"])
					if (name != "eslint-plugin-lube") assert.isFalse(
						manifest["sideEffects"],
						"sideEffects"
					)
					assert.equal(manifest["type"], "module")
					const exports = /** @type {Record<string, Record<string, string>>} */(manifest["exports"])/**/
					for (const [ subpath, target ] of Object.entries(exports)) {
						assert.deepEqual(
							Object.keys(target),
							[ "types", "default" ],
							subpath
						)
						assert.match(
							target["types"] ?? "",
							/\.d\.ts$/,
							subpath
						)
						assert.match(
							target["default"] ?? "",
							/^\.\/src\/.+\.js$/,
							subpath
						)
						assert.isTrue(
							packed.has(
								posix.normalize(target["types"] ?? "")
							),
							subpath
						)
					}
					for (const file of files.filter(path => path.endsWith(".d.ts"))) {
						const source = readFileSync(join(dir, file), "utf8")
						for (const [ , specifier ] of source.matchAll(
							/(?:from |import\()"(\.{1,2}\/[^"]+)"/g
						)) {
							const base = posix.join(
								posix.dirname(file),
								/** @type {string} */(specifier)/**/
							).replace(/\.js$/, "")
							assert.isTrue(
								packed.has(`${base}.d.ts`) || packed.has(`${base}.js`),
								`${file} imports ${specifier}`
							)
						}
					}
				},
				30000
			)
		}
	}
)
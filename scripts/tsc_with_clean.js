import { exec } from "node:child_process"
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmdirSync,
	statSync,
	unlinkSync,
	writeFileSync
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
/**
 * @param {string} package_path
 * @param {string} manifest
 * @returns {void}
 */
function add_public_exports(package_path, manifest) {
	/** @type {{ exports?: Record<string, { default?: string }> }} */
	const parsed = JSON.parse(manifest)
	for (const entry of Object.values(parsed.exports ?? {})) {
		const source = entry.default
		if (!source?.startsWith("./src/")) continue
		const file_path = path.join(
			package_path,
			"types",
			source.slice("./src/".length, -3) + ".d.ts"
		)
		if (!existsSync(file_path)) continue
		const declaration = readFileSync(file_path, "utf8")
		const line = `export * from "${
			"../".repeat(source.split("/").length - 2)
		}public.js"\n`
		const marker = "//# sourceMappingURL="
		const index = declaration.lastIndexOf(marker)
		writeFileSync(
			file_path,
			index < 0
				? declaration + line
				: declaration.slice(0, index) + line + declaration.slice(index)
		)
	}
}
/**
 * @param {string} dir_path
 * @param {number} start_time
 * @returns {void}
 */
function clean_dir(dir_path, start_time) {
	const files = readdirSync(dir_path)
	let length = files.length
	for (const file of files) {
		const file_path = path.join(dir_path, file)
		const stat = statSync(file_path)
		if (stat.isDirectory()) {
			clean_dir(file_path, start_time)
			if (!existsSync(file_path)) length--
		} else if (stat.mtimeMs < start_time) {
			unlinkSync(file_path)
			length--
		}
	}
	if (!length) rmdirSync(dir_path)
}
const package_path = fileURLToPath(
	new URL(
		`../packages/${process.argv[2]}`,
		import.meta.url
	)
)
const start_time = Date.now()
exec(
	"tsc",
	{ cwd: package_path },
	(error, stdout, stderr) => {
		if (stdout) console.log(stdout)
		if (stderr) console.error(stderr)
		if (error) process.exit(error.code ?? 1)
		const types_path = path.join(package_path, "types")
		if (existsSync(types_path)) clean_dir(types_path, start_time)
		const manifest = readFileSync(
			path.join(package_path, "package.json"),
			"utf8"
		)
		if (existsSync(
			path.join(package_path, "public.d.ts")
		)) {
			add_public_exports(package_path, manifest)
		}
	}
)
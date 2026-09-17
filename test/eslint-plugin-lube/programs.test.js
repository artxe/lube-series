import { fuzz_seeds } from "../seeds.js"
import { Linter } from "eslint"
import lube from "eslint-plugin-lube"
import assert from "node:assert"
import { spawnSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"
const prelude = `const out = globalThis.fuzzOutput
function log(v) { out.push(typeof v == "function" ? "fn" : String(v)); return v }
function show(v) {
	return JSON.stringify(v, (k, x) => x instanceof Set ? [ "Set", ...x ] : x instanceof Map ? [ "Map", ...x ] : typeof x == "function" ? "fn" : x && typeof x == "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [ key, x[key] ])) : x)
}
`
const library = `export let counterValue = 1
export const fixedLimit = 10
export function bumpCounter() { counterValue += 1; return counterValue }
export function readCounter() { return counterValue }
export default function defaultHelper(x) { return x * 2 }
`
const runner = `import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
const results = []
for (const file of JSON.parse(readFileSync(process.argv[1], "utf8"))) {
	globalThis.fuzzOutput = []
	let error = ""
	try {
		await import(pathToFileURL(file).href)
	} catch (e) {
		error = \`\${e?.constructor?.name}: \${e?.message}\`
	}
	results.push([ ...globalThis.fuzzOutput, error ].join("\\n"))
}
process.stdout.write(JSON.stringify(results))
`
const camel_names = [
	"maxTemp",
	"lineName",
	"itemList",
	"lastBid",
	"aValue",
	"bValue",
	"zetaCount",
	"machineId",
	"nextSlot",
	"isReady",
	"x1Y",
	"totalMs"
]
const snake_names = [
	"max_temp",
	"line_name",
	"item_list",
	"zeta",
	"alpha",
	"beta",
	"count",
	"b",
	"a"
]
const key_names = [
	"a",
	"b",
	"B",
	"aB",
	"Ab",
	"_x",
	"$d",
	"z",
	"10",
	"2",
	"mid",
	"Z9",
	"a_b",
	"ab"
]
/**
 * @param {number} seed
 * @returns {() => number}
 */
function create_random(seed) {
	return () => {
		seed = seed + 0x6d2b79f5 | 0
		let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
		value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
		return ((value ^ value >>> 14) >>> 0) / 4294967296
	}
}
/**
 * @param {number} seed
 * @returns {string}
 */
function generate(seed) {
	const random = create_random(seed)
	/** @type {string[]} */
	const consts = []
	/** @type {string[]} */
	const lets = []
	/** @type {string[]} */
	const lines = []
	/** @type {string[]} */
	const tdz = []
	let counter = 0
	/**
	 * @param {number} probability
	 * @returns {boolean}
	 */
	function chance(probability) {
		return random() < probability
	}
	/** @returns {string} */
	function fresh() {
		counter++
		return `${chance(0.6) ? pick(camel_names) : pick(snake_names)}${counter}`
	}
	/**
	 * @param {number} count
	 * @returns {number}
	 */
	function int(count) {
		return Math.floor(random() * count)
	}
	/**
	 * @param {string} open
	 * @param {string[]} parts
	 * @param {string} close
	 * @returns {string}
	 */
	function layout(open, parts, close) {
		if (!parts.length) return `${open}${close}`
		if (chance(0.6)) return `${open} ${parts.map(part => chance(0.1) ? `/* k */ ${part}` : part).join(", ")} ${close}`
		const body = parts.map(
			(part, index) => {
				const comment = weighted(
					[
						[ "", 6 ],
						[ " // note", 1 ],
						[ " /* c */", 1 ],
						[ " // a, b }", 1 ]
					]
				)
				const comma = index < parts.length - 1 ? "," : ""
				return comment.startsWith(" //")
					? `\t${part}${comma}${comment}`
					: `\t${part}${comment}${comma}`
			}
		)
		return `${open}\n${body.join("\n")}\n${close}`
	}
	/**
	 * @param {number} depth
	 * @param {boolean} in_function
	 * @returns {string}
	 */
	function object(depth, in_function) {
		/** @type {string[]} */
		const parts = []
		const used = new Set()
		for (let count = 1 + int(5); count > 0; count--) {
			const kind = int(12)
			if (kind == 0 && consts.length) {
				parts.push(`...${pick(consts)}`)
				continue
			}
			if (kind == 1 && lets.length) {
				const name = pick(lets)
				if (!used.has(name)) {
					used.add(name)
					parts.push(name)
				}
				continue
			}
			if (kind == 2) {
				parts.push(
					`[${JSON.stringify(pick(key_names))}]: ${value(depth, in_function)}`
				)
				continue
			}
			const key = pick(key_names)
			if (kind == 3) {
				if (!used.has(key) && /^[a-zA-Z_$]/.test(key)) {
					used.add(key)
					parts.push(
						`${key}() { return ${value(depth, true)} }`
					)
				}
				continue
			}
			if (used.has(key) && chance(0.7)) continue
			used.add(key)
			parts.push(
				`${/^[a-zA-Z_$]/.test(key) || chance(0.5) ? key : JSON.stringify(key)}: ${value(depth, in_function)}`
			)
		}
		return layout("{", parts, "}")
	}
	/**
	 * @template T
	 * @param {readonly T[]} items
	 * @returns {T}
	 */
	function pick(items) {
		return /** @type {T} */(items[int(items.length)])/**/
	}
	/** @returns {void} */
	function statement() {
		const kind = weighted(
			[
				[ "const", 3 ],
				[ "let", 3 ],
				[ "log", 4 ],
				[ "closure", 2 ],
				[ "destructure", 2 ],
				[ "ternary", 1 ],
				[ "tdz", 1 ],
				[ "functions", 1 ],
				[ "shadow", 1 ],
				[ "loop", 1 ],
				[ "sequence", 1 ],
				[ "asi", 2 ],
				[ "arguments", 1 ],
				[ "return", 1 ]
			]
		)
		if (kind == "const") {
			const name = fresh()
			lines.push(
				`const ${name} = ${chance(0.5) ? object(0, false) : value(1, false)}`,
				`log(show(${name}))`
			)
			consts.push(name)
		} else if (kind == "let") {
			const name = fresh()
			lines.push(`let ${name} = ${int(5)}`)
			lets.push(name)
			if (chance(0.5)) lines.push(`${name} += ${int(3)}`)
		} else if (kind == "log") {
			lines.push(
				`log(show(${object(0, false)}))`
			)
		} else if (kind == "closure" && lets.length) {
			const target = pick(lets)
			const name = fresh()
			lines.push(
				chance(0.5)
					? `function ${name}() { ${target} = ${target} + 1; return ${target} }`
					: `const ${name} = () => { ${target} += 1; return { ${target}, other: ${value(1, true)} } }`,
				`log(show(${name}()))`
			)
			consts.push(name)
		} else if (kind == "destructure") {
			/** @type {string[]} */
			const names = []
			/** @type {string[]} */
			const parts = []
			for (let count = 1 + int(3); count > 0; count--) {
				const key = pick([ "a", "b", "c", "aB", "zz" ])
				if (parts.some(
					part => part.startsWith(`${key}:`)
				)) continue
				const name = fresh()
				names.push(name)
				parts.push(
					`${key}: ${name}${chance(0.5) ? ` = ${value(1, false)}` : ""}`
				)
			}
			lines.push(
				`const { ${parts.join(", ")} } = { a: 1, c: undefined, zz: ${int(5)} }`
			)
			for (const name of names) {
				lines.push(`log(show(${name}))`)
				consts.push(name)
			}
		} else if (kind == "ternary") {
			lines.push(
				`log(show(${value(1, false)} ? ${value(1, false)} : ${value(1, false)} ? ${object(1, false)} : ${value(1, false)}))`
			)
		} else if (kind == "tdz") {
			const later = fresh()
			const early = fresh()
			tdz.push(later)
			lines.push(
				`function ${early}() { return ${object(0, true)} }`,
				`try { log(show(${early}())) } catch (e) { log(e.constructor.name) }`,
				`const ${later} = ${int(9)}`,
				`log(show(${early}()))`
			)
			consts.push(later)
		} else if (kind == "functions") {
			const a = fresh()
			const b = fresh()
			lines.push(
				`log(${b}() + ${a}())`,
				`function ${b}() { return log("${b}") }`,
				`function ${a}() { return log("${a}") }`
			)
		} else if (kind == "shadow" && lets.length) {
			const target = pick(lets)
			const snake = target.replace(
				/[A-Z]/g,
				letter => `_${letter.toLowerCase()}`
			)
			lines.push(
				`{ const ${snake} = "inner"; log(${target}); log(${snake}) }`
			)
		} else if (kind == "loop" && lets.length) {
			const target = pick(lets)
			lines.push(
				`for (let iIndex = 0; iIndex < 2; iIndex++) { ${target} += iIndex; log(${target}) }`
			)
		} else if (kind == "asi") {
			lines.push(
				`${pick([ "log(\"x\")", "log(show([ 1, 2 ]))", lets.length ? `${pick(lets)} = 3` : "log(0)", "void 0" ])}; ${pick([ "(log(\"p\"), log(\"q\"))", "[ 1, 2 ].forEach(v => log(v))", "`t`.length && log(\"tl\")", "+log(\"plus\")", "/re/.test(\"re\") && log(\"rx\")", "-1 && log(\"minus\")" ])}`
			)
		} else if (kind == "arguments") {
			lines.push(
				`log(show(${layout("[", Array.from({ length: 2 + int(4) }, () => value(1, false)), "]")}))`
			)
		} else if (kind == "return") {
			const name = fresh()
			lines.push(
				`function ${name}(someFlag, otherFlag) {\n\treturn someFlag ? ${value(1, true)} : otherFlag ? ${value(1, true)} : ${value(1, true)} // tail\n}`,
				`log(show(${name}(${pick([ "0", "1" ])}, ${pick([ "0", "1" ])})))`
			)
		} else if (kind == "sequence") {
			lines.push(
				`log((${value(1, false)}, ${value(1, false)}, ${value(1, false)}))`
			)
		}
	}
	/**
	 * @param {number} depth
	 * @param {boolean} in_function
	 * @returns {string}
	 */
	function value(depth, in_function) {
		switch (weighted(
			[
				[ "literal", 3 ],
				[ "const", consts.length ? 3 : 0 ],
				[ "let", lets.length ? 3 : 0 ],
				[ "call", 3 ],
				[ "builtin", 2 ],
				[ "constructor", 1 ],
				[ "arrow", 1 ],
				[ "ternary", 1 ],
				[ "nullish", 1 ],
				[ "typeof", 1 ],
				[ "assign", lets.length ? 1 : 0 ],
				[ "update", lets.length ? 1 : 0 ],
				[ "object", depth < 2 ? 2 : 0 ],
				[
					"tdz",
					in_function && tdz.length ? 2 : 0
				],
				[ "namespace", 1 ],
				[ "import", 1 ],
				[ "template", 1 ],
				[ "member", consts.length ? 1 : 0 ],
				[ "sequence", 1 ],
				[ "date", lets.length ? 1 : 0 ]
			]
		)) {
		case "literal": return pick(
			[
				"1",
				"0",
				"\"s\"",
				"null",
				"true",
				"-1",
				"2.5",
				"undefined",
				"NaN"
			]
		)
		case "const": return pick(consts)
		case "let": return pick(lets)
		case "call": return `log(${JSON.stringify(`v${counter++}`)})`
		case "builtin": return pick(
			[
				"new Date(0)",
				"new Set([ 1 ])",
				"new Map()",
				"new Map([ [ 1, 2 ] ])",
				"new Array(3)",
				"new Error(\"e\")",
				"new RegExp(\"a\", \"g\")",
				"new URL(\"https://x.y/\")",
				"new Uint8Array(2)",
				"new WeakMap()"
			]
		)
		case "constructor": return "new Thing(log(\"ctor\"))"
		case "arrow": return `(() => ${chance(0.5) && lets.length ? pick(lets) : "log(\"arrow\")"})`
		case "ternary": return `(${value(depth + 1, in_function)} ? ${value(depth + 1, in_function)} : ${value(depth + 1, in_function)})`
		case "nullish": return `(${value(depth + 1, in_function)} ?? ${value(depth + 1, in_function)})`
		case "typeof": return `typeof ${chance(0.5) && lets.length ? pick(lets) : "undeclaredThing"}`
		case "assign": return `(${pick(lets)} = ${int(9)})`
		case "update": return `${pick(lets)}++`
		case "object": return object(depth + 1, in_function)
		case "tdz": return pick(tdz)
		case "namespace": return pick(
			[
				"lib.counterValue",
				"lib.bumpCounter()",
				"lib.fixedLimit"
			]
		)
		case "import": return pick(
			[
				"counterValue",
				"bumpCounter()",
				"fixedLimit",
				"defaultHelper(2)",
				"readCounter()"
			]
		)
		case "template": return `\`t\${${pick([ "1", "log(\"tp\")", ...lets ])}}\``
		case "member": return `${pick(consts)}?.a`
		case "sequence": return `(log("s1"), ${value(depth + 1, in_function)})`
		default: return `new Date(${pick(lets)})`
		}
	}
	/**
	 * @param {[string, number][]} items
	 * @returns {string}
	 */
	function weighted(items) {
		let rest = random() * items.reduce(
			(total, [ , weight ]) => total + weight,
			0
		)
		for (const [ item, weight ] of items) {
			rest -= weight
			if (rest < 0) return item
		}
		return /** @type {[string, number]} */(items.at(-1))/**/[0]
	}
	for (let count = 4 + int(10); count > 0; count--) statement()
	return [
		"import { readCounter, fixedLimit, counterValue, bumpCounter } from \"./lib.js\"",
		"import defaultHelper from \"./lib.js\"",
		"import * as lib from \"./lib.js\"",
		prelude + "class Thing { constructor(v) { this.v = v; log(\"Thing\") } }",
		...lines,
		lets.length ? `log(show({ ${lets.join(", ")} }))` : ""
	].join("\n")
}
describe(
	"programs",
	() => {
		const seeds = fuzz_seeds(30)
		for (const config_name of /** @type {const} */([ "recommended", "strict" ])/**/) {
			it(
				`the ${config_name} config keeps what a program does, converges and keeps CRLF`,
				() => {
					const linter = new Linter()
					const config = [ lube.configs[config_name] ]
					const dir = mkdtempSync(
						join(tmpdir(), "lube-programs-")
					)
					try {
						writeFileSync(
							join(dir, "package.json"),
							"{ \"type\": \"module\" }"
						)
						/** @type {string[]} */
						const files = []
						/** @type {number[]} */
						const changed = []
						for (const seed of seeds) {
							const code = generate(seed)
							const first = linter.verifyAndFix(code, config)
							assert.deepStrictEqual(
								first.messages.filter(message => message.fatal),
								[],
								`seed ${seed}`
							)
							assert.strictEqual(
								linter.verifyAndFix(first.output, config).output,
								first.output,
								`seed ${seed} converges`
							)
							const crlf = linter.verifyAndFix(
								code.replaceAll("\n", "\r\n"),
								config
							).output
							assert.doesNotMatch(
								crlf,
								/(?<!\r)\n/,
								`seed ${seed} CRLF`
							)
							assert.strictEqual(
								linter.verifyAndFix(crlf, config).output,
								crlf,
								`seed ${seed} converges with CRLF`
							)
							if (first.output == code && crlf == code.replaceAll("\n", "\r\n")) continue
							changed.push(seed)
							for (const [ name, source ] of /** @type {[string, string][]} */([
								[ "original", code ],
								[ "fixed", first.output ],
								[ "crlf", crlf ]
							])/**/) {
								const folder = join(dir, String(seed), name)
								mkdirSync(folder, { recursive: true })
								writeFileSync(join(folder, "lib.js"), library)
								writeFileSync(join(folder, "main.js"), source)
								files.push(join(folder, "main.js"))
							}
						}
						assert.ok(
							changed.length > seeds.length / 2,
							`${changed.length} of ${seeds.length} changed`
						)
						writeFileSync(
							join(dir, "files.json"),
							JSON.stringify(files)
						)
						const run = spawnSync(
							process.execPath,
							[
								"--input-type=module",
								"-e",
								runner,
								join(dir, "files.json")
							],
							{
								encoding: "utf8",
								maxBuffer: 1 << 30,
								timeout: 60000 + seeds.length * 100
							}
						)
						assert.strictEqual(run.status, 0, run.stderr)
						const results = /** @type {string[]} */(JSON.parse(run.stdout))/**/
						for (const [ index, seed ] of changed.entries()) {
							const [ original, fixed, crlf ] = results.slice(index * 3, index * 3 + 3)
							assert.strictEqual(fixed, original, `seed ${seed}`)
							assert.strictEqual(
								crlf,
								original,
								`seed ${seed} CRLF`
							)
						}
					} finally {
						rmSync(
							dir,
							{ force: true, recursive: true }
						)
					}
				},
				60000 + seeds.length * 500
			)
		}
	}
)
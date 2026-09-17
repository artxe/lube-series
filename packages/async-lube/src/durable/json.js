/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function copy(value) {
	return typeof value == "object" && value !== null
		? JSON.parse(JSON.stringify(value))
		: value
}
/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function json_problem(value) {
	if (value === void 0) return
	/** @type {(number | string)[]} */
	const path = []
	const problem = json_problem_at(value, path, [])
	if (!problem) return
	let at = ""
	for (const part of path) at += typeof part == "number" ? `[${part}]` : `.${part}`
	return at ? `${problem} at ${at}` : problem
}
/**
 * @param {unknown} value
 * @param {(number | string)[]} path
 * @param {unknown[]} parents
 * @returns {string | undefined}
 */
function json_problem_at(value, path, parents) {
	switch (typeof value) {
	case "bigint": return "a BigInt"
	case "boolean":
	case "string": return
	case "function":
	case "symbol": return `a ${typeof value}`
	case "number": return Number.isFinite(value) ? void 0 : String(value)
	case "undefined": return "undefined"
	}
	if (value === null) return
	if (parents.includes(value)) return "a circular reference"
	if (Array.isArray(value)) {
		parents.push(value)
		for (let index = 0; index < value.length; index++) {
			path.push(index)
			const problem = json_problem_at(value[index], path, parents)
			if (problem) return problem
			path.pop()
		}
		parents.pop()
		return
	}
	const prototype = /** @type {{ constructor?: unknown } | null} */(Object.getPrototypeOf(value))/**/
	if (prototype && Object.getPrototypeOf(prototype)) {
		const { constructor } = prototype
		return `an instance of ${typeof constructor == "function" && constructor.name || "a class"}`
	}
	parents.push(value)
	const record = /** @type {Record<string, unknown>} */(value)/**/
	for (const key of Object.keys(record)) {
		const item = record[key]
		if (item === void 0) continue
		path.push(key)
		const problem = json_problem_at(item, path, parents)
		if (problem) return problem
		path.pop()
	}
	parents.pop()
	return void 0
}
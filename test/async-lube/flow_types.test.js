import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { assert, describe, it } from "vitest"
const root = join(
	dirname(fileURLToPath(import.meta.url)),
	"../.."
)
/**
 * @param {string} code
 * @returns {string[]}
 */
function type_errors(code) {
	const config = ts.getParsedCommandLineOfConfigFile(
		join(root, "tsconfig.json"),
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: () => {}
		}
	)
	const file = join(
		root,
		"syntax",
		"flow_types_fixture.ts"
	).replace(/\\/g, "/")
	const host = ts.createCompilerHost(
		/** @type {ts.ParsedCommandLine} */(config)/**/.options
	)
	const {
		fileExists,
		getSourceFile,
		readFile
	} = host
	host.fileExists = name => name == file || fileExists(name)
	host.readFile = name => name == file ? code : readFile(name)
	host.getSourceFile = (name, version, ...rest) => name == file
		? ts.createSourceFile(name, code, version)
		: getSourceFile(name, version, ...rest)
	const program = ts.createProgram(
		[ file ],
		/** @type {ts.ParsedCommandLine} */(config)/**/.options,
		host
	)
	return ts.getPreEmitDiagnostics(program)
		.map(
			diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
		)
}
describe(
	"flow types",
	() => {
		it(
			"errors name the problem of the node",
			() => {
				const errors = type_errors(
					[
						"import { flow, type NodeContext } from \"async-lube\"",
						"type Req = { id: string }",
						"const sub = flow<Req>().add(({ state }: NodeContext<Req>) => state.id)",
						"const lead = () => ({ ok: true })",
						"const validate = (): Req => ({ id: \"1\" })",
						"flow().add(validate).add(lead).add(sub, validate, lead)",
						"const accept = flow.input<boolean>(\"accept\")",
						"flow().add(accept, { catch: () => \"timeout\" as const, timeout: 1000 })"
					].join("\n")
				)
				assert.lengthOf(errors, 2)
				assert.include(
					errors[0],
					"The state of the sub-flow does not match"
				)
				assert.include(
					errors[1],
					"Type '\"timeout\"' is not assignable to type 'Caught<boolean>'"
				)
			},
			30000
		)
	}
)
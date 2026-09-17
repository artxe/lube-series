import { start_server } from "../async-lube/server.js"
/** @type {Awaited<ReturnType<typeof start_server>>[]} */
const servers = []
/**
 * @param {{ provide: (key: string, value: unknown) => void }} context
 * @returns {Promise<void>}
 */
export async function setup({ provide }) {
	const server = await start_server()
	servers.push(server)
	provide("base", server.base)
}
/**
 * @returns {Promise<void>}
 */
export async function teardown() {
	await Promise.all(
		servers.splice(0)
			.map(server => server.close())
	)
}
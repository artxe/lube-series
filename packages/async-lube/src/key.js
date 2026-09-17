/**
 * @returns {string}
 */
export function random_key() {
	return globalThis.crypto?.randomUUID?.()
	?? Date.now().toString(36) + Math.random().toString(36)
		.slice(2)
}
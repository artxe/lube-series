/** @import { Hook } from "../../private.js" */
import { noop } from "../signal.js"
export const hook_names = /** @type {const} */([
	"error",
	"request",
	"response",
	"unauthorized"
])/**/
/**
 * @template {unknown[]} A
 * @param {((...args: A) => unknown) | undefined} hook
 * @param {A} args
 * @returns {void}
 */
export function call_hook(hook, ...args) {
	if (!hook) return
	try {
		Promise.resolve(hook(...args))
			.catch(noop)
	} catch {}
}
/**
 * @param {import("../../public.js").HeadersSource | undefined} source
 * @param {Headers} target
 * @returns {Promise<void>}
 */
export async function merge_headers(source, target) {
	const init = typeof source == "function" ? await source() : source
	if (init) new Headers(init).forEach(
		(value, key) => target.set(key, value)
	)
}
/**
 * @param {import("../../public.js").Hooks} parent
 * @param {import("../../public.js").Hooks} child
 * @returns {import("../../public.js").Hooks}
 */
export function merge_hooks(parent, child) {
	/** @type {Record<string, Hook | undefined>} */
	const hooks = {}
	for (const name of hook_names) {
		const first = /** @type {Hook | undefined} */(parent[name])/**/
		const second = /** @type {Hook | undefined} */(child[name])/**/
		/**
		 * @param {unknown[]} args
		 * @returns {Promise<void>}
		 */
		async function both(...args) {
			try {
				await /** @type {Hook} */(first)/**/(...args)
			} finally {
				await /** @type {Hook} */(second)/**/(...args)
			}
		}
		hooks[name] = first && second ? both : first ?? second
	}
	return hooks
}
/**
 * @param {Readonly<Record<string, unknown>>} source
 * @param {Set<string>} keys
 * @returns {Record<string, unknown>}
 */
export function omit_keys(source, keys) {
	/** @type {Record<string, unknown>} */
	const init = {}
	for (const key of Object.keys(source)) {
		if (!keys.has(key)) init[key] = source[key]
	}
	return init
}
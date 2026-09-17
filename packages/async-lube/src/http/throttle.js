/** @import { ClientContext } from "../../private.js" */
import { clamp_delay, sleep } from "../signal.js"
/**
 * @param {ClientContext} c
 * @param {string} key
 * @param {number} ms
 * @param {(reason: string) => void} cancel
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export async function throttle(c, key, ms, cancel, signal) {
	let slot = c.shared.throttles.get(key)
	if (!slot) {
		slot = { cancel: void 0, next: 0 }
		c.shared.throttles.set(key, slot)
	}
	const current = slot
	const wait = current.next - Date.now()
	if (wait > 0 || current.cancel) {
		current.cancel?.(
			"Superseded by a newer request"
		)
		current.cancel = cancel
		try {
			await sleep(Math.max(wait, 0), signal)
		} finally {
			if (current.cancel == cancel) current.cancel = void 0
		}
	}
	current.next = Date.now() + ms
	const sweeper = /** @type {{ unref?: () => void }} */(/** @type {unknown} */(setTimeout(
		() => {
			if (!current.cancel && Date.now() >= current.next && c.shared.throttles.get(key) == current) c.shared.throttles.delete(key)
		},
		clamp_delay(ms)
	)))/**/
	sweeper.unref?.()
}
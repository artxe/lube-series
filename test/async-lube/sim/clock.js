/** @import { SimRng, SimTimer } from "../private.js" */
const real = {
	clear_interval: globalThis.clearInterval,
	clear_timeout: globalThis.clearTimeout,
	date_now: Date.now,
	set_immediate: globalThis.setImmediate,
	set_interval: globalThis.setInterval,
	set_timeout: globalThis.setTimeout
}
/** @type {Map<number, SimTimer>} */
const timers = new Map()
let last_id = 0
let now = Date.UTC(2026, 0, 1)
let sequence = 0
/**
 * @param {() => void} fn
 * @param {number | undefined} ms
 * @param {boolean} repeat
 * @returns {NodeJS.Timeout}
 */
function add(fn, ms, repeat) {
	const delay = Math.max(0, Number(ms) || 0)
	const id = ++last_id
	timers.set(
		id,
		{
			at: now + delay,
			every: repeat ? Math.max(1, delay) : void 0,
			fn,
			id,
			seq: sequence++
		}
	)
	const handle = {
		[Symbol.toPrimitive]: () => id,
		hasRef: () => true,
		id,
		ref: () => handle,
		refresh: () => handle,
		unref: () => handle
	}
	return /** @type {NodeJS.Timeout} */(/** @type {unknown} */(handle))/**/
}
/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export async function advance(ms) {
	const end = now + ms
	await flush(4)
	for (;;) {
		const timer = earliest()
		if (!timer || timer.at > end) break
		now = Math.max(now, timer.at)
		if (timer.every) {
			timer.at = now + timer.every
			timer.seq = sequence++
		} else timers.delete(timer.id)
		timer.fn()
		await flush(1)
	}
	now = end
	await flush(4)
}
/**
 * @param {unknown} handle
 * @returns {void}
 */
function clear(handle) {
	if (handle == null) return
	timers.delete(
		typeof handle == "number"
			? handle
			: /** @type {{ id: number }} */(handle)/**/.id
	)
}
/**
 * @returns {SimTimer | undefined}
 */
function earliest() {
	/** @type {SimTimer | undefined} */
	let best
	for (const timer of timers.values()) {
		if (!best || timer.at < best.at || timer.at == best.at && timer.seq < best.seq) best = timer
	}
	return best
}
/**
 * @param {number} rounds
 * @returns {Promise<void>}
 */
export async function flush(rounds) {
	for (let round = 0; round < rounds; round++) {
		await new Promise(
			resolve => real.set_immediate(resolve)
		)
	}
}
/**
 * @returns {void}
 */
export function install() {
	const target = /** @type {Record<string, unknown>} */(/** @type {unknown} */(globalThis))/**/
	target["clearInterval"] = clear
	target["clearTimeout"] = clear
	target["setInterval"] = (
		/** @type {() => void} */ fn,
		/** @type {number=} */ ms
	) => add(fn, ms, true)
	target["setTimeout"] = (
		/** @type {() => void} */ fn,
		/** @type {number=} */ ms
	) => add(fn, ms, false)
	Date.now = () => now
}
/**
 * @returns {number}
 */
export function pending_timers() {
	return timers.size
}
/**
 * @param {number} seed
 * @returns {SimRng}
 */
export function rng(seed) {
	let state = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0 || 1
	function next() {
		state ^= state << 13
		state >>>= 0
		state ^= state >>> 17
		state ^= state << 5
		state >>>= 0
		return state / 4294967296
	}
	return {
		chance: p => next() < p,
		int: n => Math.floor(next() * n),
		next,
		pick: list => /** @type {(typeof list)[number]} */(list[Math.floor(next() * list.length)])/**/
	}
}
/**
 * @returns {number}
 */
export function time() {
	return now
}
/**
 * @returns {void}
 */
export function uninstall() {
	timers.clear()
	globalThis.clearInterval = real.clear_interval
	globalThis.clearTimeout = real.clear_timeout
	globalThis.setInterval = real.set_interval
	globalThis.setTimeout = real.set_timeout
	Date.now = real.date_now
}
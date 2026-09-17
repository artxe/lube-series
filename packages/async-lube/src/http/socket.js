/** @import { SocketLoop, SocketSetup } from "../../private.js" */
import {
	CancelError,
	NetworkError,
	SocketError,
	TimeoutError
} from "../errors.js"
import { check_options } from "../options.js"
import {
	clamp_delay,
	link_signal,
	noop,
	on_abort
} from "../signal.js"
import {
	check_reconnect,
	get_reconnect_wait
} from "./retry.js"
const first_failures = 5
const stable_delay = 5000
const reconnect_codes = new Set(
	[ 1001, 1011, 1012, 1013, 1014 ]
)
/**
 * @param {import("../../public.js").SocketOptions<unknown>} options
 * @returns {void}
 */
function check_socket_options(options) {
	check_options(
		options,
		[
			"as",
			"heartbeat",
			"limit",
			"onStatus",
			"outbox",
			"params",
			"parse",
			"protocols",
			"reconnect",
			"signal",
			"timeout"
		],
		"ws"
	)
	const { as, heartbeat, limit, outbox } = options
	if (as != null && as != "json" && as != "text") throw TypeError(
		"The as of ws() must be \"json\" or \"text\""
	)
	if (limit != null && !(limit === Infinity || Number.isInteger(limit) && limit >= 1)) throw TypeError(
		"The limit of ws() must be a positive integer or Infinity"
	)
	if (outbox != null && !(outbox === Infinity || Number.isInteger(outbox) && outbox >= 0)) throw TypeError(
		"The outbox of ws() must be a non-negative integer or Infinity"
	)
	if (heartbeat != null) {
		check_options(
			heartbeat,
			[ "interval", "message", "timeout" ],
			"ws",
			"heartbeat."
		)
		if (!(typeof heartbeat.interval == "number" && heartbeat.interval > 0)) throw TypeError(
			"The heartbeat interval of ws() must be positive milliseconds"
		)
	}
	check_reconnect(options.reconnect, "ws")
}
/**
 * @param {unknown} data
 * @returns {boolean}
 */
function is_raw_message(data) {
	return typeof data == "string"
	|| data instanceof ArrayBuffer
	|| ArrayBuffer.isView(data)
	|| typeof Blob != "undefined" && data instanceof Blob
}
/**
 * @param {unknown} error
 * @returns {boolean}
 */
function is_reconnectable(error) {
	return error instanceof NetworkError
	|| error instanceof TimeoutError
	|| error instanceof SocketError && reconnect_codes.has(error.code)
}
/**
 * @param {SocketSetup} setup
 * @returns {import("../../public.js").Socket<unknown, unknown>}
 */
export function open_socket(setup) {
	const { options, summary } = setup
	check_socket_options(options)
	const closed = new AbortController()
	const buffer_limit = options.limit ?? Infinity
	const outbox_limit = options.outbox ?? Infinity
	const reconnect = options.reconnect ?? true
	const reconnect_count = typeof reconnect == "object" ? reconnect.count : void 0
	/** @type {Set<SocketLoop>} */
	const loops = new Set()
	/** @type {unknown[]} */
	let outbox = []
	/** @type {import("../../public.js").WebSocketLike | undefined} */
	let current
	let ever_opened = false
	let failures = 0
	let generation = 0
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let heartbeat_timer
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let silence_timer
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let stable_timer
	/** @type {(() => void) | undefined} */
	let stop_waiting
	/** @type {import("../../public.js").ConnectionStatus} */
	let status = "idle"
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	const unlink = link_signal(closed, options.signal ?? void 0)
	/**
	 * @param {number} id
	 * @returns {Promise<void>}
	 */
	async function connect(id) {
		const timeout = setup.timeout
		if (timeout) {
			timer = setTimeout(
				() => lose(
					id,
					new TimeoutError(timeout, summary)
				),
				clamp_delay(timeout)
			)
		}
		try {
			const { redacted, url } = await setup.url()
			if (id != generation) return
			summary.url = redacted
			const socket = setup.create(url, options.protocols)
			current = socket
			socket.binaryType = "arraybuffer"
			socket.onerror = noop
			socket.onopen = () => {
				if (id == generation) open(id)
			}
			socket.onmessage = (
				/** @type {MessageEvent} */ event
			) => {
				if (id == generation) receive(event.data)
			}
			socket.onclose = (
				/** @type {CloseEvent} */ event
			) => {
				if (id != generation) return
				detach()
				if (event.code == 1000) finish(void 0)
				else lose(
					generation,
					event.code == 1005 || event.code == 1006
						? new NetworkError(
							new SocketError(event.code, event.reason, summary),
							summary
						)
						: new SocketError(event.code, event.reason, summary)
				)
			}
		} catch (error) {
			lose(id, error)
		}
	}
	/**
	 * @returns {void}
	 */
	function detach() {
		generation++
		stop_waiting?.()
		clearTimeout(timer)
		clearTimeout(stable_timer)
		clearInterval(heartbeat_timer)
		clearTimeout(silence_timer)
		silence_timer = void 0
		const socket = current
		current = void 0
		if (!socket) return
		try {
			socket.close(1000)
		} catch {}
	}
	/**
	 * @param {unknown} error
	 * @param {boolean=} failed
	 * @returns {void}
	 */
	function finish(error, failed = false) {
		detach()
		failures = 0
		outbox = []
		set_status(
			closed.signal.aborted ? "closed" : "idle"
		)
		for (const loop of loops) {
			loop.ended = true
			loop.error = failed ? { value: error } : void 0
			loop.wake?.()
		}
		loops.clear()
		if (failed) setup.report(error)
	}
	/**
	 * @param {number} id
	 * @param {unknown} error
	 * @returns {void}
	 */
	function lose(id, error) {
		if (id != generation) return
		detach()
		if (!reconnect || !is_reconnectable(error) || ++failures > (reconnect_count ?? (ever_opened ? Infinity : first_failures))) {
			finish(error, true)
			return
		}
		const delay = get_reconnect_wait(reconnect, failures, error)
		if (delay == null) {
			finish(error, true)
			return
		}
		setup.report(error)
		set_status("connecting")
		const next = generation
		function retry() {
			stop_waiting?.()
			if (next == generation) connect(next)
		}
		timer = setTimeout(retry, clamp_delay(delay))
		if (typeof globalThis.addEventListener == "function") {
			globalThis.addEventListener("online", retry)
			stop_waiting = () => {
				stop_waiting = void 0
				clearTimeout(timer)
				globalThis.removeEventListener("online", retry)
			}
		}
	}
	/**
	 * @param {number} id
	 * @returns {void}
	 */
	function open(id) {
		ever_opened = true
		clearTimeout(timer)
		stable_timer = setTimeout(
			() => {
				failures = 0
			},
			stable_delay
		)
		set_status("open")
		const pending = outbox
		outbox = []
		for (const data of pending) write(data)
		const heartbeat = options.heartbeat
		if (!heartbeat) return
		const ping = serialize(heartbeat.message)
		heartbeat_timer = setInterval(
			() => {
				write(ping)
				const timeout = heartbeat.timeout
				if (timeout && !silence_timer) {
					silence_timer = setTimeout(
						() => lose(
							id,
							new TimeoutError(timeout, summary)
						),
						clamp_delay(timeout)
					)
				}
			},
			clamp_delay(heartbeat.interval)
		)
	}
	/**
	 * @param {unknown} data
	 * @returns {void}
	 */
	function receive(data) {
		clearTimeout(silence_timer)
		silence_timer = void 0
		/** @type {unknown} */
		let message = data
		try {
			if (typeof data == "string" && options.as != "text") {
				try {
					message = JSON.parse(data)
				} catch {}
			}
			if (options.parse) message = options.parse(message)
		} catch (error) {
			finish(error, true)
			return
		}
		if (message instanceof Promise) {
			const id = generation
			message.then(
				noop,
				(/** @type {unknown} */ error) => {
					if (id == generation) finish(error, true)
					else setup.report(error)
				}
			)
		}
		for (const loop of loops) {
			loop.buffer.push(message)
			if (loop.buffer.length - loop.head > buffer_limit) {
				loop.buffer[loop.head++] = void 0
				if (loop.head * 2 > loop.buffer.length) {
					loop.buffer = loop.buffer.slice(loop.head)
					loop.head = 0
				}
			}
			loop.wake?.()
		}
	}
	/**
	 * @param {import("../../public.js").ConnectionStatus} next
	 * @returns {void}
	 */
	function set_status(next) {
		if (status == next) return
		status = next
		try {
			options.onStatus?.(next)
		} catch {}
	}
	/**
	 * @returns {void}
	 */
	function start() {
		if (status != "idle") return
		set_status("connecting")
		connect(++generation)
	}
	/**
	 * @param {unknown} payload
	 * @returns {void}
	 */
	function write(payload) {
		current?.send(
			/** @type {never} */(payload)/**/
		)
	}
	if (closed.signal.aborted) status = "closed"
	else {
		on_abort(
			closed.signal,
			() => {
				unlink()
				finish(void 0)
			}
		)
	}
	return {
		/**
		 * @returns {AsyncIterableIterator<unknown>}
		 */
		[Symbol.asyncIterator]() {
			/** @type {SocketLoop} */
			const loop = {
				buffer: [],
				ended: closed.signal.aborted,
				error: void 0,
				head: 0,
				wake: void 0
			}
			let finished = false
			let started = false
			/** @returns {IteratorResult<unknown>} */
			function stop() {
				if (!finished) {
					finished = true
					loops.delete(loop)
					loop.wake?.()
				}
				return { done: true, value: void 0 }
			}
			return {
				[Symbol.asyncIterator]() {
					return this
				},
				async next() {
					if (!started) {
						started = true
						if (!loop.ended) {
							loops.add(loop)
							start()
						}
					}
					for (;;) {
						if (finished) return { done: true, value: void 0 }
						if (loop.head < loop.buffer.length) {
							const message = loop.buffer[loop.head]
							loop.buffer[loop.head++] = void 0
							if (loop.head == loop.buffer.length) {
								loop.buffer = []
								loop.head = 0
							} else if (loop.head > 1024 && loop.head * 2 > loop.buffer.length) {
								loop.buffer = loop.buffer.slice(loop.head)
								loop.head = 0
							}
							if (!(message instanceof Promise)) return { done: false, value: message }
							/** @type {unknown} */
							let value
							try {
								value = await message
							} catch (error) {
								if (finished) return { done: true, value: void 0 }
								stop()
								throw error
							}
							if (finished) return { done: true, value: void 0 }
							return { done: false, value }
						}
						if (loop.error) {
							const { value } = loop.error
							stop()
							throw value
						}
						if (loop.ended) return stop()
						await new Promise(
							resolve => {
								loop.wake = () => resolve(void 0)
							}
						)
						loop.wake = void 0
					}
				},
				async return() {
					return stop()
				}
			}
		},
		/**
		 * @param {unknown} reason
		 * @returns {void}
		 */
		cancel: reason => closed.abort(
			new CancelError(reason ?? "Cancelled", summary)
		),
		/**
		 * @param {unknown} data
		 * @returns {boolean}
		 */
		send: data => {
			if (closed.signal.aborted) throw closed.signal.reason instanceof CancelError
				? closed.signal.reason
				: new CancelError(closed.signal.reason, summary)
			const payload = serialize(data)
			if (status == "open" && current?.readyState == 1) {
				write(payload)
				return true
			}
			if (outbox_limit > 0) {
				if (outbox.length >= outbox_limit) outbox.shift()
				outbox.push(payload)
			}
			start()
			return false
		},
		get status() {
			return status
		}
	}
}
/**
 * @param {unknown} data
 * @returns {unknown}
 */
function serialize(data) {
	return is_raw_message(data) ? data : JSON.stringify(data)
}
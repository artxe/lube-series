/** @import { NodeWorker, OffloadReply, OffloadTransport } from "../private.js" */
import { CancelError } from "./errors.js"
import { check_options } from "./options.js"
import { noop } from "./signal.js"
/**
 * @template Q, R, D, B
 * @param {string | URL} target
 * @param {import("../public.js").OffloadModuleOptions<D, B>=} options
 * @returns {import("../public.js").OffloadModule<Q, R>}
 */
export function offload_module(target, options = {}) {
	const url = typeof target == "string" ? new URL(target) : target
	check_options(
		options,
		[ "data", "delay", "onBatch" ],
		"offload"
	)
	const { data, delay = 0, onBatch } = options
	if (typeof delay != "number" || !(Number.isFinite(delay) && delay >= 0)) {
		throw TypeError(
			"The delay of offload() must be a non-negative number of milliseconds"
		)
	}
	if (onBatch !== void 0 && typeof onBatch != "function") {
		throw TypeError(
			"The onBatch of offload() must be a function"
		)
	}
	/** @type {Map<number, { reject: (error: unknown) => void, resolve: (value: R) => void }>} */
	const pending = new Map()
	/** @type {[number, Q][]} */
	let outbox = []
	/** @type {OffloadTransport} */
	let transport = {
		post: noop,
		ref: noop,
		stop: () => Promise.resolve()
	}
	/** @type {{ error: unknown } | undefined} */
	let failure
	/** @type {Promise<void> | undefined} */
	let closing
	/** @type {((outcome: { error: unknown } | undefined) => void) | undefined} */
	let finish_closing
	let chain = Promise.resolve()
	let count = 0
	let closed = false
	let flushing = false
	let is_ready = false
	let resolve_ready = noop
	/** @type {(error: unknown) => void} */
	let reject_ready = noop
	const ready = new Promise(
		(resolve, reject) => {
			resolve_ready = () => resolve(void 0)
			reject_ready = reject
		}
	)
	ready.catch(noop)
	try {
		transport = open_thread(
			url,
			data,
			delay,
			receive,
			error => fail(to_error(error))
		)
	} catch (error) {
		fail(error)
	}
	update_ref()
	return {
		call,
		close: () => closing ??= shutdown(),
		ready: /** @type {Promise<void>} */(ready)/**/
	}
	/**
	 * @param {OffloadReply[]} entries
	 * @returns {void}
	 */
	function apply(entries) {
		for (const [ id, ok, value ] of entries) {
			settle(
				id,
				ok,
				ok ? value : to_error(value)
			)
		}
	}
	/**
	 * @param {Q} request
	 * @returns {Promise<R>}
	 */
	function call(request) {
		if (failure) {
			return Promise.reject(failure.error)
		}
		if (closed) {
			return Promise.reject(
				new CancelError("The offload was closed")
			)
		}
		return new Promise(
			(resolve, reject) => {
				const id = ++count
				pending.set(id, { reject, resolve })
				outbox.push([ id, request ])
				update_ref()
				if (!flushing) {
					flushing = true
					queueMicrotask(flush)
				}
			}
		)
	}
	/**
	 * @param {unknown} error
	 * @returns {void}
	 */
	function fail(error) {
		if (failure) {
			return
		}
		failure = { error }
		reject_ready(error)
		const jobs = [ ...pending.values() ]
		pending.clear()
		outbox = []
		for (const job of jobs) {
			job.reject(error)
		}
		void transport.stop()
		update_ref()
		finish_closing?.({ error })
	}
	/** @returns {void} */
	function flush() {
		flushing = false
		if (!is_ready || failure || !outbox.length) {
			return
		}
		const calls = outbox
		outbox = []
		try {
			transport.post([ "calls", calls ])
		} catch {
			for (const entry of calls) {
				try {
					transport.post([ "calls", [ entry ] ])
				} catch (error) {
					settle(entry[0], false, error)
				}
			}
		}
	}
	/**
	 * @param {unknown[]} message
	 * @returns {void}
	 */
	function receive(message) {
		const [ kind, first, second ] = message
		if (kind == "ready") {
			is_ready = true
			resolve_ready()
			update_ref()
			flush()
		} else if (kind == "failed") {
			fail(to_error(first))
		} else if (kind == "replies") {
			replied(
				/** @type {OffloadReply[]} */(first)/**/,
				second
			)
		} else if (kind == "closed") {
			finish_closing?.(
				first ? { error: to_error(second) } : void 0
			)
		}
	}
	/**
	 * @param {OffloadReply[]} entries
	 * @param {unknown} value
	 * @returns {void}
	 */
	function replied(entries, value) {
		if (!onBatch) {
			apply(entries)
			return
		}
		chain = chain.then(
			async () => {
				if (value !== void 0) {
					try {
						await onBatch(/** @type {B} */(value)/**/)
					} catch (error) {
						for (const [ id ] of entries) {
							settle(id, false, error)
						}
						return
					}
				}
				apply(entries)
			}
		)
	}
	/**
	 * @param {number} id
	 * @param {boolean} ok
	 * @param {unknown} value
	 * @returns {void}
	 */
	function settle(id, ok, value) {
		const job = pending.get(id)
		if (!job) {
			return
		}
		pending.delete(id)
		update_ref()
		if (ok) {
			job.resolve(/** @type {R} */(value)/**/)
		} else {
			job.reject(value)
		}
	}
	/** @returns {Promise<void>} */
	async function shutdown() {
		closed = true
		update_ref()
		await ready.catch(noop)
		/** @type {{ error: unknown } | undefined} */
		let outcome
		if (!failure) {
			flush()
			outcome = await new Promise(
				resolve => {
					finish_closing = resolve
					try {
						transport.post([ "close" ])
					} catch (error) {
						resolve({ error })
					}
				}
			)
		}
		await chain
		await transport.stop()
		if (outcome) {
			throw outcome.error
		}
	}
	/** @returns {void} */
	function update_ref() {
		transport.ref(
			pending.size > 0 || closed || !is_ready && !failure
		)
	}
}
/**
 * @param {URL} url
 * @param {unknown} data
 * @param {number} delay
 * @param {(message: unknown[]) => void} on_message
 * @param {(error: unknown) => void} on_failure
 * @returns {OffloadTransport}
 */
function open_thread(
	url,
	data,
	delay,
	on_message,
	on_failure
) {
	const threads = /** @type {{ process?: { getBuiltinModule?: (name: string) => unknown } }} */(globalThis)/**/.process?.getBuiltinModule?.("node:worker_threads")
	const rest = `() => import(${JSON.stringify(url.href)}), ${delay}`
	if (threads) {
		const { Worker } = /** @type {{ Worker: new (code: string, options: { eval: true, workerData: unknown }) => NodeWorker }} */(threads)/**/
		const thread = new Worker(
			`const { parentPort, workerData } = process.getBuiltinModule("node:worker_threads");\n(${worker_main})(message => parentPort.postMessage(message), listener => parentPort.on("message", listener), fn => setImmediate(fn), ${rest}, workerData)`,
			{ eval: true, workerData: data }
		)
		let stopped = false
		thread.on("message", on_message)
		thread.on("error", on_failure)
		thread.on(
			"exit",
			code => {
				if (!stopped) {
					on_failure(
						Error(
							`The worker of offload() exited with code ${code}`
						)
					)
				}
			}
		)
		thread.unref()
		return {
			post: message => thread.postMessage(message),
			ref: on => on ? thread.ref() : thread.unref(),
			stop: () => {
				stopped = true
				return thread.terminate().then(noop)
			}
		}
	}
	if (typeof Worker == "function") {
		const source = URL.createObjectURL(
			new Blob(
				[
					`self.onmessage = ({ data: [ , data ] }) => (${worker_main})(message => self.postMessage(message), listener => { self.onmessage = ({ data }) => listener(data) }, fn => setTimeout(fn, 0), ${rest}, data)`
				],
				{ type: "text/javascript" }
			)
		)
		const thread = new Worker(source, { type: "module" })
		thread.onmessage = event => on_message(event.data)
		thread.onerror = event => {
			event.preventDefault()
			on_failure(
				event.error ?? Error(event.message)
			)
		}
		try {
			thread.postMessage([ "init", data ])
		} catch (error) {
			thread.terminate()
			URL.revokeObjectURL(source)
			throw error
		}
		return {
			post: message => thread.postMessage(message),
			ref: noop,
			stop: () => {
				thread.terminate()
				URL.revokeObjectURL(source)
				return Promise.resolve()
			}
		}
	}
	throw TypeError(
		"offload() needs Worker, or worker_threads of Node.js 20.16 or later"
	)
}
/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function to_error(value) {
	if (value instanceof Error || value == null || typeof value != "object" || !("message" in value)) {
		return value
	}
	const error = Error(String(value.message))
	error.name = String(
		/** @type {{ name?: unknown }} */(value)/**/.name ?? "Error"
	)
	return error
}
/**
 * @param {(message: unknown[]) => void} post
 * @param {(listener: (message: unknown[]) => void) => void} listen
 * @param {(fn: () => void) => void} defer
 * @param {() => Promise<{ default?: unknown }>} import_module
 * @param {number} delay
 * @param {unknown} data
 * @returns {void}
 */
function worker_main(
	post,
	listen,
	defer,
	import_module,
	delay,
	data
) {
	/** @type {import("../public.js").OffloadHandlers<unknown, unknown>} */
	let handlers = { call: () => void 0 }
	/** @type {[number, unknown][]} */
	const queue = []
	let waiting = false
	let running = false
	let closing = false
	listen(
		message => {
			if (message[0] == "close") {
				closing = true
				settle()
			} else {
				queue.push(
					.../** @type {[number, unknown][]} */(message[1])/**/
				)
				wait()
			}
		}
	)
	load().then(
		() => post([ "ready" ]),
		error => send("failed", error)
	)
	/**
	 * @param {[number, unknown][]} batch
	 * @returns {Promise<void>}
	 */
	async function execute(batch) {
		/** @type {Promise<OffloadReply>[]} */
		const outcomes = []
		/** @type {Promise<void> | undefined} */
		let started
		let failed = false
		/** @type {unknown} */
		let failure
		/** @type {unknown} */
		let value
		try {
			value = handlers.batch ? await handlers.batch(run) : await run()
		} catch (error) {
			failed = true
			failure = error
		}
		if (started) {
			await started
		} else if (!failed) {
			failed = true
			failure = Error(
				"The batch function of offload() did not call run()"
			)
		}
		/** @type {OffloadReply[]} */
		const entries = failed
			? batch.map(
				([ id ]) => [ id, false, failure ]
			)
			: await Promise.all(outcomes)
		reply(entries, failed ? void 0 : value)
		/**
		 * @param {number} id
		 * @param {unknown} request
		 * @returns {Promise<OffloadReply>}
		 */
		function invoke(id, request) {
			try {
				return Promise.resolve(handlers.call(request)).then(
					result => [ id, true, result ],
					error => [ id, false, error ]
				)
			} catch (error) {
				return Promise.resolve([ id, false, error ])
			}
		}
		/** @returns {Promise<void>} */
		function run() {
			started ??= start()
			return started
		}
		/** @returns {Promise<void>} */
		function start() {
			for (const [ id, request ] of batch) {
				outcomes.push(invoke(id, request))
			}
			return Promise.all(outcomes).then(() => void 0)
		}
	}
	/** @returns {Promise<void>} */
	async function finish() {
		try {
			await handlers.close?.()
		} catch (error) {
			try {
				post([ "closed", true, error ])
			} catch {
				post(
					[ "closed", true, plain(error) ]
				)
			}
			return
		}
		post([ "closed", false ])
	}
	/** @returns {void} */
	function fire() {
		waiting = false
		running = true
		execute(queue.splice(0)).then(
			() => {
				running = false
				settle()
			}
		)
	}
	/** @returns {Promise<void>} */
	async function load() {
		const setup = (await import_module()).default
		if (typeof setup != "function") {
			throw TypeError(
				"The module of offload() must export a setup function by default"
			)
		}
		handlers = await setup(data)
		if (typeof handlers?.call != "function") {
			throw TypeError(
				"The setup function of the module of offload() must return an object with a call function"
			)
		}
	}
	/**
	 * @param {unknown} error
	 * @returns {{ message: string, name: string }}
	 */
	function plain(error) {
		/** @type {{ message?: unknown, name?: unknown }} */
		const { message, name } = Object(error)
		return {
			message: String(message ?? error),
			name: String(name ?? "Error")
		}
	}
	/**
	 * @param {OffloadReply[]} entries
	 * @param {unknown} value
	 * @returns {void}
	 */
	function reply(entries, value) {
		try {
			post([ "replies", entries, value ])
		} catch {
			let shipped = value
			try {
				structuredClone(value)
			} catch (clone_error) {
				shipped = void 0
				entries = entries.map(
					([ id ]) => [ id, false, plain(clone_error) ]
				)
			}
			post(
				[
					"replies",
					entries.map(
						entry => {
							try {
								structuredClone(entry)
								return entry
							} catch (clone_error) {
								return [
									entry[0],
									false,
									plain(
										entry[1] ? clone_error : entry[2]
									)
								]
							}
						}
					),
					shipped
				]
			)
		}
	}
	/**
	 * @param {string} kind
	 * @param {unknown} error
	 * @returns {void}
	 */
	function send(kind, error) {
		try {
			post([ kind, error ])
		} catch {
			post([ kind, plain(error) ])
		}
	}
	/** @returns {void} */
	function settle() {
		if (running || waiting) {
			return
		}
		if (queue.length) {
			wait()
		} else if (closing) {
			closing = false
			finish()
		}
	}
	/** @returns {void} */
	function wait() {
		if (waiting || running || !queue.length) {
			return
		}
		waiting = true
		if (delay > 0) {
			setTimeout(fire, delay)
		} else {
			defer(fire)
		}
	}
}
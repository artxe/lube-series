/** @import { NodeWorker, OffloadJob, OffloadWorker } from "../private.js" */
import { CancelError } from "./errors.js"
import { offload_module, to_error } from "./offload_module.js"
import { check_options } from "./options.js"
import { noop, on_abort } from "./signal.js"
/**
 * @param {unknown} target
 * @param {unknown=} options
 * @returns {never}
 */
function create_offload(target, options) {
	if (typeof target == "function") {
		return /** @type {never} */(offload_function(
			/** @type {(...args: never[]) => unknown} */(target)/**/,
			/** @type {{ concurrency?: number | undefined } | undefined} */(options)/**/
		))/**/
	}
	if (typeof target == "string" || target instanceof URL) {
		return /** @type {never} */(offload_module(
			target,
			/** @type {import("../public.js").OffloadModuleOptions | undefined} */(options)/**/
		))/**/
	}
	throw TypeError(
		"offload() needs a function, or the URL of a worker module"
	)
}
/** @type {import("../public.js").OffloadFunction} */
export const offload = create_offload
/**
 * @template {unknown[]} A
 * @template R
 * @param {(...args: A) => R} fn
 * @param {{ concurrency?: number | undefined }=} options
 * @returns {import("../public.js").Offloaded<A, R>}
 */
function offload_function(fn, options = {}) {
	if (typeof fn != "function") {
		throw TypeError("offload() needs a function")
	}
	check_options(
		options,
		[ "concurrency" ],
		"offload"
	)
	const concurrency = options.concurrency ?? 1
	if (!(concurrency === Infinity || Number.isInteger(concurrency) && concurrency >= 1)) {
		throw TypeError(
			"The concurrency of offload() must be a positive integer or Infinity"
		)
	}
	const source = String(fn)
	/** @type {OffloadJob[]} */
	const queue = []
	/** @type {Set<OffloadWorker>} */
	const workers = new Set()
	/** @type {string | undefined} */
	let url
	let count = 0
	const run = /** @type {import("../public.js").Offloaded<never[], unknown>} */(/** @type {unknown} */(call))/**/
	run.close = () => {
		for (const job of queue.splice(0)) {
			job.reject(
				new CancelError("The offload was closed")
			)
		}
		for (const worker of workers) {
			worker.job?.reject(
				new CancelError("The offload was closed")
			)
			worker.stop()
		}
		workers.clear()
		if (url) {
			URL.revokeObjectURL(url)
		}
		url = void 0
	}
	return /** @type {import("../public.js").Offloaded<A, R>} */(/** @type {unknown} */(run))/**/
	/**
	 * @param {...unknown} args
	 * @returns {import("../public.js").OffloadCall<unknown>}
	 */
	function call(...args) {
		const last = args.at(-1)
		const signal = last instanceof AbortSignal ? last : void 0
		if (signal) {
			args.pop()
		}
		let unlink = noop
		/** @type {OffloadJob} */
		const job = {
			args,
			id: ++count,
			reject: noop,
			resolve: noop
		}
		const promise = new Promise(
			(resolve, reject) => {
				job.resolve = value => {
					unlink()
					resolve(value)
				}
				job.reject = error => {
					unlink()
					reject(error)
				}
			}
		)
		if (signal?.aborted) {
			job.reject(new CancelError(signal.reason))
		} else {
			if (signal) {
				unlink = on_abort(
					signal,
					() => cancel_job(job, signal.reason)
				)
			}
			queue.push(job)
			dispatch()
		}
		return Object.assign(
			promise,
			{
				/** @param {unknown=} reason */
				cancel: reason => cancel_job(job, reason ?? "Cancelled")
			}
		)
	}
	/**
	 * @param {OffloadJob} job
	 * @param {unknown} reason
	 * @returns {void}
	 */
	function cancel_job(job, reason) {
		const index = queue.indexOf(job)
		if (index >= 0) {
			queue.splice(index, 1)
		}
		for (const worker of workers) {
			if (worker.job != job) {
				continue
			}
			worker.job = void 0
			worker.stop()
			workers.delete(worker)
		}
		job.reject(
			reason instanceof CancelError ? reason : new CancelError(reason)
		)
		dispatch()
	}
	/** @returns {void} */
	function dispatch() {
		while (queue.length) {
			let worker = [ ...workers ].find(item => !item.job)
			if (!worker) {
				if (workers.size >= concurrency) {
					return
				}
				try {
					worker = spawn()
				} catch (error) {
					for (const job of queue.splice(0)) {
						job.reject(error)
					}
					return
				}
			}
			const job = /** @type {OffloadJob} */(queue.shift())/**/
			worker.job = job
			try {
				worker.send([ job.id, job.args ])
			} catch (error) {
				worker.job = void 0
				job.reject(error)
				worker.idle?.()
			}
		}
	}
	/**
	 * @param {OffloadWorker} worker
	 * @returns {void}
	 */
	function finish(worker) {
		worker.idle?.()
		dispatch()
	}
	/** @returns {OffloadWorker} */
	function spawn() {
		const threads = /** @type {{ process?: { getBuiltinModule?: (name: string) => unknown } }} */(globalThis)/**/.process?.getBuiltinModule?.("node:worker_threads")
		/** @type {OffloadWorker} */
		const worker = {
			job: void 0,
			send: noop,
			stop: noop
		}
		if (threads) {
			const { Worker } = /** @type {{ Worker: new (code: string, options: { eval: true }) => NodeWorker }} */(threads)/**/
			const thread = new Worker(
				`const { parentPort } = process.getBuiltinModule("node:worker_threads")\nconst fn = (${source})\nparentPort.on("message", ${reply("parentPort.postMessage")})`,
				{ eval: true }
			)
			thread.on("message", receive)
			thread.on("error", crash)
			thread.unref()
			worker.send = message => {
				thread.ref()
				thread.postMessage(message)
			}
			worker.stop = () => void thread.terminate()
			worker.idle = () => thread.unref()
		} else if (typeof Worker == "function") {
			url ??= URL.createObjectURL(
				new Blob(
					[
						`const fn = (${source})\nself.onmessage = ({ data }) => (${reply("self.postMessage")})(data)`
					],
					{ type: "text/javascript" }
				)
			)
			const thread = new Worker(url)
			thread.onmessage = event => receive(event.data)
			thread.onerror = event => {
				event.preventDefault()
				crash(
					event.error ?? Error(event.message)
				)
			}
			worker.send = message => thread.postMessage(message)
			worker.stop = () => thread.terminate()
		} else {
			throw TypeError(
				"offload() needs Worker, or worker_threads of Node.js 20.16 or later"
			)
		}
		workers.add(worker)
		return worker
		/**
		 * @param {unknown} error
		 * @returns {void}
		 */
		function crash(error) {
			const { job } = worker
			worker.job = void 0
			worker.stop()
			workers.delete(worker)
			job?.reject(to_error(error))
			dispatch()
		}
		/**
		 * @param {[number, boolean, unknown]} message
		 * @returns {void}
		 */
		function receive([ id, ok, value ]) {
			const { job } = worker
			if (!job || job.id != id) {
				return
			}
			worker.job = void 0
			if (ok) {
				job.resolve(value)
			} else {
				job.reject(to_error(value))
			}
			finish(worker)
		}
	}
}
/**
 * @param {string} post
 * @returns {string}
 */
function reply(post) {
	return `async ([ id, args ]) => {
	try {
		${post}([ id, true, await fn(...args) ])
	} catch (error) {
		try {
			${post}([ id, false, error ])
		} catch {
			${post}([ id, false, { message: String(error?.message ?? error), name: String(error?.name ?? "Error") } ])
		}
	}
}`
}
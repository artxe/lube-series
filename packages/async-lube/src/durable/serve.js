/** @import { DurableWorker } from "../../private.js" */
/** @import { ServeOptions } from "../../public.js" */
import { check_options } from "../options.js"
import { link_signal, noop, sleep } from "../signal.js"
import { check_halted } from "./lease.js"
import { resume } from "./run.js"
/**
 * @param {DurableWorker} d
 * @param {ServeOptions=} serve_options
 * @returns {Promise<void>}
 */
export async function serve(d, serve_options = {}) {
	check_options(
		serve_options,
		[
			"batch",
			"interval",
			"onError",
			"signal"
		],
		"serve"
	)
	const {
		batch = 100,
		interval = 1000,
		onError = noop
	} = serve_options
	if (!(Number.isInteger(batch) && batch > 0)) throw TypeError(
		"The batch of serve() must be a positive integer"
	)
	if (!(Number.isFinite(interval) && interval > 0)) throw TypeError(
		"The interval of serve() must be a positive number of milliseconds"
	)
	if (typeof onError != "function") throw TypeError(
		"The onError of serve() must be a function"
	)
	check_halted(d)
	const controller = new AbortController()
	const unlink = link_signal(controller, serve_options.signal)
	/**
	 * @param {unknown} error
	 * @param {string=} key
	 * @returns {void}
	 */
	function reporter(error, key) {
		onError(error, key)
	}
	/**
	 * @returns {void}
	 */
	function stop() {
		controller.abort()
	}
	d.reporters.add(reporter)
	d.stoppers.add(stop)
	try {
		while (!controller.signal.aborted) {
			try {
				for (const key of await d.store.due(Date.now(), batch)) void resume(d, key).catch(error => reporter(error, key))
			} catch (error) {
				reporter(error)
			}
			await sleep(interval, controller.signal).catch(noop)
		}
	} finally {
		d.reporters.delete(reporter)
		d.stoppers.delete(stop)
		unlink()
	}
}
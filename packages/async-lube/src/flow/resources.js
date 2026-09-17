/** @import { RawNodeOptions, NodeRecord, RunContext } from "../../private.js" */
import { CancelError } from "../errors.js"
import { noop } from "../signal.js"
import { clear_record, get_record } from "./nodes.js"
/**
 * @param {NodeRecord} record
 * @param {unknown} value
 * @returns {void}
 */
export function discard(record, value) {
	const dispose = record.node.options.release
	if (!dispose || record.node.each) return
	void Promise.resolve()
		.then(
			() => dispose(
				value,
				new CancelError(
					`The result of flow node "${record.node.name}" arrived after it stopped`
				)
			)
		)
		.catch(noop)
}
/**
 * @param {RunContext} c
 * @param {unknown} error
 * @returns {void}
 */
export function release_all(c, error) {
	for (const record of c.records.values()) {
		if (!record.node.options.release || record.status != "done" || record.released) continue
		release_quietly(record, error)
		record.released = { error }
	}
}
/**
 * @param {NodeRecord} record
 * @param {unknown} error
 * @returns {void}
 */
export function release_quietly(record, error) {
	const dispose = /** @type {NonNullable<RawNodeOptions["release"]>} */(record.node.options.release)/**/
	void Promise.resolve(record.result)
		.then(value => dispose(value, error))
		.catch(noop)
}
/**
 * @param {RunContext} c
 * @param {string} name
 * @param {unknown} error
 * @returns {void}
 */
export function release_unused(c, name, error) {
	const record = get_record(c, name)
	if (!record.node.options.release || record.status != "done" || record.released || record.node.dependents.some(
		dependent => get_record(c, dependent).status != "skipped"
	)) return
	record.released = { error: void 0 }
	release_quietly(
		record,
		error === void 0
			? new CancelError(
				`The dependents of flow node "${name}" lost the race`
			)
			: error
	)
	clear_record(c, record)
	record.released = void 0
}
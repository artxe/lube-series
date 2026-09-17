/** @import { FlowBuilder, NodeRef } from "../../private.js" */
import { create_builder } from "./builder.js"
import { each } from "./items.js"
import { input, is_count, to_arriving } from "./refs.js"
export default /** @type {import("../../public.js").FlowFunction} */(/** @type {unknown} */(Object.assign(
	/**
	 * @param {{ concurrency?: number, maxSteps?: number }=} options
	 * @returns {FlowBuilder}
	 */
	function(options = {}) {
		for (const key of Object.keys(options)) {
			if (key != "concurrency" && key != "maxSteps") throw TypeError(`Unknown flow option "${key}"`)
		}
		if (options.concurrency != null && !is_count(options.concurrency)) throw TypeError(
			"The concurrency of a flow must be a positive integer or Infinity"
		)
		if (options.maxSteps != null && !is_count(options.maxSteps)) throw TypeError(
			"The maxSteps of a flow must be a positive integer or Infinity"
		)
		return create_builder(
			{
				count: 0,
				edges: [],
				list: [],
				names: new Map(),
				options,
				refs: new Map()
			}
		)
	},
	{
		each,
		input,
		/**
		 * @param {NodeRef} dependency
		 * @returns {NodeRef}
		 */
		keep: dependency => to_arriving(dependency, "keep"),
		/**
		 * @param {NodeRef} dependency
		 * @returns {NodeRef}
		 */
		queue: dependency => to_arriving(dependency, "queue"),
		/**
		 * @param {NodeRef} dependency
		 * @returns {NodeRef}
		 */
		restart: dependency => to_arriving(dependency, "restart")
	}
)))/**/
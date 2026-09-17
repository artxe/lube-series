/** @import { ClientContext, SharedState } from "../../private.js" */
import {
	merge_headers,
	merge_hooks,
	omit_keys
} from "./config.js"
import { report, request, scheme_regex } from "./request.js"
import { open_socket } from "./socket.js"
import { sse } from "./sse.js"
import { build_url } from "./url.js"
const config_keys = new Set(
	[
		"WebSocket",
		"base",
		"fetch",
		"headers",
		"ok",
		"on",
		"query",
		"refresh",
		"retry",
		"timeout"
	]
)
let client_count = 0
/**
 * @param {string} url
 * @returns {string}
 */
function to_socket_url(url) {
	if (scheme_regex.test(url)) return url.replace(/^http(s?):/i, "ws$1:")
	if (typeof location == "undefined") throw TypeError(
		`The URL "${url}" is relative: set base, or use an absolute URL`
	)
	return new URL(url, location.href).href.replace(/^http(s?):/i, "ws$1:")
}
/**
 * @param {import("../../public.js").HttpConfig=} config
 * @param {SharedState=} shared
 * @returns {import("../../public.js").Http}
 */
function http(
	config = {},
	shared = {
		latest: new Map(),
		shared: new Map(),
		throttles: new Map()
	}
) {
	const c = /** @type {ClientContext} */(/** @type {unknown} */({}))/**/
	c.config = config
	c.shared = shared
	const base_init = omit_keys(config, config_keys)
	c.base_init = base_init
	const client_id = ++client_count
	c.client_id = client_id
	/** @type {import("../../public.js").Http} */
	const api = {
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		delete: (path, params, options = {}) => request(
			c,
			"DELETE",
			path,
			{ ...options.params, ...params },
			options.body,
			options,
			false
		),
		/**
		 * @param {import("../../public.js").ExtendConfig} next
		 */
		extend: next => {
			/** @type {Record<string, unknown>} */
			const merged = { ...config }
			for (const [ key, value ] of Object.entries(next)) {
				if (value === null) delete merged[key]
				else if (value !== void 0) merged[key] = value
			}
			if (config.headers && next.headers) {
				merged["headers"] = async () => {
					const headers = new Headers()
					await merge_headers(config.headers, headers)
					await merge_headers(
						/** @type {import("../../public.js").HeadersSource} */(next.headers)/**/,
						headers
					)
					return headers
				}
			}
			if (config.on && next.on) merged["on"] = merge_hooks(config.on, next.on)
			return http(merged, shared)
		},
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		get: (path, params, options = {}) => request(
			c,
			"GET",
			path,
			{ ...options.params, ...params },
			options.body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		head: (path, params, options = {}) => request(
			c,
			"HEAD",
			path,
			{ ...options.params, ...params },
			options.body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		options: (path, params, options = {}) => request(
			c,
			"OPTIONS",
			path,
			{ ...options.params, ...params },
			options.body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {unknown=} body
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		patch: (path, body, options = {}) => request(
			c,
			"PATCH",
			path,
			options.params,
			body === void 0 ? options.body : body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {unknown=} body
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		post: (path, body, options = {}) => request(
			c,
			"POST",
			path,
			options.params,
			body === void 0 ? options.body : body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {unknown=} body
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		put: (path, body, options = {}) => request(
			c,
			"PUT",
			path,
			options.params,
			body === void 0 ? options.body : body,
			options,
			false
		),
		/**
		 * @param {string} method
		 * @param {string} path
		 * @param {import("../../public.js").RequestOptions=} options
		 */
		request: (method, path, options = {}) => request(
			c,
			method.toUpperCase(),
			path,
			options.params,
			options.body,
			options,
			false
		),
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").SseOptions=} options
		 */
		sse: (path, params, options = {}) => /** @type {import("../../public.js").EventStream<never>} */(sse(c, path, params, options))/**/,
		/**
		 * @param {string} path
		 * @param {import("../../public.js").QueryParams=} params
		 * @param {import("../../public.js").SocketOptions<unknown>=} options
		 */
		ws: (path, params, options = {}) => /** @type {import("../../public.js").Socket<never, unknown>} */(open_socket(
			{
				create: (url, protocols) => {
					const Socket = config.WebSocket ?? globalThis.WebSocket
					if (!Socket) throw TypeError(
						"WebSocket is not available: pass WebSocket in the config"
					)
					return protocols == null ? new Socket(url) : new Socket(url, protocols)
				},
				options,
				report: report.bind(void 0, c),
				summary: { method: "GET", url: path },
				timeout: options.timeout ?? config.timeout,
				url: async () => {
					const extra = typeof options.params == "function" ? await options.params() : options.params
					/** @type {Record<string, string>} */
					const hidden = {}
					if (typeof options.params == "function") {
						for (const key of Object.keys(extra ?? {})) hidden[key] = "***"
					}
					return {
						redacted: to_socket_url(
							build_url(
								config.base,
								path,
								{ ...extra, ...hidden, ...params },
								config.query
							)
						),
						url: to_socket_url(
							build_url(
								config.base,
								path,
								{ ...extra, ...params },
								config.query
							)
						)
					}
				}
			}
		))/**/
	}
	return api
}
/** Creates syntax sugar for fetch requests with shared config. */
export default /** @type {import("../../public.js").HttpFunction} */(http)/**/
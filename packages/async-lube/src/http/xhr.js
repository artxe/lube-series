import { call_progress, to_progress } from "./response.js"
const header_line_regex = /\r?\n/
const null_body_statuses = new Set([ 101, 103, 204, 205, 304 ])
/**
 * @param {string} url
 * @param {RequestInit & { headers: Headers }} init
 * @param {(progress: import("../../public.js").Progress) => void} on_upload
 * @returns {Promise<Response>}
 */
export function send_with_xhr(url, init, on_upload) {
	return new Promise(
		(resolve, reject) => {
			const xhr = new XMLHttpRequest()
			const signal = init.signal
			function abort() {
				return xhr.abort()
			}
			/**
			 * @param {() => void} settle
			 * @returns {() => void}
			 */
			function finish(settle) {
				return () => {
					signal?.removeEventListener("abort", abort)
					try {
						settle()
					} catch (error) {
						reject(error)
					}
				}
			}
			xhr.open(init.method ?? "GET", url)
			init.headers.forEach(
				(value, key) => xhr.setRequestHeader(key, value)
			)
			xhr.responseType = "blob"
			xhr.withCredentials = init.credentials == "include"
			xhr.upload.onprogress = event => call_progress(
				on_upload,
				to_progress(
					event.loaded,
					event.lengthComputable ? event.total : void 0
				)
			)
			xhr.onabort = finish(() => reject(signal?.reason))
			xhr.onerror = finish(
				() => reject(
					TypeError("Network request failed")
				)
			)
			xhr.ontimeout = xhr.onerror
			xhr.onload = finish(
				() => {
					if (!xhr.status) throw TypeError("Network request failed")
					/** @type {Headers} */
					const headers = new Headers()
					for (const line of xhr.getAllResponseHeaders().split(header_line_regex)) {
						const index = line.indexOf(":")
						if (index > 0) headers.append(
							line.slice(0, index).trim(),
							line.slice(index + 1).trim()
						)
					}
					resolve(
						new Response(
							null_body_statuses.has(xhr.status) ? null : xhr.response,
							{
								headers,
								status: xhr.status,
								statusText: xhr.statusText
							}
						)
					)
				}
			)
			if (signal?.aborted) {
				reject(signal.reason)
				return
			}
			signal?.addEventListener("abort", abort, { once: true })
			xhr.send(
				/** @type {XMLHttpRequestBodyInit | null} */(init.body ?? null)/**/
			)
		}
	)
}
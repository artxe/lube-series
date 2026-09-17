/** @import { HttpConfig, RequestOptions } from "async-lube" */
/** @import { HttpFuzzAction, HttpFuzzConfig, HttpFuzzExpect, HttpFuzzHooks, SimRng } from "./private.js" */
import { rng } from "./sim/clock.js"
import { sim_seeds } from "./sim/seeds.js"
import {
	CancelError,
	HttpError,
	NetworkError,
	TimeoutError,
	http
} from "async-lube"
import { createServer } from "node:http"
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	it
} from "vitest"
const retry_statuses = new Set(
	[ 408, 425, 429, 500, 502, 503, 504 ]
)
/**
 * @param {HttpFuzzAction} action
 * @param {HttpFuzzConfig} config
 * @returns {{ outcome: string, retry_after: string | undefined, status: number | undefined }}
 */
function classify(action, config) {
	switch (action.k) {
	case "drop":
		return {
			outcome: "network",
			retry_after: void 0,
			status: void 0
		}
	case "hang":
	case "slow-body":
		return {
			outcome: "timeout",
			retry_after: void 0,
			status: void 0
		}
	case "ok":
		return {
			outcome: action.status != 204 && config.as != "text" && (action.body == "malformed" || action.body == "text" && config.as == "json")
				? "syntax"
				: "ok",
			retry_after: void 0,
			status: void 0
		}
	case "status":
		return {
			outcome: "http",
			retry_after: action.retry_after,
			status: action.status
		}
	}
}
/**
 * @param {unknown} error
 * @returns {string}
 */
function kind_of(error) {
	if (error === void 0) return "ok"
	if (error instanceof CancelError) return "cancel"
	if (error instanceof HttpError) return "http"
	if (error instanceof NetworkError) return "network"
	if (error instanceof TimeoutError) return "timeout"
	if (error instanceof SyntaxError) return "syntax"
	return "other: " + String(error)
}
/**
 * @param {HttpFuzzAction[]} plan
 * @param {string[]} refreshes
 * @param {HttpFuzzConfig} config
 * @returns {HttpFuzzExpect}
 */
function model(plan, refreshes, config) {
	/** @type {HttpFuzzExpect} */
	const expected = {
		delays: 0,
		error_hook: 0,
		outcome: "ok",
		refreshes: 0,
		response_hook: 0,
		server: 0,
		status: void 0,
		unauthorized: 0
	}
	const retries = config.stream || config.retry_at == "none" ? 0 : config.count
	let attempt = 0
	let index = 0
	let refreshed = false
	/**
	 * @param {string} outcome
	 * @param {number | undefined} status
	 * @returns {HttpFuzzExpect}
	 */
	function fail(outcome, status) {
		expected.outcome = outcome
		expected.status = status
		expected.error_hook = 1
		return expected
	}
	for (;;) {
		attempt++
		/** @type {HttpFuzzAction} */
		const action = plan[index++] ?? {
			body: "json",
			delay: 0,
			k: "ok",
			status: 200
		}
		expected.server++
		const { outcome, retry_after, status } = classify(action, config)
		if (outcome == "ok") {
			expected.response_hook = 1
			return expected
		}
		if (outcome == "http" && status == 401 && config.refresh) {
			if (refreshed) expected.unauthorized++
			else {
				refreshed = true
				const refresh = refreshes[expected.refreshes++] ?? "ok"
				if (refresh == "fail") {
					expected.unauthorized++
					return fail("http", 401)
				}
				if (refresh == "hang") {
					expected.unauthorized++
					return fail("timeout", void 0)
				}
				if (config.stream) return fail("http", 401)
				attempt--
				continue
			}
		}
		if (attempt > retries) return fail(outcome, status)
		if (!(config.idempotent || config.retry_at == "request" || [ "DELETE", "GET", "PUT" ].includes(config.method))) return fail(outcome, status)
		const retryable = config.when
			? outcome == "network" || outcome == "http" && status == 503
			: outcome == "network" || outcome == "timeout" || outcome == "http" && retry_statuses.has(
				/** @type {number} */(status)/**/
			)
		if (!retryable) return fail(outcome, status)
		if (!config.custom_delay && retry_after != null && Number(retry_after) * 1000 > 60000) return fail(outcome, status)
		expected.delays++
	}
}
/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(
		resolve => setTimeout(resolve, ms)
	)
}
/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T | "deadline">}
 */
async function within(promise, ms) {
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	const result = await Promise.race(
		[
			promise,
			new Promise(
				resolve => {
					timer = setTimeout(() => resolve("deadline"), ms)
				}
			)
		]
	)
	clearTimeout(timer)
	return /** @type {T | "deadline"} */(result)/**/
}
describe(
	"http fuzz",
	() => {
		/** @type {Map<string, HttpFuzzAction[]>} */
		const plans = new Map()
		/** @type {Map<string, number>} */
		const counts = new Map()
		/** @type {Map<string, string[]>} */
		const refresh_plans = new Map()
		/** @type {Map<string, number>} */
		const refresh_counts = new Map()
		/** @type {Map<string, number>} */
		const refresh_active = new Map()
		/** @type {Map<string, number>} */
		const refresh_overlaps = new Map()
		/** @type {Set<import("node:http").ServerResponse>} */
		const open = new Set()
		/** @type {unknown[]} */
		const unhandled = []
		/**
		 * @param {unknown} reason
		 * @returns {void}
		 */
		function on_unhandled(reason) {
			unhandled.push(reason)
		}
		/**
		 * @param {import("node:http").ServerResponse} response
		 * @param {HttpFuzzAction} action
		 * @param {string} id
		 * @returns {void}
		 */
		function respond(response, action, id) {
			switch (action.k) {
			case "drop":
				if (action.when == "before") {
					response.socket?.destroy()
					return
				}
				response.writeHead(
					200,
					{
						"Content-Length": "100",
						"Content-Type": "application/json"
					}
				)
				response.write("{\"partial\":")
				setTimeout(
					() => response.socket?.destroy(),
					5
				)
				return
			case "hang":
				open.add(response)
				return
			case "ok":
				if (action.status == 204 || action.body == "empty") {
					response.writeHead(action.status)
					response.end()
				} else if (action.body == "text") {
					response.writeHead(
						action.status,
						{ "Content-Type": "text/plain" }
					)
					response.end("text " + id)
				} else {
					response.writeHead(
						action.status,
						{
							"Content-Type": "application/json"
						}
					)
					response.end(
						action.body == "json" ? JSON.stringify({ id }) : "{\"id\": "
					)
				}
				return
			case "slow-body":
				response.writeHead(
					200,
					{
						"Content-Length": "20",
						"Content-Type": "application/json"
					}
				)
				response.write("{\"slow\":")
				open.add(response)
				return
			case "status":
				response.writeHead(
					action.status,
					{
						"Content-Type": "application/json",
						...action.retry_after == null
							? {}
							: {
								"Retry-After": action.retry_after
							}
					}
				)
				response.end(
					JSON.stringify({ error: action.status })
				)
			}
		}
		const server = createServer(
			async (request, response) => {
				for await (const chunk of request) void chunk
				const owner = String(
					request.headers["x-client"] ?? ""
				)
				if (request.url?.startsWith("/auth/refresh")) {
					const count = refresh_counts.get(owner) ?? 0
					refresh_counts.set(owner, count + 1)
					const active = (refresh_active.get(owner) ?? 0) + 1
					refresh_active.set(owner, active)
					if (active > 1) refresh_overlaps.set(
						owner,
						(refresh_overlaps.get(owner) ?? 0) + 1
					)
					response.on(
						"close",
						() => refresh_active.set(
							owner,
							(refresh_active.get(owner) ?? 1) - 1
						)
					)
					const plan = refresh_plans.get(owner)?.[count] ?? "ok"
					if (plan == "hang") {
						open.add(response)
						return
					}
					await sleep(3)
					response.writeHead(
						plan == "fail" ? 401 : 200,
						{
							"Content-Type": "application/json"
						}
					)
					response.end(
						plan == "fail" ? "{\"error\":\"expired\"}" : "{\"token\":\"t\"}"
					)
					return
				}
				const id = String(
					request.headers["x-case"] ?? ""
				)
				const count = counts.get(id) ?? 0
				counts.set(id, count + 1)
				/** @type {HttpFuzzAction} */
				const action = plans.get(id)?.[count] ?? {
					body: "json",
					delay: 0,
					k: "ok",
					status: 200
				}
				if ("delay" in action && action.delay) await sleep(action.delay)
				respond(response, action, id)
			}
		)
		let origin = ""
		afterAll(
			async () => {
				process.off(
					"unhandledRejection",
					on_unhandled
				)
				for (const response of open) response.destroy()
				server.closeAllConnections()
				await new Promise(
					resolve => server.close(resolve)
				)
			}
		)
		beforeAll(
			async () => {
				process.on(
					"unhandledRejection",
					on_unhandled
				)
				await new Promise(
					resolve => server.listen(
						0,
						"127.0.0.1",
						() => resolve(void 0)
					)
				)
				origin = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */(server.address())/**/.port}`
			}
		)
		/**
		 * @param {SimRng} random
		 * @param {HttpFuzzConfig} config
		 * @param {boolean} slow
		 * @returns {HttpFuzzAction}
		 */
		function action_of(random, config, slow) {
			const roll = random.next()
			if (roll < 0.35) return {
				body: random.pick(
					/** @type {const} */([
						"json",
						"json",
						"text",
						"malformed",
						"empty"
					])/**/
				),
				delay: random.int(6),
				k: "ok",
				status: random.pick(
					/** @type {const} */([ 200, 200, 201, 204 ])/**/
				)
			}
			if (roll < 0.75) {
				const status = random.pick(
					[
						400,
						401,
						401,
						404,
						408,
						409,
						422,
						429,
						500,
						502,
						503,
						503,
						504
					]
				)
				const retry_after = config.custom_delay
					? random.pick([ void 0, "0", "1", "120" ])
					: random.pick([ "0", "0", "120" ])
				return {
					delay: random.int(6),
					k: "status",
					retry_after: status == 429 || status == 503
						? retry_after
						: config.custom_delay
							? void 0
							: "0",
					status
				}
			}
			if (roll < 0.9 || !slow) return {
				k: "drop",
				when: random.pick(
					/** @type {const} */([ "before", "mid-body" ])/**/
				)
			}
			return random.chance(0.5) ? { k: "hang" } : { k: "slow-body" }
		}
		/**
		 * @param {SimRng} random
		 * @param {number} low
		 * @param {number} high
		 * @returns {number}
		 */
		function between(random, low, high) {
			return low + random.int(high - low + 1)
		}
		/**
		 * @param {string} id
		 * @param {Partial<HttpFuzzConfig>} config
		 * @param {HttpFuzzHooks} hook
		 * @returns {import("async-lube").Http}
		 */
		function client(id, config, hook) {
			const auth = http(
				{
					base: origin,
					headers: { "x-client": id }
				}
			)
			/** @type {HttpConfig} */
			const options = {
				base: origin,
				headers: () => ({
					"Authorization": "Bearer t",
					"x-client": id
				}),
				on: {
					error: error => {
						hook.error.push(error)
					},
					request: () => {
						hook.request++
					},
					response: () => {
						hook.response++
					},
					unauthorized: (...args) => {
						hook.unauthorized.push(args[1])
					}
				},
				timeout: config.timeout
			}
			if (config.retry_at == "client") {
				options.retry = {
					count: config.count ?? 0,
					delay: config.custom_delay
						? () => {
							hook.delay++
							return 1
						}
						: void 0,
					when: config.when ? when_of(hook) : void 0
				}
			}
			if (config.refresh) {
				options.refresh = async signal => {
					hook.refresh++
					await auth.post(
						"/auth/refresh",
						void 0,
						{ signal }
					)
				}
			}
			return http(options)
		}
		/**
		 * @param {SimRng} random
		 * @returns {HttpFuzzConfig}
		 */
		function config_of(random) {
			const method = random.pick(
				/** @type {const} */([
					"GET",
					"GET",
					"POST",
					"PUT",
					"PATCH",
					"DELETE"
				])/**/
			)
			return {
				as: random.pick(
					/** @type {const} */([ void 0, void 0, "json", "text" ])/**/
				),
				count: random.int(4),
				custom_delay: random.chance(0.8),
				idempotent: method != "GET" && random.chance(0.4),
				method,
				refresh: random.chance(0.5),
				retry_at: random.pick(
					/** @type {const} */([ "client", "request", "none" ])/**/
				),
				stream: (method == "POST" || method == "PUT" || method == "PATCH") && random.chance(0.15),
				timeout: random.chance(0.5) ? 600 : void 0,
				when: random.chance(0.2)
			}
		}
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function deduplicated(seed) {
			const random = rng(seed)
			const id = "d" + seed
			/** @type {HttpFuzzConfig} */
			const config = {
				as: void 0,
				count: random.int(3),
				custom_delay: true,
				idempotent: false,
				method: "GET",
				refresh: random.chance(0.5),
				retry_at: "client",
				stream: false,
				timeout: random.chance(0.5) ? 600 : void 0,
				when: false
			}
			const plan = Array.from(
				{ length: 4 },
				() => action_of(
					random,
					config,
					config.timeout != null
				)
			)
			plans.set(id, plan)
			refresh_plans.set(id, [ "ok", "ok" ])
			const hook = hooks()
			const api = client(id, config, hook)
			const callers = between(random, 2, 5)
			const cancel_at = Array.from(
				{ length: callers },
				() => random.chance(0.3) ? random.int(11) : -1
			)
			const requests = cancel_at.map(
				() => api.get(
					"/r",
					{},
					{ headers: { "x-case": id } }
				)
			)
			for (const [ index, at ] of cancel_at.entries()) {
				if (at >= 0) {
					setTimeout(
						() => requests[index]?.cancel(),
						at
					)
				}
			}
			const results = await within(
				Promise.all(
					requests.map(request => request.safe())
				),
				8000
			)
			const trace = `plan ${JSON.stringify(plan)} cancel ${cancel_at} server ${counts.get(id)} errors ${hook.error.map(kind_of)} results ${results == "deadline" ? results : JSON.stringify(results.map(([ error ]) => kind_of(error)))}`
			if (results == "deadline") return [ "never settled", trace ]
			/** @type {string[]} */
			const problems = []
			const expected = model(plan, [ "ok", "ok" ], config)
			const every_cancelled = results.every(
				([ error ]) => error instanceof CancelError
			)
			const outcomes = new Set(
				results.filter(
					([ error ]) => !(error instanceof CancelError)
				)
					.map(([ error ]) => kind_of(error))
			)
			if (outcomes.size > 1) problems.push(
				`callers of one request got ${[ ...outcomes ]}`
			)
			if (!every_cancelled && (counts.get(id) ?? 0) > expected.server) problems.push(
				`the server got ${counts.get(id)} requests, expected ${expected.server}`
			)
			for (const [ index, [ error ] ] of results.entries()) {
				if (/** @type {number} */(cancel_at[index])/**/ < 0 && error instanceof CancelError) problems.push(
					`caller ${index} was cancelled`
				)
			}
			const data = results.map(([ , value ]) => value)
				.filter(
					value => value && typeof value == "object"
				)
			if (new Set(data).size != data.length) problems.push(
				"callers share one data object"
			)
			if (hook.error.length > 1) problems.push(
				`error hook ${hook.error.length} times for one request`
			)
			if (every_cancelled && hook.error.length) problems.push(
				"error hook although every caller cancelled"
			)
			return problems.length ? [ ...problems, trace ] : []
		}
		/**
		 * @returns {HttpFuzzHooks}
		 */
		function hooks() {
			return {
				delay: 0,
				error: [],
				refresh: 0,
				request: 0,
				response: 0,
				unauthorized: [],
				when: 0
			}
		}
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function locked(seed) {
			const random = rng(seed)
			const id = "k" + seed
			plans.set(
				id,
				[
					{
						body: "json",
						delay: between(random, 40, 60),
						k: "ok",
						status: 201
					}
				]
			)
			const api = client(id, {}, hooks())
			const clicks = between(random, 2, 5)
			/** @type {Promise<unknown>[]} */
			const requests = []
			let settled = 0
			let while_pending = 0
			for (let i = 0; i < clicks; i++) {
				if (i > 0 && !settled) while_pending++
				requests.push(
					api.post(
						"/r",
						{ i },
						{
							headers: { "x-case": id },
							lock: "submit"
						}
					)
						.safe()
						.then(
							() => {
								settled++
							}
						)
				)
				if (random.chance(0.5)) await sleep(random.int(4))
			}
			await Promise.all(requests)
			return while_pending == clicks - 1 && counts.get(id) != 1
				? [
					`lock sent ${counts.get(id)} requests`
				]
				: []
		}
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function refreshing(seed) {
			const random = rng(seed)
			const id = "r" + seed
			const hook = hooks()
			const timeout = random.chance(0.5) ? 600 : void 0
			const api = client(
				id,
				{
					count: 1,
					custom_delay: true,
					refresh: true,
					retry_at: "client",
					timeout
				},
				hook
			)
			const calls = between(random, 2, 20)
			const waves = between(random, 1, 3)
			const refreshes = Array.from(
				{ length: waves + 2 },
				() => random.pick(
					timeout ? [ "ok", "ok", "fail", "hang" ] : [ "ok", "ok", "fail" ]
				)
			)
			refresh_plans.set(id, refreshes)
			/** @type {Promise<unknown>[]} */
			const requests = []
			for (let wave = 0; wave < waves; wave++) {
				for (let i = 0; i < calls; i++) {
					const key = `${id}-${wave}-${i}`
					plans.set(
						key,
						[
							{
								delay: random.int(11),
								k: "status",
								retry_after: void 0,
								status: 401
							},
							random.chance(0.8)
								? {
									body: "json",
									delay: random.int(6),
									k: "ok",
									status: 200
								}
								: {
									delay: 0,
									k: "status",
									retry_after: void 0,
									status: 401
								}
						]
					)
					requests.push(
						api.get(
							"/r",
							{ i },
							{
								headers: { "x-case": key },
								timeout: random.chance(0.2) ? 30 : void 0
							}
						)
							.safe()
					)
				}
				await sleep(random.int(41))
			}
			const results = await within(Promise.all(requests), 10000)
			const trace = `timeout ${timeout} calls ${calls} waves ${waves} refreshes ${refreshes} refreshed ${hook.refresh} server ${refresh_counts.get(id)}`
			if (results == "deadline") return [ "never settled", trace ]
			/** @type {string[]} */
			const problems = []
			if (refresh_overlaps.get(id)) problems.push(
				`two refreshes ran at the same time ${refresh_overlaps.get(id)} times`
			)
			if (hook.refresh > waves * calls) problems.push(
				"more refreshes than 401 waves"
			)
			for (let wave = 0; wave < waves; wave++) {
				for (let i = 0; i < calls; i++) {
					const count = counts.get(`${id}-${wave}-${i}`) ?? 0
					if (count > 3) problems.push(
						`request ${wave}-${i} was sent ${count} times`
					)
				}
			}
			return problems.length ? [ ...problems, trace ] : []
		}
		/**
		 * @param {number} seed
		 * @returns {Promise<string[]>}
		 */
		async function single(seed) {
			const random = rng(seed)
			const config = config_of(random)
			const id = "c" + seed
			const plan = Array.from(
				{ length: 6 },
				() => action_of(
					random,
					config,
					config.timeout != null
				)
			)
			const refreshes = Array.from(
				{ length: 2 },
				() => random.pick(
					config.timeout == null ? [ "ok", "ok", "fail" ] : [ "ok", "ok", "fail", "hang" ]
				)
			)
			plans.set(id, plan)
			refresh_plans.set(id, refreshes)
			const hook = hooks()
			const api = client(id, config, hook)
			const expected = model(plan, refreshes, config)
			/** @type {RequestOptions} */
			const options = { headers: { "x-case": id } }
			if (config.as) options.as = config.as
			if (config.idempotent) options.idempotent = true
			if (config.retry_at == "request") {
				options.retry = {
					count: config.count,
					delay: config.custom_delay
						? () => {
							hook.delay++
							return 1
						}
						: void 0,
					when: config.when ? when_of(hook) : void 0
				}
			}
			const body = config.stream
				? new ReadableStream(
					{
						start(controller) {
							controller.enqueue(
								new TextEncoder().encode("{\"x\":1}")
							)
							controller.close()
						}
					}
				)
				: config.method == "GET" || config.method == "DELETE"
					? void 0
					: { x: 1 }
			const request = config.method == "GET"
				? api.get("/r", {}, options)
				: config.method == "DELETE"
					? api.delete("/r", {}, options)
					: config.method == "POST"
						? api.post("/r", body, options)
						: config.method == "PUT"
							? api.put("/r", body, options)
							: api.patch("/r", body, options)
			const cancel_at = random.chance(0.2) ? random.int(31) : -1
			if (cancel_at >= 0) {
				setTimeout(
					() => request.cancel(),
					cancel_at
				)
			}
			const settled = await within(request.safe(), 8000)
			function server_count() {
				return counts.get(id) ?? 0
			}
			/** @type {string[]} */
			const problems = []
			const trace = [
				`config ${JSON.stringify(config)}`,
				`plan ${JSON.stringify(plan.slice(0, expected.server + 1))} refreshes ${refreshes}`,
				`expected ${JSON.stringify(expected)}`
			]
			if (settled == "deadline") return [ "never settled", ...trace ]
			const [ error ] = settled
			const got = kind_of(error)
			trace.push(
				`got ${got} ${error instanceof Error ? error.message : ""} server ${server_count()} hooks ${JSON.stringify({ ...hook, error: hook.error.map(kind_of), unauthorized: hook.unauthorized.map(kind_of) })}`
			)
			if (got == "cancel" && cancel_at >= 0) {
				if (hook.error.length) problems.push(
					"the error hook got a cancelled request"
				)
				if (server_count() > expected.server) problems.push(
					`a cancelled request was sent ${server_count()} times`
				)
				return problems.length ? [ ...problems, ...trace ] : []
			}
			if (got != expected.outcome) problems.push(
				`outcome ${got}, expected ${expected.outcome}`
			)
			else if (error instanceof HttpError && error.status != expected.status) problems.push(
				`status ${error.status}, expected ${expected.status}`
			)
			if (server_count() != expected.server) problems.push(
				`the server got ${server_count()} requests, expected ${expected.server}`
			)
			if (hook.request != server_count()) problems.push(
				`request hook ${hook.request} times for ${server_count()} requests`
			)
			if (hook.response != expected.response_hook) problems.push(
				`response hook ${hook.response} times`
			)
			if (hook.error.length != expected.error_hook) problems.push(
				`error hook ${hook.error.length} times`
			)
			if (hook.error.length == 1 && hook.error[0] !== error) problems.push(
				"the error hook got another error than the caller"
			)
			if (hook.unauthorized.length != expected.unauthorized) problems.push(
				`unauthorized hook ${hook.unauthorized.length} times`
			)
			if (hook.refresh != expected.refreshes) problems.push(
				`refresh ${hook.refresh} times`
			)
			if (config.custom_delay && hook.delay != expected.delays) problems.push(`delay ${hook.delay} times`)
			if (refresh_overlaps.get(id)) problems.push(
				"two refreshes ran at the same time"
			)
			if (config.method == "POST" && !config.idempotent && config.retry_at != "request" && server_count() > 1 + expected.refreshes) problems.push(
				"POST sent again without idempotent"
			)
			return problems.length ? [ ...problems, ...trace ] : []
		}
		/**
		 * @param {number} seed
		 * @param {"debounce" | "latest" | "throttle"} kind
		 * @returns {Promise<string[]>}
		 */
		async function superseded(seed, kind) {
			const random = rng(seed)
			const id = kind + seed
			const hook = hooks()
			const api = client(id, {}, hook)
			const calls = between(random, 2, 6)
			const window = 40
			const gaps = Array.from(
				{ length: calls - 1 },
				() => random.int(9)
			)
			plans.set(
				id,
				Array.from(
					{ length: calls },
					() => /** @type {HttpFuzzAction} */({
						body: "json",
						delay: between(random, 10, 30),
						k: "ok",
						status: 200
					})/**/
				)
			)
			/** @type {Promise<[unknown, unknown]>[]} */
			const requests = []
			const started = Date.now()
			for (let i = 0; i < calls; i++) {
				/** @type {RequestOptions} */
				const options = { headers: { "x-case": id } }
				if (kind == "latest") options.latest = "feed"
				else options[kind] = window
				requests.push(
					api.get("/r", { q: i }, options)
						.safe()
				)
				if (i < calls - 1) await sleep(
					/** @type {number} */(gaps[i])/**/
				)
			}
			const spread = Date.now() - started
			const results = await within(Promise.all(requests), 8000)
			const trace = `gaps ${gaps} spread ${spread} server ${counts.get(id)} results ${results == "deadline" ? results : results.map(([ error ]) => kind_of(error))}`
			if (results == "deadline") return [ "never settled", trace ]
			/** @type {string[]} */
			const problems = []
			const kinds = results.map(([ error ]) => kind_of(error))
			const quick = spread < window - 10
			if (kinds.at(-1) != "ok") problems.push(
				`the last request ended with ${kinds.at(-1)}`
			)
			if (hook.error.length) problems.push(
				"error hook for a cancellation"
			)
			if (kind == "debounce" && quick && (counts.get(id) != 1 || kinds.slice(0, -1).some(outcome => outcome != "cancel"))) problems.push(
				"debounce sent more than the last request"
			)
			if (kind == "throttle" && quick && (counts.get(id) != Math.min(calls, 2) || kinds[0] != "ok" || kinds.slice(1, -1).some(outcome => outcome != "cancel"))) problems.push(
				"throttle sent more than the first and the last request"
			)
			if (kind == "latest" && kinds.slice(0, -1).some(
				outcome => outcome != "ok" && outcome != "cancel"
			)) problems.push(
				"latest failed a superseded request"
			)
			return problems.length ? [ ...problems, trace ] : []
		}
		/**
		 * @param {HttpFuzzHooks} hook
		 * @returns {(error: unknown) => boolean}
		 */
		function when_of(hook) {
			return error => {
				hook.when++
				return error instanceof NetworkError || error instanceof HttpError && error.status == 503
			}
		}
		for (const [ mode, count ] of /** @type {const} */([
			[ "single", 60 ],
			[ "dedupe", 15 ],
			[ "lock", 8 ],
			[ "latest", 8 ],
			[ "debounce", 8 ],
			[ "throttle", 8 ],
			[ "refresh", 8 ]
		])/**/) {
			it(
				mode,
				async () => {
					/** @type {string[]} */
					const failures = []
					const seeds = sim_seeds("http-" + mode, count)
					let next = 0
					await Promise.all(
						Array.from(
							{ length: 16 },
							async () => {
								while (next < seeds.length) {
									const seed = /** @type {number} */(seeds[next++])/**/
									const problems = mode == "single"
										? await single(seed)
										: mode == "dedupe"
											? await deduplicated(seed)
											: mode == "lock"
												? await locked(seed)
												: mode == "refresh"
													? await refreshing(seed)
													: await superseded(seed, mode)
									if (problems.length) failures.push(
										[
											`SIM_MODE=http-${mode} SIM_SEED=${seed}`,
											...problems
										].join("\n")
									)
								}
							}
						)
					)
					assert.deepEqual(
						{
							count: failures.length,
							first: failures.slice(0, 3),
							unhandled: unhandled.map(String)
						},
						{ count: 0, first: [], unhandled: [] }
					)
				},
				600000
			)
		}
	}
)
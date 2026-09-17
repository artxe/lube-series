export type RequestSummary = {
	method: string
	url: string
}
/** The request or the flow was cancelled, superseded by a newer request or left by all its callers. */
declare class CancelErrorLike extends Error {
	cause: unknown
	request: RequestSummary | undefined
	constructor(reason?: unknown, request?: RequestSummary)
}
/** The server responded with a status that is not accepted, 2xx by default. */
declare class HttpErrorLike extends Error {
	data: unknown
	headers: Headers
	request: RequestSummary
	response: Response
	status: number
	statusText: string
	constructor(response: Response, data: unknown, request: RequestSummary)
}
/** The request did not reach the server, e.g. offline, DNS failure or CORS. */
declare class NetworkErrorLike extends Error {
	cause: unknown
	request: RequestSummary
	constructor(cause: unknown, request: RequestSummary)
}
/** The request or the flow node took longer than its timeout. */
declare class TimeoutErrorLike extends Error {
	request: RequestSummary | undefined
	timeout: number
	constructor(timeout: number, request?: RequestSummary)
}
export type RequestError = CancelErrorLike | HttpErrorLike | NetworkErrorLike | TimeoutErrorLike | Error
export type AttemptOptions = {
	/** How many times to run again after a failure, or `{ count, delay, when }` as for a flow node. */
	retry?: number | RetryOptions | undefined
	/** Cancels the attempt and the waiting, and rejects with CancelError. */
	signal?: AbortSignal | undefined
	/** Milliseconds for each attempt, which aborts its `signal` and fails with TimeoutError. */
	timeout?: number | undefined
}
/** A slot of a limiter, held until `release()`, e.g. by a transaction across several flow nodes. */
export type Lease = {
	/** Gives the slot back. Calling it again does nothing. */
	release(): void
}
/** A function that runs the calls given to it within its limits, in order. */
export interface Limiter {
	/** Runs the function when its turn comes. The signal takes it out of the line while it waits. */
	<T>(fn: () => T, signal?: AbortSignal): Promise<Awaited<T>>
	/** Waits for a slot and holds it until `release()`, for work that is not one function. */
	acquire(signal?: AbortSignal): Promise<Lease>
	/**
	 * A limiter with the same limits for each key, e.g. one call at a time per user or a quota per tenant.
	 * The state of a key is dropped when it has nothing to do.
	 */
	key(key: unknown): Limiter
	/** The calls that wait for their turn. */
	readonly pending: number
	/** The calls that run. */
	readonly running: number
}
/** A call of an `offload()` function: its result, with `cancel()` to stop it. */
export type OffloadCall<T> = Promise<T> & { cancel(reason?: unknown): void }
/** A function that runs in a worker. An `AbortSignal` as the last argument cancels the call. */
export interface Offloaded<A extends unknown[], R> {
	(...args: A): OffloadCall<Awaited<R>>
	(...args: [...A, AbortSignal]): OffloadCall<Awaited<R>>
	/** Terminates the workers and cancels the calls. A later call starts a worker again. */
	close(): void
}
export interface ChannelFunction {
	/**
	 * A stream that values are pushed into, e.g. from a callback API or a form.
	 * With `initial` it holds a current value, and every loop starts with it: the initial value or the last one sent.
	 * @example
	 * const model = channel({ initial: "small" })
	 * select.onchange = () => model.send(select.value)
	 * flow().add(answer, flow.queue(questions), flow.keep(model)) // no send after run()
	 */
	<T>(options: { initial: T, limit?: number | undefined, signal?: AbortSignal | undefined }): Channel<T>
	<T>(options?: { limit?: number | undefined, signal?: AbortSignal | undefined }): Channel<T>
}
export interface LatestFunction {
	/**
	 * For every value, runs what the function returns, a stream, a promise of a stream or of a value, or a value, and leaves
	 * the one before it, whose signal aborts, like the `latest` of a request. The values of a stream are yielded one by one.
	 * A socket, an event stream or a request that it leaves, also when the loop is left, is cancelled with its `cancel()`.
	 * @example
	 * for await (const items of latest(debounce(typed, 300), (q, signal) => api.get("/search", { q }, { signal }))) render(items)
	 * for await (const token of latest(questions, (q, signal) => api.post("/answers", { q }, { as: "ndjson", parse, signal }))) show(token)
	 */
	<T, R>(source: AsyncIterable<T>, start: (value: T, signal: AbortSignal) => R): AsyncIterableIterator<LatestValue<Awaited<R>>>
}
type LatestValue<R> = R extends AsyncIterable<infer T> ? T : R
type StreamValue<S> = S extends AsyncIterable<infer T> ? T : never
export interface MergeFunction {
	/** The values of every stream as they arrive. One that fails stops the others. */
	<const S extends readonly AsyncIterable<unknown>[]>(...sources: S): AsyncIterableIterator<StreamValue<S[number]>>
}
/**
 * A stream that values are pushed into. Every `for await` loop receives the values that arrive while it runs,
 * so several readers share one channel, and a loop that is left does not close it.
 */
export interface Channel<T> extends AsyncIterable<T> {
	/** Ends every loop. */
	close(): void
	readonly closed: boolean
	/** Rejects every loop with the error. */
	fail(error: unknown): void
	send(value: T): void
}
type Primitive = string | number | boolean | bigint | symbol | null | undefined
export type QueryValue = string | number | boolean | bigint | Date | null | undefined | readonly QueryValue[] | {
	readonly [key: string]: QueryValue
}
/**
 * Query parameters: arrays repeat the key, objects use `key[name]`, dates use ISO strings, and null or undefined are left out.
 * `QueryParams<Q>` checks the properties of `Q`, so that an interface or a class instance is accepted too.
 */
export type QueryParams<Q = { readonly [key: string]: QueryValue }> = Q extends Primitive | readonly unknown[] | ((...args: never[]) => unknown)
	? never
	: { readonly [K in keyof Q]: QueryValue }
type Lower = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
	| "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z"
type WordChar = Lower | Uppercase<Lower> | "_" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
type ParamName<S extends string, N extends string = ""> = S extends `${infer C}${infer R}`
	? C extends WordChar
		? ParamName<R, `${N}${C}`>
		: N
	: N
type PathPart<P extends string> = P extends `${infer H}?${string}`
	? H
	: P extends `${infer H}#${string}`
		? H
		: P
type PathParamsOf<P extends string> = P extends `${string}/:${infer Rest}`
	? (
		ParamName<Rest> extends "" | `${number}${string}`
			? unknown
			: { [K in ParamName<Rest>]: string | number | Date }
	) & PathParamsOf<Rest>
	: unknown
/** The path parameters of a path such as `/users/:id`. */
export type PathParams<P extends string> = string extends P ? unknown : PathParamsOf<PathPart<P>>
type NeededParams<P extends string, B> = P extends `${string}://${string}` | `//${string}`
	? PathParams<P>
	: PathParams<P> & B
type ParamsArgs<P extends string, O, Q, B> = unknown extends NeededParams<P, B>
	? [params?: QueryParams<Q>, options?: O]
	: [params: NeededParams<P, B> & QueryParams<Q>, options?: O]
type BodyArgs<P extends string, O, Q, B> = unknown extends NeededParams<P, B>
	? [body?: unknown, options?: O & { params?: QueryParams<Q> | undefined }]
	: [body: unknown, options: O & { params: NeededParams<P, B> & QueryParams<Q> }]
type OptionsArgs<P extends string, O, Q, B> = unknown extends NeededParams<P, B>
	? [options?: O & { params?: QueryParams<Q> | undefined }]
	: [options: O & { params: NeededParams<P, B> & QueryParams<Q> }]
export type Progress = {
	loaded: number
	/** Between 0 and 1, or undefined if the total size is unknown. */
	ratio: number | undefined
	total: number | undefined
}
export type ServerEvent<T = string> = {
	/** The text of the event, its JSON with `as: "json"`, or what `parse` returned for it. */
	data: T
	event: string
	id: string
	retry: number | undefined
}
export type DownloadedFile = {
	blob: Blob
	/** From the Content-Disposition header, or the last segment of the URL. */
	name: string
}
type ResponseTypes = {
	arrayBuffer: ArrayBuffer
	blob: Blob
	file: DownloadedFile
	formData: FormData
	json: unknown
	ndjson: AsyncIterable<unknown>
	stream: ReadableStream<Uint8Array<ArrayBuffer>> | null
	text: string
}
export type ResponseType = keyof ResponseTypes
export type HeadersSource = HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
/** The `retry` of a request, of `attempt()` and of a flow node, where a number is the `count`. */
export type RetryOptions = {
	/** How many times it runs again after failing. */
	count: number
	/**
	 * Milliseconds before the next attempt, or a function that returns them or undefined to reject with the error instead.
	 * `fallback` is what the default waits: 0 for `attempt()` and a flow node, and for a request the Retry-After or an exponential
	 * backoff with jitter, or undefined for a Retry-After of more than 60 seconds, which rejects at once.
	 * @example
	 * { count: 5, delay: (attempt, error, fallback) => fallback ?? 60000 } // waits for a long Retry-After too
	 */
	delay?: number | ((attempt: number, error: unknown, fallback: number | undefined) => number | undefined) | undefined
	/**
	 * Whether to run again. Default: always for `attempt()` and a flow node, and for a request network errors, timeouts and
	 * the statuses 408, 425, 429, 500, 502, 503 and 504. POST, PATCH and other methods that are not idempotent are sent again
	 * only with `idempotent` or a `retry` of the request itself.
	 */
	when?: ((error: unknown, attempt: number) => boolean | Promise<boolean>) | undefined
}
/** The `reconnect` of `sse()` and `ws()`. */
export type ReconnectOptions = {
	/**
	 * The failures in a row after which the loops reject with the last error. Default: unlimited, except that a socket
	 * that has never opened gives up after 5.
	 */
	count?: number | undefined
	/**
	 * Milliseconds before connecting again after a failure, or a function that returns them or undefined to reject the loops
	 * with the error, where failures counts the failures in a row from 1 and `fallback` is what the default waits.
	 */
	delay?: number | ((failures: number, error: unknown, fallback: number) => number | undefined) | undefined
}
export type RequestContext = {
	attempt: number
	/** The body before it is serialized. May be replaced by the `request` hook. */
	body: unknown
	/** May be changed by the `request` hook. */
	headers: Headers
	method: string
	options: RequestOptions
	/** May be replaced by the `request` hook. */
	url: string
}
export type RawResponse<T> = {
	data: T
	headers: Headers
	response: Response
	status: number
}
export type Hooks = {
	/** Called once for every failed request, except cancellations. It does not delay the request, and its errors are ignored. */
	error?: ((error: unknown) => unknown) | undefined
	/** Called before every attempt, e.g. to add a trace header. It counts toward the timeout. */
	request?: ((context: RequestContext) => unknown) | undefined
	/** Called after every successful response, e.g. to log the duration. It counts toward the timeout. */
	response?: ((context: RequestContext & RawResponse<unknown> & { duration: number }) => unknown) | undefined
	/**
	 * Called with the 401 error when refreshing the credentials failed or timed out, with its reason, or when the request failed with 401
	 * again after the refresh, with undefined, e.g. to log out. Requests that fail together call it once.
	 */
	unauthorized?: ((error: HttpErrorLike, reason: unknown) => unknown) | undefined
}
/** What `ws()` needs from a WebSocket, so that the global one or one from a package such as ws fits. */
export interface WebSocketLike {
	binaryType: string
	close(code?: number, reason?: string): void
	onclose: ((event: never) => void) | null
	onerror: ((event: never) => void) | null
	onmessage: ((event: never) => void) | null
	onopen: ((event: never) => void) | null
	readonly readyState: number
	send(data: never): void
}
export type HttpConfig = Omit<RequestInit, "body" | "headers" | "method" | "signal"> & {
	/** Replaces the global WebSocket of `ws()`, e.g. with the ws package before Node.js 22. */
	WebSocket?: (new (url: string, protocols?: string | string[]) => WebSocketLike) | undefined
	/** Prepended to relative paths. It may contain path parameters, e.g. `https://api.example.com/orgs/:org`. */
	base?: string | undefined
	fetch?: ((input: string, init: RequestInit) => Promise<Response>) | undefined
	/** Static headers, or a function called before every attempt. */
	headers?: HeadersSource | undefined
	/** Whether the response is a success. Default: 2xx. */
	ok?: ((response: Response) => boolean) | undefined
	on?: Hooks | undefined
	/** Serializes the query parameters. */
	query?: ((params: QueryParams) => string) | undefined
	/**
	 * Refreshes the credentials when a request fails with 401. Requests that fail at the same time
	 * share one refresh per function, and each of them is sent once more.
	 * Send the refresh request with a client without it, e.g. `api.extend({ refresh: null })`,
	 * or a 401 of the refresh itself waits for itself. A request waits for it at most its own `timeout` more
	 * and then rejects with TimeoutError alone. A refresh that rejects rejects the requests waiting for it with their 401.
	 * It also fails when it takes longer than the `timeout` of the client that started it, or when every request waiting
	 * for it left, timed out or cancelled, and one of them timed out: then its signal is aborted, the requests still waiting
	 * reject with TimeoutError and `on.unauthorized` gets the TimeoutError. After a failure, the next 401 starts a new refresh. Pass the signal on, e.g. `auth.post("/auth/refresh", undefined, { signal })`.
	 */
	refresh?: ((signal: AbortSignal) => unknown) | undefined
	retry?: number | RetryOptions | undefined
	/** Milliseconds for each attempt, including the headers function and the request and response hooks. */
	timeout?: number | undefined
}
/** The config of `extend()`: undefined keeps the value of the parent, and null removes it. */
export type ExtendConfig = { [K in keyof HttpConfig]?: HttpConfig[K] | null }
export type RequestOptions<Q = { readonly [key: string]: QueryValue }> = Omit<RequestInit, "body" | "headers" | "method"> & {
	/** How to read the response body, where `ndjson` is an async iterable of the JSON of each line. Default: by its Content-Type. */
	as?: ResponseType | undefined
	/** The body of `request()` and `delete()`, and of the body methods when their body argument is undefined. GET and HEAD reject a body. */
	body?: unknown
	/** Waits before sending. A newer request to the same method and path, or with the same `latest` key, cancels this one, waiting or sent. */
	debounce?: number | undefined
	/**
	 * Whether identical GET and HEAD requests of the same client in flight share one request. Every caller gets its own copy of the data.
	 * Default: true, and off with `parse`, `ok`, `progress`, `retry`, `timeout`, `latest`, `debounce`, `as: "formData"`, `"ndjson"` or `"stream"`, or `fetch` options
	 * other than `signal`, which cancels only its own caller.
	 */
	dedupe?: boolean | undefined
	headers?: HeadersInit | undefined
	/** Sends an Idempotency-Key header, generated once and kept on retries, and allows retrying. */
	idempotent?: boolean | string | undefined
	/** Cancels the previous request of the same client with the same key, so that only the latest response is used. */
	latest?: string | undefined
	/**
	 * Returns the request of the same client in flight with the same key instead of sending another, e.g. for a submit button.
	 * A response read as `ndjson` or `stream` is read once, so it cannot be locked.
	 */
	lock?: string | undefined
	/** Whether the response is a success. Default: 2xx. */
	ok?: ((response: Response) => boolean) | undefined
	/** Path and query parameters of the body methods. */
	params?: QueryParams<Q> | undefined
	/** Validates or transforms the data, or each line of `ndjson`, e.g. a zod schema's parse. It counts toward the timeout, except for the lines of `ndjson`. */
	parse?: ((data: unknown) => unknown) | undefined
	/** Reports the download progress, ending with a ratio of 1. Its errors are ignored. */
	progress?: ((progress: Progress) => void) | undefined
	retry?: number | RetryOptions | undefined
	/**
	 * Sends at most one request per the milliseconds to the same method and path of the same client:
	 * the first at once, and the last one asked in the meantime when the time is up, while the ones between reject with CancelError.
	 */
	throttle?: number | undefined
	/** Milliseconds for each attempt, and with `as: "ndjson"` or `"stream"` only until the response headers arrive. */
	timeout?: number | undefined
	/** Reports the upload progress. Uses XMLHttpRequest, so it works in browsers, and not with a `fetch` of the config. Its errors are ignored. */
	upload?: ((progress: Progress) => void) | undefined
}
type DataOf<T, O> = O extends { as: "ndjson" }
	? AsyncIterable<O extends { parse: (data: never) => infer R } ? Awaited<R> : unknown>
	: O extends { parse: (data: never) => infer R }
		? Awaited<R>
		: O extends { as: infer A extends ResponseType }
			? A extends "json"
				? T
				: ResponseTypes[A]
			: T
type RequestOnlyOptions = "as" | "debounce" | "dedupe" | "idempotent" | "latest" | "lock" | "throttle"
	| "parse" | "progress" | "retry" | "upload"
export type SseOptions = Omit<RequestOptions, RequestOnlyOptions> & {
	/** How to read the data of every event: "json" parses it and keeps text that is not valid JSON as a string. Default: "text". */
	as?: "json" | "text" | undefined
	/** Sent as Last-Event-ID on the first connection. */
	lastEventId?: string | undefined
	/** Default: GET. */
	method?: string | undefined
	/**
	 * Called when the status changes, e.g. to show that the connection is lost: "connecting" while it connects or waits to reconnect,
	 * "open" once the response arrives, "idle" when the loop ends and "closed" after `cancel()` or an aborted `signal`, also while no loop runs,
	 * so the stream listens to `signal` until then. Its errors are ignored.
	 */
	onStatus?: ((status: ConnectionStatus) => void) | undefined
	/**
	 * Validates or transforms the data of every event after `as` read it, e.g. a zod schema's parse, and types it.
	 * A promise is awaited, and the events keep their order. An event that fails rejects the loop without reconnecting,
	 * and since its ID is already the last event ID, iterating again continues after it.
	 */
	parse?: ((data: unknown) => unknown) | undefined
	/**
	 * Whether to connect again when the stream ends or fails. Default: true for GET.
	 * After a stream that ended, it waits for the server's `retry` value or 3 seconds. After a failure, it waits for `delay`,
	 * or else for an exponential backoff, or for the whole `Retry-After` of the response when it is longer, and connects at once
	 * when the browser comes back online unless the response had a `Retry-After`.
	 * It stops on 204 No Content, and rejects the loop on client errors other than 408, 425 and 429, when the response is not
	 * text/event-stream, and on errors other than network errors and timeouts, e.g. the TypeError of a missing path parameter.
	 * Every failed connection calls the `error` hook. `count` limits the failures in a row, a connection that drops
	 * after its events counts as one, and a stream that ends or a connection that stays open for 5 seconds resets them.
	 */
	reconnect?: boolean | ReconnectOptions | undefined
	/** Closes the stream for good when aborted, like `cancel()`. */
	signal?: AbortSignal | null | undefined
	/** Milliseconds to wait for the response headers of each connection. The events may take any time. */
	timeout?: number | undefined
}
/**
 * Server-sent events. Iterate it with `for await`: breaking the loop closes the connection,
 * and iterating it again connects again with the last event ID. `cancel()` closes it for good.
 */
export interface EventStream<T = string> extends AsyncIterable<ServerEvent<T>> {
	cancel(reason?: unknown): void
	/** The ID of the last event, sent as Last-Event-ID when reconnecting. */
	readonly lastEventId: string
	/** The status of the loop that changed it last. */
	readonly status: ConnectionStatus
}
export type ConnectionStatus = "closed" | "connecting" | "idle" | "open"
/** A value that JSON keeps. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue | undefined }
/** What a socket sends unless its type says otherwise: strings, binary data and JSON values. */
export type SocketData = JsonValue | ArrayBufferLike | ArrayBufferView | Blob
export type SocketOptions<S = SocketData> = {
	/** How to read text messages: "json" parses them and keeps text that is not valid JSON as a string. Binary messages are ArrayBuffers. Default: "json". */
	as?: "json" | "text" | undefined
	/**
	 * Sends the message every `interval` milliseconds while the socket is open, so that proxies keep it.
	 * With `timeout`, a socket that receives nothing within the milliseconds after a heartbeat connects again.
	 */
	heartbeat?: { interval: number, message: S, timeout?: number | undefined } | undefined
	/**
	 * How many received messages each loop keeps while it is busy, keeping the newest, e.g. for a widget that renders
	 * slower than the messages arrive: a positive integer or Infinity, the default.
	 */
	limit?: number | undefined
	/** Called when the status changes, e.g. to show that the connection is lost. Its errors are ignored. */
	onStatus?: ((status: ConnectionStatus) => void) | undefined
	/**
	 * How many messages sent while the socket is not open wait for the next connection, keeping the newest,
	 * e.g. 1 for positions where only the latest matters, or 0 to drop them: a non-negative integer or Infinity, the default.
	 */
	outbox?: number | undefined
	/**
	 * Query parameters, or a function called before every connection, e.g. for a fresh token, since browsers cannot send headers.
	 * The values of the function are shown as `***` in the `request.url` of errors.
	 */
	params?: QueryParams | (() => QueryParams | Promise<QueryParams>) | undefined
	/** Validates or transforms every message, e.g. a zod schema's parse. A promise is awaited, and the messages keep their order. A message that fails closes the socket. */
	parse?: ((data: unknown) => unknown) | undefined
	protocols?: string | string[] | undefined
	/**
	 * Whether to connect again when the connection fails or drops, or the server closes it with 1001, 1011, 1012, 1013 or 1014. Default: true.
	 * It waits for `delay`, or else an exponential backoff, and not at all when the browser comes back online.
	 * A connection that stays open for 5 seconds resets the failures, and one that drops after its messages is a failure too.
	 * Every failed connection calls the `error` hook. Browsers do not show why an upgrade failed, so one that the server
	 * refuses, e.g. with 401, is a NetworkError whose cause is a SocketError with code 1006: a socket that has never opened
	 * gives up after 5 failures in a row unless `count` says otherwise, and once it has opened, `count` is unlimited by default.
	 */
	reconnect?: boolean | ReconnectOptions | undefined
	/** Closes the socket for good when aborted. */
	signal?: AbortSignal | undefined
	/** Milliseconds for opening each connection. */
	timeout?: number | undefined
}
/**
 * A WebSocket that connects when it is first iterated or sent to, and reconnects until `cancel()`.
 * Every `for await` loop receives the messages that arrive while it runs, and leaving a loop keeps the socket open.
 * A close with 1000 ends the loops, a failure rejects them, and both make the status "idle", so that using the socket again connects again.
 */
export interface Socket<T = unknown, S = SocketData> extends AsyncIterable<T> {
	/** Closes the socket for good, ending its loops. */
	cancel(reason?: unknown): void
	/**
	 * Sends strings, ArrayBuffers, typed arrays and Blobs as they are, and other values as JSON.
	 * Messages sent while connecting or closing are sent once the socket opens again, and dropped when it ends or fails.
	 * Returns true when the message was handed to the open socket, and false when it waits for the connection or `outbox: 0` dropped it.
	 * Throws CancelError after `cancel()`.
	 */
	send(data: S): boolean
	readonly status: ConnectionStatus
}
/** A request in flight. Await it for the data. */
export interface LubeRequest<T> extends Promise<T> {
	cancel(reason?: unknown): void
	/** Resolves with the data, the status, the headers and the response. Type the data with a type argument, `raw<User>()`. */
	raw<U = T>(): Promise<RawResponse<U>>
	/**
	 * Resolves with `[error, undefined]` or `[undefined, data]` instead of rejecting.
	 * Type the data with a type argument, `safe<User>()`, which keeps the check of the path parameters, unlike `get<User>()`.
	 */
	safe<U = T>(): Promise<[error: RequestError, data: undefined] | [error: undefined, data: U]>
}
/** A client of `http()`, where `B` is the path parameters of its `base`, which every relative path needs. */
export interface Http<B = unknown> {
	delete<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions = RequestOptions>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	/** Creates a client with merged config. Headers and hooks of both are applied, and null removes a value. */
	extend(config: ExtendConfig & { base: null }): Http
	extend<const N extends string = never>(config: ExtendConfig & { base?: N | undefined }): Http<[N] extends [never] ? B : PathParams<N>>
	get<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions = RequestOptions>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	head<P extends string = string, Q = QueryParams, O extends RequestOptions = RequestOptions>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): LubeRequest<undefined>
	options<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions = RequestOptions>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	patch<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions<Q> = RequestOptions<Q>>(
		path: P,
		...args: BodyArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	/**
	 * Sends the body as JSON, or FormData, Blob, ArrayBuffer, typed arrays, URLSearchParams, strings and ReadableStream as they are.
	 * A ReadableStream is sent once: it is not retried, and after a 401 it waits for `refresh` and then rejects with the HttpError.
	 * Without a body, pass undefined, `post("/users/:id/follow", undefined, { params: { id } })`, or use `request("POST", path, { params })`.
	 */
	post<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions<Q> = RequestOptions<Q>>(
		path: P,
		...args: BodyArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	put<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions<Q> = RequestOptions<Q>>(
		path: P,
		...args: BodyArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	request<T = unknown, P extends string = string, Q = QueryParams, O extends RequestOptions<Q> = RequestOptions<Q>>(
		method: string,
		path: P,
		...args: OptionsArgs<P, O, Q, B>
	): LubeRequest<DataOf<T, O>>
	/** Opens a server-sent events stream that reconnects with the last event ID. */
	sse<P extends string = string, Q = QueryParams, O extends SseOptions = SseOptions>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): EventStream<O extends { parse: (data: never) => infer R }
		? Awaited<R>
		: O extends { as: "json" }
			? unknown
			: string>
	/**
	 * Creates a WebSocket to the path, with `base` and the query serializer of the client, where `http:` becomes `ws:`.
	 * Type the messages by annotating the variable, `const socket: Socket<Message, Command> = api.ws(...)`, or with `parse`.
	 * @example
	 * const socket: Socket<Message, Command> = api.ws("/rooms/:id", { id }, { params: async () => ({ token: await getToken() }) })
	 * socket.send({ type: "join" })
	 * for await (const message of socket) render(message)
	 */
	ws<T = unknown, S = SocketData, P extends string = string, Q = QueryParams, O extends SocketOptions<S> = SocketOptions<S>>(
		path: P,
		...args: ParamsArgs<P, O, Q, B>
	): Socket<O extends { parse: (data: never) => infer R } ? Awaited<R> : T, S>
}
export interface HttpFunction {
	/**
	 * Creates a client with shared config, whose requests resolve with the parsed data.
	 * @example
	 * const api = http({ base: "https://api.example.com", timeout: 10000 })
	 * const user: User = await api.get("/users/:id", { id: 1 })
	 */
	<const B extends string = string>(config?: HttpConfig & { base?: B | undefined }): Http<PathParams<B>>
}
export type NodeStatus = "cancelled" | "done" | "failed" | "idle" | "pending" | "running" | "skipped" | "waiting"
export type FlowStatus = "cancelled" | "done" | "failed" | "running" | "waiting"
declare const flow_brand: unique symbol
declare const goto_brand: unique symbol
declare const input_brand: unique symbol
declare const skip_brand: unique symbol
declare const context_brand: unique symbol
/** Returned by `context.goto()`. */
export type Goto = { readonly [goto_brand]: true }
/** Returned by `context.skip()`. */
export type Skip = { readonly [skip_brand]: true }
/** A node that waits for `run.send(input, value)`. */
export interface Input<V> {
	readonly [input_brand]: V
	readonly name: string
}
interface FlowNode<V> {
	readonly [flow_brand]: V
}
/**
 * A node of a flow: a function, an input, a flow or a stream. A stream, such as a `channel()` or a socket,
 * is an input that every run reads from its start until `run.cancel()`.
 */
export type Ref<V = unknown> = ((...args: never[]) => V) | Input<V> | FlowNode<V> | AsyncIterable<V>
declare const arrive_brand: unique symbol
/**
 * A dependency with its own rule for when it arrives again, from `flow.queue()`,
 * `flow.restart()` or `flow.keep()`, instead of following the node's `overlap`.
 */
export type DependencyPolicy<R extends Ref = Ref, P extends "keep" | "queue" | "restart" = "keep" | "queue" | "restart"> = { readonly [arrive_brand]: [R, P] }
/** A dependency of a node: another node, or one wrapped with `flow.queue()`, `flow.restart()` or `flow.keep()`. */
export type Dep<V = unknown> = DependencyPolicy<Ref<V>> | Ref<V>
type Clean<V> = Exclude<Awaited<V>, Goto | Skip>
type Result<V> = 0 extends 1 & V
	? V
	: [Clean<V>] extends [never]
		? undefined
		: [Clean<V>] extends [void]
			? undefined
			: Clean<V>
type EdgeKey<T> = T extends string | number | boolean | bigint | null | undefined ? `${T}` : never
type EdgeMap<T> = unknown extends T
	? { readonly [key: string]: Ref }
	: [Exclude<T, string | number | boolean | bigint | null | undefined>] extends [never]
		? { readonly [K in EdgeKey<T>]: Ref }
		: { "A result that is not a string, number or boolean has no key to map: select the key with a function": never }
/** The value that a node passes to its dependents. */
export type ValueOf<R> = R extends DependencyPolicy<infer W, "keep" | "queue" | "restart">
	? ValueOf<W>
	: R extends Input<infer V>
		? V
		: R extends FlowNode<infer V>
			? V
			: R extends (...args: never[]) => infer V
				? Result<V>
				: R extends AsyncIterable<infer V>
					? V
					: never
type Values<D extends readonly unknown[]> = { -readonly [K in keyof D]: ValueOf<D[K]> }
type MaybeValues<D extends readonly unknown[]> = { -readonly [K in keyof D]: ValueOf<D[K]> | undefined }
declare const each_brand: unique symbol
/**
 * A node made with `flow.each()`, which runs for every item of its first dependency.
 * An async iterable, e.g. `as: "ndjson"`, is read to its end before the items run, so it must be finite.
 */
export type Each<T, A extends unknown[], V> = ((items: Iterable<T> | AsyncIterable<T> | null | undefined, ...args: A) => Promise<V[]>) & {
	readonly [each_brand]: T
}
export type NodeContext<S = unknown> = {
	readonly [context_brand]?: true
	/** 1 for the first attempt. */
	attempt: number
	/**
	 * Return it to go to other nodes: they run again with their dependents.
	 * This node counts as skipped, so its dependents do not run unless they join any.
	 * A node reached only by `goto()` must be the target of an edge or a fallback, or it starts with the flow.
	 */
	goto(...targets: (Ref | readonly Ref[])[]): Goto
	/** The index of the item, for a node made with `flow.each()` and for the nodes of a sub-flow that `flow.each()` runs. */
	index: number | undefined
	/**
	 * A key of this run of the node, or of the item for `flow.each()`, to send as `idempotent` so that a request is made once:
	 * the ID of the run, the node and how many times it has started. It stays the same through `retry`, `run.retry()` and
	 * a resumed snapshot, even one saved before the key was read, and changes when the node runs again for new arguments.
	 */
	key: string
	name: string
	/** The result before the node was reset. */
	previous: unknown
	/** Aborted when the node is reset, times out or loses a race, or the run fails or is cancelled. */
	signal: AbortSignal
	/** Return it to skip the node: its dependents are skipped too, unless they join any. */
	skip(): Skip
	/** Sleeps, and rejects as soon as the node is cancelled. A resumed snapshot sleeps only for the time that was left. */
	sleep(ms: number): Promise<void>
	state: S
}
/**
 * What a node does when it is started again while it is still running, e.g. because a dependency was updated:
 * "restart" cancels the run when the new arguments arrive and starts again with them, "ignore" ignores the update,
 * "rerun" finishes and then runs once more with the latest arguments, and "queue" runs once for every update, in order.
 * On a flow node it applies to the whole sub-flow. `run.reload(node)` always restarts.
 */
export type Overlap = "ignore" | "queue" | "rerun" | "restart"
type WithoutContext<A extends unknown[]> = A extends [...infer R, NodeContext] ? R : A
type CommonOptions<S, A extends unknown[]> = {
	/**
	 * "all" runs when every dependency is done, "any" when at least one is done and the rest are settled,
	 * "race" as soon as one is done, and cancels the rest with the nodes that only they need, e.g. the loop that an answer waits for.
	 */
	join?: "all" | "any" | "race"
	/** The name in `run.nodes`, `run.results` and snapshots. Default: the function name. */
	name?: string
	/** Positive milliseconds for each attempt, or for waiting for an input. */
	timeout?: number
	/** The node is skipped unless it returns true. When it throws, the node fails with the error, which `retry`, `catch`, `fallback` and `optional` handle. */
	when?: (...args: [...A, { state: S }]) => boolean
}
type FailureOptions<C, Handler> = {
	catch?: never
	fallback?: never
	/** The flow continues without the result when the node fails, and its dependents receive undefined. */
	optional?: boolean
} | {
	/** Returns a fallback result when the node fails, or `goto()` to an error branch, or `skip()`. */
	catch?: Handler
	fallback?: never
	optional?: false
} | {
	catch?: never
	/**
	 * The nodes to go to when the node fails after its retries. They do not start with the flow
	 * unless they are dependencies of the node, and they are skipped when the node succeeds.
	 */
	fallback?: Ref | readonly Ref[]
	optional?: false
}
export type NodeOptions<S, A extends unknown[], C = unknown> = CommonOptions<S, A>
	& FailureOptions<C, (error: unknown, ...args: [...A, NodeContext<S>]) => C>
	& {
		/**
		 * When a race no longer needs the node, e.g. a cancel input wins, a run of it that has started finishes instead of being aborted,
		 * so a payment that was sent keeps its result in `run.get()` and passes it to the dependents that still run, such as a refund
		 * that joins any. It does not follow its edges then, also after resuming a snapshot, and a failure only goes to `errors` and
		 * releases the resources that only it used with the error. Otherwise the node runs as without it.
		 */
		finish?: boolean
		/** How many updates `overlap: "queue"` or a `flow.queue()` dependency keeps waiting. The oldest is dropped above it, never the value in use. Default: Infinity. */
		limit?: number
		/**
		 * What a full queue does: "drop" the oldest update, or "wait": stop reading the stream dependencies
		 * until there is room, so a generator or a streamed response pauses. "wait" needs a stream as a dependency,
		 * and `run.send()` still drops. Default: "drop".
		 */
		overflow?: "drop" | "wait"
		/** What the node does when it is started again while it is running. Default: "restart". */
		overlap?: Overlap
		/** How many times the node runs again after failing. A flow as the node continues from where it failed, keeping its finished nodes. */
		retry?: number | RetryOptions
	}
/** The options of a node made with `flow.each()`. Retries, timeouts, `catch` and `optional` apply to each item. */
export type EachOptions<S, D extends unknown[], T, A extends unknown[], C = unknown> = CommonOptions<S, D>
	& FailureOptions<C, (error: unknown, item: T, ...args: [...WithoutContext<A>, NodeContext<S>]) => C>
	& {
		/** How many items run at the same time. Default: Infinity. */
		concurrency?: number
		/** When a race no longer needs the node, the items that have started finish instead of being aborted, as for a node. */
		finish?: boolean
		/** How many updates `overlap: "queue"` or a `flow.queue()` dependency keeps waiting. The oldest is dropped above it, never the value in use. Default: Infinity. */
		limit?: number
		/** What a full queue does: "drop" the oldest update, or "wait" until there is room to read the stream dependencies, which it needs. Default: "drop". */
		overflow?: "drop" | "wait"
		overlap?: Overlap
		retry?: number | RetryOptions
	}
export type InputOptions<S, A extends unknown[], C = unknown> = CommonOptions<S, A>
	& FailureOptions<C, (error: unknown, ...args: [...A, NodeContext<S>]) => C>
type Optional = { catch?: undefined, optional: true }
type Caught<T> = T | Goto | Skip | PromiseLike<T | Goto | Skip>
/**
 * `limit` bounds a queue, so it needs `overlap: "queue"` or a `flow.queue()` dependency.
 */
type QueueOptions<D extends readonly unknown[]> = [Extract<D[number], DependencyPolicy<Ref, "queue">>] extends [never]
	? { limit?: never, overflow?: never, overlap?: Exclude<Overlap, "queue"> } | { limit?: number, overlap: "queue" }
	: { limit?: number, overlap?: Overlap }
type ReleaseOption<V> = {
	/**
	 * Called once for each result that is no longer used, e.g. to commit or roll back a transaction or to close a connection:
	 * without an error when the run is done, which waits for it and fails if it throws, with the error when the run fails
	 * or is cancelled, and with a CancelError when the node runs again or a race skips all its dependents. A run started again gets a new result,
	 * and runs its dependents again after a release with an error. The result is not kept in snapshots.
	 */
	release?: (value: V, error: unknown) => unknown
}
declare const node_snapshot_brand: unique symbol
/** The progress of one node in a `FlowSnapshot`. Its content is internal and may change: store it and pass it back as it is. */
export type NodeSnapshot = { readonly [node_snapshot_brand]?: never }
/** The progress of a run. Store it, e.g. as JSON, and pass it to `flow.run(state, { snapshot })` to resume. */
export type FlowSnapshot = {
	errors: Record<string, unknown>
	/** The ID of the run, which the keys of its nodes start with. */
	id?: string
	nodes: Record<string, NodeSnapshot>
	/** The format of the snapshot. `run(state, { snapshot })` throws for another one. */
	version: 1
}
/**
 * A run of a flow. Await it for the result of the last added node. A failure that nobody handles is an unhandled rejection.
 * Once the run has `subscribe` or `idle`, no failure is, and once it has `catch` or `then` with a rejection handler, a failure after a stream started it again is not: read `status` and `errors`.
 */
export interface FlowRun<S, V> extends PromiseLike<V> {
	/** Cancels the running nodes and rejects with CancelError. */
	cancel(reason?: unknown): void
	catch<R = never>(on_rejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<V | R>
	/**
	 * The errors of failed nodes and items, including optional and caught ones, as `node` or `node.index`,
	 * and the errors inside sub-flows as `node.sub_node` or `node.index.sub_node`.
	 * An error goes with its node's result: a node that runs again, e.g. in the next round of a loop, drops it, so log failures with `trace`.
	 * The same object until the next change. Do not change it.
	 */
	readonly errors: Record<string, unknown>
	finally(on_finally?: (() => void) | null): Promise<V>
	/** The result of the node so far. */
	get<const R extends Ref>(node: R): ValueOf<R> | undefined
	/** Resolves when no node is running: the run is done, failed or cancelled, or waits for an input. It never rejects. */
	idle(): Promise<void>
	/**
	 * The status of every node, including the nodes of running sub-flows as `node.sub_node` or `node.index.sub_node`.
	 * A node that failed and went to its `fallback` or `goto()` is `"skipped"`, and `errors` keeps its error.
	 * The same object until the next change, so it fits `useSyncExternalStore`. Do not change it.
	 */
	readonly nodes: Record<string, NodeStatus>
	/**
	 * How many updates a node has not finished: the one that runs and the ones that `overlap: "queue"` or a `flow.queue()` dependency keeps waiting,
	 * or a node of a sub-flow as `node.sub_node`, which is 0 while the sub-flow does not run. Read it to slow a producer that sends faster than the node runs.
	 */
	pending(node: Ref | string): number
	/**
	 * Runs the node again with its dependents, or the whole flow without a node,
	 * or a node of a running sub-flow as `node.sub_node` or `node.index.sub_node`, which is ignored while the sub-flow does not run.
	 */
	reload(node?: Ref | string): void
	/** The results so far by node name. The same object until the next change. Do not change it. */
	readonly results: Record<string, unknown>
	/**
	 * Runs the failed nodes and the failed optional items again, also inside sub-flows, keeping every result that succeeded.
	 * They get all their retries again.
	 */
	retry(): void
	/**
	 * Sends a value to an input node, or to an input of a sub-flow as `node.input` or `node.index.input`,
	 * which an item that has not started yet gets when it starts and a failed sub-flow gets when `retry()` continues it.
	 * A value sent to a sub-flow or an item that is done is ignored, since its result is final.
	 * Sending to an input that is already done runs its dependents again. A value sent while the `catch` of its timeout runs is ignored,
	 * and so is one sent to an input that a race skipped, e.g. a close button after confirm won, also when the input waits again later.
	 */
	send<T>(input: Input<T>, value: T): void
	send(path: string, value: unknown): void
	/**
	 * The progress to resume with `flow.run(state, { snapshot })`.
	 * Throws when a node, also of a sub-flow, is named by its place: an anonymous function, a flow,
	 * a stream, an input without a name or a name with a suffix such as `_2`. Give those a `name` option.
	 */
	snapshot(): FlowSnapshot
	readonly state: S
	readonly status: FlowStatus
	/**
	 * The results of a node as a stream, one per run that is done, so that a node which runs again and
	 * again is read with `for await`. Only `cancel()` ends it, also after the run settled, since `send`, `reload` and `retry`
	 * run a settled run again: `run.then(() => run.cancel(), () => run.cancel())` ends it with the run.
	 */
	stream<const R extends Ref>(node: R): AsyncIterable<ValueOf<R>>
	/**
	 * Calls the listener after every change of a node, a result or an error, including inside sub-flows,
	 * at once after `send`, `reload` and `retry` and at most once per microtask otherwise, and returns the function that stops it. Its errors are ignored.
	 * With `nodes`, `results` and `errors` it is a store: `useSyncExternalStore(run.subscribe, () => run.nodes)`.
	 */
	subscribe(listener: () => void): () => void
	then<A = V, B = never>(
		on_fulfilled?: ((value: V) => A | PromiseLike<A>) | null,
		on_rejected?: ((reason: unknown) => B | PromiseLike<B>) | null
	): Promise<A | B>
}
type RunArgs<S> = undefined extends S
	? [state?: S, options?: RunOptions]
	: [state: S, options?: RunOptions]
export type RunOptions = {
	/**
	 * The ID of the run, which the keys of its nodes start with, e.g. the key of the request that it serves.
	 * Save it before the run starts, and a run resumed after a crash repeats the keys of its nodes. Default: a random ID.
	 */
	id?: string | undefined
	signal?: AbortSignal
	/**
	 * Resumes from `run.snapshot()`: the settled nodes keep their results, and the rest run again.
	 * A node that failed the run runs again with all its retries, as `run.retry()` runs it.
	 * The run takes the ID of the snapshot, so an `id` must be the same.
	 */
	snapshot?: FlowSnapshot
	/**
	 * Called for every attempt of a node and every skipped node, including the nodes of sub-flows as `sub.node`,
	 * e.g. to log them or to make OpenTelemetry spans. Its errors are ignored.
	 */
	trace?: ((event: TraceEvent) => void) | undefined
}
/** What a node did, for `trace`. `time` and `duration` are milliseconds, and `index` is the one that `context.index` has. */
export type TraceEvent = { attempt: number, index: number | undefined, node: string, time: number } & (
	| { type: "skip" | "start" }
	| { duration: number, type: "cancel" | "done" }
	| { duration: number, error: unknown, retry: boolean, type: "fail" }
)
type SubState<S, D extends readonly unknown[]> = D extends readonly []
	? S
	: D extends readonly [infer X]
		? ValueOf<X>
		: Values<D>
type NodeOptionKey = "catch" | "fallback" | "finish" | "join" | "limit" | "name" | "optional" | "overflow" | "overlap" | "release" | "retry" | "timeout" | "when"
type RunValues<A extends readonly unknown[]> = A extends readonly Dep[]
	? Values<A>
	: A extends readonly [...infer D extends readonly Dep[], infer O]
		? O extends { join: "any" | "race" }
			? MaybeValues<D>
			: Values<D>
		: unknown[]
type CheckOptions<S, D extends readonly Dep[], O, R> = [Exclude<keyof O, NodeOptionKey>] extends [never]
	? O extends { join: "any" | "race" }
		? NodeOptions<S, MaybeValues<D>> & QueueOptions<D> & ReleaseOption<Result<R>>
		: NodeOptions<S, Values<D>> & { join?: "all" } & QueueOptions<D> & ReleaseOption<Result<R>>
	: { [K in keyof O]: K extends NodeOptionKey ? O[K] : "Unknown option of a flow node" }
type NodeArgs<S, A extends readonly unknown[], R, F> = A extends readonly Dep[]
	? A
	: A extends readonly [...infer D extends readonly Dep[], infer O]
		? [F] extends [Input<infer T>]
			? [...D, O extends { optional: true }
				? InputOptions<S, Values<D>> & Optional
				: InputOptions<S, Values<D>, Caught<T>>]
			: [...D, CheckOptions<S, D, O, R>]
		: { [K in keyof A]: A[K] extends Dep ? A[K] : Dep }
type DepsOf<A extends readonly unknown[]> = A extends readonly Dep[]
	? A
	: A extends readonly [...infer D extends readonly Dep[], unknown]
		? D
		: []
type CheckNode<S, A extends readonly unknown[], R, F> = [F] extends [Flow<infer SS, unknown>]
	? CheckState<SubState<S, DepsOf<A>>, SS>
	: [F] extends [Input<unknown> | AsyncIterable<unknown>]
		? unknown
		: ((...args: [...RunValues<A>, NodeContext<S>]) => R) & CheckContext<RunValues<A>["length"], F>
type CheckContext<N extends number, F> = F extends (...args: infer P) => unknown
	? `${N}` extends keyof P
		? typeof context_brand extends keyof NonNullable<P[N]>
			? unknown
			: { "Add the missing dependency, or type the last parameter as NodeContext": never }
		: unknown
	: unknown
type CheckState<Given, Expected> = [Given] extends [Expected]
	? unknown
	: { "The state of the sub-flow does not match": Given }
export interface Flow<S = unknown, V = undefined> extends FlowNode<V> {
	/**
	 * Adds a flow as a node. Its state is the result of its only dependency, the results of its dependencies,
	 * or the state of this flow without dependencies.
	 */
	add<const D extends readonly Dep[], SS, SV>(
		sub: Flow<SS, SV> & CheckState<SubState<S, D>, SS>,
		...deps: D
	): Flow<S, SV>
	add<const D extends readonly Dep[], SS, SV>(
		sub: Flow<SS, SV> & CheckState<SubState<S, D>, SS>,
		...args: [...D, NodeOptions<S, Values<D>> & Optional & QueueOptions<D> & ReleaseOption<SV>]
	): Flow<S, SV | undefined>
	add<const D extends readonly Dep[], SS, SV, C = never>(
		sub: Flow<SS, SV> & CheckState<SubState<S, D>, SS>,
		...args: [...D, NodeOptions<S, Values<D>, C> & QueueOptions<D> & ReleaseOption<SV>]
	): Flow<S, [C] extends [never] ? SV : SV | Result<C>>
	/**
	 * Adds an input node, which waits for `run.send(input, value)` after its dependencies.
	 * Its `catch` returns a value of the input, so declare what it returns in the type of the input,
	 * e.g. `flow.input<boolean | "timeout">("accept")` with `{ catch: () => "timeout", timeout }`.
	 */
	add<const D extends readonly Dep[], T>(input: Input<T>, ...deps: D): Flow<S, T>
	add<const D extends readonly Dep[], T>(input: Input<T>, ...args: [...D, InputOptions<S, Values<D>> & Optional]): Flow<S, T | undefined>
	add<const D extends readonly Dep[], T>(
		input: Input<T>,
		...args: [...D, InputOptions<S, Values<D>, Caught<T>>]
	): Flow<S, T>
	/**
	 * Adds a stream, such as a `channel()`, a socket or `run.stream(node)`, as an input that gets every value it yields.
	 * Each run reads it from its start, or from the start of the sub-flow node, until `run.cancel()`;
	 * the input is skipped when the stream ends without a value and fails when the stream throws.
	 */
	add<const D extends readonly Dep[], T>(stream: AsyncIterable<T>, ...deps: D): Flow<S, T>
	add<const D extends readonly Dep[], T>(stream: AsyncIterable<T>, ...args: [...D, InputOptions<S, Values<D>> & Optional]): Flow<S, T | undefined>
	add<const D extends readonly Dep[], T, C = never>(
		stream: AsyncIterable<T>,
		...args: [...D, InputOptions<S, Values<D>, C>]
	): Flow<S, [C] extends [never] ? T : T | Result<C>>
	add<const D extends readonly [Dep, ...Dep[]], T, A extends unknown[], R>(
		run: Each<T, A, R> & ((...args: [...Values<D>, NodeContext<S>]) => unknown),
		...args: [...D, EachOptions<S, Values<D>, T, A> & Optional & QueueOptions<D> & ReleaseOption<(R | undefined)[]>]
	): Flow<S, (R | undefined)[]>
	add<const D extends readonly [Dep, ...Dep[]], T, A extends unknown[], R, C = never>(
		run: Each<T, A, R> & ((...args: [...Values<D>, NodeContext<S>]) => unknown),
		...args: [...D, EachOptions<S, Values<D>, T, A, C> & QueueOptions<D> & ReleaseOption<(R | undefined)[]>]
	): Flow<S, ([C] extends [never] ? R : R | Result<C>)[]>
	/** Adds a node made with `flow.each()` without dependencies, which runs for every item of the state. */
	add<T, A extends unknown[], R>(
		run: Each<T, A, R>,
		...args: [options: EachOptions<S, [], T, A> & Optional & QueueOptions<[]> & ReleaseOption<(R | undefined)[]>]
	): Flow<S, (R | undefined)[]>
	add<T, A extends unknown[], R, C = never>(
		run: Each<T, A, R>,
		...args: [options?: EachOptions<S, [], T, A, C> & QueueOptions<[]> & ReleaseOption<(R | undefined)[]>]
	): Flow<S, ([C] extends [never] ? R : R | Result<C>)[]>
	add<const D extends readonly Dep[], R, F>(
		run: F & ((...args: [...MaybeValues<D>, NodeContext<S>]) => R) & CheckContext<D["length"], F>,
		...args: [...D, NodeOptions<S, MaybeValues<D>> & Optional & { join: "any" | "race" } & QueueOptions<D> & ReleaseOption<Result<R>>]
	): Flow<S, Result<R> | undefined>
	add<const D extends readonly Dep[], R, F>(
		run: F & ((...args: [...Values<D>, NodeContext<S>]) => R) & CheckContext<D["length"], F>,
		...args: [...D, NodeOptions<S, Values<D>> & Optional & { join?: "all" } & QueueOptions<D> & ReleaseOption<Result<R>>]
	): Flow<S, Result<R> | undefined>
	add<const D extends readonly Dep[], R, F, C = never>(
		run: F & ((...args: [...MaybeValues<D>, NodeContext<S>]) => R) & CheckContext<D["length"], F>,
		...args: [...D, NodeOptions<S, MaybeValues<D>, C> & { join: "any" | "race" } & QueueOptions<D> & ReleaseOption<Result<R>>]
	): Flow<S, Result<R | C>>
	add<const D extends readonly Dep[], R, F, C = never>(
		run: F & ((...args: [...Values<D>, NodeContext<S>]) => R) & CheckContext<D["length"], F>,
		...args: [...D, NodeOptions<S, Values<D>, C> & { join?: "all" } & QueueOptions<D> & ReleaseOption<Result<R>>]
	): Flow<S, Result<R | C>>
	/**
	 * Adds a function as a node. It runs with the results of its dependencies as arguments, followed by the context,
	 * after they are done, whatever order they were added in. The flow resolves with the result of the last added node.
	 */
	add<const A extends readonly unknown[], R, F>(
		run: F & CheckNode<S, A, R, F>,
		...deps: NodeArgs<S, A, R, F>
	): Flow<S, Result<R>>
	/**
	 * The problems of the flow without running it: a circular dependency, a node that never starts
	 * because nothing that runs goes to it, a race against a stream or a node that a stream runs again for every value,
	 * which ends the race with the first value, `finish` on a node that no race can abandon, and a node, also of a sub-flow,
	 * named by its place, which a snapshot cannot find after the code changes, as `run.snapshot()` throws for it.
	 * Empty when the flow is fine, e.g. `assert.deepEqual(checkout.check(), [])`.
	 */
	check(): string[]
	/**
	 * After the node is done, goes to the target, to every target of an array,
	 * or to the target mapped from the result, e.g. `{ true: a, false: b }`. Targets that are not selected are skipped.
	 * A map needs a key for every result, and a result without one fails the run with FlowError.
	 */
	edge<const F extends Ref>(from: F, to: Ref | readonly Ref[] | EdgeMap<ValueOf<F>>): Flow<S, V>
	/**
	 * After the node is done, goes to the targets that the function selects from the listed targets, or nowhere for null.
	 * A function that throws or selects another node fails the run with FlowError, whatever the options of the node.
	 */
	edge<const F extends Ref, const T extends readonly Ref[]>(
		from: F,
		targets: T,
		select: (result: ValueOf<F>, context: { state: S }) => T[number] | readonly T[number][] | null | undefined
	): Flow<S, V>
	/**
	 * After the node is done, goes to the nodes of the keys that the function selects, or nowhere for null,
	 * e.g. `edge(judge, { answer, "ask the user": ask }, result => result.verdict)`.
	 * A function that throws or selects another key fails the run with FlowError, whatever the options of the node.
	 */
	edge<const F extends Ref, const M extends { readonly [key: string]: Ref }>(
		from: F,
		map: M,
		select: (result: ValueOf<F>, context: { state: S }) => keyof M | readonly (keyof M)[] | null | undefined
	): Flow<S, V>
	/**
	 * A Mermaid flowchart of the nodes, the dependencies (solid) and the edges and fallbacks (dotted, or solid with their label when the target is a dependent).
	 * A node names its `join`, `finish` and `overlap` other than the default, e.g. `decide (join: race)`, and a dependency is labeled `queue`, `keep` or `restart` for `flow.queue()`, `flow.keep()` or `flow.restart()`.
	 */
	mermaid(): string
	run(...args: RunArgs<S>): FlowRun<S, V>
}
export interface FlowFunction {
	/**
	 * Creates a flow of plain async functions. A node runs with the results of its dependencies as arguments,
	 * in topological order, and edges choose the next nodes, so that branches and loops read like a flowchart.
	 */
	<S = unknown>(options?: {
		/** How many nodes run at the same time, a positive integer or Infinity. Default: Infinity. */
		concurrency?: number
		/** How many node runs are allowed per cycle before the flow fails, e.g. to catch a wrong loop. Default: Infinity. */
		maxSteps?: number
	}): Flow<S, undefined>
	/**
	 * Makes a node that runs for every item of its first dependency, with the item in place of the dependency,
	 * or a sub-flow for every item as its state. The result is the array of the results.
	 */
	each<S, V>(sub: Flow<S, V>): Each<S, [], V>
	each<T, A extends unknown[], R>(run: (item: T, ...args: A) => R): Each<T, A, Result<R>>
	/** Creates an input node, which waits for `run.send(input, value)`. */
	input<V = unknown>(name?: string): Input<V>
	/** Keeps the newest value of a dependency for the next run, also a restart, without touching the run that is going. */
	keep<R extends Ref>(dependency: R): DependencyPolicy<R, "keep">
	/** Keeps every value of a dependency and takes one per run, so that nothing is lost while the node runs. */
	queue<R extends Ref>(dependency: R): DependencyPolicy<R, "queue">
	/**
	 * Starts the run again with the newest value of a dependency. The others keep their values, except that a `flow.keep()`
	 * dependency gives the value it stored meanwhile, since the restart is the next run.
	 */
	restart<R extends Ref>(dependency: R): DependencyPolicy<R, "restart">
}
/**
 * An error as a run keeps it: its name, its message, its `cause` when that is an Error, and its own properties that are
 * JSON values, e.g. `status`, `data` and `request` of an HttpError, `code` or `timeout`, and the headers of an HttpError.
 * It is thrown again as an instance of the class of its name: CancelError, FlowError, HttpError, NetworkError, SocketError,
 * TimeoutError or a built-in Error class such as TypeError, and otherwise an Error with that name.
 */
export type SavedError = {
	cause?: SavedError | undefined
	message: string
	name: string
	[field: string]: unknown
}
/** One `step`, `sleep` or `wait` of a run, in the order the function reached it. */
export type JournalEntry = {
	done: boolean
	/** The error of a `step` that threw, thrown again when the run runs again. */
	error?: SavedError | undefined
	name: string
	timed_out?: boolean | undefined
	type: "sleep" | "step" | "wait"
	/** When a `sleep` ends or a `wait` times out, in milliseconds since the epoch. */
	until?: number | undefined
	/** The result of a `step`, or the value that a `wait` got. */
	value?: unknown
}
/** A run as a store keeps it: JSON, since the input, the results of the steps, the values sent and the result must be JSON values. */
export type SavedRun = {
	error?: SavedError | undefined
	/** Values sent before the run waited for them, by the name of the wait, with the time each arrived. */
	events?: Record<string, { at: number, value: unknown }[]> | undefined
	/** Values sent while another worker held the run, which it takes on its next write or when it takes the run. */
	inbox?: { at: number, name: string, value: unknown }[] | undefined
	input: unknown
	journal: JournalEntry[]
	/** When the lease of the owner ends, in milliseconds since the epoch. */
	lease?: number | undefined
	/** The worker that runs it. */
	owner?: string | undefined
	result?: unknown
	revision?: number | undefined
	status: "cancelled" | "done" | "failed" | "pending" | "running" | "sleeping" | "waiting"
	/** Increased by every write, so that a write of a worker that lost the run fails. */
	version: number
	/** When a sleeping or waiting run wakes, in milliseconds since the epoch. */
	wake?: number | undefined
}
/**
 * Where runs are kept by key. `put` writes only when the version in the store is `expected`,
 * or when there is no run for `undefined`, and returns whether it wrote. `due` returns the keys of runs that a worker
 * should pick up: running without a live lease, or sleeping or waiting until a time that has come.
 * A `put` or `get` that throws, e.g. on a busy database, is tried again while the lease of the run lasts; a worker that cannot
 * renew it in time aborts the `signal` of the run and leaves it to the next worker, and `send` and `cancel` reject with the error.
 */
export type DurableStore = {
	due(now: number, limit: number): string[] | PromiseLike<string[]>
	get(key: string): SavedRun | undefined | PromiseLike<SavedRun | undefined>
	put(key: string, run: SavedRun, expected: number | undefined): boolean | PromiseLike<boolean>
}
/**
 * `T` itself when it is a JSON value, as a durable run keeps it: plain objects, arrays, strings, finite numbers, booleans and null.
 * For a type that JSON would change, e.g. a Date, a Map or a BigInt, it is a type that `T` does not match,
 * so `durable()` rejects such an input or result, and `step`, `wait` and `send` such a value.
 */
export type DurableJson<T> = unknown extends T
	? T
	: T extends string | number | boolean | null | undefined | void
		? T
		: T extends bigint | symbol | ((...args: never[]) => unknown) | Error
			? never
			: T extends readonly unknown[]
				? { readonly [K in keyof T]: DurableJson<Exclude<T[K], undefined>> }
				: { readonly [K in keyof T]: DurableJson<T[K]> }
type JsonName<T, M> = [T] extends [DurableJson<T>] ? string : M
type StepResult<T> = [T] extends [DurableJson<T>]
	? unknown
	: "The result of a step must be a JSON value"
export type DurableContext = {
	/** The key of the run. */
	key: string
	/**
	 * Aborted when the run is cancelled, its worker stops, another worker took it or the store failed until its lease ended,
	 * with a CancelError. Once it is aborted, `step`, `sleep` and `wait` reject with that error instead of starting.
	 */
	signal: AbortSignal
	/**
	 * Waits, also across restarts. A sleep longer than `idle` saves the run and leaves memory,
	 * and a worker of `serve()` wakes it. `ms` is a finite number from 0, or it rejects with a TypeError.
	 */
	sleep(name: string, ms: number): Promise<void>
	/**
	 * Runs the function once for the run: a result that was saved is returned without running it again.
	 * `key` is the same every time the step runs, e.g. after a crash, so pass it as an idempotency key.
	 * A step that throws is saved too: when the run runs again, it throws the error again without running, as an instance
	 * of the same class with the same message and JSON fields (see `SavedError`), so a function that catches it takes the same path. Only the step whose error failed the run,
	 * thrown by the function or as the `cause` of its error, runs again with what followed it, and only when no
	 * `step`, `sleep` or `wait` was reached after the error, e.g. to compensate: such a run fails the same way again.
	 * The result must be a JSON value, e.g. an ISO string instead of a Date, or the step fails with a TypeError.
	 */
	step<T>(name: string, fn: ((context: { key: string, signal: AbortSignal }) => T) & StepResult<Awaited<T>>): Promise<Awaited<T>>
	/**
	 * Waits for a value that `send(key, name, value)` sends, or rejects with TimeoutError after `timeout` milliseconds
	 * or at `until`, a time in milliseconds since the epoch, whichever comes first. A value that arrives after that stays
	 * for the next `wait` of its name. A run that failed by the `timeout` waits a whole `timeout` again when it runs again,
	 * and one that failed by `until` fails again at once, since that time has passed. The message of the TimeoutError names
	 * the `timeout`, or the `until` as an ISO time when that came first. `timeout` is a finite number from 0, where 0
	 * takes only a value that was sent before, or it rejects with a TypeError.
	 * The value is a copy: changing it changes nothing that the run keeps.
	 */
	wait<T = unknown>(name: JsonName<T, "The value of a wait must be a JSON value">, options?: { timeout?: number | undefined, until?: number | undefined }): Promise<T>
}
export type DurableOptions = {
	/**
	 * Milliseconds that a wait stays in memory before the run is saved and leaves it. A sleep longer than this leaves at once.
	 * Default: 1000.
	 */
	idle?: number | undefined
	/** Milliseconds of a lease, renewed while the run runs. Another worker takes a run whose lease ended. Default: 30000. */
	lease?: number | undefined
	/** Turns a run saved by another revision into one of this revision. Without it, such a run fails. */
	migrate?: ((run: SavedRun, revision: number | undefined) => SavedRun | PromiseLike<SavedRun>) | undefined
	/** The name of this worker in the leases. Default: a random ID. */
	owner?: string | undefined
	/**
	 * Milliseconds before a caller of `run` or `join` checks the store again for a run that has left this worker,
	 * doubled after every check up to a minute, or up to `poll` when it is longer, and never past the time the run is due. Default: 500.
	 */
	poll?: number | undefined
	/** The revision of the function, saved with its runs. Change it when the steps change. */
	revision?: number | undefined
}
export type ServeOptions = {
	/** The most runs that one look at the store picks up, a positive integer. Default: 100. */
	batch?: number | undefined
	/** Milliseconds between two looks at the store, a positive finite number. Default: 1000. */
	interval?: number | undefined
	/**
	 * Gets the errors that no caller of this worker gets: without a key, an error of the store while it looks for runs,
	 * which is tried again after `interval`, and with the key of the run, an error of the store while it takes the run,
	 * or the error that failed a run that this worker ran in the background, i.e. one it resumed, woke or took from another
	 * worker, or began with `start`. A run that is cancelled does not fail.
	 */
	onError?: ((error: unknown, key?: string) => void) | undefined
	/** Stops serving when it aborts, while the runs in memory go on. */
	signal?: AbortSignal | undefined
}
export interface Durable<I, R> {
	/**
	 * Cancels the run: its signal aborts, and it rejects with CancelError. A failed run is cancelled too, so that `run` rejects
	 * with CancelError instead of running it again. It does nothing for a run that is done or cancelled.
	 */
	cancel(key: string, reason?: unknown): Promise<void>
	/** The run as the store keeps it. */
	get(key: string): Promise<SavedRun | undefined>
	/**
	 * The result of the run of the key, which is joined, resumed or waited for, but never started or run again:
	 * it rejects with an Error when the key has no run, and with the error of a failed run.
	 */
	join(key: string): Promise<R>
	/**
	 * The result of the run of the key: a new run with the input, a finished one, or one that is resumed, joined or waited for.
	 * A failed run runs again from the step or `wait` whose error failed it, unless the function reached another step, sleep
	 * or wait after that error, e.g. to compensate: then it fails with the same error again. `input` is read only by a new run.
	 * It rejects with a TypeError when the input or the result is not a JSON value.
	 */
	run(...args: undefined extends I ? [key: string, input?: I] : [key: string, input: I]): Promise<R>
	/** The runs that this worker has in memory. */
	readonly running: number
	/**
	 * Sends a value to a `wait` of the run, now or when it gets there, also of a failed run that will run again,
	 * or of a key without a run, whose value waits for the run that `run` or `start` begins, while `join` of the key waits for it.
	 * It rejects with an Error when the run is done or cancelled, and with a TypeError when the value is not a JSON value, `undefined` included.
	 */
	send<T>(key: string, name: undefined extends T
		? unknown extends T
			? string
			: "The value sent must not be undefined"
		: JsonName<T, "The value sent must be a JSON value">, value: T): Promise<void>
	/**
	 * Picks up the runs that are due, e.g. after a restart or when a sleep ends, until `stop()` or the signal.
	 * It rejects with a TypeError for an option it does not know or a number out of range.
	 */
	serve(options?: ServeOptions): Promise<void>
	/**
	 * Starts a run with the input when the key has none, or the run whose values `send` kept before it, and resolves once
	 * it is saved, without waiting for its result: with true when it started the run, and false when the key has a run.
	 * It rejects with a TypeError when the input is not a JSON value.
	 */
	start(...args: undefined extends I ? [key: string, input?: I] : [key: string, input: I]): Promise<boolean>
	/** Stops this worker as a crash would: its runs stop without being saved, and other workers take them when their leases end. */
	stop(): void
}
/** The part of a SQLite database that `sqlite()` uses, as `node:sqlite` and better-sqlite3 have it. */
export type SqliteDatabase = {
	exec(sql: string): unknown
	prepare(sql: string): {
		all(...params: unknown[]): unknown[]
		get(...params: unknown[]): unknown
		run(...params: unknown[]): { changes: number | bigint }
	}
}
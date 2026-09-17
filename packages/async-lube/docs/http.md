# http
`http` wraps `fetch` with what an app adds around each request: path and query parameters, JSON, typed errors, timeouts, retries, token refresh, cancellation, deduplication, progress, server-sent events and WebSockets.

[Requests](#requests) · [Errors](#errors) · [Retry and token refresh](#retry-and-token-refresh) · [Races of the UI](#races-of-the-ui) · [Files and progress](#files-and-progress) · [Validation](#validation) · [Server-sent events](#server-sent-events) · [WebSockets](#websockets) · [Shared config and hooks](#shared-config-and-hooks) · [Caches and stores](#caches-and-stores) · [API tables](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/reference.md#http)

## Requests
```ts
import { http } from "async-lube"

const api = http({
    base: "https://api.example.com",
    credentials: "include",
    headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
    timeout: 10000
})

type User = { id: number, name: string }

const user: User = await api.get("/users/:id", { id: 1, expand: true }) // GET /users/1?expand=true
const created = await api.post<User>("/users", { name: "Kim" }) // JSON body
await api.put("/users/:id", form, { params: { id: 1 } }) // FormData, Blob, URLSearchParams and strings are sent as they are
await api.delete("/users/:id", { id: 1 })
await api.delete("/users", {}, { body: { ids: [1, 2] } }) // a body for DELETE goes in options.body
await api.post("/users/:id/follow", undefined, { params: { id: 1 } }) // no body, or api.request("POST", "/users/:id/follow", { params: { id: 1 } })

api.get("/users/:id") // Expected 2-3 arguments, but got 1.ts(2554): the path parameters are missing
```
- The data is `unknown` until it is typed. Annotate the variable, as `user` above, also `const orders: Promise<Order[]> = api.get(...)` for `Promise.all`, or pass the type to `safe<Order[]>()` or `raw<User>()`. A type argument such as `api.post<User>("/users", ...)` suits a path without parameters and query parameters that are not an interface: TypeScript cannot infer the path once a type argument is given, so it turns off the check of the path parameters, and it rejects interfaces as query parameters.
- Path parameters are URL-encoded, also in `base`, and `:name` after `?` or `#` is left as it is. The types check the parameters of `base` too: with `base: "https://api.example.com/orgs/:org"`, every relative path needs `org`.
- A path parameter that is missing, empty, `.` or `..`, a body for GET or HEAD, or a relative path without `base` outside a browser rejects with a `TypeError` before sending, and so do the loops of `sse()` and `ws()`, which do not reconnect after it. A `fetch` in the config gets a relative path as it is, e.g. in tests.
- The data is parsed by its `Content-Type` as JSON, text or a `Blob`, and `204 No Content` and `HEAD` resolve with `undefined`.


## Errors
```ts
import { HttpError, isCancel } from "async-lube"

try {
    await api.post("/orders", order)
} catch (error) {
    if (error instanceof HttpError) {
        error.status // 422
        error.data // unknown: the parsed error body, its text when it is not valid JSON, or a Blob when it is not text
        error.message // data.message, data.error, data.detail or data.title
    } else if (!isCancel(error)) throw error // cancelled, superseded or unmounted: nothing to show
}

const [error, orders] = await api.get("/orders").safe<Order[]>() // without try
const { data, headers, status } = await api.get("/me").raw<User>() // with the status and headers
```
| Error | When |
| --- | --- |
| `HttpError` | The status is not accepted: not 2xx, or `ok(response)` returned false |
| `NetworkError` | The request did not reach the server, offline, DNS or CORS, or the connection dropped while reading the body. The chunks of `as: "stream"` fail with the error of the runtime instead |
| `TimeoutError` | An attempt took longer than `timeout` |
| `CancelError` | `cancel()`, an aborted `signal`, `latest`, `debounce`, `throttle`, or all callers of a deduplicated request left |
| `SyntaxError` | The response is not valid JSON |
| `SocketError` | A WebSocket was closed with a code that is not reconnected, e.g. 1008 or 4001, or with a reconnected code, e.g. 1011, when `reconnect` is false, `reconnect.count` ran out or `reconnect.delay` returned undefined. A close with 1005 or 1006 is a dropped connection: a `NetworkError` whose `cause` is the `SocketError` |

## Retry and token refresh
```ts
const base = http({ base: "https://api.example.com", credentials: "include" })
const api = base.extend({
    // idempotent methods are retried on network errors, timeouts and 408, 425, 429, 500, 502, 503 and 504,
    // after a Retry-After of up to 60 seconds, or with exponential backoff and jitter; a longer Retry-After rejects at once
    retry: 2,
    // requests that fail with 401 at the same time share one refresh and are sent once more
    // send the refresh with a client without refresh, or a 401 of the refresh waits for itself
    // a request waits for it at most its own timeout more and then rejects with TimeoutError alone
    // a refresh that rejects rejects the waiting requests with their 401; after the client's timeout, or once every waiting
    // request left and one of them timed out, it counts as failed: its signal aborts, the requests still waiting reject
    // with TimeoutError, and the next 401 refreshes again
    refresh: signal => base.post("/auth/refresh", undefined, { signal }),
    on: {
        // the refresh failed or timed out with the reason, or the request failed with 401 again after it, with undefined
        unauthorized: (error, reason) => location.assign("/login")
    }
})
const downloads = api.extend({ retry: null, timeout: null }) // null removes a value of the parent

// POST and PATCH are retried only when the request itself asks for it, e.g. an AI API, or with an Idempotency-Key,
// which stays the same on every attempt: a retry of the client does not retry them, even with a when
await api.post("/completions", prompt, { retry: 2 })
await api.post("/payments", payment, { idempotent: true, retry: { count: 3, delay: attempt => attempt * 1000 } })

// delay is milliseconds, or a function that gets the delay of the default policy last: here a long Retry-After is waited for
// instead of rejecting, and undefined stops retrying
await api.get("/report", {}, { retry: { count: 3, delay: (attempt, error, fallback) => fallback ?? 120000 } })
```
- `retry` is `{ count, delay, when }` with the `RetryOptions` type that `attempt()` and flow nodes take too. For a request, `fallback` is the Retry-After or the backoff, and undefined when the Retry-After is longer than 60 seconds, which rejects at once by default. `sse()` and `ws()` reconnect instead, with `reconnect: { count, delay(failures, error, fallback) }`.

## Races of the UI
```ts
// search as you type: waits 300 ms, and a newer search cancels this one, so only the latest response resolves
const results: Item[] = await api.get("/search", { q }, { debounce: 300 })

// autosave: the superseded saves reject with CancelError, so fire and forget with safe()
editor.oninput = () => void api.put("/drafts/:id", editor.value, { debounce: 800, params: { id } }).safe()

// infinite scroll or a moving map: at most one request per 500 ms, and the last position is always loaded
const tiles: Tile[] = await api.get("/tiles", { x, y }, { throttle: 500 })

// tabs or filters: the request of the previous tab is cancelled when the next one starts
const page: Page = await api.get("/feed", { tab }, { latest: "feed" })

// a double-clicked submit button sends one request, and both clicks get its result
await api.post("/orders", cart, { lock: "checkout" })

// identical GET requests in flight share one request, e.g. from several components
await Promise.all([api.get("/me"), api.get("/me")])

// cancel on unmount
const request = api.get("/me")
request.cancel()
api.get("/me", {}, { signal: controller.signal })
```

## Files and progress
```ts
const { blob, name } = await api.get("/export", { month: "2025-01" }, {
    as: "file", // the name from Content-Disposition, in UTF-8, another charset of filename* or percent-encoded, or from the URL
    progress: ({ loaded, ratio, total }) => bar.set(ratio)
})

// raw bytes of an older Korean server are read as CP949, e.g. "㈜배달·영수증.pdf", "韓國支社_급여.xlsx" or "A형.pdf", unless they
// read as Latin-1 words such as "Müßig.txt" or "AÇÃO.txt"; the rare UHC syllables such as "똠" need a runtime that decodes them, as browsers do and Node.js does not

// upload progress uses XMLHttpRequest, so it is reported in browsers, and not with a fetch of the config;
// there it rejects a ReadableStream body with a TypeError
await api.post("/uploads", form, { upload: ({ ratio }) => bar.set(ratio) })

const text = await api.get("/terms", {}, { as: "text" })
const stream = await api.get("/big", {}, { as: "stream" }) // ReadableStream<Uint8Array<ArrayBuffer>>, or null without a body
const chunks = stream?.pipeThrough(new TextDecoderStream()) // the text as it arrives

// a ReadableStream body is streamed where the runtime supports it, e.g. Node.js, or Chromium over HTTP/2; it is sent once,
// so it is not retried, and a 401 waits for refresh and then rejects with the HttpError: send a new stream to try again
await api.put("/files/:id", file.stream(), { params: { id } })

// a streamed AI response: the JSON of each line as it arrives, and breaking the loop closes the connection
const tokens = await api.post("/chat", prompt, { as: "ndjson", parse: TokenSchema.parse }) // AsyncIterable<unknown> without parse
for await (const token of tokens) render(token)
// a line that is not valid JSON rejects the loop with SyntaxError after the lines before it:
// to skip such lines, read as: "stream" and split and parse the text yourself
```

## Validation
```ts
import { z } from "zod"

const UserSchema = z.object({ id: z.number(), name: z.string() })
const user = await api.get("/users/:id", { id }, { parse: UserSchema.parse }) // typed as z.infer<typeof UserSchema>
```

## Server-sent events
```ts
const events = api.sse("/rooms/:id/events", { id }, {
    onStatus: status => setOnline(status == "open"), // "connecting" also while it waits to reconnect
    signal: controller.signal // closes it for good, like cancel()
})

for await (const event of events) {
    event.event // "message"
    event.data // the text of the event
    if (done) break // closes the connection
}

for await (const event of events) {} // iterating again connects again with the last event ID
events.cancel() // closes it for good
events.lastEventId

// as: "json" parses the data of every event, and keeps text that is not valid JSON as a string
for await (const { data } of api.sse("/prices", {}, { as: "json" })) show(data) // unknown
// parse validates what as read, the text by default: an event that fails rejects the loop
for await (const { data } of api.sse("/prices", {}, { as: "json", parse: PriceSchema.parse })) show(data) // typed as z.infer<typeof PriceSchema>
// an async parse is awaited in the order of the events, and after an event that fails, iterating again continues after it
```
- When a stream ends, it reconnects with `Last-Event-ID` after the server's `retry` delay or 3 seconds. After a failure it waits for an exponential backoff, or for the whole `Retry-After` when that is longer, so a busy server that answers `Retry-After: 0` is not asked again at once and one that asks for ten minutes is asked again after ten minutes, while a request rejects at once when its Retry-After is longer than 60 seconds. Without a `Retry-After` it reconnects at once when the browser comes back online. `reconnect.delay` replaces the wait with milliseconds or `(failures, error, fallback) => milliseconds`, where `fallback` is the default, and is called only after failures, from 1.
- `reconnect.count` limits the failures in a row. A connection that drops after its events is a failure too, and a stream that ends or a connection that stays open for 5 seconds resets them, so a server that sends an event and drops every connection backs off and then fails the loop instead of being asked again forever.
- `status` is `"idle"` as soon as the loop is left, and stays `"closed"` after `cancel()` or an aborted `signal`, also when the stream is iterated again. With `onStatus`, the stream listens to `signal` until it is closed, so `onStatus("closed")` is called also when no loop runs.
- It stops on `204 No Content` and when `reconnect` is false. When a `reconnect.delay` function returns undefined, it rejects with the error of the failure. It fails on client errors other than 408, 425 and 429, on a response that is not `text/event-stream`, and on errors that are not a network error or a timeout, e.g. the `TypeError` of a missing path parameter or an error thrown by a hook.
- `method` and `body` send other requests, e.g. for streamed AI responses, which reconnect only when `reconnect` is set. A `ReadableStream` body is sent once, so with `reconnect` the loop rejects with a `TypeError`.
- The `fetch` options, e.g. `credentials`, pass through to every connection, while the options of a request that do not apply, such as `retry`, `lock` or `dedupe`, throw a `TypeError`.
- Every failed connection calls `on.error`, also the ones it reconnects after. `timeout` limits the wait for the response headers of each connection, not for the events, and a server that sends its headers only with the first event times out.

## WebSockets
```ts
import type { Socket } from "async-lube"

// browsers cannot send headers with a WebSocket, so params can be a function called before every connection
const socket: Socket<Message, Command> = api.ws("/rooms/:id", { id }, {
    params: async () => ({ token: await getToken() }),
    heartbeat: { interval: 30000, message: { type: "ping" }, timeout: 10000 }, // reconnects when nothing arrives
    onStatus: status => setOnline(status == "open") // "idle", "connecting", "open" or "closed", and "idle" again after it ends or fails
})

socket.send({ type: "join", room: id }) // connects, and sends once open, also while reconnecting: false until then, true when sent at once

for await (const message of socket) render(message) // JSON, or a string, or an ArrayBuffer

socket.cancel() // closes it for good, e.g. on unmount
```
- `https://api.example.com` becomes `wss://api.example.com`, and a relative `base` is resolved against the page.
- It reconnects with a backoff after a failed or dropped connection, a timeout, or a close with 1001, 1011, 1012, 1013 or 1014, and at once when the browser comes back online. `reconnect.delay` replaces the backoff with milliseconds or `(failures, error, fallback) => milliseconds`, and undefined rejects the loops with the error. A close with 1000 ends the loops, 1005 and 1006 are dropped connections that reject them with `NetworkError` when they are not reconnected, and other codes reject them with `SocketError`.
- `reconnect.count` limits the failures in a row. A connection that drops after its messages is a failure too, and one that stays open for 5 seconds resets them, so a server that sends a message and drops every connection backs off and then fails the socket instead of being connected to again forever.
- Every failed connection calls `on.error`, also the ones it reconnects after. Browsers do not show why an upgrade failed, so a server that refuses it, e.g. with 401 for an expired token, looks like a dropped connection, a `NetworkError` whose `cause` is a `SocketError` with code 1006. A socket that has never opened therefore gives up after 5 failures in a row and rejects its loops with the last error, so the app can sign in again, while one that has opened reconnects without a limit. `reconnect.count` sets the limit for both.
- Without a type, `send` takes JSON values, strings and binary data, and `heartbeat.message` has the type that `send` takes.
- Every loop receives the messages that arrive while it runs, so several components can read one socket. Leaving a loop keeps the socket open: close it with `cancel()` or `signal`. A loop keeps the messages that arrive while it is busy, and `limit` keeps only the newest of them, e.g. `limit: 1` for a widget that renders slower than the prices arrive.
- `parse` validates every message, and one that fails closes the socket. An async `parse` is awaited, in the order of the messages. Using the socket again after it ended or failed connects again.
- Messages sent while connecting or closing wait for the next connection, and are dropped when the socket ends or fails. `send` returns true when the message went to the open socket, and false when it waits or `outbox: 0` dropped it. `outbox` keeps only the newest of them, e.g. `outbox: 1` for a position sent 10 times a second, so a reconnect does not flush stale ones. WebSockets do not confirm delivery, so confirm what matters in your protocol.
- A reply to `heartbeat` reaches the loops like any message, and text that is valid JSON is parsed, so `"123"` arrives as a number unless `as` is `"text"`.
- The values of a `params` function are shown as `***` in the `request.url` of errors, so a token does not reach the `error` hook or logs.
- `headers`, `refresh`, `retry` and the `request` and `response` hooks do not apply. Before Node.js 22, pass a WebSocket: `http({ WebSocket })` from the ws package.

| | Request | `sse()` | `ws()` |
| --- | --- | --- | --- |
| `timeout` | Each attempt, including the `headers` function and the hooks. With `as: "ndjson"` or `"stream"`, until the headers arrive | Until the response headers of each connection arrive | Until each connection opens |
| `headers`, hooks, `refresh` | All apply | `headers` and the `headers` of the config, the `request`, `response` and `error` hooks and `refresh` apply to each connection | Only the `error` hook: browsers cannot send headers, so pass a token with a `params` function |
| Failures | `retry`, off by default, where a Retry-After longer than 60 seconds rejects | `reconnect`, on for GET, which waits for the whole Retry-After and reconnects when the browser comes back online | `reconnect`, on, which gives up after 5 failures before the first open and reconnects when the browser comes back online |
| Reading | `as` of the body, by `Content-Type` by default, then `parse` | `as: "text"` (default) or `"json"` for the data of every event, then `parse` | `as: "json"` (default) or `"text"` for text messages, then `parse` |

## Shared config and hooks
```ts
const admin = api.extend({ headers: { "X-Role": "admin" } }) // headers and hooks of both apply

const logged = http({
    on: {
        request: ({ headers }) => headers.set("X-Request-Id", crypto.randomUUID()),
        response: ({ duration, url }) => metrics.timing(url, duration),
        error: error => console.error(error) // once per failed request, never for cancellations, without delaying it
    }
})
```

## Caches and stores
`http` does not cache responses or hold UI state. It fits under a query cache, under a few lines of your own, or under a store of 27 lines.

```ts
// TanStack Query, SWR or any cache: pass its signal, and let the cache own the key
useQuery({
    queryKey: ["users", id],
    queryFn: ({ signal }): Promise<User> => api.get("/users/:id", { id }, { signal }),
    retry: (count, error) => !isCancel(error) && count < 2
})
```
- **Retry once, not twice.** A `retry` here and a `retry` of the cache multiply: 2 and 2 send nine requests, not three. Keep one, and `api.extend({ retry: null })` removes the client's.
- **`isCancel` belongs in `retry`.** `latest`, `debounce`, `throttle` and `cancel()` reject with `CancelError`, and a cache that does not know it sends the request again, which cancels the next one in turn.
- **Leave the races to the cache.** `dedupe` is harmless under one, but `latest` and `debounce` fight its lifecycle: use its own `staleTime`, deduplication and `cancelQueries` instead. They are for the requests that no cache owns, e.g. a search box, an autosave or a submit button.

A cache of your own is a promise per key:
```ts
const cache = new Map<string, { at: number, data: Promise<unknown> }>()
function cached<T>(key: string, load: () => Promise<T>, ms = 60000) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < ms) return hit.data as Promise<T>
    const data = load()
    cache.set(key, { at: Date.now(), data })
    data.catch(() => cache.delete(key)) // a failure is not kept
    return data
}

const user = await cached(`user ${id}`, (): Promise<User> => api.get("/users/:id", { id }))
cache.delete(`user ${id}`) // after a change
```

Without a cache, a request becomes a store that every framework reads, with `get()` returning the same object until something changes:

```ts
import { isCancel } from "async-lube"
import type { LubeRequest } from "async-lube"

function resource<A extends unknown[], T>(load: (...args: A) => LubeRequest<T>) {
    const listeners = new Set<() => void>()
    let request: LubeRequest<T> | undefined
    let state = { data: undefined as T | undefined, error: undefined as unknown, pending: false }
    const set = (next: Partial<typeof state>) => {
        state = { ...state, ...next }
        for (const listener of [...listeners]) listener()
    }
    return {
        get: () => state,
        refresh(...args: A) {
            request?.cancel("Superseded")
            set({ error: undefined, pending: true })
            request = load(...args)
            request.safe().then(([error, data]) => {
                if (isCancel(error)) return // a newer refresh owns the state
                set({ data: error ? state.data : data, error, pending: false })
            })
            return request
        },
        subscribe(listener: () => void) {
            listeners.add(listener)
            return () => void listeners.delete(listener)
        }
    }
}

const results = resource((q: string): LubeRequest<Item[]> => api.get("/search", { q }, { debounce: 300 }))
```
```ts
type State = ReturnType<typeof results.get>

// React
const { data, error, pending } = useSyncExternalStore(results.subscribe, results.get, results.get)
// Svelte, as the store contract
const store = { subscribe: (run: (value: State) => void) => (run(results.get()), results.subscribe(() => run(results.get()))) }
// Solid
const solid_state = from<State>(set => results.subscribe(() => set(results.get())))
// Vue
const vue_state = shallowRef<State>(results.get())
results.subscribe(() => { vue_state.value = results.get() })
```
- `get()` must keep the same reference between changes, or React loops forever: build the next state, then notify.
- `safe()` instead of `catch` keeps a superseded request from becoming an unhandled rejection, and `isCancel` keeps the newest refresh in charge of the state.
- This is a store, not a cache: there are no keys, no invalidation and no garbage collection. Reach for a query cache when you want those.

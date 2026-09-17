# Async Lube
Complex async code as plain procedural code: functions, `await`, `for await` and `AbortSignal`.

Most async libraries add a second language on top of JavaScript: operator chains, a workflow DSL or callbacks wired into a graph. async-lube keeps the one you already write. A request is `await api.get(...)`. A WebSocket, a search box or a streamed AI answer is a `for await` loop. A process of many steps is a set of plain functions whose parameters are the results of the steps they depend on, wired by a small builder, `.add` and `.edge`. A job that must survive a crash is an async function whose effects go in `step`. Every function can be called and tested on its own, and cancellation is an `AbortSignal` throughout.

- **`http`** wraps `fetch` with what an app adds around each request: path and query parameters, JSON, typed errors, timeouts, retries, token refresh, cancellation, deduplication, progress, server-sent events and WebSockets.
- **Streams**: `channel`, `merge`, `share`, `until`, `latest`, `every`, `buffer`, `debounce` and `throttle` read WebSockets, server-sent events, streamed responses and anything a handler pushes as async iterables, so a stream is a `for await` loop instead of a pipeline of operators.
- **`flow`** runs plain functions like a flowchart: dependencies in topological order, branches, loops, retries, fallbacks, user input, streams, batches, transactions and resuming.
- **`async-lube/durable`** runs an async function that survives crashes, restarts and deploys: saved steps, sleeps and waits of days, one worker per key.
- **`attempt`, `limiter` and `offload`** give any async work a retry and a timeout, a limit shared by everything that uses a database or an API quota, and a worker for heavy functions.

## Before and after
### A fetch wrapper
```ts
// before: a wrapper that every app writes, and grows
let token = ""
async function request<T>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
    const response = await fetch(`https://api.example.com${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method,
        signal: AbortSignal.timeout(10000)
    })
    if (response.status == 401) return (token = await refreshToken(), request(method, path, body, retries))
    if (response.status >= 500 && method == "GET" && retries > 0) return request(method, path, body, retries - 1)
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
    return response.status == 204 ? undefined as T : response.json()
}
const user = await request<User>("GET", `/users/${encodeURIComponent(id)}?expand=true`)
```
```ts
// after
import { http } from "async-lube"

const base = http({
    base: "https://api.example.com",
    headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
    retry: 2,
    timeout: 10000
})
const api = base.extend({ refresh: signal => base.post("/auth/refresh", undefined, { signal }) })

const user: User = await api.get("/users/:id", { id, expand: true }) // GET /users/1?expand=true
```
- Requests that fail with 401 at the same time share one refresh and are sent once more, where the wrapper refreshes once per request.
- With `retry`, idempotent methods are retried on network errors, timeouts and 408, 425, 429, 500, 502, 503 and 504, after a `Retry-After` of up to 60 seconds or with exponential backoff and jitter. POST and PATCH are retried only when the request asks for it.
- A failure is an `HttpError` with `status` and the parsed `data`, a `NetworkError`, a `TimeoutError` or a `CancelError`, and TypeScript checks the path parameters, which are URL-encoded.

### A search box
```ts
// before: a debounce and a controller per keystroke, and results that arrive out of order
let timer: ReturnType<typeof setTimeout>
let controller: AbortController | undefined
input.oninput = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
        controller?.abort()
        controller = new AbortController()
        try {
            const response = await fetch(`/search?q=${encodeURIComponent(input.value)}`, { signal: controller.signal })
            render(await response.json() as Item[])
        } catch (error) {
            if (!(error instanceof DOMException && error.name == "AbortError")) showError(error)
        }
    }, 300)
}
```
```ts
// after
import { channel, debounce, latest } from "async-lube"

const typed = channel<string>()
input.oninput = () => typed.send(input.value)

try {
    for await (const items of latest(debounce(typed, 300), (q, signal): Promise<Item[]> => api.get("/search", { q }, { signal }))) render(items)
} catch (error) {
    showError(error)
}
```
- `debounce` passes the last value of every quiet window, and `latest` aborts the `signal` of the request before it, so an older answer can never overwrite a newer one.
- `map`, `filter`, `scan` and `take` have no helper: they are an assignment, an `if`, a variable outside the loop and a `break`.
- Leaving the loop cancels the request in flight, and an error of the request ends the loop, so a `try` around it handles it.

### A checkout
```ts
// before
async function checkout(signal: AbortSignal) {
    const [cart, user] = await Promise.all([get_cart(), get_user()])
    let quote: Quote | undefined
    for (let attempt = 1; !quote; attempt++) {
        try { quote = await get_quote(cart, user) }
        catch (error) { if (attempt > 2) throw error; await new Promise(resolve => setTimeout(resolve, attempt * 1000)) }
    }
    const code = await new Promise<string>((resolve, reject) => {
        otpForm.onsubmit = () => resolve(otpInput.value)
        signal.addEventListener("abort", () => reject(signal.reason))
    })
    return pay(quote, code)
}
```
```ts
// after
import { flow } from "async-lube"

const otp = flow.input<string>("otp")
const checkout = flow()
    .add(get_cart)
    .add(get_user)
    .add(get_quote, get_cart, get_user, { retry: { count: 2, delay: attempt => attempt * 1000 } })
    .add(pay, get_quote, otp) // pay(quote, code)

const run = checkout.run(undefined, { signal })
otpForm.onsubmit = () => { if (run.nodes.otp == "waiting") run.send(otp, otpInput.value) }
const receipt = await run
```
- The functions are the same plain functions: a node receives the results of its dependencies as arguments, and TypeScript checks them. Independent nodes run at the same time.
- The run shows its progress in `run.status` and `run.nodes`, and `run.retry()` runs what failed again while keeping what succeeded.
- `run.snapshot()` resumes it later, also on a server after the user answered, and a sub-flow, a loop or a race is one more `.add` or `.edge`.

## Installation
```bash
npm i async-lube
```
Works in browsers and in Node.js 18 or later. The `node:sqlite` of the durable example needs Node.js 22.5 or later; `sqlite()` takes better-sqlite3 and bun:sqlite as well.

The types a caller names come from the package itself, e.g.
`import { flow, type Flow, type NodeContext } from "async-lube"`.

## Quick start
### http
```ts
import { HttpError, http, isCancel } from "async-lube"

const api = http({ base: "https://api.example.com", credentials: "include", timeout: 10000 })

const user: User = await api.get("/users/:id", { id: 1, expand: true }) // GET /users/1?expand=true
const created = await api.post<User>("/users", { name: "Kim" }) // JSON body

try {
    await api.post("/orders", order)
} catch (error) {
    if (error instanceof HttpError) show(error.message) // data.message, data.error, data.detail or data.title
    else if (!isCancel(error)) throw error // cancelled, superseded or unmounted: nothing to show
}

const results: Item[] = await api.get("/search", { q }, { debounce: 300 }) // a newer search cancels this one
for await (const message of api.ws("/rooms/:id", { id })) render(message) // reconnects with a backoff
```
- The data is `unknown` until it is typed: annotate the variable, pass a type argument or validate it with `parse`.
- `api.get("/users/:id")` without `{ id }` is a type error, and the parameters are URL-encoded.
- `latest`, `debounce`, `throttle` and `lock` settle the races of a UI, and identical GET requests in flight share one request.

[docs/http.md](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/http.md): errors, retries and token refresh, files and progress, validation, server-sent events, WebSockets, hooks, and use under a query cache.

### Streams
```ts
import { channel, until } from "async-lube"

const downs = channel<MouseEvent>()
const moves = channel<number>()
const ups = channel<MouseEvent>()
box.addEventListener("mousedown", e => { e.preventDefault(); downs.send(e) })
window.addEventListener("mousemove", e => moves.send(e.clientX))
window.addEventListener("mouseup", e => ups.send(e))

// drag: for every mousedown, for every mousemove until mouseup
for await (const down of downs) {
    for await (const x of until(moves, ups)) box.style.left = `${x}px`
}
```
- A `channel()` turns a handler, a callback API or a form into a stream that any number of loops read.
- `break` leaves a loop, and the streams and operators of this package stop their sources at once, also nested in each other.
- `share` reads one stream for several loops, `merge` joins streams, and `buffer`, `debounce` and `throttle` pace them.

[docs/streams.md](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/streams.md): sharing and batching, only the latest, every operator, and channels.

### flow
```ts
import { flow } from "async-lube"
import type { NodeContext } from "async-lube"

const get_user = ({ signal }: NodeContext) => api.get<User>("/me", {}, { signal })
const get_prices = ({ signal }: NodeContext) => api.get<Price[]>("/prices", {}, { signal })
const get_cached = () => cache.read<Price[]>("prices")
const show_prices = (fresh?: Price[], cached?: Price[]) => chart.draw(fresh ?? cached)
const greet = (user: User) => `Hello, ${user.name}`

const dashboard = flow()
    .add(get_user)
    .add(get_prices, { fallback: get_cached, retry: 2, timeout: 5000 })
    .add(get_cached)
    .add(show_prices, get_prices, get_cached, { join: "any" })
    .add(greet, get_user)

const run = dashboard.run()
run.subscribe(() => render(run.nodes)) // { get_user: "done", get_prices: "running", ... }
refresh.onclick = () => run.reload(get_prices) // get_prices and its dependents again
const greeting = await run // the result of the last added node
```
- `get_user` and `get_prices` start at once. `get_cached` runs only when `get_prices` fails after its retries, and `show_prices` runs with whichever is done.
- A node receives the results of its dependencies, and the context last: pass its `signal` to requests, so a cancelled run aborts them.
- `.add(show_prices, get_user)` is a type error, since a `User` is not a `Price[]`, and `.check()` finds the problems TypeScript cannot see, e.g. a node that never starts, without running anything.

[docs/flow.md](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/flow.md): user input, branches and loops, errors, batches, resuming, sub-flows, updates while running, transactions, races and streams.

### Durable runs
```ts
import { DatabaseSync } from "node:sqlite"
import { durable, sqlite } from "async-lube/durable"

const day = 24 * 60 * 60 * 1000
const checkout = durable(sqlite(new DatabaseSync("runs.db")), async (cart: Cart, { sleep, step, wait }) => {
    const order = await step("order", () => orders.insert(cart)) // saved: never runs twice
    await step("charge", ({ key }) => api.post("/charges", order, { idempotent: key }))
    const approved = await wait<boolean>("approve", { timeout: 3 * day }) // leaves memory while it waits
    await sleep("cool off", day) // survives a restart
    return approved ? step("ship", () => ship(order)) : "declined"
})

reply(await checkout.run(request.headers["idempotency-key"], cart)) // one run per key, joined or resumed
await checkout.send(key, "approve", true)
// on every server: resumes what a crash left, wakes sleeps and waits, takes runs of dead workers
void checkout.serve({ onError: (error, key) => console.error(key ?? "store", error) })
```
- After a crash the function runs again from its start, and every `step` that finished returns its saved result at once, so what differs every time, e.g. `Date.now()`, belongs in a step.
- Pass `key` as the idempotency key of a request: a step that was running when its worker died runs again with the same key.
- The input, the results and the values sent are JSON values, and a store is three functions, `get`, `put` and `due`: `memory()` for tests, `sqlite(db)`, or a table of any database.

[docs/durable.md](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/durable.md): starting, joining and sending, errors and cancelling, sleeps and waits, workers and leases, long-lived runs, and a Postgres store.

### Tasks
```ts
import { attempt, limiter, offload } from "async-lube"

// a database query with a timeout for each attempt, retried twice
const rows = await attempt(({ signal }) => db.query(sql, { signal }), { retry: 2, timeout: 5000 })

// at most 10 queries at once and 100 AI requests a minute, across every run and request that uses them
const pool = limiter({ concurrency: 10 })
const ai = limiter({ rate: { count: 100, per: 60000 } })
const user = await pool(() => db.query("select * from users where id = $1", [id]))

// heavy work in a worker, so that the page or the server keeps answering
const resize = offload(async (bytes: ArrayBuffer, width: number) => {
    // only its arguments and globals: this runs in the worker
})
const thumbnail = await resize(bytes, 200, signal) // the signal terminates the worker
```
- `attempt` takes the same `retry` options as a request and a flow node.
- `limiter` starts the calls in order, and `key(id)` gives each user or tenant the same limits.
- `offload` sends the function as its source, so it uses only its arguments and globals.

[docs/tasks.md](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/tasks.md): leases, keys and workers.

## When to use it
- A frontend talks to an HTTP API and wants retries, token refresh, cancellation and the races of a UI handled once, in the client.
- A UI reads sockets, server-sent events, streamed AI answers or user events, and wants them as loops.
- A process of several steps, e.g. a checkout, an onboarding, an import or an AI agent, has parallel loads, dependent steps, user input, retries, loops or batches, and wants progress, cancelling, retrying and resuming without a state machine.
- A job on a server must survive crashes and deploys, or wait for days, with its state in a database of its own.

## What it is not
- **Not a query cache.** `http` does not cache responses or hold UI state. It fits under TanStack Query or SWR, see [Caches and stores](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/http.md#caches-and-stores).
- **Not an operator library.** The stream functions are the few that a loop cannot express. When code is built from operators, e.g. `combineLatest` or schedulers, RxJS has them.
- **Not a workflow platform.** `flow` and `durable` are functions in your process, and a durable store is a table you own. There is no server, dashboard or hosted queue: Temporal and Inngest provide those.

## Documentation
- [http](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/http.md): requests, errors, retries and token refresh, races of the UI, files, server-sent events, WebSockets, caches and stores
- [Streams](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/streams.md): channels, operators and how loops end
- [flow](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/flow.md): basics, common patterns, advanced features and the rules for when they meet
- [Durable runs](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/durable.md): steps, waits, workers and stores
- [Tasks](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/tasks.md): `attempt`, `limiter` and `offload`
- [Testing](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/testing.md): fake timers of Vitest, Jest and `node:test`
- [Reference](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/reference.md): every option, method and run property in tables

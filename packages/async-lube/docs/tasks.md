# Tasks
`attempt`, `limiter` and `offload` give any async work, on a page or a server, a retry and a timeout, a limit shared by everything that uses a database or an API quota, and a worker for heavy functions.

```ts
import { attempt, limiter, offload, redial } from "async-lube"

// a database query with a timeout for each attempt, retried twice
const rows = await attempt(({ signal }) => db.query(sql, { signal }), { retry: 2, timeout: 5000 })

// at most 10 queries at once and 100 AI requests a minute, across every run and request that uses them
const pool = limiter({ concurrency: 10 })
const ai = limiter({ rate: { count: 100, per: 60000 } })
const user = await pool(() => db.query("select * from users where id = $1", [id]))

// one job at a time per user, and a slot held across steps
const jobs = limiter({ concurrency: 1 })
await jobs.key(user.id)(() => export_data(user))
const lease = await pool.acquire(signal)
try { await copy_tables() } finally { lease.release() }

// a packet limit per socket, answered at once and never waiting
const packets = limiter({ rate: { count: 20, per: 1000, window: "fixed" } })
const retry_after = packets.take(socket.id) // 0, or the milliseconds until a start is free

// one WebSocket kept up, reconnecting after each close with a capped backoff
const stop = new AbortController()
const stopped = redial(({ attempt, signal, open, close }) => {
    const socket = new WebSocket(urls[(attempt - 1) % urls.length])
    socket.onopen = open
    socket.onclose = close
    signal.addEventListener("abort", () => socket.close(), { once: true })
}, { signal: stop.signal, base: 1000, most: 30000 })
stop.abort()
await stopped

// heavy work in a worker, so that the page or the server keeps answering
const resize = offload(async (bytes: ArrayBuffer, width: number) => {
    // only its arguments and globals: this runs in the worker
})
const thumbnail = await resize(bytes, 200, signal) // the signal terminates the worker
```
- `attempt` gives the function `{ attempt, signal }`, and the signal aborts on a timeout or the `signal` option, so pass it on. `retry` takes a count or `{ count, delay, when }`, as a flow node does, where a `delay` function that returns undefined stops retrying, and a `signal` that aborts rejects with `CancelError`, also while it waits for the next attempt.
- `limiter` starts the calls in order when they are within its limits. A signal as the second argument takes a call out of the line while it waits, and `pending` and `running` count the calls. `acquire()` holds a slot until `release()`, and `key(id)` is a limiter with the same limits for each key, dropped when it has nothing to do. `take(id?)` answers at once, without waiting: `0` when a start is free in the rate window, which it counts, otherwise the milliseconds until the next start is accepted, which it counts nothing for. It ignores `concurrency` and the queue but shares the window with the calls and `acquire()`, so a queued call waits for it, and it throws a TypeError without a `rate`. The window is `"sliding"` by default, where each start frees its slot `per` milliseconds later, or `"fixed"`, where a window opens at the first start after the last one ended and frees all `count` starts at once when it ends. Like `durable`, it throws a TypeError for an option it does not know, e.g. `concurency`, and `attempt` rejects with one.
- `offload` sends the function as its source, so it may use only its arguments and globals: an arrow function or a function expression, not a method or a closure. The arguments and the result are copied as `postMessage` copies them, `concurrency` workers run at once, 1 by default, and `close()` terminates them. An `AbortSignal` as the last argument or `cancel()` of the call terminates its worker. In Node.js it needs 20.16 or later, and idle workers do not keep the process running.
- `offload(url, { data, delay, onBatch })` loads a module file, a `URL` or a URL string, in one stateful worker, for work that keeps a state, e.g. a database. The module default-exports a setup function that gets `data` and returns `{ call, batch, close }`, possibly after an async setup, and `ready` resolves when it has finished or rejects with its error, which every call rejects with too. `call(request)` returns the result of the module's `call`, matched by id, and the calls made in the same tick travel in one message. The worker gathers the requests that arrive within `delay` milliseconds (0, the next macrotask, by default) into one batch and never runs two at once: `batch(run)` wraps a batch, where `run()` calls `call` for every request in order and its promise settles when every result has settled, so `db.exec("BEGIN"); run(); db.exec("COMMIT")` works for sync calls and `await run()` for async ones. If `batch` throws or rejects, every call of the batch rejects with that error. A value it returns reaches `onBatch` in the calling thread, and the calls of the batch settle only after `onBatch` resolves (in order, and they reject with its error if it rejects), e.g. to ship a changeset before the replies. `close()` lets the calls already sent finish, runs the module's `close`, ends the thread and resolves after it exited; calls made after it reject with `CancelError`. A worker that crashed rejects its calls and every later one, and is not started again. Type the default export with `OffloadSetup<Data, Request, Result>`.
- `redial(connect, { signal, base, most })` keeps one connection up, e.g. a WebSocket: it calls `connect({ attempt, signal, open, close })` at once and again after each `close()`, until `signal` aborts. The connector calls `open()` when the connection is up, which resets the wait, and `close()` when it ended. The wait before the next `connect` is `base` milliseconds (1000 by default) after a connection that opened, and doubles up to `most` (30000 by default) after each one that closed without opening. `attempt` counts every call from 1, so it can rotate addresses, and a `connect` that throws or rejects counts as a close. When `signal` aborts, the signal of the connection in hand aborts with the same reason, so close the connection on it, and the result resolves once that connection has closed.
- Files, database cursors and `readline` are async iterables, so they are streams: `for await (const line of readline.createInterface({ input: createReadStream(path) }))`, or a flow dependency that `overflow: "wait"` slows down.

The signatures are in the [API tables](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/reference.md#tasks).

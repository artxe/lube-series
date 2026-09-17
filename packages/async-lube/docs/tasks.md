# Tasks
`attempt`, `limiter` and `offload` give any async work, on a page or a server, a retry and a timeout, a limit shared by everything that uses a database or an API quota, and a worker for heavy functions.

```ts
import { attempt, limiter, offload } from "async-lube"

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

// heavy work in a worker, so that the page or the server keeps answering
const resize = offload(async (bytes: ArrayBuffer, width: number) => {
    // only its arguments and globals: this runs in the worker
})
const thumbnail = await resize(bytes, 200, signal) // the signal terminates the worker
```
- `attempt` gives the function `{ attempt, signal }`, and the signal aborts on a timeout or the `signal` option, so pass it on. `retry` takes a count or `{ count, delay, when }`, as a flow node does, where a `delay` function that returns undefined stops retrying, and a `signal` that aborts rejects with `CancelError`, also while it waits for the next attempt.
- `limiter` starts the calls in order when they are within its limits. A signal as the second argument takes a call out of the line while it waits, and `pending` and `running` count the calls. `acquire()` holds a slot until `release()`, and `key(id)` is a limiter with the same limits for each key, dropped when it has nothing to do. Like `durable`, it throws a TypeError for an option it does not know, e.g. `concurency`, and `attempt` rejects with one.
- `offload` sends the function as its source, so it may use only its arguments and globals: an arrow function or a function expression, not a method or a closure. The arguments and the result are copied as `postMessage` copies them, `concurrency` workers run at once, 1 by default, and `close()` terminates them. An `AbortSignal` as the last argument or `cancel()` of the call terminates its worker. In Node.js it needs 20.16 or later, and idle workers do not keep the process running.
- Files, database cursors and `readline` are async iterables, so they are streams: `for await (const line of readline.createInterface({ input: createReadStream(path) }))`, or a flow dependency that `overflow: "wait"` slows down.

The signatures are in the [API tables](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/reference.md#tasks).

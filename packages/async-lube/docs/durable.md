# Durable runs
`async-lube/durable` runs an async function that survives crashes, restarts and deploys, as plain code: saved steps, sleeps and waits of days, one worker per key.

[Steps](#steps) · [Starting, joining and sending](#starting-joining-and-sending) · [Errors and cancelling](#errors-and-cancelling) · [JSON values](#json-values) · [Sleeps and waits](#sleeps-and-waits) · [Workers](#workers) · [Long-lived runs](#long-lived-runs) · [Stores](#stores) · [API tables](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/reference.md#tasks)

```ts
import { durable, sqlite } from "async-lube/durable"

const checkout = durable(sqlite(db), async (cart: Cart, { sleep, step, wait }) => {
    const order = await step("order", () => orders.insert(cart))              // saved: never runs twice
    await step("charge", ({ key }) => api.post("/charges", order, { idempotent: key }))
    const approved = await wait<boolean>("approve", { timeout: 3 * day })    // leaves memory while it waits
    await sleep("cool off", day)                                               // survives a restart
    return approved ? step("ship", () => ship(order)) : "declined"
})

reply(await checkout.run(request.headers["idempotency-key"], cart)) // one run per key, joined or resumed
await checkout.send(key, "approve", true)
reply(await checkout.join(key))                                      // a status endpoint: never starts a run
// on every server: resumes what a crash left, wakes sleeps and waits, takes runs of dead workers
void checkout.serve({ onError: (error, key) => console.error(key ?? "store", error) })
```

## Steps
- A run is the function called again from its start, where every `step` that finished returns its saved result at once, so it continues where it stopped. The function has to reach the same steps in the same order, and what differs every time, e.g. `Date.now()`, a random ID or a request, belongs in a step. A step that changed name or order fails the run, unless `revision` and `migrate` turn the old runs into new ones.
- A step that was running when its worker died runs again with the same `key`, so pass the key as the idempotency key of the request it makes: effects outside the store happen at least once, and a receiver that knows the key makes them happen once.

## Starting, joining and sending
- `run(key, input)` reads `input` only when it starts a new run, and TypeScript asks for it unless the function takes `undefined`.
- `join(key)` waits for the run of a key without starting it or running a failed one again: it rejects with an Error when the key has no run and with the error of a failed run, so a status endpoint never creates a run without its input.
- `start(key, input)` starts a run and resolves once it is saved, without waiting for its result: with true when it started the run, also one whose values `send` kept, and with false, doing nothing, when the key has a run.
- `send(key, name, value)` rejects with an Error when the run is done or cancelled, and keeps a value for a key without a run until `run` or `start` begins one, while `join` of that key waits for it.

## Errors and cancelling
- A step that throws is saved too, and throws its error again when the run runs again, so a function that catches it, e.g. to compensate, takes the same path. The error comes back as an instance of the same class, `CancelError`, `TimeoutError`, `HttpError`, `NetworkError`, `SocketError`, `FlowError` or a built-in one such as `TypeError`, with its message, its `cause` and its fields that are JSON values, e.g. `status`, `data` and the headers of an `HttpError`, so `instanceof` gives the same answer after a crash; an error of another class comes back as an `Error` with its name and those fields, and so does the error of a failed run.
- When the error of a step fails the run, thrown by the function or as the `cause` of its error, the next `run(key)` runs that step again with what followed it, unless the function reached another `step`, `sleep` or `wait` after the error: a run that compensated, e.g. cancelled a booking before it rethrew, would otherwise go on as if nothing was undone, so it fails with the same error on every `run(key)`, and trying again is a new run with a new key.
- `wait` rejects with `TimeoutError` after its `timeout` or at its `until`, whichever comes first, and its message names that one: `Timed out after 300ms` or `Timed out at 2026-01-01T00:00:00.000Z`. A run that failed by a `timeout` waits again for a whole `timeout` on the next `run(key)`, and one that failed by an `until` that has passed fails again at once; a value that `send` gave the failed run meanwhile satisfies the wait of the new `timeout`, but not a passed `until`.
- `cancel(key)` rejects the run with `CancelError` and aborts `signal`, and cancels a failed run too, so that `run(key)` rejects with `CancelError` instead of running it again.

## JSON values
- The input, the results of the steps, the values sent and the result must be JSON values, since that is what a store keeps: plain objects, arrays, strings, finite numbers, booleans and null. A Date, a Map, a class instance, a BigInt, `NaN` or `undefined` in an array would come back changed once the run left memory, so `run`, `start` and `send` reject with a TypeError that names the value, a step with one fails with it, and so does a run that returns one. Return `date.toISOString()` or `[...map]` instead. TypeScript rejects such a type too: the input or the result of the function of `durable()`, the result of a step, `wait<Date>` and a value of `send`. `memory()` keeps runs as JSON too, so a test with it sees what production sees. The function gets copies of its input, of the results of the steps and of the values sent, so changing them, e.g. pushing to a list that a step returned, changes nothing that the run keeps, and a caller may change what it passed to `run` or `send` afterwards.

## Sleeps and waits
- A `sleep` longer than `idle` saves the run and leaves memory at once, and a `wait` does after `idle`, and `serve()` wakes it when its time comes or `send` arrives, so a million runs that wait for approvals take no memory. Each value sent reaches one `wait` of its name, in the order sent, also when it arrives while the run leaves memory or runs on another worker. `wait(name, { timeout })` ends `timeout` milliseconds after the run first reached it and `wait(name, { until })` at a time in milliseconds since the epoch, e.g. the end of an auction that a bid extends, and a value that arrives after that end never satisfies it, even when no worker woke the run in time: it stays for the next `wait` of its name. A caller of `run` or `join` for such a run, or for one that another worker runs, gets the outcome at once when this worker finishes it, e.g. after `send`, and otherwise checks the store after `poll`, doubling the delay up to a minute and waking the run when it is due.

## Workers
- A worker holds a lease on each run it runs and renews it. `serve()` on another server takes a run whose lease ended, and every write is a compare-and-set on its version, so a worker that lost its lease stops instead of writing over the new one. `send` from another worker never takes a run whose lease is alive: it adds the value to the run, and the worker that holds it takes the value within `poll`. A run cancelled by another worker aborts `signal` with its `CancelError`. `stop()` stops a worker as a crash would, for a deploy.
- `serve({ batch, interval, onError, signal })` looks for due runs every `interval` milliseconds, 1000 by default, and takes at most `batch` of them at a time, 100 by default. No caller waits for a run that it resumes or wakes, or for one that `start` began, so `onError(error, key)` gets the error of such a run when it fails, but not when it is cancelled, and the error of the store while it takes the run; an error of the store while it looks for runs comes without a key, and the next `interval` tries again. `sleep` takes milliseconds from 0 and `wait` a `timeout` from 0, where 0 takes only a value sent before, and they reject with a TypeError for a negative or infinite number, as `serve` does for an `interval` that is not positive and finite or a `batch` that is not a positive integer.

## Long-lived runs
- Every write saves the whole run, so a run that waits for thousands of values, e.g. every bid of a long auction, writes more with each one. Keep such a run short-lived: after a few thousand values, let it start a successor with what it gathered and end, and send to the key of the newest run:
  ```ts
  const bids = durable(store, async ({ lot, part, best }: Book, { step, wait }) => {
      for (let count = 0; count < 1000; count++) best = Math.max(best, await wait<number>("bid"))
      const next = `${lot}:${part + 1}`
      await step("continue", () => bids.start(next, { best, lot, part: part + 1 }))
      return next
  })
  ```

## Stores
- A store is `get(key)`, `put(key, run, expected)` and `due(now, limit)`: `memory()` for tests, `sqlite(db)` for `node:sqlite` or better-sqlite3, or a table of any database. With several processes on one SQLite file, set `pragma journal_mode = wal` and `pragma busy_timeout = 5000`.
- A table of another database is a store in a few lines, e.g. Postgres with node-postgres. `put` must write only when the version is the expected one, since that is what keeps a run on one worker, and `dueAt(run)` is the column that `due` looks up:
  ```ts
  import { dueAt } from "async-lube/durable"
  import type { DurableStore } from "async-lube"

  // create table durable_runs (key text primary key, version integer not null, due bigint, data jsonb not null);
  // create index on durable_runs (due) where due is not null;
  const store: DurableStore = {
      async get(key) {
          const { rows } = await pool.query("select data from durable_runs where key = $1", [key])
          return rows[0]?.data
      },
      async put(key, run, expected) {
          const { rowCount } = expected === undefined
              ? await pool.query("insert into durable_runs values ($1, $2, $3, $4) on conflict do nothing", [key, run.version, dueAt(run), run])
              : await pool.query("update durable_runs set version = $2, due = $3, data = $4 where key = $1 and version = $5", [key, run.version, dueAt(run), run, expected])
          return rowCount == 1
      },
      async due(now, limit) {
          const { rows } = await pool.query("select key from durable_runs where due <= $1 order by due limit $2", [now, limit])
          return rows.map(row => row.key)
      }
  }
  ```

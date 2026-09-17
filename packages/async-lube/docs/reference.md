# Reference
[http](#http) · [flow](#flow) · [streams](#streams) · [tasks](#tasks), including `durable`

A function that returns at once, such as `ws()`, `channel()`, `every()`, `buffer()`, `offload()`, `limiter()` or `flow().add()`, throws a `TypeError` that names an unknown or invalid option, and one that returns a promise, such as `attempt()` or `durable().run()`, rejects with it. The config of `http()` and the options of a request and of `sse()` are the exception: they pass a key they do not know to `fetch` instead, so a misspelled `timeout` or `onStatus` is silently without effect in JavaScript, and only the keys they know but cannot apply, such as `retry` on `sse()`, throw. TypeScript reports the misspelling.

## http
| Config | |
| --- | --- |
| `base` | Prepended to relative paths, and may have path parameters |
| `headers` | Headers, or a function that returns them before every attempt |
| `timeout` | Milliseconds for each attempt, including the `headers` function and the `request` and `response` hooks. With `as: "ndjson"` or `"stream"`, only until the response headers arrive |
| `retry` | A count, or `{ count, delay, when(error, attempt) }`, where `delay` is milliseconds or `(attempt, error, fallback) => milliseconds`. POST and PATCH are retried only with `idempotent` or a `retry` of the request |
| `refresh` | Refreshes the credentials once for the requests that fail with 401 at the same time |
| `ok` | Whether a response is a success. Default: 2xx |
| `on` | The `request`, `response`, `error` and `unauthorized(error, reason)` hooks |
| `query` | Serializes the query parameters. Default: arrays repeat the key, objects use `key[name]`, dates are ISO strings, and null and undefined are left out |
| `fetch` | Replaces `fetch`, e.g. in tests |
| `WebSocket` | Replaces the global `WebSocket` of `ws` |
| `credentials`, `mode`, `cache`, ... | Passed to `fetch` |

| Method | |
| --- | --- |
| `get`, `head`, `delete`, `options` | `(path, params?, options?)`, with a body in `options.body` except for GET and HEAD |
| `post`, `put`, `patch` | `(path, body?, options?)`, with the path parameters in `options.params`, and `options.body` when `body` is undefined |
| `request` | `(method, path, options?)`, with `options.body` |
| `sse` | `(path, params?, options?)`, with `as`, `body`, `lastEventId`, `method`, `onStatus`, `parse`, `signal` and `reconnect`: a boolean or `{ count, delay }`, where `delay` is milliseconds or `(failures, error, fallback) => milliseconds` |
| `ws` | `(path, params?, options?)`, with `as`, `heartbeat`, `limit`, `onStatus`, `outbox`, `params`, `parse`, `protocols`, `signal`, `timeout` and `reconnect`: a boolean or `{ count, delay }` as for `sse` |
| `extend` | `(config)`, a client that merges the headers and hooks of both, where null removes a value |

A request is a promise of the data with `cancel(reason?)`, `safe()` and `raw()`, whose type argument types the data. Its options are the config's `headers`, `ok`, `retry` and `timeout`, the `fetch` options including `signal`, and the options below. `dedupe`, `latest`, `debounce`, `throttle` and `lock` apply within one client, and a client made by `extend` is another one.

| Option | |
| --- | --- |
| `as` | `arrayBuffer`, `blob`, `file`, `formData`, `json`, `ndjson`, `stream` or `text`. Default: by `Content-Type` |
| `parse` | Validates or transforms the data, or each line of `ndjson` |
| `dedupe` | Whether identical GET and HEAD requests in flight share one request, and every caller gets its own copy of the data. Default: true, and off with `parse`, `ok`, `progress`, `retry`, `timeout`, `latest`, `debounce`, `as: "formData"`, `"ndjson"` or `"stream"`, or `fetch` options other than `signal`, which cancels only its own caller |
| `latest` | Cancels the previous request with the same key |
| `debounce` | Waits the milliseconds before sending, and a newer request to the same method and path, or with the same `latest` key, cancels it |
| `throttle` | Sends at most one request per the milliseconds to the same method and path: the first at once, and the last one asked in the meantime when the time is up, while the others reject with `CancelError` |
| `lock` | Returns the request in flight with the same key instead of sending another. A streaming `as` rejects |
| `idempotent` | Sends an `Idempotency-Key` header, generated or given, and allows retrying |
| `progress` / `upload` | Report the download / upload progress, and their errors are ignored |

## flow
| API | |
| --- | --- |
| `flow<State>({ concurrency, maxSteps })` | An empty flow. `concurrency` limits its nodes that run at the same time, not those inside sub-flows or the items of `flow.each()`, and `maxSteps` the node runs before the run settles. Both are positive integers or `Infinity`, the default |
| `flow.each(function or flow)` | A node that runs for every item of its first dependency, or of the state |
| `flow.input<Value>(name?)` | A node that waits for `run.send(input, value)` |
| `flow.queue(dependency)` | A dependency that keeps every value and is taken one per run in order, so nothing is lost while the node runs |
| `flow.restart(dependency)` | A dependency that starts the run again with its newest value. The others keep their values, except that a `flow.keep()` dependency gives the value it stored meanwhile |
| `flow.keep(dependency)` | A dependency whose newest value is stored for the next run, also one that `flow.restart()` starts, without touching the one that runs. Only its first value, which the node waits for, can start the node |
| `.add(node, ...dependencies, options?)` | Adds a function, a `flow.input()`, a flow, a stream or a `flow.each()`. An input or a stream that a node depends on is added with it |
| `.edge(from, to)` | `to` is a node, an array of nodes, or an object that maps results to nodes, whose keys TypeScript checks against the result. A result without a key fails the run. Dependents that are not targets run whatever it selects |
| `.edge(from, targets, select)` | `select(result, { state })` returns some of the targets, or null. One that throws fails the run |
| `.edge(from, map, select)` | `select(result, { state })` returns some of the keys, or null. One that throws fails the run |
| `.check()` | The problems of the flow without running it: a circular dependency, a node that never starts, a race against a stream or a node it feeds, which ends with the first value, `finish` on a node that no race can abandon, or a node named by its place, which a snapshot cannot find. Empty when it is fine |
| `.mermaid()` | A Mermaid flowchart with solid dependencies and dotted edges and fallbacks, or one solid arrow with the label for an edge or fallback to a dependent. A node names its `join`, `finish` and `overlap` other than the default, e.g. `decide (join: race)`, and a dependency its `flow.queue`, `flow.keep` or `flow.restart` |
| `.run(state?, { id, signal, snapshot, trace }?)` | Starts a run, and throws for another option. `id` starts the keys of its nodes and must be the ID of a `snapshot`, and `trace(event)` gets the `start`, `done`, `fail`, `cancel` and `skip` of every node, and only the `skip` of an input or a stream |

| Node option | |
| --- | --- |
| `retry` | A count, or `{ count, delay, when }`, where `delay` is milliseconds or `(attempt, error, fallback) => milliseconds`, 0 by default, whose undefined stops retrying, and `when(error, attempt)` decides whether to retry, or every error is retried |
| `timeout` | Milliseconds for each attempt, or for waiting for an input |
| `catch` | `(error, ...arguments, context)` returns a fallback result, `goto()` or `skip()`. For `flow.each()`: `(error, item, ...arguments, context)` returns the result of the item, not `goto()` or `skip()` |
| `fallback` | The nodes to go to when the node fails |
| `optional` | `true` continues without the result when the node fails |
| `when` | `(...arguments, { state })` skips the node unless it returns true. One that throws fails the node |
| `join` | `"all"` (default), `"any"` or `"race"` |
| `finish` | `true` lets a run that has started finish when a race no longer needs the node, instead of aborting it |
| `overlap` | `"restart"` (default), `"ignore"`, `"rerun"` or `"queue"`: what the node does when it is started again while it runs |
| `concurrency` | The items that run at the same time, for a `flow.each()` node |
| `limit` | The updates that `overlap: "queue"` or a `flow.queue()` dependency keeps waiting, dropping the oldest above it. The value in use is never dropped |
| `overflow` | `"drop"` (default), or `"wait"` to stop reading the stream dependencies while the queue is full, which needs one |
| `release` | `(result, error)` when the result is no longer used: commits, rolls back or closes it. The node starts only when a dependent can run |
| `name` | The name in `nodes`, `results`, `errors` and snapshots |

| Run | |
| --- | --- |
| `await run`, `catch`, `finally` | The result of the last added node |
| `idle()` | Resolves when no node is running, and never rejects |
| `get(node)` | The result of a node |
| `status`, `nodes`, `results`, `errors`, `state` | The progress |
| `send(input or path, value)` | Sends a value to an input: one that does not wait yet keeps it, one that is done runs its dependents again, and one whose `catch` is handling its timeout or that a race skipped ignores it |
| `reload(node or path?)` | Runs a node and its dependents again, or everything. A path into a sub-flow that does not run is ignored |
| `retry()` | Runs the failed nodes and items again, also inside sub-flows |
| `cancel(reason?)` | Aborts the running nodes |
| `pending(node or path)` | The updates a node has not finished: the one that runs and the ones that `overlap: "queue"` or a `flow.queue()` dependency keeps waiting, and 0 for a path into a sub-flow that does not run |
| `subscribe(listener)` | Calls the listener after every change and returns the function that stops it |
| `stream(node)` | The results of a node as a stream, one per run that is done. `cancel()` ends it |
| `snapshot()` | The progress to resume with `run(state, { snapshot })`, with opaque nodes and a `version`. Throws for a node named by its place, such as `node_2` |

## streams
The stream functions are listed in [Operators](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/streams.md#operators).

## tasks
| API | |
| --- | --- |
| `attempt(fn, { retry, signal, timeout })` | Runs `fn({ attempt, signal })` again after it fails, with a timeout for each attempt |
| `limiter({ concurrency, rate: { count, per } })` | A function `(fn, signal?)` that runs the calls within the limits, in order, with `acquire(signal?)`, `key(id)`, `pending` and `running` |
| `durable(store, fn, { idle, lease, migrate, owner, poll, revision })` | From `async-lube/durable`: `run(key, input)`, `join(key)`, `start(key, input)`, `send(key, name, value)`, `cancel(key, reason?)`, `get(key)`, `serve({ batch, interval, onError, signal }?)`, `stop()` and `running`, with `step`, `sleep` and `wait(name, { timeout, until })` in `fn(input, context)` |
| `memory()`, `sqlite(db, table?)`, `dueAt(run)` | From `async-lube/durable`: the stores, and when a run is due, for a store of your own |
| `offload(fn, { concurrency })` | A function that runs `fn` in a worker, with `close()`. Its calls have `cancel()`, and an `AbortSignal` as the last argument cancels them |

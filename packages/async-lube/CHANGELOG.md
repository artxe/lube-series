# Changelog

## 2.0.0

### Breaking

- **`client`, `dag`, `decorator` and `parallel` are removed.** Use `http` for requests and `flow` for
  everything that combines several async steps.
- **`client` → `http`.** A request resolves with the parsed data instead of the `Response`, and
  rejects with `HttpError` when the status is not 2xx.
  ```js
  // before
  client("https://api.example.com/users/:id", abort => setTimeout(abort, 2000))
      .get({ credentials: "include" })
      .query({ id: 1 }, { Authorization: token })
      .then(response => response.json())
  client("https://api.example.com/users").post().json({ name: "Kim" })
  // after
  const api = http({ base: "https://api.example.com", credentials: "include", headers: { Authorization: token }, timeout: 2000 })
  api.get("/users/:id", { id: 1 })
  api.post("/users", { name: "Kim" })
  ```
  `multiPart` and `urlEncoded` are gone: pass `FormData` or `URLSearchParams` as the body.
- **`dag` → `flow`.** Nodes and dependencies are still plain functions, and the order is still
  resolved by topological sort. A flow is started with `run()` instead of being called, a dependency
  must be an added function or flow, an input or a stream instead of any value or promise, and a function receives
  the node context after the results of its dependencies.
  ```js
  // before
  const run = dag().add(get_user).add(get_cart, get_user).add(get_quote, get_user, get_cart)
  const quote = await run()
  // after
  const checkout = flow().add(get_user).add(get_cart, get_user).add(get_quote, get_user, get_cart)
  const quote = await checkout.run()
  ```
  `run(index)` is gone: read other results with `run.get(get_cart)`.
- **`decorator` has no replacement function.** `retries` is `attempt(fn, { retry })` for any async
  function, or the `retry` option of `http` requests and of flow nodes, `throttle(count, ms)` is
  `limiter({ rate: { count, per: ms } })`, and `debounce` is the `debounce` option of `http` requests, or
  `debounce(stream, ms)` for a stream. Keep cached data in your state or query cache.
- **`parallel(size, ...handlers)` → `flow({ concurrency: size })`.** Add `optional: true` to the
  nodes whose failure should not reject the run; a failed optional node has no result.
- **Every type comes from the package entry,** e.g.
  `import { flow, type Flow, type NodeContext } from "async-lube"`, and the durable types from
  `async-lube/durable`. Deep imports such as `async-lube/types/client` no longer exist.
- **The package is an ES module only.** `import` loads `src/index.js`, and there is no CommonJS
  build: `require("async-lube")` works on Node.js 20.19+ and 22.12+, which load ES modules with `require`.
  Jest loads it once its ESM mode is on or the package is transformed.

### Added

- The package publishes `docs/`, which the README links to: `docs/http.md`, `docs/streams.md`, `docs/flow.md`,
  `docs/durable.md`, `docs/tasks.md`, `docs/testing.md` and `docs/reference.md`.
- `package.json` declares `engines.node` as `>=18`, the Node.js versions with a global `fetch`.
- `http(config)`: `get`, `post`, `put`, `patch`, `delete`, `head`, `options` and `request` with
  `/users/:id` path parameters checked by TypeScript, also those of `base` and of `request()`, query
  serialization of arrays, nested objects and dates, JSON bodies, and response parsing by
  `Content-Type`. The data is `unknown` until an annotated variable, a type argument of `safe()` or
  `raw()`, or `parse` types it, which keep the check of the path parameters, and query parameters,
  including interfaces and class instances, are checked against `QueryValue`.
- `HttpError`, whose `data` is `unknown` until it is checked, also after `instanceof`, `NetworkError`,
  `TimeoutError`, `CancelError` and `isCancel`, plus `.safe()` for
  `[error, data]` tuples and `.raw()` for the status and headers.
- Request policies: `timeout` per attempt, `retry` after a `Retry-After` of up to 60 seconds, where a
  longer one rejects at once, or after an exponential backoff, where POST and PATCH are retried only with
  `idempotent` or a `retry` of the request, whatever the `when` of the client, `idempotent` with an
  Idempotency-Key header, `dedupe` of identical GET and HEAD requests, `latest`, `debounce`, `throttle`,
  `lock`, which shares a request only with the same method and path, and `cancel()` or `signal`.
  `retry.delay` is milliseconds or `(attempt, error, fallback)`, where `fallback` is the Retry-After or
  the backoff, or undefined for a Retry-After over 60 seconds, and undefined stops retrying. The
  `retry` of a request, of `attempt()` and of a flow node is one type, `RetryOptions`, and a request
  rejects with a `TypeError` for an unknown or invalid `retry`. A `ReadableStream` body is sent once: it is not retried, and a 401
  waits for `refresh` and then rejects with the `HttpError`.
- `refresh` is shared by the requests that fail with 401 at the same time, which are sent once more after
  it. A request waits for it at most its own `timeout` more and then rejects with `TimeoutError` alone. A
  refresh that rejects rejects the waiting requests with their 401, and one that takes longer than the
  `timeout` of the client, or whose waiting requests all left after one of them timed out, fails: its
  signal is aborted and the requests still waiting reject with `TimeoutError`. The next 401 after a
  failure starts a new refresh, and `on.unauthorized` is called once when it fails or the requests fail
  with 401 again after it.
- `as: "stream"` resolves with a `ReadableStream<Uint8Array<ArrayBuffer>>`, typed like `Response.body`, so
  `pipeThrough(new TextDecoderStream())` type-checks, or null without a body.
- `as: "file"` resolves with the blob and the name from Content-Disposition: `filename*` in UTF-8 or
  another charset, a `filename` in UTF-8, raw or percent-encoded, or a raw one in EUC-KR (CP949) with
  Hangul, jamo, hanja or symbols such as `·`, `①` and `㈜`, also when hanja or symbols outnumber the
  Hangul or a syllable stands beside a Latin letter, as in `A형.pdf`. Raw Latin-1 words such as `Müßig`,
  `créé` or `AÇÃO` stay Latin-1, and the UHC syllables such as `똠` need a runtime that decodes them, as
  browsers do.
- `as: "ndjson"` is an async iterable of the JSON of each line, which calls `on.error` when reading it
  fails. Download `progress`, upload `upload` progress, `parse` for schema validation of the data or of
  each line, and the `on.request`, `on.response`, `on.error` and `on.unauthorized` hooks. `extend` merges
  headers and hooks, and null removes a value.
- `api.sse(path)`: server-sent events as an async iterable that reconnects with `Last-Event-ID`
  after the server's `retry` when a stream ends, and after a failure after `reconnect.delay`, which is
  milliseconds or `(failures, error, fallback)` with the default as `fallback`, or an exponential
  backoff, or the whole `Retry-After` when it is longer, while a request rejects for one over 60
  seconds. After a failure without `Retry-After` it reconnects at once when the browser comes back
  online. It stops on 204, and connects again when it is iterated again. Every failed
  connection calls `on.error`, and `timeout` limits the wait for the response headers of each
  connection, not for the events. `onStatus` and `status` report `"connecting"`, also while it waits
  to reconnect, `"open"`, `"idle"` and `"closed"` like a socket, e.g. for an offline indicator, and
  `onStatus` gets `"closed"` when `signal` aborts also while no loop runs.
  `status` is `"idle"` as soon as the loop is left and stays `"closed"` after `cancel()` or an aborted
  `signal`. The data of an event is its text, or with `as: "json"` its JSON, keeping text that is not
  valid JSON as a string. `parse` validates or transforms what `as` read and types it, also
  asynchronously in the order of the events, and an event that fails rejects the loop
  without reconnecting, while iterating again continues after it. `api.sse()` throws a `TypeError` for
  an option of requests that does not apply, e.g. `retry` or `lock`, or an invalid `as` or `reconnect`,
  and passes the `fetch` options, e.g. `credentials`, to every connection. An error other than a network error,
  a timeout or a server error, e.g. the `TypeError` of a missing path parameter, rejects the loop at
  once instead of reconnecting.
  `reconnect.count` limits the failures in a row, where a connection that drops after its events
  counts too, and a stream that ends or a connection that stays open for 5 seconds resets them, so a
  server that sends an event and then drops, e.g. under a streamed POST, backs off and fails the loop.
- `api.ws(path, params?, options?)`: a WebSocket with the client's `base`, path parameters and query
  serializer that connects on first use, sends JSON, queues messages while connecting, of which `outbox` keeps only the newest, reconnects with a
  backoff or when the browser comes back online, keeps the connection alive with `heartbeat`, and is read
  with `for await` by any number of loops, each keeping only the newest `limit` messages while it is busy.
  `reconnect.count` limits the failures in a row, where a
  connection that drops after its messages counts too and one that stays open for 5 seconds resets them,
  and every failed connection calls `on.error`, also the ones it reconnects after. A socket that has
  never opened, e.g. one whose upgrade the server refuses, gives up after 5 failures in a row and rejects
  its loops with the last error, and one that has opened reconnects without a limit unless `count` sets
  one. `reconnect.delay` is milliseconds or `(failures, error, fallback)` as for `sse()`. `send` returns
  true when the message went to the open socket and false when it waits for the connection or `outbox: 0`
  dropped it. `api.ws()` throws a `TypeError` for an unknown option, a `limit` that is not a positive
  integer or Infinity, an `outbox` that is not a non-negative integer or Infinity, or an invalid `as`,
  `heartbeat` or `reconnect`. Sockets and event streams report their status as `ConnectionStatus`.
  Without a type, `send` takes JSON values, strings and binary data, and `heartbeat.message` has the type
  that `send` takes. `SocketError` rejects the loops of a socket closed with a code
  that is not reconnected, and the `WebSocket` config replaces the global WebSocket, e.g. with the ws
  package before Node.js 22. The values of a `params` function, e.g. a token, are shown as `***` in the
  URL of errors. `parse` validates or transforms every message and types it, also asynchronously in the
  order of the messages, and a message that fails closes the socket.
  ```ts
  const socket: Socket<Message, Command> = api.ws("/rooms/:id", { id }, { params: async () => ({ token: await getToken() }) })
  socket.send({ type: "join" })
  for await (const message of socket) render(message)
  ```
- `flow(options)`: plain functions as nodes that take the results of their dependencies as arguments,
  topological order whatever the order of `add`, circular dependency errors, `edge` for branches
  and loops, `flow.input()` nodes, `goto`, `skip`, `sleep`, `catch`, `fallback`, `optional`, `when`,
  `join: "any"` and `"race"`, `overlap: "restart"`, `"ignore"`, `"rerun"` or `"queue"` for a node or a sub-flow that is
  started again while it runs, `flow.each()` nodes for every item with a `concurrency`, `retry`, `timeout`, sub-flows at any
  depth that continue from their failed nodes on retry,
  `concurrency`, `maxSteps` (unlimited by default) and `mermaid()`, which draws an edge or a fallback to a
  dependent as one solid arrow with its label, names a `join`, `finish` or `overlap` other than the
  default at the node, e.g. `decide (join: race)`, and labels a `flow.queue`, `flow.keep` or
  `flow.restart` dependency. The state is `unknown` unless the flow declares it with `flow<State>()`. Adding a node throws for an unknown or invalid option, e.g. an `optional` or `finish` that is not a boolean or a `when` that is not a function, and for one that another
  option makes useless: `optional` next to `catch` or `fallback`, which handle the failure instead, `join` without dependencies to join, a `fallback` that is the node itself, which would only fail again, and `overflow: "wait"` without a stream dependency to stop reading. `run()` throws for an unknown option. A `when` that throws fails its node like an error of the node, so `retry`, which calls `when` again, `catch`, `fallback` and `optional` handle it. A map edge without a function fails the run with `FlowError` for a result that has no key, and a `select` that throws or selects another node fails the run whatever the options of the node. Targets that an edge or a fallback does not take are
  skipped, so the nodes that join the branches still run, while a dependent that is not a target runs
  whatever the edge selects, so a loop runs it after every round, and once when it is the target that
  leaves the loop. TypeScript marks an unknown option at the option, `optional` next to `catch` or
  `fallback`, a state that does not match at the function also next to options, a sub-flow whose state
  does not match, a map edge from a node
  whose result is not only strings, numbers or booleans or that lacks a key for one of them, and a function whose parameter for the context
  is not a `NodeContext`, which is a missing dependency.
- Flow runs: `await run`, `then`, `catch` and `finally`, which return promises, `idle` until nothing
  runs, `get`, `status`, `nodes`, `results`, `errors` also of sub-flows, `send`, `reload`, `retry` for the
  failed nodes and items only, also inside sub-flows, `cancel`, and `snapshot()` with
  `run(state, { snapshot })` to resume.
  A resumed `flow.each()` node gives undefined for its failed items, and a
  sub-flow node whose nodes wait for inputs is `"waiting"` in `run.nodes`, which names the nodes of a
  sub-flow only while it runs or keeps a failure to retry.
  `snapshot()` throws for a node named by its place, such as `node_2` or `flow`, whose result a resumed
  run would give to another node once the order of `add` changes. A snapshot has a `version`, which
  `run(state, { snapshot })` throws for when it does not know it, and its nodes are opaque.
  A failure that nobody handles is an unhandled rejection. Once the run has `subscribe` or `idle`, no
  failure is, and once it has `catch` or `then` with a rejection handler, a failure of a run that a
  stream started again is not.
- `run.retry()` and a resumed snapshot of a failed run give every failed node all its retries again,
  also inside sub-flows and each attempt of a sub-flow node with `retry`, and the snapshot of a failed
  run keeps the failed nodes (`fatal: true`) and their errors. They keep the result of a race that the
  failed node lost and of the nodes that used a committed resource.
- `join: "race"` also cancels the nodes that only the losers need, so a stop input that wins against
  the node that ends an agent loop aborts the loop at once. A resource whose dependents all lost is
  released with a `CancelError` at once, so the writes of an aborted loser are rolled back, and a value
  sent to an input that lost is ignored, also when the input waits again later or is inside a
  sub-flow that lost, e.g. `run.send("hr_a.decision", value)`, also in a resumed run.
- The node option `finish: true` lets a run that has started finish when a race no longer needs the
  node, e.g. a payment that was sent before a cancel won, and the run waits for it. It keeps its result for
  `run.get()` and the dependents that still run, does not follow its edges, also in a run resumed from a
  snapshot, and when it fails, its error goes to `run.errors` without failing the run and rolls back the
  resources that only it used. Otherwise the node runs as without the option.
- TypeScript requires the `catch` of an input to return a value of the input, and marks the `catch`
  that does not, so
  `flow.input<boolean | "timeout">("accept")` types its dependents and the keys of its edges with what
  `catch` returns. A sub-flow added with options but without `catch` or `optional`, e.g.
  `{ name: "sub", retry: 2 }`, keeps the type of its result without `undefined`.
- `run.send("docs.1.approve", value)` keeps the value for an item of a sub-flow that has not started
  yet, e.g. behind `concurrency`, keeps it in a snapshot (`sends`) for the resumed run, keeps it for a
  failed sub-flow until `run.retry()` continues it, ignores it for a sub-flow or an item that is done,
  whose result is final, and throws for an item or input that the flow does not have. `run.reload(path)`
  ignores and `run.pending(path)` counts 0 for a sub-flow that does not run, and both throw for a node
  that the flow does not have.
- A snapshot stores the `cause` of an error as an object with `message` and `name` too, e.g. the
  failure inside a sub-flow.
- The nodes of a sub-flow that `flow.each()` runs get the index of the item as `context.index`.
- `edge(from, map, select)` selects keys of a map, `flow.each()` without dependencies iterates the state, and the
  node `retry` takes `when(error, attempt)` and `delay(attempt, error, fallback)` like the `retry` of `http`,
  where `fallback` is 0 and undefined stops retrying.
- `package.json` sets `"sideEffects": false`, so a bundler leaves `flow` out of an app that imports only
  `http`.
- `flow.each()` takes an async iterable, so a streamed response feeds a batch:
  `.add(flow.each(index), rows)` after `rows = () => api.get("/rows", {}, { as: "ndjson" })`.
  It is read to its end before the items run, so it must be finite.
- The node option `limit` bounds the updates that `overlap: "queue"` or a `flow.queue()` dependency
  keeps waiting and drops the oldest above it, never the failed update that the queue runs again, and `run.pending(node)` counts the updates a node has not finished, so a producer
  that sends faster than the node runs can slow itself down instead of filling the memory.
  `overflow: "wait"` stops reading the stream dependencies of a node whose queue is full instead, so a
  generator, a file or a streamed response pauses without losing values. It needs a stream dependency.
- A queue node, with `overlap: "queue"` or a `flow.queue()` dependency, whose failure fails the run keeps its
  queue: `run.retry()`, a resumed snapshot or a new value runs the failed update again with its own
  arguments and `context.key`, then the updates behind it in order, each with a key of its own. A
  queue node that the failure cancelled keeps the update it ran the same way. `run.retry()` runs a failed
  update of a queue node with `optional` again with its key while no update came after it, also in a
  run resumed from a snapshot.
- **A rule per dependency.** `flow.queue(d)` keeps every value of a dependency and takes one per run,
  `flow.restart(d)` starts the run again with its newest value, and `flow.keep(d)` stores its newest
  value for the next run without touching the one that runs, e.g.
  `.add(answer, flow.queue(questions), flow.restart(models), flow.keep(settings))`. Without a wrapper a
  dependency follows the node's `overlap`. A snapshot keeps the values a queue keeps waiting, so a
  resumed run answers the questions it still owes.
- An input or a stream that a node depends on is added with its name if it is not added yet, so
  `.add(pay, get_quote, otp)` needs no `.add(otp)`. Adding it later, e.g. with a `timeout`, replaces
  the automatic one in its place, so it does not become the last added node.
- **A stream is a dependency.** A `channel()`, a socket, `run.stream(node)` or any async iterable is
  added like an input that gets every value it yields, so
  `.add(answer, flow.queue(questions), flow.restart(models))` reads two channels without a loop or
  `run.send()`. Each run reads it from its start, and a sub-flow from the start of its node, until
  `run.cancel()`. A stream that ends before its first value skips its node, one that throws fails it at
  once, also after the run is done, and `timeout`, `catch` and `optional` work as for an input.
- `run.stream(node)` is the results of a node as a stream, one per run that is done, so a node that
  runs again and again is read with `for await` instead of polling. `run.cancel()` ends it.
- **Streams.** `channel()` is a stream that any handler pushes into, e.g.
  `button.addEventListener("click", e => clicks.send(e))`, and `channel({ initial })` holds a current
  value, such as a setting, that every loop and every flow run starts with. `merge`, `share`, `until`,
  `latest`, `buffer`, `debounce` and `throttle` combine any async iterable, including `ws()`, `sse()`
  and `as: "ndjson"`. `until` ends when its stop stream yields or ends, and rejects with its error when it
  fails. A stream is read with `for await`, so `map`, `filter` and `scan` stay ordinary
  code in the loop. Leaving a composed loop never blocks on a source that cannot be interrupted, and
  closes the connection of `sse()` or `as: "ndjson"` at once, also while it waits for data or to
  reconnect and through operators nested in each other, e.g. `until(merge(api.sse(path)), stop)`. A
  source that fails after its loop left is ignored, `share` starts its source again for the next loop
  after it ended or failed, and `buffer`, `debounce` and `throttle` yield the values they hold when the
  stream ends, and also when it fails, before the error. `merge` lets the ready streams take turns, so no stream waits while others
  always have a value. Every new loop of an operator reads its streams again, so `share(merge(api.ws(path), updates))`
  opens the socket again when a widget mounts again, while a generator or a response body is read once.
  A value and the end of a window of `buffer`, `debounce` or `throttle` at the same instant come in the order of their
  timers, and the window ends first under fake timers that run the timers of one instant without the microtasks between
  them, such as `node:test` mock timers.
  `latest` calls `cancel()` of a stream or a request that it leaves, so `latest(lines, line => api.ws(path, { line }))`
  closes the socket of the line before without passing the signal on.
- `flow().check()` returns the problems of a flow without running it: a circular dependency or a
  dependency that is not added, which `run()` throws, a node that never starts because nothing that
  runs goes to it, a race against a stream or a node that a stream runs again, which the first
  value wins, `finish` on a node that no race can abandon, and a node named by its place, also in a
  sub-flow, which a snapshot cannot find. Empty when the flow is fine, so `assert.deepEqual(checkout.check(), [])` is a test.
- `run.subscribe(listener)` calls the listener after every change of a node, a result or an error,
  including inside sub-flows, at once after `send`, `reload` and `retry` and at most once per
  microtask otherwise, and returns the function that stops it.
  `run.nodes`, `run.results` and `run.errors` return the same object until the next change, so a
  run is a store for `useSyncExternalStore`, the Svelte store contract, Solid, Vue and Angular.
  Do not change the objects they return.
- **Timers and keys that survive a restart.** A resumed snapshot waits only for the time that was left of
  `context.sleep(ms)`, a retry `delay` and an input `timeout`, keeps counting attempts, and waits longer than a
  timer allows. `context.key` is made of the ID of the run, the node and how many times it started, so
  it stays the same through its retries, `run.retry()` and a resumed snapshot, even one saved before
  the node read it: `api.post("/charges", order, { idempotent: key })`. A node that starts for other
  arguments, e.g. after a dependency ran again, a `cancel()` or a snapshot taken meanwhile, gets a new key.
- **`release` for resources**, e.g. `.add(begin, { release: (tx, error) => error ? tx.rollback() : tx.commit() })`:
  called when the run is done, which waits for it and fails when it throws, when the run fails or is
  cancelled, and when the node runs again. The node starts only when one of its dependents can run, so a
  transaction is not open while a dependent waits for an input, and a skipped dependent opens none. A run started again gets new resources, and runs the nodes
  that used a rolled back one again. A snapshot keeps neither the resources nor the nodes that used an
  uncommitted one, and a resource that arrives after its node stopped, also in the tick another node
  fails, is released at once. A resumed run opens a resource again with its key, and opens none that
  only another resource that nobody needs would use.
- `run(state, { id })` names a run, and the keys of its nodes start with it, so the key of a request as
  the ID gives a request sent again the same `context.key` in every node, and `snapshot`, `subscribe`
  and `state` resume it from a table of your own. A resumed run takes the ID of its snapshot, and
  throws for another `id`.
- `trace` of `run()` gets the `start`, `done`, `fail`, `cancel` and `skip` of every node, and only the
  `skip` of an input or a stream, also inside sub-flows, for logs and spans, with the `index` of the item that `context.index` has. A node that
  loses a race while it runs gets only `cancel`, and one that has not started only `skip`.
- `latest(stream, start)` takes a function that returns a promise or a value too, and aborts the signal
  it gets when a newer value comes: a search box is one `for await`. A promise of a stream, such as an
  `as: "ndjson"` request, is read value by value, so a new question stops a streamed answer, and the values are
  typed as the stream's values also when the function returns a value or a stream, e.g. from a cache or a request.
  `every(ms)` ticks without overlap.
- `limiter.acquire()` holds a slot across several steps, e.g. a transaction, and `limiter.key(id)`
  limits each key on its own, e.g. one job per user.
- **`async-lube/durable`.** `durable(store, fn)` runs an async function once per key and keeps its
  progress in a store: `step` results are saved and never run twice, `sleep` and `wait` last for days
  without memory, `send` delivers each value to one `wait` of its name in the order sent, also while
  the run leaves memory, sleeps in the store or runs on another worker, and a `wait` that keeps a run in
  memory, e.g. beside a long step, times out on time. Leases with compare-and-set writes keep a run on one
  worker while `serve()` takes the runs of dead ones. `memory()` and `sqlite(db)` are stores that both
  keep runs as JSON, and `dueAt(run)` makes a table of any other database one.
  The input, the step results, the values sent and the result must be JSON values: `run`, `start` and
  `send` reject with a TypeError that names a value JSON would change, e.g. a Date, a Map, a class instance, a
  BigInt, `NaN` or `undefined` in an array, a step that returns one fails with it, and TypeScript rejects
  such a type as a step result, the input or result of the function, `wait<T>` or a value of `send`,
  which also takes no `undefined`. `DurableJson<T>` is that check.
  A step that throws is saved and throws its error again when the run runs again, so a function that
  catches it to compensate takes the same path. The error, and the error of a failed run, comes back as
  an instance of its class, `CancelError`, `TimeoutError`, `HttpError`, `NetworkError`, `SocketError`,
  `FlowError` or a built-in one such as `TypeError`, with its message, its `cause` and its fields that are
  JSON values, e.g. `status`, `data` and the headers of an `HttpError`, so `instanceof` gives the same
  answer after a crash as before it, and `SavedError` is that shape in the store. A failed run runs again from the step
  or the timed out `wait` whose error failed it, keeping the values that `send` gave it meanwhile: a
  `wait` that failed by its `timeout` waits a whole `timeout` again, and one that failed by an `until`
  that has passed fails again at once. The message of the `TimeoutError` names the `timeout` or, when it
  came first, the `until` as an ISO time. A run
  that reached another `step`, `sleep` or `wait` after that error, e.g. to compensate, fails with the
  same error on every `run(key)` instead of going on past what it undid, and `cancel(key)` cancels a failed
  run, so that `run(key)` rejects with `CancelError` instead of running it again.
  A caller of `run` or `join` gets the outcome at once when this worker finishes the run, and otherwise
  checks the store after `poll`, doubling the delay up to a minute.
  `join(key)` waits for a run without starting it or running a failed one again, and rejects when the
  key has no run, `start(key, input)` starts a run without waiting for its result and resolves with
  whether it started one, false when the key has a run, and TypeScript asks
  `run` for the input unless the function takes `undefined`. The function gets copies of its input, the
  step results and the values sent, so changing them never changes what the run keeps. `wait` takes
  `until`, a time in milliseconds since the epoch, beside `timeout`, and a value that arrives after
  the end of a wait never satisfies it, also when the run was out of memory, but stays for the next
  `wait` of its name. A `send` from another worker leaves a run to the worker whose lease is alive,
  which takes the value within `poll`, a run cancelled by another worker aborts `signal` with its
  `CancelError`. TypeScript reports a step result that is not a JSON value on the function of the step.
  `send` rejects for a run that is done or cancelled, and keeps a value for a key without a run until
  `run` or `start` begins one, while `join` of that key waits for it.
  A function that goes on after its worker stopped or lost the run starts no other `step`, `sleep` or `wait`:
  they reject with the `CancelError` of its `signal`, so no step runs twice at once, and a stopped worker leaves
  no timer behind. A store that throws, e.g. `SQLITE_BUSY`, never becomes an unhandled rejection: the worker
  writes the run again while its lease lasts, also when the failed write had committed, and one that cannot
  renew the lease before it ends aborts `signal` with a `CancelError` whose `cause` is the error and leaves the
  run to the next worker. `send` and `cancel` reject with the error when their own write fails. A `wait` in
  memory gets a value that another worker sent before its deadline also when `poll` would check later.
  `serve({ batch, interval, onError, signal })` takes at most `batch` due runs every `interval` and keeps
  serving when the store throws while it looks for or takes runs: `onError(error, key)` gets the error,
  with the key when it concerns one run, and the next `interval` tries again. It also gets the error of a
  run that failed while this worker ran it in the background, e.g. one it resumed, woke or began with
  `start`, but not of a cancelled one. `sleep` and the `timeout` of `wait` take a finite number of
  milliseconds from 0, `serve` a positive finite `interval` and a positive integer `batch`, and they
  reject with a TypeError otherwise, as `durable` throws one for a `lease` or `poll` that is not positive and finite.
- **Tasks.** `attempt(fn, { retry, timeout, signal })` retries any async work with a timeout for each
  attempt, `limiter({ concurrency, rate })` limits a database pool or an API quota across everything
  that uses it, and `offload(fn, { concurrency })` runs a function in a Worker or a worker thread with
  cancellation that terminates it. A function that returns at once throws a TypeError that names an
  option it does not know or an invalid value, e.g. `limiter({ concurency: 2 })`, `channel({ limit: 0 })`,
  `share`, `every`, `offload`, `ws()` and `sse()`, and `buffer`, `debounce` and `throttle` throw for
  milliseconds that are not a non-negative number, while `attempt`, a request, `serve` and `wait`
  reject with one. `attempt` stops retrying when its `delay` function returns undefined.

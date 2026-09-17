# Streams
`ws()`, `sse()` and `as: "ndjson"` are async iterables, and anything a handler pushes into a `channel()` is one too: a click, a form, a callback API. A stream is read with `for await` and left with `break`, so it stays procedural: the order of the lines is the order of the work.

[Events as streams](#events-as-streams) · [Sharing and batching](#sharing-and-batching) · [Only the latest](#only-the-latest) · [Operators](#operators) · [Channels and generators](#channels-and-generators) · [Streams in a flow](#streams-in-a-flow)

## Events as streams
```ts
import { buffer, channel, debounce, merge, share, until } from "async-lube"

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
- The handler runs while the event is dispatched, so `preventDefault()` and reading the event belong there. A loop receives the value a tick later, when the default action already happened.
- `map`, `filter`, `scan` and `take` have no helper: they are an assignment, an `if`, a variable outside the loop and a `break`.

## Sharing and batching
```ts
// one socket and one request, read by two loops at the same time, at most one render per 16 ms
const updates = share(merge(api.ws("/prices"), await api.get("/backlog", {}, { as: "ndjson" })))
void (async () => { for await (const update of updates) log(update) })()
for await (const batch of buffer(updates, 16)) render(batch)
```

## Only the latest
```ts
// a search box: a new query cancels the request of the one before it
const typed = channel<string>()
input.oninput = () => typed.send(input.value)
for await (const items of latest(debounce(typed, 300), (q, signal): Promise<Item[]> => api.get("/search", { q }, { signal }))) render(items)

// a streamed AI answer: a new question stops the answer being streamed, and the tokens of the new one follow
const questions = channel<string>()
form.onsubmit = () => questions.send(input.value)
const parse = (line: unknown) => line as { token: string }
for await (const { token } of latest(questions, (q, signal) => api.post("/answers", { q }, { as: "ndjson", parse, signal }))) answer.append(token)

// polling that never overlaps: a slow round gets the next tick at once instead of the ones it missed
for await (const tick of every(60000, { signal })) await sync()
```
- A loop runs its body one value at a time, so a body that awaits a request delays the next value; `latest` runs the newest one instead and aborts the `signal` of the one before. It yields the values of a stream, also of a promise of one such as an `as: "ndjson"` request, one by one. An error of the function ends the loop, so catch inside it what the loop should survive.

## Operators
| | |
| --- | --- |
| `channel({ initial, limit, signal })` | A stream that `send()` pushes into, with `close()`, `fail()` and `closed`. Every loop receives the values that arrive while it runs, and with `initial` it starts with the current value: the initial one or the last one sent |
| `merge(...streams)` | The values of every stream as they arrive, taking turns when several are ready. One that fails stops the others |
| `share(stream, { limit })` | Reads a stream once for all the loops that read it at the same time. When the last loop leaves, it stops the stream, and the next loop starts it again: sockets, event streams, channels and the operators here start over, while a generator or a response body is read once |
| `until(stream, stop)` | The values until the other stream yields or ends. When it fails, the loop rejects with its error |
| `latest(stream, start)` | Runs `start(value, signal)` for every value, a stream, a promise of a stream or of a value, or a value, and leaves the one before it, whose signal aborts and whose `cancel()` is called, e.g. of a socket |
| `every(ms, { immediate, signal })` | 1, 2, 3 every period. A slow loop gets the next tick at once, without the ticks it missed |
| `buffer(stream, ms)` | The values that arrive within the milliseconds after the first one, as an array, and the rest when the stream ends or before its error |
| `debounce(stream, ms)` | The last value of every quiet window, like the `debounce` of a request, and the last one when the stream ends or before its error |
| `throttle(stream, ms)` | At most one value per the milliseconds: the first at once, then the last of every window, and the held one at once when the stream ends or before its error |

A value and the end of a window of `buffer`, `debounce` or `throttle` at the same instant come in the order of their timers, and the window ends first when the timers of one instant run without the microtasks between them, as with `node:test` mock timers.

## Channels and generators
- A `channel` keeps each value for every loop that reads it until that loop takes it, and drops the values sent while no loop reads it. Set `limit`, a positive integer, where the producer is faster than the loop, e.g. `channel({ limit: 1 })` for mouse moves, and the oldest is dropped.
- **An `async function*` of your own cannot be interrupted while it waits.** The operators ask their sources to stop and do not wait for an answer, so leaving a loop is never blocked, but a source that is suspended on a promise that never settles is only cleaned up when it settles. The streams and operators of this package stop at once, also nested in each other, e.g. `until(merge(api.sse(...)), stop)`.

## Streams in a flow
A stream is also a dependency of a flow node, which runs again with every value: see [Streams as dependencies](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/flow.md#streams-as-dependencies). WebSockets and server-sent events are described in [http](https://github.com/artxe/lube-series/blob/master/packages/async-lube/docs/http.md#server-sent-events).

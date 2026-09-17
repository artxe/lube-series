# Testing
## Vitest and Jest
Every timer of the package reads `setTimeout` and `Date` when it starts, so the fake timers of Vitest or Jest run retries, timeouts, waits, input timeouts and the windows of streams and requests in an instant, days included:
```ts
vi.useFakeTimers()
const run = approval.run() // waits for an approval with a timeout of 3 days
await vi.advanceTimersByTimeAsync(3 * 24 * 60 * 60 * 1000)
expect(run.status).toBe("failed")
```
`vi.advanceTimersByTimeAsync` lets the promises run between the timers it fires, so code that sets a timer after an `await`, e.g. a step that waits twice or the idle timer of a `wait` after a step, runs at its time. A caller of a durable `run(key)` whose run left memory checks the store with a timer that doubles up to a minute, so advancing the fake timers by a day takes about 1500 reads of a store per key.

## node:test
The mock timers of `node:test` fire the timers that are due in one `tick()` without the promises between them: a timer set by code that runs after them starts at the end of the tick, and code that has not reached its timer yet, e.g. a run before its `wait`, sets it after the tick. Let the promises run before every tick, and tick in steps shorter than the delays that matter, and at most a minute for the store checks above:
```ts
import { mock } from "node:test"

mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] }) // not setImmediate, which lets the promises run
const flush = () => new Promise(resolve => setImmediate(resolve))
async function advance(ms: number, step = 60_000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
        await flush()
        mock.timers.tick(Math.min(step, end - Date.now()))
    }
    await flush()
}

const expiring = job.run("a", "a") // a step that waits 50 ms twice, then a wait with a timeout of 3 days
await advance(2000, 10)            // small steps while the step's timers run
await advance(3 * day)             // then a minute per tick
assert.equal(await expiring, "expired")
```

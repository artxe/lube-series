import type {
	DependencyPolicy,
	Durable,
	FlowRun,
	NodeContext,
	Overlap,
	Ref,
	RunOptions
} from "async-lube"
export type { SavedFlow } from "../../packages/async-lube/private.js"
export type DurableSimBody = { name: string, signal: AbortSignal, worker: string }
export type DurableSimInput = { ops: DurableSimOp[] }
export type DurableSimOp =
	| { error: "http" | "range" | "timeout", fail: "caught" | "none" | "uncaught", ms: number, n: string, t: "step" }
	| { ms: number, n: string, t: "sleep" }
	| { n: string, name: string, t: "wait", timeout: number | null, until: number | null }
export type DurableSimOptions = { failures: boolean, reads: boolean, store: "memory" | "sqlite" }
export type DurableSimSent = {
	end: number | undefined
	error: string | undefined
	id: string
	key: string
	name: string
	ok: boolean | undefined
	start: number
}
export type DurableSimWorker = { alive: boolean, durable: Durable<DurableSimInput, string[]>, id: string, serve: AbortController | undefined }
export type DynamicOptions = {
	catch?: (...args: unknown[]) => unknown
	concurrency?: number
	join?: "any" | "race"
	name: string
	optional?: boolean
	overlap?: Overlap
	retry?: { count: number, delay: number }
	timeout?: number
}
export interface DynamicFlow {
	add(node: Ref, ...args: (Ref | DynamicOptions)[]): DynamicFlow
	edge(from: Ref, targets: readonly Ref[], select: () => Ref | null): DynamicFlow
	run(state?: unknown, options?: RunOptions): FlowRun<unknown, unknown>
}
export type MergeContext = NodeContext<{ a: number[], b: number[], c: number[], i: number, j: number }>
export type Echo = {
	body: string
	headers: import("node:http").IncomingHttpHeaders
	method: string
	url: string
}
export type Flaky = {
	count: number
	idempotency_key: string | null
}
export type SimCall = { args: string, attempt: number, epoch: number, index: number | undefined, key: string, node: string }
export type SimFlow = {
	add(node: Ref, ...args: (DependencyPolicy | Ref | SimOptions)[]): SimFlow
	edge(from: Ref, targets: Ref[], select: () => Ref | null): SimFlow
	run(state?: unknown, options?: RunOptions): FlowRun<unknown, unknown>
}
export type SimMode = "edges" | "finish" | "goto" | "plain"
export type SimOptions = { [option: string]: unknown, name: string }
export type SimOutcome = { describe: string[], log: string[], problems: string[] }
export type SimRng = {
	chance(p: number): boolean
	int(n: number): number
	next(): number
	pick<T>(list: readonly T[]): T
}
export type SimSpec = {
	coop: boolean
	delay: number[]
	deps: number[]
	fail: number
	kind: "each" | "fn" | "input" | "sub"
	name: string
	options: SimOptions
	ref: Ref | undefined
	release: boolean
}
export type SimTimer = { at: number, every: number | undefined, fn: () => void, id: number, seq: number }
export type SimToken = { node: string, released: string[], token: number, value: string }
export type FuzzEnd = { error?: unknown, kind: "break" | "end" | "error" | "hang" | "never", t: number }
export type FuzzEvent = { t: number, v: unknown }
export type FuzzInner =
	| { dt: number, fail: boolean, k: "promise", name: string }
	| { k: "isrc", src: FuzzSource }
	| { k: "iop", ms: number, op: "buffer" | "debounce" | "throttle", src: FuzzSource }
	| { k: "value", name: string }
export type FuzzLeaf = { finished: boolean, name: string, pending: boolean, returned: number | undefined }
export type FuzzLoop = { end: FuzzEnd, events: FuzzEvent[], forced: boolean, reader: AsyncIterator<unknown> | undefined, throws: number }
export type FuzzSource = { gaps: number[], k: "chan" | "src", name: string, term: { dt: number, kind: "end" | "error" | "never" } }
export type FuzzSpec =
	| FuzzSource
	| { child: FuzzSpec, inner: FuzzInner, k: "latest" }
	| { child: FuzzSpec, k: "buffer" | "debounce" | "throttle", ms: number }
	| { child: FuzzSpec, k: "share" }
	| { child: FuzzSpec, k: "until", stop: FuzzSource }
	| { children: FuzzSpec[], k: "merge" }
export type FuzzTimed = { end: FuzzEnd, events: FuzzEvent[] }
export type HttpFuzzAction =
	| { body: "empty" | "json" | "malformed" | "text", delay: number, k: "ok", status: 200 | 201 | 204 }
	| { delay: number, k: "status", retry_after: string | undefined, status: number }
	| { k: "drop", when: "before" | "mid-body" }
	| { k: "hang" }
	| { k: "slow-body" }
export type HttpFuzzConfig = {
	as: "json" | "text" | undefined
	count: number
	custom_delay: boolean
	idempotent: boolean
	method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT"
	refresh: boolean
	retry_at: "client" | "none" | "request"
	stream: boolean
	timeout: number | undefined
	when: boolean
}
export type HttpFuzzExpect = {
	delays: number
	error_hook: number
	outcome: string
	refreshes: number
	response_hook: number
	server: number
	status: number | undefined
	unauthorized: number
}
export type HttpFuzzHooks = { delay: number, error: unknown[], refresh: number, request: number, response: number, unauthorized: unknown[], when: number }
export type SseFuzzCase = { connections: number, last_ids: number[], next_id: number, open: Set<import("node:http").ServerResponse>, script: SseFuzzConnection[] }
export type SseFuzzConnection =
	| { gap: number, k: "events", n: number, retry: number | undefined, then: "drop" | "end" | "stay" }
	| { k: "hang" }
	| { k: "status", retry_after: string | undefined, status: number }
	| { k: "wrong-type" }
export type WsFuzzCase = { connections: number, received: string[], script: WsFuzzConnection[], sequence: number }
export type WsFuzzConnection =
	| { gap: number, k: "accept", messages: number, pong: boolean, then: number | "silent" | "stay" | "terminate" }
	| { k: "hang" }
	| { k: "refuse" }
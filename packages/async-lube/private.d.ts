import type {
	FlowStatus,
	NodeStatus,
	RawResponse,
	RequestOptions,
	RequestSummary,
	ResponseType,
	RetryOptions,
	ServerEvent,
	SocketOptions,
	TraceEvent,
	WebSocketLike
} from "./public.js"
export declare const ARRIVE: unique symbol
export declare const DEFINITION: unique symbol
export declare const EACH: unique symbol
export declare const FAILURES: unique symbol
export declare const GOTO: unique symbol
export declare const INDEX: unique symbol
export declare const INPUT: unique symbol
export declare const ON_CHANGE: unique symbol
export declare const RUN_ID: unique symbol
export declare const SKIP: unique symbol
export declare const STOP: unique symbol
export type BacklogEntry = { args: unknown[], resume?: boolean, skipped: boolean }
export type ClientContext = {
	base_init: Record<string, unknown>
	client_id: number
	config: import("./public.js").HttpConfig
	shared: SharedState
}
export type Context = {
	attempt: number
	goto: (...targets: unknown[]) => GotoResult
	index: number | undefined
	key: string
	name: string
	previous: unknown
	signal: AbortSignal
	skip: () => typeof SKIP
	sleep: (ms: number) => Promise<void>
	state: unknown
}
export type Cycle<T> = {
	promise: Promise<T>
	reject: (reason: unknown) => void
	resolve: (value: T) => void
	settled: boolean
}
export type Deferred = {
	reject: (error: unknown) => void
	resolve: (value: unknown) => void
}
export type DurableBlock = { status: "sleeping" | "waiting", wake: number | undefined }
export type DurableExecution = {
	absorbed: number
	blocked: DurableBlock[]
	controller: AbortController
	cursor: number
	dirty: boolean
	failures: Map<unknown, { entry: import("./public.js").JournalEntry, reached: number }>
	fault: unknown
	finished: boolean
	flights: number
	gone: Promise<void>
	inbox_timer: ReturnType<typeof setInterval> | undefined
	interrupt: (reason: unknown) => void
	key: string
	lease: number | undefined
	lost: boolean
	outcome: Promise<DurableOutcome>
	saved: import("./public.js").SavedRun
	suspending: boolean
	taken: number
	tried: import("./public.js").SavedRun[]
	unsaved: Set<{ at: number, value: unknown }>
	waiters: Map<string, DurableWaiter[]>
	writing: Promise<boolean> | undefined
	written: number
}
export type DurableOutcome = { detached: true } | { error: unknown } | { value: unknown }
export type DurableWorker = {
	fn: (input: never, context: import("./public.js").DurableContext) => unknown
	halted: boolean
	idle_ms: number
	lease_ms: number
	live: Map<string, DurableExecution>
	migrate: ((run: import("./public.js").SavedRun, revision: number | undefined) => import("./public.js").SavedRun | PromiseLike<import("./public.js").SavedRun>) | undefined
	owner: string
	poll_cap: number
	poll_ms: number
	pollers: Map<string, DurablePoller>
	renew_ms: number
	reporters: Set<(error: unknown, key?: string) => void>
	revision: number | undefined
	stoppers: Set<() => void>
	store: import("./public.js").DurableStore
	watchers: Map<string, Set<Deferred>>
}
export type DurablePoller = {
	checking: boolean
	delay: number
	timer: ReturnType<typeof setTimeout> | undefined
}
export type DurableWaiter = {
	block: DurableBlock | undefined
	clear: () => void
	entry: import("./public.js").JournalEntry
	reject: (error: unknown) => void
	resolve: (value: unknown) => void
}
export type DefinitionEdge = {
	from: NodeRef
	labels: [string, NodeRef][]
	map: Record<string, NodeRef> | undefined
	select: EdgeSelect
	targets: NodeRef[]
}
export type DefinitionNode = {
	auto?: boolean
	deps: NodeRef[]
	each: boolean
	kind: "flow" | "input" | "task"
	name: string
	named: boolean
	options: RawNodeOptions
	ref: NodeRef
	source?: AsyncIterable<unknown> | undefined
}
export type EdgeSelect = (result: unknown, context: { state: unknown }) => unknown
export type FlowBuilder = {
	readonly [DEFINITION]: FlowDefinition
	add(ref: NodeRef, ...args: (RawNodeOptions | NodeRef)[]): FlowBuilder
	check(): string[]
	edge(from: NodeRef, to: NodeRef | NodeRef[] | Record<string, NodeRef>, select?: EdgeSelect): FlowBuilder
	mermaid(): string
	run(state?: unknown, options?: RawRunOptions): FlowRunner
}
export type FlowDefinition = {
	count: number
	edges: DefinitionEdge[]
	list: DefinitionNode[]
	names: Map<string, number>
	options: { concurrency?: number, maxSteps?: number }
	refs: Map<NodeRef, number>
}
export type FlowRef = FlowBuilder & {
	readonly [EACH]?: undefined
	readonly [INPUT]?: undefined
	readonly name?: undefined
}
export type FlowRunner = PromiseLike<unknown> & {
	[FAILURES](): boolean
	[STOP](): void
	cancel(reason?: unknown): void
	catch(on_rejected?: ((reason: unknown) => unknown) | null): Promise<unknown>
	readonly errors: Record<string, unknown>
	finally(on_finally?: (() => void) | null): Promise<unknown>
	get(target: NodeRef | string): unknown
	idle(): Promise<void>
	readonly nodes: Record<string, NodeStatus>
	pending(target: NodeRef | string): number
	reload(target?: NodeRef | string): void
	readonly results: Record<string, unknown>
	retry(): void
	send(target: InputRef | string, value: unknown): void
	snapshot(): SavedFlow
	readonly state: unknown
	readonly status: FlowStatus
	stream(target: NodeRef | string): AsyncIterable<unknown>
	subscribe(listener: () => void): () => void
}
export type GotoResult = { readonly [GOTO]: unknown[] }
export type Hook = (...args: unknown[]) => unknown
export type InputRef = {
	readonly [DEFINITION]?: undefined
	readonly [EACH]?: undefined
	readonly [INPUT]: "named" | "unnamed"
	readonly name: string
}
export type ItemResult = { failed?: boolean, value: unknown } | null | undefined
export type Job = {
	controller: AbortController
	key: string | undefined
	promise: Promise<RawResponse<unknown>>
	refs: number
	settled: boolean
}
export type JobSpec = {
	body: unknown
	idempotency_key: string | undefined
	method: string
	options: Options
	silent: boolean
	summary: RequestSummary
	url: string
}
export type RawNodeOptions = {
	catch?: (error: unknown, ...args: unknown[]) => unknown
	concurrency?: number
	fallback?: NodeRef | NodeRef[]
	finish?: boolean
	join?: "all" | "any" | "race"
	limit?: number
	name?: string
	optional?: boolean
	overflow?: "drop" | "wait"
	overlap?: "ignore" | "queue" | "rerun" | "restart"
	release?: (value: unknown, error: unknown) => unknown
	retry?: number | RetryOptions
	timeout?: number
	when?: (...args: unknown[]) => boolean
}
export type NodeRecord = {
	abandoned: boolean
	activated: boolean
	activators: Set<string>
	args: unknown[] | undefined
	backlog: BacklogEntry[]
	backlog_head: number
	buffer: { value: unknown } | undefined
	controller: AbortController | undefined
	deadline: number | undefined
	delaying: number
	dropped: number
	fatal: boolean
	gate: { error: unknown } | true | undefined
	holding: boolean
	item_list: unknown[] | undefined
	item_source: unknown
	items: ItemResult[] | undefined
	node: ProgramNode
	previous: unknown
	queued: Map<string, unknown[]> | undefined
	released: { error: unknown } | undefined
	result: unknown
	resume_deadline: number | undefined
	resume_items: ItemResult[] | undefined
	resume_runs: Record<string, RunSnapshot> | undefined
	resume_subs: Record<string, SavedFlow> | undefined
	retrigger: boolean
	retrying: boolean
	runs: Map<string, RunState>
	sends: Map<string, [string, unknown][]> | undefined
	serial: number
	slot: boolean
	source_ended: boolean
	source_error: { error: unknown } | undefined
	status: NodeStatus
	sub_running: number
	sub_runs: Map<string, FlowRunner>
	sub_waiting: number
	timer: ReturnType<typeof setTimeout> | undefined
	token: number
}
export type NodeRef = FlowRef | InputRef | StreamRef | TaskRef
export type { FlowStatus, NodeStatus }
export type SavedFlow = {
	errors: Record<string, unknown>
	id?: string
	nodes: Record<string, SavedNode>
	version: 1
}
export type SavedNode = {
	abandoned?: boolean
	activated: boolean
	activators?: string[]
	backlog?: { args: unknown[], resume?: boolean, skipped: boolean }[]
	buffer?: { value: unknown }
	deadline?: number
	fatal?: boolean
	items?: ({ failed?: boolean, value: unknown } | null)[]
	previous?: unknown
	queued?: Record<string, unknown[]>
	result?: unknown
	runs?: Record<string, { attempt: number, delay?: number, serial: number, waits: number[] }>
	sends?: Record<string, [string, unknown][]>
	serial?: number
	status: "done" | "failed" | "idle" | "skipped"
	subs?: Record<string, SavedFlow>
}
export type LimiterJob = {
	fn: (() => unknown) | undefined
	reject: (error: unknown) => void
	resolve: (value: unknown) => void
	unlink: () => void
}
export type LimiterState = {
	queue: LimiterJob[]
	running: number
	schedule: () => void
}
export type NodeWorker = {
	on(event: "error" | "message", listener: (value: never) => void): void
	postMessage(message: unknown): void
	ref(): void
	terminate(): Promise<number>
	unref(): void
}
export type OffloadJob = {
	args: unknown[]
	id: number
	reject: (error: unknown) => void
	resolve: (value: unknown) => void
}
export type OffloadWorker = {
	idle?: () => void
	job: OffloadJob | undefined
	send: (message: unknown) => void
	stop: () => void
}
export type Options = Omit<RequestOptions, "as"> & {
	as?: ResponseType | "events" | undefined
}
export type Outcome = { index?: number | undefined, items?: boolean, kind: "done" | "error" | "stale", value?: unknown }
export type Program = {
	edges: Map<string, ProgramEdge>
	forward: Map<string, string[]>
	incoming: Set<string>
	is_downstream: (target: string, name: string) => boolean
	last: string | undefined
	name_of: (target: unknown) => string | undefined
	node_of: (name: string) => ProgramNode | undefined
	nodes: ProgramNode[]
	options: { concurrency?: number, maxSteps?: number }
	sources: Map<string, string[]>
	transitions: Map<string, string[]>
}
export type ProgramEdge = {
	labels: [string, string][]
	map: Record<string, string> | undefined
	select: EdgeSelect
	targets: string[]
}
export type ProgramNode = {
	arrive: Record<string, "keep" | "queue" | "restart"> | undefined
	dependents: string[]
	deps: string[]
	each: boolean
	fallback: string[]
	kind: "flow" | "input" | "task"
	name: string
	named: boolean
	options: RawNodeOptions
	queuers: string[]
	run: Task | undefined
	source: AsyncIterable<unknown> | undefined
	sub: FlowDefinition | undefined
}
export type RefProbe = {
	readonly [ARRIVE]?: unknown
	readonly [DEFINITION]?: unknown
	readonly [GOTO]?: unknown
	readonly [INPUT]?: unknown
} | null | undefined
export type RefreshState = {
	controller: AbortController | undefined
	failed_generation: number
	generation: number
	refreshing: Promise<void> | undefined
	time_out: ((error: Error) => void) | undefined
	timed_out: Error | undefined
	timer: ReturnType<typeof setTimeout> | undefined
	unauthorized_generation: number
	waiters: number
}
export type RunContext = {
	active_count: number
	concurrency: number
	cycle: Cycle<unknown>
	edges: Program["edges"]
	errors: Record<string, unknown>
	flushing: boolean
	incoming: Program["incoming"]
	item_index: number | undefined
	jobs: (() => void)[]
	max_steps: number
	notified_version: number
	observed: boolean
	program: Program
	pumping: boolean
	pumps: (() => void)[]
	queue: string[]
	records: Map<string, NodeRecord>
	releasing: boolean
	reported_status: FlowStatus
	reported_version: number
	results: Record<string, unknown>
	room_waiters: ((value: unknown) => void)[]
	run: FlowRunner
	run_id: string
	run_options: RawRunOptions
	run_status: "cancelled" | "done" | "failed" | "running"
	running: number
	scheduled: boolean
	signal_target: Pick<AbortController, "abort">
	state: unknown
	steps: number
	streaming: boolean
	streams: Map<string, import("./public.js").Channel<unknown>>
	subscribers: Set<() => void>
	trace: ((event: TraceEvent) => void) | undefined
	trace_path: string | undefined
	unlink_signal: () => void
	version: number
	waiters: (() => void)[]
	watched: boolean
}
export type RawRunOptions = {
	[INDEX]?: number | undefined
	[ON_CHANGE]?: (status: FlowStatus) => void
	[RUN_ID]?: string
	id?: string | undefined
	signal?: AbortSignal
	snapshot?: SavedFlow
	trace?: ((event: TraceEvent) => void) | undefined
}
export type ResumePlan = {
	items: ItemResult[] | undefined
	retrying: boolean
	runs: Record<string, RunSnapshot> | undefined
	subs: Record<string, SavedFlow> | undefined
}
export type RunSnapshot = NonNullable<SavedNode["runs"]>[string]
export type RunState = {
	attempt: number
	delay: number | undefined
	serial: number
	wait: number
	waits: number[]
}
export type SharedState = {
	latest: Map<string, (reason: string) => void>
	shared: Map<string, Job>
	throttles: Map<string, { cancel: ((reason: string) => void) | undefined, next: number }>
}
export type StreamLoop = {
	buffer: unknown[]
	ended: boolean
	error: { value: unknown } | undefined
	head: number
	wake: (() => void) | undefined
}
export type StreamSource = {
	close(): void
	readonly ended: boolean
	fail(error: unknown): void
	read(on_first?: () => void, on_last?: () => void): AsyncIterableIterator<unknown>
	write(value: unknown): void
}
export type SocketLoop = {
	buffer: unknown[]
	ended: boolean
	error: { value: unknown } | undefined
	head: number
	wake: (() => void) | undefined
}
export type SocketSetup = {
	create: (url: string, protocols: string | string[] | undefined) => WebSocketLike
	options: SocketOptions<unknown>
	report: (error: unknown) => void
	summary: RequestSummary
	timeout: number | undefined
	url: () => Promise<{ redacted: string, url: string }>
}
export type StreamRecord = { event: ServerEvent, type: "event" }
	| { id: string, type: "id" }
	| { retry: number, type: "retry" }
export type StreamRef = AsyncIterable<unknown> & {
	readonly [DEFINITION]?: undefined
	readonly [EACH]?: undefined
	readonly [INPUT]?: undefined
	readonly name?: undefined
}
export type Task = (...args: unknown[]) => unknown
export type TaskRef = Task & {
	readonly [DEFINITION]?: undefined
	[EACH]?: FlowRef | TaskRef
	readonly [INPUT]?: undefined
}
import {
	CancelError,
	type Channel,
	type ConnectionStatus,
	type Dep,
	type DependencyPolicy,
	type DownloadedFile,
	type Each,
	type EventStream,
	FlowError,
	type FlowSnapshot,
	type Http,
	HttpError,
	type Limiter,
	type NodeContext,
	type NodeStatus,
	type OffloadCall,
	type ReconnectOptions,
	type RetryOptions,
	type ServerEvent,
	type Socket,
	SocketError,
	TimeoutError,
	type TraceEvent,
	attempt,
	buffer,
	channel,
	debounce,
	every,
	flow,
	http,
	isCancel,
	latest,
	limiter,
	merge,
	offload,
	share,
	throttle,
	until
} from "async-lube"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
	? true
	: false
function expect_type<A, B>(_: Equal<A, B>) {}
type User = { id: number, name: string }
function parse_user(data: unknown): User {
	if (
		typeof data == "object"
		&& data
		&& "id" in data
		&& typeof data.id == "number"
		&& "name" in data
		&& typeof data.name == "string"
	) return { id: data.id, name: data.name }
	throw TypeError("Invalid user")
}
const api = http(
	{
		base: "https://api.example.com",
		credentials: "include",
		headers: async () => ({ Authorization: "Bearer token" }),
		on: {
			error: error => alert(
				error instanceof Error ? error.message : String(error)
			),
			request: context => context.headers.set(
				"X-Trace",
				context.method + context.url
			),
			unauthorized: error => error.status
		},
		refresh: signal => http().post(
			"/auth/refresh",
			void 0,
			{ signal }
		),
		retry: {
			count: 2,
			when: error => error instanceof HttpError && error.status >= 500
		},
		timeout: 10000
	}
)
async function arrive_syntax() {
	const bread = flow.input<string>("bread")
	const patty = flow.input<number>("patty")
	const cabbage = flow.input<boolean>("cabbage")
	const queued: DependencyPolicy<typeof bread> = flow.queue(bread)
	const dep: Dep<string> = queued
	void dep
	function burger(b: string, p: number, c: boolean) {
		return `${b}${p}${c}`
	}
	const run = flow()
		.add(bread)
		.add(patty)
		.add(cabbage)
		.add(
			burger,
			flow.queue(bread),
			flow.restart(patty),
			flow.keep(cabbage),
			{ limit: 5 }
		)
		.run()
	for await (const made of run.stream(burger)) expect_type<typeof made, string>(true)
	flow()
		.add(bread)
		.add(patty)
		.add(
			// @ts-expect-error: a wrapped patty is still a number
			(b: string, p: string) => b + p,
			bread,
			flow.restart(patty)
		)
	// @ts-expect-error: only a node can be wrapped
	flow.queue("bread")
	const saved: FlowSnapshot = run.snapshot()
	expect_type<FlowSnapshot["version"], 1>(true)
	// @ts-expect-error: a node snapshot is opaque
	void saved.nodes["burger"]?.queued
	run.idle().then(
		done => expect_type<typeof done, void>(true)
	)
}
async function backend_syntax() {
	type Tx = { commit(): Promise<void>, id: number, rollback(): Promise<void> }
	async function begin(): Promise<Tx> {
		return {
			commit: async () => {},
			id: 1,
			rollback: async () => {}
		}
	}
	function insert(tx: Tx, { key }: NodeContext) {
		expect_type<typeof key, string>(true)
		return tx.id
	}
	const saved = flow()
		.add(
			begin,
			{
				release: (tx, error) => {
					expect_type<typeof tx, Tx>(true)
					return error ? tx.rollback() : tx.commit()
				}
			}
		)
		.add(insert, begin)
	expect_type<Awaited<ReturnType<typeof saved.run>>, number>(true)
	flow().add(
		begin,
		{
			// @ts-expect-error: release gets the result of the node
			release: (tx: string) => tx
		}
	)
	const lines = channel<number>()
	flow().add(
		(line: number) => line,
		flow.queue(lines),
		{ limit: 10, overflow: "wait" }
	)
	flow().add(
		(line: number) => line,
		lines,
		// @ts-expect-error: overflow needs a queue
		{ overflow: "wait" }
	)
	const rows = await attempt(
		async ({ attempt: count, signal }) => {
			expect_type<typeof signal, AbortSignal>(true)
			return [ count ]
		},
		{
			retry: {
				count: 3,
				delay: count => count * 100
			},
			timeout: 5000
		}
	)
	expect_type<typeof rows, number[]>(true)
	const db: Limiter = limiter(
		{
			concurrency: 10,
			rate: { count: 100, per: 1000 }
		}
	)
	// @ts-expect-error: an unknown option is rejected
	void limiter({ concurency: 2 })
	void attempt(
		() => 1,
		// @ts-expect-error: an unknown option is rejected
		{ timout: 10 }
	)
	const user = await db(async () => ({ id: 1 }))
	expect_type<typeof user, { id: number }>(true)
	void db.pending
	const resize = offload(
		(
			bytes: ArrayBuffer,
			width: number
		) => bytes.byteLength * width
	)
	const call: OffloadCall<number> = resize(new ArrayBuffer(8), 2)
	call.cancel()
	expect_type<Awaited<typeof call>, number>(true)
	void resize(
		new ArrayBuffer(8),
		2,
		new AbortController().signal
	)
	// @ts-expect-error: the arguments are checked
	void resize("bytes", 2)
	resize.close()
	const lease = await db.acquire()
	lease.release()
	const per_user: Limiter = db.key("user-1")
	void per_user(async () => 1)
	const typed = channel<string>()
	for await (const items of latest(
		typed,
		(q, signal) => api.get<string[]>("/search", { q }, { signal })
	)) expect_type<typeof items, string[]>(true)
	for await (const doubled of latest(
		channel<number>(),
		value => value * 2
	)) expect_type<typeof doubled, number>(true)
	for await (const answer of latest(
		typed,
		(q, signal) => api.post(
			"/answers",
			{ q },
			{
				as: "ndjson",
				parse: parse_user,
				signal
			}
		)
	)) expect_type<typeof answer, User>(true)
	for await (const line of latest(
		typed,
		async q => (await api.get("/search", { q }, { as: "ndjson" }))
	)) expect_type<typeof line, unknown>(true)
	for await (const list of latest(typed, async () => [ 1 ])) expect_type<typeof list, number[]>(true)
	async function* spell(q: string) {
		yield* q
	}
	for await (const letter of latest(
		typed,
		async q => q.length > 1 ? spell(q) : q
	)) expect_type<typeof letter, string>(true)
	for await (const part of latest(
		typed,
		q => q ? spell(q) : q.length
	)) expect_type<typeof part, string | number>(true)
	for await (const tick of every(1000, { immediate: true })) expect_type<typeof tick, number>(true)
	const identified = saved.run(void 0, { id: "order-1" })
	void identified
	void saved.run(
		void 0,
		{
			trace: (event: TraceEvent) => {
				if (event.type == "fail") expect_type<typeof event.retry, boolean>(true)
			}
		}
	)
	const snapshot: FlowSnapshot = saved.run().snapshot()
	saved.run(
		undefined,
		{
			snapshot: JSON.parse(JSON.stringify(snapshot))
		}
	)
	// @ts-expect-error: a snapshot has a version
	const unversioned: FlowSnapshot = { errors: {}, nodes: {} }
	void unversioned
	const node = { status: "done" }
	// @ts-expect-error: a node snapshot is not built by hand
	const opaque: FlowSnapshot["nodes"][string] = node
	void opaque
	// @ts-expect-error: an unknown run option
	saved.run(undefined, { ids: "a" })
}
async function flow_syntax() {
	type Cart = { items: string[], total: number }
	type Paid = { id: string }
	function get_cart(
		{ signal }: NodeContext<unknown>
	) {
		return api.get<Cart>("/cart", {}, { signal })
	}
	function get_quote(
		cart: Cart,
		user: User,
		{ state }: NodeContext<{ coupon?: string }>
	) {
		return cart.total - (state.coupon ? user.id : 0)
	}
	function get_user() {
		return api.get<User>("/me")
	}
	const otp = flow.input<string>("otp")
	function pay(quote: number, code: string) {
		return api.post<Paid>("/pay", { code, quote })
	}
	function pay_later(quote: number) {
		return api.post<Paid>("/pay/later", { quote })
	}
	function receipt(
		paid: Paid | undefined,
		later: Paid | undefined
	) {
		return paid ?? later
	}
	const checkout = flow<{ coupon?: string }>({ concurrency: 4 })
		.add(get_cart)
		.add(get_user)
		.add(get_quote, get_cart, get_user)
		.add(otp, get_quote, { timeout: 60000 })
		.add(
			pay,
			get_quote,
			otp,
			{ fallback: pay_later, retry: 2 }
		)
		.add(pay_later, get_quote)
		.add(
			receipt,
			pay,
			pay_later,
			{ join: "any" }
		)
	// @ts-expect-error: the arguments do not match the dependencies
	flow<{ coupon?: string }>().add(get_quote, get_user, get_cart)
	// @ts-expect-error: the state of a flow without a type argument is unknown
	flow().add(get_quote, get_cart, get_user)
	flow().add(
		({ state }) => expect_type<typeof state, unknown>(true)
	)
	flow().add(
		(cart, user, { attempt: count }) => {
			expect_type<typeof cart, Cart>(true)
			return user.name + cart.total + count
		},
		get_cart,
		get_user
	)
	const run = checkout.run({ coupon: "SAVE" })
	run.send(otp, "123456")
	// @ts-expect-error: otp is a string
	run.send(otp, 123456)
	run.reload(get_cart)
	const quote = run.get(get_quote)
	expect_type<typeof quote, number | undefined>(true)
	const done = await run
	expect_type<typeof done, Paid | undefined>(true)
	const saved: FlowSnapshot = JSON.parse(JSON.stringify(run.snapshot()))
	checkout.run(
		{ coupon: "SAVE" },
		{ snapshot: saved }
	)
	run.retry()
	const stop: () => void = run.subscribe(() => {})
	stop()
	expect_type<ReturnType<typeof run.pending>, number>(true)
	run.pending(get_cart)
	run.pending("get_cart")
	expect_type<typeof run.nodes, Record<string, NodeStatus>>(true)
	function files() {
		return [ "a.txt", "b.txt" ]
	}
	async function* rows() {
		yield "a.txt"
	}
	flow()
		.add(rows)
		.add(
			flow.each((file: string) => file.length),
			rows
		)
	flow()
		.add(files)
		.add(
			flow.each((file: string) => file.length),
			files,
			{ limit: 10, overlap: "queue" }
		)
	function upload(
		file: string,
		{ index }: NodeContext
	) {
		return file.length + (index ?? 0)
	}
	const upload_all = flow.each(upload)
	expect_type<typeof upload_all, Each<string, [NodeContext], number>>(true)
	function total(sizes: number[]) {
		return sizes.length
	}
	const uploads = await flow()
		.add(files)
		.add(
			upload_all,
			files,
			{
				catch: (_, file) => file.length,
				concurrency: 2
			}
		)
		.run()
	flow()
		.add(files)
		.add(upload_all, files)
		.add(total, upload_all)
	const size_all = flow.each((size: number) => size)
	// @ts-expect-error: the items are strings
	flow().add(size_all, files)
	expect_type<typeof uploads, number[]>(true)
	const partial = await flow()
		.add(files)
		.add(
			upload_all,
			files,
			{ optional: true }
		)
		.run()
	expect_type<typeof partial, (number | undefined)[]>(true)
	const partial_state = await flow<string[]>()
		.add(upload_all, { optional: true })
		.run([ "a.txt" ])
	expect_type<typeof partial_state, (number | undefined)[]>(true)
	const maybe_total = await flow()
		.add(files)
		.add(
			(names: string[]) => names.length,
			files,
			{ optional: true }
		)
		.run()
	expect_type<typeof maybe_total, number | undefined>(true)
	const maybe_any = await flow()
		.add(files)
		.add(
			(sizes?: string[]) => sizes?.length ?? 0,
			files,
			{ join: "any", optional: true }
		)
		.run()
	expect_type<typeof maybe_any, number | undefined>(true)
	const maybe_sub = await flow()
		.add(files)
		.add(
			flow<string[]>().add(({ state }) => state.length),
			files,
			{ optional: true }
		)
		.run()
	expect_type<typeof maybe_sub, number | undefined>(true)
	const named_sub = await flow()
		.add(files)
		.add(
			flow<string[]>().add(({ state }) => state.length),
			files,
			{ name: "count", retry: 2 }
		)
		.run()
	expect_type<typeof named_sub, number>(true)
	const caught_sub = await flow()
		.add(files)
		.add(
			flow<string[]>().add(({ state }) => state.length),
			files,
			{ catch: () => "none" as const }
		)
		.run()
	expect_type<typeof caught_sub, number | "none">(true)
	const count_files = flow<string[]>().add(({ state }) => state.length)
	flow().add(files)
		// @ts-expect-error: the state of the sub-flow does not match
		.add(count_files, files, get_cart)
	function then_names(
		_: number[],
		{ state }: NodeContext<string[]>
	) {
		return state
	}
	const counted = await flow<string[]>()
		.add(upload_all)
		.add(then_names, upload_all)
		.add(count_files, then_names)
		.run([ "a.txt" ])
	expect_type<typeof counted, number>(true)
	const answer = flow.input<string>("answer")
	const maybe_answer = await flow().add(
		answer,
		{ optional: true, timeout: 10 }
	)
		.run()
	expect_type<typeof maybe_answer, string | undefined>(true)
	const answer_or_default = flow.input<string | 42>("answer")
	const default_answer = await flow().add(
		answer_or_default,
		{
			catch: () => 42 as const,
			timeout: 10
		}
	)
		.run()
	expect_type<typeof default_answer, string | 42>(true)
	flow().add(
		answer,
		{
			// @ts-expect-error: the input gives strings, so declare flow.input<string | 42>
			catch: () => 42 as const,
			timeout: 10
		}
	)
	const accept = flow.input<boolean | "timeout">("accept")
	function accepted(value: boolean | "timeout") {
		return value
	}
	function timed_out() {
		return "timed out"
	}
	flow()
		.add(
			accept,
			{
				catch: () => "timeout" as const,
				timeout: 10
			}
		)
		.add(accepted, accept)
		.add(timed_out)
		.edge(
			accept,
			{
				false: timed_out,
				timeout: timed_out,
				true: accepted
			}
		)
	flow().add(
		accept,
		{
			catch: (_, { skip }) => skip(),
			timeout: 10
		}
	)
	const paid = await flow()
		.add(accept)
		.add(accepted, accept, { finish: true })
		.run()
	expect_type<typeof paid, boolean | "timeout">(true)
	const plain_answer = await flow().add(answer, { timeout: 10 })
		.run()
	expect_type<typeof plain_answer, string>(true)
	const safe = await flow()
		.add(
			() => Math.random(),
			{
				catch: () => "fallback" as const
			}
		)
		.run()
	expect_type<typeof safe, number | "fallback">(true)
	const summarize = flow<string>().add(({ state }) => state.length)
	const lengths = await flow()
		.add(files)
		.add(
			flow.each(summarize),
			files,
			{ concurrency: 2 }
		)
		.run()
	expect_type<typeof lengths, number[]>(true)
	expect_type<Extract<keyof typeof import("async-lube"), "each" | "input">, never>(true)
	const draft = flow.input<string>("draft")
	function save(text: string) {
		return api.put("/drafts", text)
	}
	flow()
		.add(draft)
		.add(save, draft, { overlap: "rerun" })
		.add(
			flow.each(summarize),
			files,
			{ overlap: "queue" }
		)
	const drafts = flow().add(draft)
	drafts.add(save, draft, { overlap: "ignore" })
	// @ts-expect-error: overlap is restart, ignore, rerun or queue
	drafts.add(save, draft, { overlap: "skip" })
	drafts.add(
		async (
			text: string,
			{ sleep }: NodeContext
		) => (await sleep(10), text),
		draft,
		{
			finish: true,
			when: text => text.length > 0
		}
	)
	// @ts-expect-error: the context sleeps, it does not wait
	function waits({ wait }: NodeContext) {
		return wait
	}
	void waits
	// @ts-expect-error: an input has no overlap
	flow().add(draft, { overlap: "queue" })
	function heads() {
		return "heads"
	}
	function tails() {
		return "tails"
	}
	function toss() {
		return Math.random() > 0.5
	}
	flow()
		.add(toss)
		.add(heads)
		.add(tails)
		.edge(
			toss,
			{ false: tails, true: heads }
		)
		.edge(
			heads,
			[ toss, tails ],
			result => {
				expect_type<typeof result, string>(true)
				return result == "heads" ? toss : tails
			}
		)
		.mermaid()
		.trim()
	function verdict(): "answer" | "ask" {
		return Math.random() > 0.5 ? "answer" : "ask"
	}
	const verdicts = flow().add(verdict)
		.add(heads)
		.add(tails)
	verdicts.edge(
		verdict,
		{ answer: heads, ask: tails }
	)
	// @ts-expect-error: the result is never "asks"
	verdicts.edge(verdict, { asks: tails })
	// @ts-expect-error: "ask" has no key
	verdicts.edge(verdict, { answer: heads })
	function judge() {
		return { verdict: verdict() }
	}
	const judges = flow().add(judge)
		.add(heads)
		.add(tails)
	judges.edge(
		judge,
		{ answer: heads, ask: tails },
		result => result.verdict
	)
	function typo() {
		return "typo" as const
	}
	// @ts-expect-error: select returns a key of the map
	judges.edge(judge, { answer: heads }, typo)
	// @ts-expect-error: an object result has no keys to map
	judges.edge(judge, { answer: heads })
	function anything(): unknown {
		return "answer"
	}
	flow().add(anything)
		.add(heads)
		.edge(anything, { answer: heads })
	function charge() {
		return Math.random() > 0.5 ? { id: "paid" } : "declined" as const
	}
	flow().add(charge)
		.add(tails)
		// @ts-expect-error: an object result has no key
		.edge(charge, { declined: tails })
	flow().add(charge)
		.add(tails)
		.edge(
			charge,
			[ tails ],
			result => result == "declined" ? tails : null
		)
	flow().add(
		heads,
		// @ts-expect-error: optional next to catch
		{ catch: () => "", optional: true }
	)
	flow().add(
		heads,
		// @ts-expect-error: optional next to fallback
		{ fallback: tails, optional: true }
	)
	flow().add(
		heads,
		{ optional: false, retry: 1 }
	)
	// @ts-expect-error: timout is not an option
	flow().add(heads, { retry: 2, timout: 5 })
	flow().add(toss)
		// @ts-expect-error: timout is not an option
		.add(heads, toss, { timout: 5 })
	function greet(
		who: User,
		guest: { name: string }
	) {
		return who.name + guest.name
	}
	flow().add(get_user)
		// @ts-expect-error: the context parameter is not a NodeContext, so a dependency is missing
		.add(greet, get_user)
	flow().add(get_user)
		// @ts-expect-error: the context parameter is not a NodeContext, so a dependency is missing
		.add(greet, get_user, { retry: 1 })
	flow().add(get_user)
		.add(
			(who: User, context?: NodeContext) => who.name + (context?.name ?? ""),
			get_user
		)
	const doubled = await flow().add(
		flow.each((n: number) => n * 2)
	)
		.run([ 1, 2 ])
	expect_type<typeof doubled, number[]>(true)
	const guarded = flow().add(heads)
		.run()
	const caught = await guarded.catch(() => 0)
	expect_type<typeof caught, string | number>(true)
	guarded.catch(
		reason => {
			expect_type<typeof reason, unknown>(true)
			return reason instanceof FlowError ? reason.node : ""
		}
	)
	const settled = guarded.then(String, () => "failed")
		.finally(() => void 0)
	expect_type<typeof settled, Promise<string>>(true)
	await guarded.idle()
	flow().add(
		heads,
		{
			retry: {
				count: 2,
				delay: (count, reason) => reason instanceof HttpError ? 0 : count * 100,
				when: reason => !(reason instanceof TypeError)
			}
		}
	)
	const policy: RetryOptions = {
		count: 2,
		delay: count => count > 1 ? void 0 : 100
	}
	flow().add(heads, { retry: policy })
	void attempt(() => 1, { retry: policy })
	const nothing = flow().add(async () => {})
	expect_type<Awaited<ReturnType<typeof nothing.run>>, undefined>(true)
	const loop = flow().add(({ goto }) => goto(heads))
	expect_type<Awaited<ReturnType<typeof loop.run>>, undefined>(true)
	// @ts-expect-error: state is required
	flow<{ id: number }>().run()
	try {
		await checkout.run(
			{},
			{
				signal: AbortSignal.timeout(1000)
			}
		)
	} catch (error) {
		if (error instanceof FlowError) error.node.trim()
		if (error instanceof TimeoutError) error.timeout.toFixed()
	}
}
async function http_syntax() {
	const user = api.get<User>(
		"/users/:id",
		{ expand: true, id: 1 }
	)
	expect_type<Awaited<typeof user>, User>(true)
	// @ts-expect-error: missing path parameter id
	api.get("/users/:id", { expand: true })
	// @ts-expect-error: missing params
	api.get("/users/:id")
	api.get("/users")
	const parsed = api.get(
		"/users/:id",
		{ id: 1 },
		{ parse: parse_user }
	)
	expect_type<Awaited<typeof parsed>, User>(true)
	const untyped = await api.get("/me")
	expect_type<typeof untyped, unknown>(true)
	// @ts-expect-error: the data is unknown without a type
	untyped.name.trim()
	const annotated: User = await api.get("/users/:id", { id: 1 })
	annotated.name.trim()
	// @ts-expect-error: the annotation keeps the check of the path parameters
	const unchecked: User = await api.get("/users/:id", { expand: true })
	void unchecked
	function name_of(data: User) {
		return data.name
	}
	// @ts-expect-error: parse receives unknown data
	api.get("/me", {}, { parse: name_of })
	interface Filter {
		page: number
		tags?: string[]
	}
	class Search {
		q = "a"
		since = new Date()
	}
	const filter: Filter = { page: 1 }
	const filtered: User[] = await api.get("/users", filter)
	expect_type<typeof filtered, User[]>(true)
	api.get("/search", new Search())
	api.post(
		"/users/:id/tags",
		[ "a" ],
		{ params: { ...filter, id: 1 } }
	)
	api.request(
		"GET",
		"/users",
		{ params: new Search() }
	)
	// @ts-expect-error: query parameters are an object
	api.get("/users", "page=1")
	// @ts-expect-error: a function is not a query value
	api.get("/users", { page: () => 1 })
	const file = api.get(
		"/export",
		{},
		{
			as: "file",
			progress: progress => progress.ratio?.toFixed()
		}
	)
	expect_type<Awaited<typeof file>, DownloadedFile>(true)
	const text = api.get("/text", void 0, { as: "text" })
	expect_type<Awaited<typeof text>, string>(true)
	const body = await api.post("/bulk", {}, { as: "stream" })
	expect_type<typeof body, ReadableStream<Uint8Array<ArrayBuffer>> | null>(true)
	body?.pipeThrough(new TextDecoderStream())
	const bytes = api.get(
		"/bytes",
		void 0,
		{ as: "arrayBuffer" }
	)
	expect_type<Awaited<typeof bytes>, ArrayBuffer>(true)
	const lines = api.get(
		"/users.ndjson",
		void 0,
		{ as: "ndjson" }
	)
	expect_type<Awaited<typeof lines>, AsyncIterable<unknown>>(true)
	// @ts-expect-error: the lines are unknown without parse
	const unparsed: AsyncIterable<User> = await lines
	void unparsed
	const users = await api.get(
		"/users.ndjson",
		void 0,
		{ as: "ndjson", parse: parse_user }
	)
	for await (const line of users) line.name.trim()
	const names = api.get(
		"/users.ndjson",
		void 0,
		{
			as: "ndjson",
			parse: line => parse_user(line).name
		}
	)
	expect_type<Awaited<typeof names>, AsyncIterable<string>>(true)
	const head = api.head("/users/:id", { id: 1 })
	expect_type<Awaited<typeof head>, undefined>(true)
	const created = api.post<User>(
		"/users",
		{ name: "a" },
		{
			idempotent: true,
			lock: "create-user"
		}
	)
	expect_type<Awaited<typeof created>, User>(true)
	api.put(
		"/users/:id",
		{ name: "b" },
		{ params: { id: 1 } }
	)
	// @ts-expect-error: missing path parameter id
	api.patch("/users/:id", { name: "b" })
	api.post(
		"/users/:id/follow",
		void 0,
		{ params: { id: 1 } }
	)
	api.request(
		"POST",
		"/users/:id/follow",
		{ params: { id: 1 } }
	)
	api.delete("/users/:id", { id: 1 })
	const [ error, data ] = await api.get<User[]>(
		"/users",
		{ page: 2, tags: [ "a", "b" ] }
	).safe()
	if (error) {
		if (isCancel(error)) error satisfies CancelError
		if (error instanceof HttpError) {
			expect_type<typeof error.data, unknown>(true)
			// @ts-expect-error: the data of an error is unknown until it is checked
			error.data.message.trim()
		}
	} else {
		expect_type<typeof data, User[]>(true)
	}
	const { headers, status } = await api.get<User>("/me").raw()
	headers.get("ETag")
	status.toFixed()
	const search = api.get<User[]>(
		"/search",
		{ q: "a" },
		{ debounce: 300, latest: "search" }
	)
	search.cancel()
	api.get(
		"/tiles",
		{ x: 1 },
		{ throttle: 500 }
	)
	const tiles = api.sse("/tiles")
	// @ts-expect-error: an event stream has no throttle
	api.sse("/tiles", {}, { throttle: 500 })
	void tiles
	const stream: EventStream = api.sse(
		"/rooms/:id/events",
		{ id: 1 },
		{
			lastEventId: "7",
			onStatus: stream_status => expect_type<typeof stream_status, ConnectionStatus>(true),
			reconnect: { count: 5 }
		}
	)
	for await (const event of stream) {
		expect_type<typeof event.data, string>(true)
		if (event.event == "close") break
	}
	stream.lastEventId.trim()
	expect_type<typeof stream.status, ConnectionStatus>(true)
	const user_events = api.sse(
		"/users/events",
		{},
		{
			parse: parse_user,
			signal: new AbortController().signal
		}
	)
	for await (const user_event of user_events) {
		expect_type<typeof user_event, ServerEvent<User>>(true)
		expect_type<typeof user_event.data, User>(true)
	}
	// @ts-expect-error: an event stream of users has no string data
	const text_events: EventStream = user_events
	void text_events
	const checked_events = api.sse(
		"/users/events",
		{},
		{
			parse: async (value: unknown) => parse_user(value)
		}
	)
	for await (const checked_event of checked_events) expect_type<typeof checked_event.data, User>(true)
	const json_events = api.sse("/prices", {}, { as: "json" })
	for await (const json_event of json_events) expect_type<typeof json_event.data, unknown>(true)
	const measured_events = api.sse(
		"/prices",
		{},
		{
			as: "text",
			parse: (value: unknown) => String(value).length
		}
	)
	for await (const measured_event of measured_events) expect_type<typeof measured_event.data, number>(true)
	// @ts-expect-error: an event stream reads text or JSON
	api.sse("/prices", {}, { as: "ndjson" })
	const reconnect: ReconnectOptions = {
		count: 3,
		delay: (failures, reason, fallback) => {
			expect_type<typeof reason, unknown>(true)
			expect_type<typeof fallback, number>(true)
			return failures > 2 ? void 0 : fallback
		}
	}
	api.sse("/prices", {}, { reconnect })
	api.sse(
		"/prices",
		{},
		{ reconnect: { delay: 1000 } }
	)
	api.sse(
		"/prices",
		{},
		{
			// @ts-expect-error: a delay is milliseconds
			reconnect: { delay: () => "1s" }
		}
	)
	api.get(
		"/users",
		{},
		{
			retry: { count: 3, delay: 1000 }
		}
	)
	api.get(
		"/users",
		{},
		{
			retry: {
				count: 3,
				delay: (count, reason, fallback) => {
					expect_type<typeof reason, unknown>(true)
					expect_type<typeof fallback, number | undefined>(true)
					return fallback ?? count * 1000
				}
			}
		}
	)
	type Message = { text: string, type: "message" }
	type Command = { room: number, type: "join" } | { type: "ping" }
	const socket: Socket<Message, Command> = api.ws(
		"/rooms/:id",
		{ id: 1 },
		{
			heartbeat: {
				interval: 30000,
				message: { type: "ping" },
				timeout: 5000
			},
			onStatus: socket_status => expect_type<typeof socket_status, ConnectionStatus>(true),
			outbox: 1,
			params: async () => ({ token: "t" }),
			reconnect: {
				count: 5,
				delay: failures => failures * 1000
			}
		}
	)
	socket.send({ room: 1, type: "join" })
	// @ts-expect-error: a command has a room
	socket.send({ type: "join" })
	for await (const message of socket) {
		expect_type<typeof message, Message>(true)
		if (message.text == "bye") socket.cancel()
	}
	// @ts-expect-error: the path needs an id
	api.ws("/rooms/:id")
	// @ts-expect-error: a socket has no debounce
	api.ws("/live", {}, { debounce: 300 })
	const user_socket = api.ws(
		"/users",
		{},
		{ parse: parse_user }
	)
	for await (const socket_user of user_socket) expect_type<typeof socket_user, User>(true)
	const checked_socket = api.ws(
		"/users",
		{},
		{
			parse: async (value: unknown) => parse_user(value)
		}
	)
	for await (const checked_user of checked_socket) expect_type<typeof checked_user, User>(true)
	const live = api.ws(
		"/live",
		{},
		{
			as: "text",
			limit: 100,
			protocols: [ "v1" ]
		}
	)
	for await (const socket_data of live) expect_type<typeof socket_data, unknown>(true)
	expect_type<ReturnType<typeof live.send>, boolean>(true)
	api.ws("/live", {}, { reconnect })
	live.send(new Uint8Array(1))
	live.send(
		{
			nested: [ 1, "a", null ],
			type: "ping"
		}
	)
	// @ts-expect-error: a symbol is not sent as JSON
	live.send(Symbol("a"))
	// @ts-expect-error: a function is not sent as JSON
	live.send(() => 1)
	api.ws(
		"/live",
		{},
		{
			heartbeat: {
				interval: 1000,
				// @ts-expect-error: the heartbeat is a message the socket sends
				message: Symbol("ping")
			}
		}
	)
	const command_socket: Socket<Message, Command> = api.ws(
		"/live",
		{},
		{
			heartbeat: {
				interval: 1000,
				// @ts-expect-error: the heartbeat is a Command
				message: "ping"
			}
		}
	)
	void command_socket
	const node_socket = http({ WebSocket })
	node_socket.ws("wss://example.com").status.trim()
	try {
		await socket[Symbol.asyncIterator]().next()
	} catch (socket_error) {
		if (socket_error instanceof SocketError) expect_type<typeof socket_error.code, number>(true)
	}
	const [ typed_error, typed_users ] = await api.get("/users/:id/friends", { id: 1 }).safe<User[]>()
	if (!typed_error) expect_type<typeof typed_users, User[]>(true)
	// @ts-expect-error: a type argument of safe() keeps the check of the path parameters
	void api.get("/users/:id/friends").safe<User[]>()
	const typed_raw = await api.get("/users/:id", { id: 1 }).raw<User>()
	expect_type<typeof typed_raw.data, User>(true)
	// @ts-expect-error: request() checks the path parameters
	api.request("GET", "/users/:id")
	api.request(
		"GET",
		"/users/:id",
		{
			params: { expand: true, id: 1 }
		}
	)
	const org = http(
		{
			base: "https://api.example.com/orgs/:org"
		}
	)
	// @ts-expect-error: the base needs an org
	org.get("/repos")
	org.get("/repos", { org: "lube" })
	// @ts-expect-error: the base and the path need their parameters
	org.get("/repos/:id", { id: 1 })
	org.get(
		"/repos/:id",
		{ id: 1, org: "lube" }
	)
	// @ts-expect-error: the base needs an org
	org.post("/repos", { name: "a" })
	org.post(
		"/repos",
		{ name: "a" },
		{ params: { org: "lube" } }
	)
	// @ts-expect-error: the base needs an org
	org.ws("/live")
	org.get(
		"https://other.example.com/repos"
	)
	// @ts-expect-error: extend keeps the base
	org.extend({ timeout: 1000 }).get("/repos")
	org.extend(
		{
			base: "https://api.example.com"
		}
	).get("/repos")
	org.extend({ base: null }).get(
		"https://api.example.com/repos"
	)
	const any_client: Http = org
	void any_client
	const admin = api.extend(
		{ headers: { "X-Role": "admin" } }
	)
	admin.request<User>(
		"POST",
		"/users",
		{
			body: new FormData(),
			upload: progress => progress.loaded
		}
	)
}
async function stream_dependency_syntax() {
	const model = channel({ initial: "small" })
	expect_type<typeof model, Channel<string>>(true)
	// @ts-expect-error: the initial value has the type of the channel
	channel<number>({ initial: "small" })
	const asked = flow().add(
		(
			question: string,
			current: string
		) => question + current,
		flow.queue(channel<string>()),
		flow.keep(model)
	)
	expect_type<Awaited<ReturnType<typeof asked.run>>, string>(true)
	const breads = channel<string>()
	const patties = channel<number>()
	function burger(b: string, p: number) {
		return `${b}${p}`
	}
	const run = flow()
		.add(
			burger,
			flow.queue(breads),
			flow.restart(patties),
			{ limit: 5 }
		)
		.run()
	expect_type<Awaited<typeof run>, string>(true)
	function shout(made: string) {
		return made.toUpperCase()
	}
	const piped = flow().add(shout, run.stream(burger))
	expect_type<Awaited<ReturnType<typeof piped.run>>, string>(true)
	flow().add(
		// @ts-expect-error: the breads are strings
		(b: number) => b,
		breads
	)
	const optional = flow().add(breads, { optional: true })
	expect_type<Awaited<ReturnType<typeof optional.run>>, string | undefined>(true)
	const caught = flow().add(
		breads,
		{ catch: () => 0, timeout: 1000 }
	)
	expect_type<Awaited<ReturnType<typeof caught.run>>, string | number>(true)
	const later = flow().add(() => 1)
		.add(breads, flow.keep(patties))
	expect_type<Awaited<ReturnType<typeof later.run>>, string>(true)
	for await (const bread of breads) expect_type<typeof bread, string>(true)
}
async function stream_syntax() {
	const words: Channel<string> = channel<string>({ limit: 10 })
	words.send("a")
	// @ts-expect-error: a channel of strings takes strings
	words.send(1)
	const lengths = channel<number>()
	for await (const value of merge(words, lengths)) expect_type<typeof value, string | number>(true)
	for await (const batch of buffer(words, 16)) expect_type<typeof batch, string[]>(true)
	for await (const word of debounce(words, 300)) expect_type<typeof word, string>(true)
	for await (const word of throttle(share(words), 16)) expect_type<typeof word, string>(true)
	for await (const word of until(words, lengths)) expect_type<typeof word, string>(true)
	for await (const length of latest(words, () => share(lengths))) {
		expect_type<typeof length, number>(true)
		void word_of(length)
	}
	// @ts-expect-error: a stream is an async iterable
	merge([ 1 ])
}
/**
 * @param {number} value
 * @returns {string}
 */
function word_of(value: number) {
	return String(value)
}
http_syntax()
flow_syntax()
function limit_syntax() {
	const tick = flow.input<number>("tick")
	function step(value: number) {
		return value
	}
	flow().add(tick)
		.add(
			step,
			tick,
			{ limit: 5, overlap: "queue" }
		)
	flow().add(tick)
		.add(
			step,
			flow.queue(tick),
			{ limit: 5 }
		)
	flow().add(tick)
		.add(
			step,
			flow.queue(tick),
			{ limit: 5, overlap: "restart" }
		)
	flow().add(tick)
		.add(
			step,
			tick,
			// @ts-expect-error: limit bounds a queue
			{ limit: 5 }
		)
	flow().add(tick)
		.add(
			step,
			flow.keep(tick),
			// @ts-expect-error: limit bounds a queue
			{ limit: 5, overlap: "rerun" }
		)
	const run = flow().add(tick)
		.add(step, tick)
		.run()
	// @ts-expect-error: a stream is read by its node
	run.stream("step")
}
void stream_syntax()
void stream_dependency_syntax()
void arrive_syntax()
void backend_syntax()
limit_syntax()
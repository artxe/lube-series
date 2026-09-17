import {
	type Durable,
	type DurableContext,
	type DurableStore,
	type SavedError,
	type SavedRun,
	type ServeOptions,
	TimeoutError
} from "async-lube"
import { dueAt, durable, memory, sqlite } from "async-lube/durable"
import { DatabaseSync } from "node:sqlite"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
	? true
	: false
function expect_type<A, B>(_: Equal<A, B>) {}
type Cart = { amount: number, email: string }
interface StoredOrder { id: number, items: { sku: string }[], note?: string, parent?: StoredOrder }
declare const stored_order: StoredOrder
async function durable_syntax() {
	const checkout = durable(
		sqlite(new DatabaseSync(":memory:")),
		async (
			cart: Cart,
			{ sleep, step, wait }: DurableContext
		) => {
			const order = await step(
				"order",
				() => ({ id: 1, total: cart.amount })
			)
			expect_type<typeof order, { id: number, total: number }>(true)
			const paid = await step(
				"charge",
				async ({ key, signal }) => `${key} ${signal.aborted}`
			)
			expect_type<typeof paid, string>(true)
			const saved_order = await step("load", async () => stored_order)
			expect_type<typeof saved_order, StoredOrder>(true)
			const nothing = await step("log", () => {})
			expect_type<typeof nothing, void>(true)
			await step("any", (): unknown => cart)
			// @ts-expect-error: a Date is not a JSON value
			await step("at", () => new Date())
			await step(
				"rows",
				// @ts-expect-error: a Map is not a JSON value, reported on the function
				async () => new Map<string, number>()
			)
			// @ts-expect-error: undefined in an array is not a JSON value
			await step("list", () => [ 1, undefined ])
			// @ts-expect-error: a bigint is not a JSON value
			await step("big", () => 1n)
			await sleep("cool off", 1000)
			try {
				const approved = await wait<boolean>("approve", { timeout: 1000 })
				await wait(
					"close",
					{ until: Date.now() + 1000 }
				)
				// @ts-expect-error: until is a number of milliseconds since the epoch
				await wait("close", { until: new Date() })
				return approved ? paid : "declined"
			} catch (error) {
				if (error instanceof TimeoutError) return "expired"
				throw error
			}
		},
		{
			idle: 1000,
			lease: 30000,
			migrate: run => run,
			revision: 2
		}
	)
	expect_type<typeof checkout, Durable<Cart, string>>(true)
	const receipt = await checkout.run(
		"order-1",
		{ amount: 5, email: "a@b.c" }
	)
	expect_type<typeof receipt, string>(true)
	await checkout.send("order-1", "approve", true)
	await checkout.cancel("order-1")
	const saved = await checkout.get("order-1")
	expect_type<typeof saved, SavedRun | undefined>(true)
	expect_type<NonNullable<typeof saved>["journal"][number]["error"], SavedError | undefined>(true)
	const saved_error = saved?.error
	if (saved_error) {
		expect_type<typeof saved_error.message, string>(true)
		expect_type<typeof saved_error.cause, SavedError | undefined>(true)
		expect_type<typeof saved_error["status"], unknown>(true)
	}
	void checkout.serve({ batch: 50, interval: 1000 })
	void checkout.serve(
		{
			onError: (error, key) => {
				expect_type<typeof error, unknown>(true)
				expect_type<typeof key, string | undefined>(true)
			}
		}
	)
	const serve_options: ServeOptions = { onError: error => void error }
	void checkout.serve(serve_options)
	// @ts-expect-error: limit is batch
	void checkout.serve({ limit: 50 })
	// @ts-expect-error: onError is a function
	void checkout.serve({ onError: "log" })
	checkout.stop()
	// @ts-expect-error: the input is checked
	void checkout.run("order-2", { amount: "5" })
	// @ts-expect-error: a run of a function that takes an input is started with it
	void checkout.run("order-2")
	expect_type<Awaited<ReturnType<typeof checkout.join>>, string>(true)
	void checkout.join(
		"order-2",
		// @ts-expect-error: join takes no input
		{ amount: 5, email: "a@b.c" }
	)
	expect_type<ReturnType<typeof checkout.start>, Promise<boolean>>(true)
	const created: boolean = await checkout.start(
		"order-3",
		{ amount: 5, email: "a@b.c" }
	)
	void created
	// @ts-expect-error: start needs the input
	void checkout.start("order-3")
	void durable(
		memory(),
		async (n: number) => n * 2
	)
	void durable(
		memory(),
		async (n: number) => n,
		// @ts-expect-error: an unknown option is rejected
		{ pol: 10 }
	)
	// @ts-expect-error: an unknown option is rejected
	void checkout.serve({ intervl: 10 })
	await checkout.send(
		"order-1",
		"approve",
		{ at: "2026-01-01", ids: [ 1, 2 ] }
	)
	await checkout.send("order-1", "approve", stored_order)
	await checkout.send(
		"order-1",
		"approve",
		null as unknown
	)
	// @ts-expect-error: a Date is not a JSON value
	await checkout.send("order-1", "approve", new Date())
	await checkout.send(
		"order-1",
		// @ts-expect-error: a Map is not a JSON value
		"approve",
		{
			rows: new Map<string, number>()
		}
	)
	// @ts-expect-error: undefined is not sent
	await checkout.send("order-1", "approve", undefined)
	await checkout.send(
		"order-1",
		// @ts-expect-error: undefined is not sent
		"approve",
		"yes" as string | undefined
	)
	const stored = durable(
		memory(),
		async (
			order: StoredOrder,
			{ wait }: DurableContext
		) => {
			const note = await wait<{ at: string, by?: string }>("note")
			expect_type<typeof note, { at: string, by?: string }>(true)
			const anything = await wait("anything")
			expect_type<typeof anything, unknown>(true)
			// @ts-expect-error: a Date is not a JSON value
			await wait<Date>("at")
			// @ts-expect-error: a bigint is not a JSON value
			await wait<{ n: bigint }>("big")
			return order
		}
	)
	expect_type<typeof stored, Durable<StoredOrder, StoredOrder>>(true)
	expect_type<ReturnType<typeof durable<null, Promise<unknown>>>, Durable<null, unknown>>(true)
	const nothing = durable(memory(), async () => {})
	expect_type<typeof nothing, Durable<unknown, void>>(true)
	await nothing.run("n")
	await nothing.start("n")
	const optional = durable(
		memory(),
		async (note: string | undefined) => note ?? ""
	)
	await optional.run("o")
	// @ts-expect-error: a Date is not a JSON value
	void durable(memory(), async () => new Date())
	void durable(
		memory(),
		// @ts-expect-error: a Set is not a JSON value
		() => new Set<number>()
	)
	void durable(
		memory(),
		// @ts-expect-error: a Date is not a JSON value
		async (at: Date) => at.toISOString()
	)
	void durable(
		memory(),
		// @ts-expect-error: a function is not a JSON value
		async (
			input: { callback: () => void }
		) => typeof input
	)
}
type Pool = { query<R>(sql: string, params: unknown[]): Promise<{ rowCount: number | null, rows: R[] }> }
function postgres_store(pool: Pool): DurableStore {
	return {
		async due(now, limit) {
			const { rows } = await pool.query<{ key: string }>(
				"select key from durable_runs where due <= $1 order by due limit $2",
				[ now, limit ]
			)
			return rows.map(row => row.key)
		},
		async get(key) {
			const { rows } = await pool.query<{ data: SavedRun }>(
				"select data from durable_runs where key = $1",
				[ key ]
			)
			return rows[0]?.data
		},
		async put(key, run, expected) {
			const { rowCount } = expected === undefined
				? await pool.query(
					"insert into durable_runs values ($1, $2, $3, $4) on conflict do nothing",
					[ key, run.version, dueAt(run), run ]
				)
				: await pool.query(
					"update durable_runs set version = $2, due = $3, data = $4 where key = $1 and version = $5",
					[
						key,
						run.version,
						dueAt(run),
						run,
						expected
					]
				)
			return rowCount == 1
		}
	}
}
void postgres_store
void durable_syntax()
type Book = { best: number, lot: string, part: number }
const bids = durable(
	memory(),
	async (
		{ best, lot, part }: Book,
		{ step, wait }: DurableContext
	) => {
		best = Math.max(best, await wait<number>("bid"))
		const next = `${lot}:${part + 1}`
		await step(
			"continue",
			() => bids.start(
				next,
				{ best, lot, part: part + 1 }
			)
		)
		return next
	}
)
expect_type<typeof bids, Durable<Book, string>>(true)
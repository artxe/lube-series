/** @import { DurableStore, JournalEntry, SavedRun, SqliteDatabase } from "../../public.js" */
import { dueAt } from "./state.js"
/** @type {WeakMap<JournalEntry, string>} */
const encoded = new WeakMap()
/**
 * @param {SavedRun} saved
 * @returns {string}
 */
function encode(saved) {
	const { journal, ...rest } = saved
	let json = JSON.stringify(rest).slice(0, -1)
	json += json.length > 1 ? ",\"journal\":[" : "\"journal\":["
	for (let index = 0; index < journal.length; index++) {
		const entry = /** @type {JournalEntry} */(journal[index])/**/
		let text = entry.done ? encoded.get(entry) : void 0
		if (text == null) {
			text = JSON.stringify(entry)
			if (entry.done) encoded.set(entry, text)
		}
		json += index ? `,${text}` : text
	}
	return `${json}]}`
}
/**
 * @param {DurableStore} store
 * @param {string} key
 * @returns {Promise<SavedRun | undefined>}
 */
export async function load(store, key) {
	return await store.get(key) ?? void 0
}
/**
 * A store in memory, for tests and for one process that may lose its runs. It keeps runs as JSON, as `sqlite()` does.
 * @returns {DurableStore}
 */
export function memory() {
	/** @type {Map<string, { data: string, due: number | undefined, version: number }>} */
	const rows = new Map()
	return {
		due(now, limit) {
			/** @type {string[]} */
			const keys = []
			for (const [ key, row ] of rows) {
				if (keys.length >= limit) break
				if ((row.due ?? Infinity) <= now) keys.push(key)
			}
			return keys
		},
		get(key) {
			const row = rows.get(key)
			return row && /** @type {SavedRun} */(JSON.parse(row.data))/**/
		},
		put(key, saved, expected) {
			if (rows.get(key)?.version !== expected) return false
			rows.set(
				key,
				{
					data: encode(saved),
					due: dueAt(saved),
					version: saved.version
				}
			)
			return true
		}
	}
}
/**
 * A store in a table of SQLite, created when it does not exist.
 * @param {SqliteDatabase} db
 * @param {string=} table
 * @returns {DurableStore}
 */
export function sqlite(db, table = "durable_runs") {
	if (!/^[a-z_]\w*$/i.test(table)) throw TypeError(
		`The table name must be an identifier: ${table}`
	)
	db.exec(
		`create table if not exists ${table} (key text primary key, version integer not null, due integer, data text not null)`
	)
	db.exec(
		`create index if not exists ${table}_due on ${table} (due) where due is not null`
	)
	const select = db.prepare(
		`select data from ${table} where key = ?`
	)
	const insert = db.prepare(
		`insert or ignore into ${table} (key, version, due, data) values (?, ?, ?, ?)`
	)
	const update = db.prepare(
		`update ${table} set version = ?, due = ?, data = ? where key = ? and version = ?`
	)
	const pending = db.prepare(
		`select key from ${table} where due is not null and due <= ? order by due limit ?`
	)
	return {
		due: (now, limit) => /** @type {{ key: string }[]} */(pending.all(now, limit))/**/.map(row => row.key),
		get(key) {
			const row = /** @type {{ data: string } | undefined} */(select.get(key))/**/
			return row && JSON.parse(row.data)
		},
		put(key, saved, expected) {
			const data = encode(saved)
			const due = dueAt(saved) ?? null
			const { changes } = expected === void 0
				? insert.run(key, saved.version, due, data)
				: update.run(
					saved.version,
					due,
					data,
					key,
					expected
				)
			return Number(changes) == 1
		}
	}
}
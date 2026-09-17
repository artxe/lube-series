/** @import { StreamLoop, StreamSource } from "../private.js" */
import { CancelError } from "./errors.js"
import { check_options } from "./options.js"
import {
	clamp_delay,
	link_signal,
	noop,
	on_abort,
	sleep_until
} from "./signal.js"
/**
 * Collects the values that arrive within the milliseconds after the first one into an array.
 * The rest is yielded when the stream ends, and also when it fails, before the error.
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {number} ms
 * @returns {AsyncIterableIterator<T[]>}
 */
export function buffer(source, ms) {
	check_ms(ms, "buffer")
	/** @type {AsyncIterator<T> | undefined} */
	let reader
	/** @type {Promise<IteratorResult<T>> | undefined} */
	let next
	/** @type {T[]} */
	let batch = []
	/** @type {{ error: unknown } | undefined} */
	let failure
	let finished = false
	const due = create_due(ms)
	function finish() {
		finished = true
		due.clear()
		if (reader) release(reader)
	}
	return {
		[Symbol.asyncIterator]() {
			return reader || finished ? buffer(source, ms) : this
		},
		async next() {
			if (failure) {
				const { error } = failure
				failure = void 0
				throw error
			}
			if (finished) return { done: true, value: void 0 }
			try {
				reader ??= /** @type {AsyncIterator<T>} */(to_reader(source))/**/
				for (;;) {
					next ??= reader.next()
					const racing = due.promise
					const step = await Promise.race(
						racing ? [ next, racing ] : [ next ]
					)
					if (finished) return { done: true, value: void 0 }
					if (step == "due" || racing && due.fired) {
						const full = batch
						batch = []
						return { done: false, value: full }
					}
					next = void 0
					if (step.done) {
						const full = batch
						reader = void 0
						finish()
						return full.length ? { done: false, value: full } : { done: true, value: void 0 }
					}
					batch.push(step.value)
					if (!due.promise) due.start()
				}
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				if (!batch.length) throw error
				const full = batch
				batch = []
				failure = { error }
				return { done: false, value: full }
			}
		},
		async return() {
			failure = void 0
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
/**
 * @param {unknown} value
 * @returns {void}
 */
function cancel_result(value) {
	const result = /** @type {{ cancel?: unknown } | null | undefined} */(value)/**/
	if (typeof result?.cancel != "function") return
	try {
		const cancelled = /** @type {{ cancel: () => unknown }} */(result)/**/.cancel()
		if (typeof /** @type {Partial<PromiseLike<unknown>>} */(cancelled)/**/?.then == "function") /** @type {PromiseLike<unknown>} */(cancelled)/**/.then(noop, noop)
	} catch {}
}
/**
 * @param {unknown} limit
 * @param {string} kind
 * @returns {void}
 */
function check_limit(limit, kind) {
	if (limit == null || limit === Infinity || Number.isInteger(limit) && /** @type {number} */(limit)/**/ >= 1) return
	throw TypeError(
		`The limit of ${kind}() must be a positive integer or Infinity`
	)
}
/**
 * @param {unknown} ms
 * @param {string} kind
 * @returns {void}
 */
function check_ms(ms, kind) {
	if (typeof ms == "number" && ms >= 0) return
	throw TypeError(
		`${kind}() needs a non-negative number of milliseconds`
	)
}
/**
 * @template T
 * @param {{ initial?: T, limit?: number | undefined, signal?: AbortSignal | undefined }=} options
 * @returns {import("../public.js").Channel<T>}
 */
function create_channel(options = {}) {
	check_options(
		options,
		[ "initial", "limit", "signal" ],
		"channel"
	)
	check_limit(options.limit, "channel")
	const source = create_source(
		options.limit,
		"initial" in options ? { value: options.initial } : void 0
	)
	const { signal } = options
	if (signal?.aborted) source.close()
	else if (signal) {
		on_abort(signal, () => source.close())
	}
	return {
		[Symbol.asyncIterator]: () => /** @type {AsyncGenerator<T, void, undefined>} */(source.read())/**/,
		close: () => source.close(),
		get closed() {
			return source.ended
		},
		fail: error => source.fail(error),
		send: value => source.write(value)
	}
}
export const channel = /** @type {import("../public.js").ChannelFunction} */(create_channel)/**/
/**
 * @param {number} ms
 */
function create_due(ms) {
	const delay = clamp_delay(ms)
	/** @type {((value: "due") => void) | undefined} */
	let resolve
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer
	function fire() {
		const settle = /** @type {(value: "due") => void} */(resolve)/**/
		due.clear()
		due.fired = true
		settle("due")
	}
	const due = {
		clear() {
			clearTimeout(timer)
			due.promise = void 0
			resolve = void 0
			timer = void 0
		},
		fired: false,
		/** @type {Promise<"due"> | undefined} */
		promise: void 0,
		start() {
			clearTimeout(timer)
			due.fired = false
			due.promise ??= new Promise(
				settle => {
					resolve = settle
				}
			)
			timer = setTimeout(fire, delay)
		}
	}
	return due
}
/**
 * @param {number=} limit
 * @param {{ value: unknown }=} current
 * @returns {StreamSource}
 */
function create_source(
	limit = Infinity,
	current = void 0
) {
	/** @type {Set<StreamLoop>} */
	const loops = new Set()
	let ended = false
	/** @type {{ value: unknown } | undefined} */
	let failure
	/**
	 * @param {{ value: unknown }=} error
	 * @returns {void}
	 */
	function finish(error) {
		if (ended) return
		ended = true
		failure = error
		for (const loop of loops) {
			loop.ended = true
			loop.error = error
			loop.wake?.()
		}
	}
	return {
		close: () => finish(void 0),
		get ended() {
			return ended
		},
		fail: error => finish({ value: error }),
		read(on_first, on_last) {
			/** @type {StreamLoop} */
			const loop = {
				buffer: [],
				ended,
				error: failure,
				head: 0,
				wake: void 0
			}
			let finished = false
			let started = false
			/** @returns {IteratorResult<unknown>} */
			function stop() {
				if (!finished) {
					finished = true
					const left = loops.delete(loop)
					loop.wake?.()
					if (left && !loops.size) on_last?.()
				}
				return { done: true, value: void 0 }
			}
			return {
				[Symbol.asyncIterator]() {
					return this
				},
				async next() {
					if (!started) {
						started = true
						loop.ended = ended
						loop.error = failure
						if (!ended) {
							loops.add(loop)
							if (current) loop.buffer.push(current.value)
							if (loops.size == 1) on_first?.()
						}
					}
					for (;;) {
						if (finished) return { done: true, value: void 0 }
						if (loop.head < loop.buffer.length) {
							const value = loop.buffer[loop.head]
							loop.buffer[loop.head++] = void 0
							if (loop.head == loop.buffer.length) {
								loop.buffer = []
								loop.head = 0
							} else if (loop.head > 1024 && loop.head * 2 > loop.buffer.length) {
								loop.buffer = loop.buffer.slice(loop.head)
								loop.head = 0
							}
							return { done: false, value }
						}
						if (loop.error) {
							const { value } = loop.error
							stop()
							throw value
						}
						if (loop.ended) return stop()
						await new Promise(
							resolve => {
								loop.wake = () => resolve(void 0)
							}
						)
						loop.wake = void 0
					}
				},
				async return() {
					return stop()
				}
			}
		},
		write(value) {
			if (ended) return
			if (current) current.value = value
			for (const loop of loops) {
				loop.buffer.push(value)
				if (loop.buffer.length - loop.head > limit) {
					loop.buffer[loop.head++] = void 0
					if (loop.head * 2 > loop.buffer.length) {
						loop.buffer = loop.buffer.slice(loop.head)
						loop.head = 0
					}
				}
				loop.wake?.()
			}
		}
	}
}
/**
 * Yields the last value of every quiet window of the milliseconds, like the `debounce` of a request.
 * The last one is yielded when the stream ends, and also when it fails, before the error.
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {number} ms
 * @returns {AsyncIterableIterator<T>}
 */
export function debounce(source, ms) {
	check_ms(ms, "debounce")
	/** @type {AsyncIterator<T> | undefined} */
	let reader
	/** @type {Promise<IteratorResult<T>> | undefined} */
	let next
	/** @type {{ error: unknown } | undefined} */
	let failure
	/** @type {{ value: T } | undefined} */
	let held
	let finished = false
	const due = create_due(ms)
	function finish() {
		finished = true
		due.clear()
		if (reader) release(reader)
	}
	return {
		[Symbol.asyncIterator]() {
			return reader || finished ? debounce(source, ms) : this
		},
		async next() {
			if (failure) {
				const { error } = failure
				failure = void 0
				throw error
			}
			if (finished) return { done: true, value: void 0 }
			try {
				reader ??= /** @type {AsyncIterator<T>} */(to_reader(source))/**/
				for (;;) {
					next ??= reader.next()
					const racing = due.promise
					const step = await Promise.race(
						racing ? [ next, racing ] : [ next ]
					)
					if (finished) return { done: true, value: void 0 }
					if (step == "due" || racing && due.fired) {
						const { value } = /** @type {{ value: T }} */(held)/**/
						held = void 0
						return { done: false, value }
					}
					next = void 0
					if (step.done) {
						const last = held
						reader = void 0
						finish()
						return last ? { done: false, value: last.value } : { done: true, value: void 0 }
					}
					held = { value: step.value }
					due.start()
				}
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				const last = held
				if (!last) throw error
				held = void 0
				failure = { error }
				return { done: false, value: last.value }
			}
		},
		async return() {
			failure = void 0
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
/**
 * Counts every period of the milliseconds, 1, 2, 3, for polling and jobs. A loop that takes longer than a period gets
 * the next tick at once instead of the ticks it missed, so runs never overlap or pile up. `immediate` ticks at once first.
 * Leaving the loop or aborting `signal` ends it at once. As a flow dependency it runs the node on every tick.
 * @example
 * for await (const tick of every(60000, { signal })) await sync()
 * @param {number} ms
 * @param {{ immediate?: boolean | undefined, signal?: AbortSignal | undefined }=} options
 * @returns {AsyncIterable<number>}
 */
export function every(ms, options = {}) {
	if (!(typeof ms == "number" && ms > 0)) throw TypeError(
		"every() needs a positive number of milliseconds"
	)
	check_options(
		options,
		[ "immediate", "signal" ],
		"every"
	)
	const { immediate = false, signal } = options
	return {
		[Symbol.asyncIterator]() {
			let due = Date.now() + (immediate ? 0 : ms)
			let count = 0
			let finished = false
			const controller = new AbortController()
			const unlink = link_signal(controller, signal)
			/** @returns {IteratorResult<number>} */
			function finish() {
				if (!finished) {
					finished = true
					controller.abort()
					unlink()
				}
				return { done: true, value: void 0 }
			}
			return {
				[Symbol.asyncIterator]() {
					return this
				},
				async next() {
					if (finished || controller.signal.aborted) return finish()
					if (due > Date.now()) {
						try {
							await sleep_until(due, controller.signal)
						} catch {
							return finish()
						}
					}
					if (finished) return finish()
					const now = Date.now()
					due = (now - due >= ms ? now : due) + ms
					return { done: false, value: ++count }
				},
				async return() {
					return finish()
				}
			}
		}
	}
}
/**
 * @template T
 * @template R
 * @param {AsyncIterable<T>} source
 * @param {(value: T, signal: AbortSignal) => unknown} start
 * @returns {AsyncIterableIterator<R>}
 */
function switch_latest(source, start) {
	/** @type {AsyncIterator<T> | undefined} */
	let outer
	/** @type {Promise<IteratorResult<T>> | undefined} */
	let next_outer
	/** @type {{ controller: AbortController, made: unknown, next: Promise<IteratorResult<R>> | undefined, reader: AsyncIterator<R> } | undefined} */
	let inner
	let outer_done = false
	let finished = false
	/**
	 * @returns {void}
	 */
	function close_inner() {
		if (!inner) return
		inner.controller.abort(
			new CancelError("Superseded by a newer value")
		)
		inner.next?.catch(noop)
		release(inner.reader)
		cancel_result(inner.made)
		inner = void 0
	}
	function finish() {
		finished = true
		close_inner()
		if (outer) release(outer)
	}
	/**
	 * @param {T} value
	 * @returns {void}
	 */
	function open_inner(value) {
		next_outer = /** @type {AsyncIterator<T>} */(outer)/**/.next()
		next_outer.catch(noop)
		const controller = new AbortController()
		const made = start(value, controller.signal)
		const iterable = typeof /** @type {Partial<AsyncIterable<unknown>>} */(made)/**/?.[Symbol.asyncIterator] == "function"
		const reader = /** @type {AsyncIterator<R>} */(iterable ? to_reader(made) : once_reader(made))/**/
		inner = {
			controller,
			made: iterable || typeof /** @type {Partial<PromiseLike<unknown>>} */(made)/**/?.then == "function"
				? made
				: void 0,
			next: void 0,
			reader
		}
	}
	return {
		[Symbol.asyncIterator]() {
			return outer || finished ? switch_latest(source, start) : this
		},
		async next() {
			if (finished) return { done: true, value: void 0 }
			try {
				outer ??= /** @type {AsyncIterator<T>} */(to_reader(source))/**/
				for (;;) {
					if (!inner) {
						if (outer_done) {
							finish()
							return { done: true, value: void 0 }
						}
						next_outer ??= outer.next()
						const step = await next_outer
						if (finished) return { done: true, value: void 0 }
						next_outer = void 0
						if (step.done) {
							finish()
							return { done: true, value: void 0 }
						}
						open_inner(step.value)
						continue
					}
					const current = inner
					current.next ??= current.reader.next()
					/** @type {Promise<{ from_outer: boolean, step: IteratorResult<unknown> }>[]} */
					const racing = [
						current.next.then(
							step => ({ from_outer: false, step })
						)
					]
					if (!outer_done) {
						next_outer ??= outer.next()
						racing.push(
							next_outer.then(
								step => ({ from_outer: true, step })
							)
						)
					}
					const won = await Promise.race(racing)
					if (finished) return { done: true, value: void 0 }
					if (won.from_outer) {
						const step = /** @type {IteratorResult<T>} */(won.step)/**/
						next_outer = void 0
						if (step.done) {
							outer_done = true
							continue
						}
						close_inner()
						open_inner(step.value)
						continue
					}
					const step = /** @type {IteratorResult<R>} */(won.step)/**/
					current.next = void 0
					if (step.done) {
						inner = void 0
						continue
					}
					return step
				}
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				throw error
			}
		},
		async return() {
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
export const latest = /** @type {import("../public.js").LatestFunction} */(switch_latest)/**/
/**
 * @template T
 * @param {...AsyncIterable<T>} sources
 * @returns {AsyncIterableIterator<T>}
 */
function merge_streams(...sources) {
	/** @type {AsyncIterator<T>[] | undefined} */
	let readers
	/** @type {{ error: { value: unknown } | undefined, reader: AsyncIterator<T>, step: IteratorResult<T> | undefined }[]} */
	let ready = []
	let head = 0
	let active = 0
	/** @type {AsyncIterator<T> | undefined} */
	let last
	/** @type {(() => void) | undefined} */
	let wake
	let finished = false
	function finish() {
		finished = true
		if (readers) for (const reader of readers) release(reader)
		wake?.()
	}
	/**
	 * @param {AsyncIterator<T>} reader
	 * @returns {void}
	 */
	function read(reader) {
		reader.next()
			.then(
				step => {
					if (finished) return
					ready.push(
						{ error: void 0, reader, step }
					)
					wake?.()
				},
				error => {
					if (finished) return
					ready.push(
						{
							error: { value: error },
							reader,
							step: void 0
						}
					)
					wake?.()
				}
			)
	}
	return {
		[Symbol.asyncIterator]() {
			return readers || finished ? merge_streams(...sources) : this
		},
		async next() {
			if (finished) return { done: true, value: void 0 }
			try {
				if (!readers) {
					readers = sources.map(
						source => /** @type {AsyncIterator<T>} */(to_reader(source))/**/
					)
					active = readers.length
					for (const reader of readers) read(reader)
				}
				if (last) {
					read(last)
					last = void 0
				}
				for (;;) {
					if (head < ready.length) {
						const { error, reader, step } = /** @type {(typeof ready)[number]} */(ready[head++])/**/
						if (head == ready.length) {
							ready = []
							head = 0
						}
						if (error) throw error.value
						if (/** @type {IteratorResult<T>} */(step)/**/.done) {
							active--
							continue
						}
						last = reader
						return /** @type {IteratorResult<T>} */(step)/**/
					}
					if (!active) break
					await new Promise(
						resolve => {
							wake = () => resolve(void 0)
						}
					)
					wake = void 0
					if (finished) return { done: true, value: void 0 }
				}
				finish()
				return { done: true, value: void 0 }
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				throw error
			}
		},
		async return() {
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
export const merge = /** @type {import("../public.js").MergeFunction} */(merge_streams)/**/
/**
 * @param {unknown} value
 * @returns {AsyncIterator<unknown>}
 */
function once_reader(value) {
	let done = false
	/** @type {{ reader: AsyncIterator<unknown>, stream: unknown } | undefined} */
	let inner
	return {
		async next() {
			if (done) return { done: true, value: void 0 }
			if (inner) return inner.reader.next()
			const settled = await value
			const iterable = typeof /** @type {Partial<AsyncIterable<unknown>>} */(settled)/**/?.[Symbol.asyncIterator] == "function"
			if (done) {
				if (iterable) {
					release(to_reader(settled))
					cancel_result(settled)
				}
				return { done: true, value: void 0 }
			}
			if (!iterable) {
				done = true
				return { done: false, value: settled }
			}
			inner = {
				reader: to_reader(settled),
				stream: settled
			}
			return inner.reader.next()
		},
		async return() {
			done = true
			if (inner) {
				release(inner.reader)
				cancel_result(inner.stream)
			}
			return { done: true, value: void 0 }
		}
	}
}
/**
 * @param {{ return?: (value?: never) => unknown }} reader
 * @returns {void}
 */
function release(reader) {
	try {
		const returned = /** @type {Promise<unknown> | undefined} */(reader.return?.())/**/
		if (returned && typeof returned.then == "function") returned.then(noop, noop)
	} catch {}
}
/**
 * Reads a stream once and hands its values to every loop, so that several readers share one source.
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {{ limit?: number | undefined }=} options
 * @returns {AsyncIterable<T>}
 */
export function share(source, options = {}) {
	check_options(options, [ "limit" ], "share")
	check_limit(options.limit, "share")
	let shared = share_source(source, options.limit)
	return {
		[Symbol.asyncIterator]() {
			if (shared.source.ended) shared = share_source(source, options.limit)
			return /** @type {AsyncGenerator<T, void, undefined>} */(shared.read())/**/
		}
	}
}
/**
 * @param {AsyncIterable<unknown>} source
 * @param {number | undefined} limit
 */
function share_source(source, limit) {
	const shared = create_source(limit)
	/** @type {AsyncIterator<unknown> | undefined} */
	let reader
	function start() {
		const current = to_reader(source)
		reader = current
		void (async () => {
			try {
				for (;;) {
					const step = await current.next()
					if (reader != current) return
					if (step.done) {
						shared.close()
						return
					}
					shared.write(step.value)
				}
			} catch (error) {
				if (reader == current) shared.fail(error)
			}
		})()
	}
	function stop() {
		const current = reader
		reader = void 0
		if (current) release(current)
	}
	return {
		read: () => shared.read(start, stop),
		source: shared
	}
}
/**
 * Yields at most one value per the milliseconds: the first at once, then the last one of every window.
 * The held one is yielded at once when the stream ends, and also when it fails, before the error.
 * A value and the end of a window at the same instant come in the order of their timers.
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {number} ms
 * @returns {AsyncIterableIterator<T>}
 */
export function throttle(source, ms) {
	check_ms(ms, "throttle")
	/** @type {AsyncIterator<T> | undefined} */
	let reader
	/** @type {Promise<IteratorResult<T>> | undefined} */
	let next
	/** @type {{ error: unknown } | undefined} */
	let failure
	/** @type {{ value: T } | undefined} */
	let held
	let finished = false
	const window = create_due(ms)
	function finish() {
		finished = true
		window.clear()
		if (reader) release(reader)
	}
	return {
		[Symbol.asyncIterator]() {
			return reader || finished ? throttle(source, ms) : this
		},
		async next() {
			if (failure) {
				const { error } = failure
				failure = void 0
				throw error
			}
			if (finished) return { done: true, value: void 0 }
			try {
				reader ??= /** @type {AsyncIterator<T>} */(to_reader(source))/**/
				for (;;) {
					next ??= reader.next()
					const racing = window.promise
					const step = await Promise.race(
						racing ? [ next, racing ] : [ next ]
					)
					if (finished) return { done: true, value: void 0 }
					if (step == "due" || racing && window.fired) {
						if (held) {
							const { value } = held
							held = void 0
							window.start()
							return { done: false, value }
						}
						continue
					}
					next = void 0
					if (step.done) {
						const last = held
						reader = void 0
						finish()
						return last ? { done: false, value: last.value } : { done: true, value: void 0 }
					}
					if (window.promise) {
						held = { value: step.value }
						continue
					}
					window.start()
					return step
				}
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				const last = held
				if (!last) throw error
				held = void 0
				failure = { error }
				return { done: false, value: last.value }
			}
		},
		async return() {
			failure = void 0
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
/**
 * @param {unknown} source
 * @returns {AsyncIterator<unknown>}
 */
function to_reader(source) {
	const iterable = /** @type {Partial<AsyncIterable<unknown>>} */(source)/**/
	if (typeof iterable?.[Symbol.asyncIterator] != "function") throw TypeError(
		"A stream must be an async iterable"
	)
	return /** @type {AsyncIterable<unknown>} */(source)/**/[Symbol.asyncIterator]()
}
/**
 * Yields the values of a stream until the other one yields or ends, and rejects with the error of the other one when it fails first.
 * @template T
 * @param {AsyncIterable<T>} source
 * @param {AsyncIterable<unknown>} stop
 * @returns {AsyncIterableIterator<T>}
 */
export function until(source, stop) {
	/** @type {AsyncIterator<T> | undefined} */
	let reader
	/** @type {AsyncIterator<unknown> | undefined} */
	let ender
	/** @type {Promise<"stop"> | undefined} */
	let ended
	let finished = false
	function finish() {
		finished = true
		if (reader) release(reader)
		if (ender) release(ender)
	}
	return {
		[Symbol.asyncIterator]() {
			return reader || finished ? until(source, stop) : this
		},
		async next() {
			if (finished) return { done: true, value: void 0 }
			try {
				if (!reader) {
					reader = /** @type {AsyncIterator<T>} */(to_reader(source))/**/
					ender = to_reader(stop)
					ended = ender.next()
						.then(() => "stop")
				}
				const step = await Promise.race(
					[
						reader.next(),
						/** @type {Promise<"stop">} */(ended)/**/
					]
				)
				if (finished) return { done: true, value: void 0 }
				if (step == "stop" || step.done) {
					finish()
					return { done: true, value: void 0 }
				}
				return step
			} catch (error) {
				if (finished) return { done: true, value: void 0 }
				finish()
				throw error
			}
		},
		async return() {
			if (!finished) finish()
			return { done: true, value: void 0 }
		}
	}
}
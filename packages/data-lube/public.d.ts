/**
 * Deeply readonly `T`, as returned by `deepFreeze`: Map and Set become ReadonlyMap and ReadonlySet,
 * while functions, Date, RegExp, Promise, binary data and weak collections stay as they are.
 * A class with private members also stays as it is, since a readonly copy of its type would lose
 * them, so its fields look writable although they are frozen.
 */
export type DeepReadonly<T> = unknown extends T
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
		: T extends ReadonlySet<infer V>
			? ReadonlySet<DeepReadonly<V>>
			: T extends ((...args: never[]) => unknown) | ArrayBuffer | ArrayBufferView | Date | Promise<unknown> | RegExp | WeakMap<WeakKey, unknown> | WeakSet<WeakKey>
				? T
				: { [K in keyof T]: T[K] } extends T
					? { readonly [K in keyof T]: DeepReadonly<T[K]> }
					: T
/** A change listed by `deepDiff` and applied by `deepPatch`. */
export type Change =
	| { op: "add" | "replace", path: unknown[], value: unknown }
	| { op: "remove", path: unknown[] }
/**
 * Mutable `T` that a `deepUpdate` recipe changes: readonly properties, ReadonlyMap and ReadonlySet
 * become writable. A class with private members stays as it is, so a draft can be passed where the
 * class is expected; class instances are not drafted, so replace them instead of changing their fields,
 * which throws when the value is frozen and changes the original when it is not.
 */
export type Draft<T> = unknown extends T
	? T
	: T extends ReadonlyMap<infer K, infer V>
		? Map<K, Draft<V>>
		: T extends ReadonlySet<infer V>
			? Set<Draft<V>>
			: T extends ((...args: never[]) => unknown) | ArrayBuffer | ArrayBufferView | Date | Error | Promise<unknown> | RegExp | WeakMap<WeakKey, unknown> | WeakSet<WeakKey>
				? T
				: { [K in keyof T]: T[K] } extends T
					? { -readonly [K in keyof T]: Draft<T[K]> }
					: T
/** The calls of `deepEqual`. */
export type DeepEqual = {
	/**
	 * Verify that a value is deeply equal to another value of its type, like `===` for primitives
	 * except that `NaN` equals `NaN`. Plain objects, arrays, Date, RegExp, Map, Set, Error, boxed primitives,
	 * ArrayBuffer and its views are compared by content, with shared and circular references.
	 * @example deepEqual(before, draft) //=> false after the draft changed
	 */
	<T>(value: T, other: NoInfer<T>): boolean
	/**
	 * Verify that a value is deeply equal to another value, and narrow the other value to the type of
	 * the first when it is: `if (deepEqual({ tags: [ "a" ] }, input)) input.tags`.
	 * @example deepEqual(new Set([ { id: 1 } ]), new Set([ { id: 1 } ])) //=> true
	 */
	<T>(value: T, other: unknown): other is T
}
/** Options of a `deepUpdate` recipe. */
export type DeepUpdateOptions = {
	/**
	 * Treat the value as a graph whose objects may be shared or circular: every reference to a changed
	 * object held by a plain object, array, `Map` or `Set`, also one the recipe never reads, then points to its
	 * one new copy, while class instances keep their references. Each change walks the whole value.
	 * Values returned by such an update keep this without the option.
	 */
	graph?: boolean | undefined
}
/**
 * The calls of `deepUpdate`: a recipe that changes a draft of the value, or returns the next value.
 */
export type DeepUpdate = {
	/**
	 * Runs an async recipe on a draft of `value` and resolves with the next version, sharing every path
	 * the recipe did not change.
	 * @example await deepUpdate(state, async draft => { draft.user = await load_user() })
	 */
	<T>(value: T, recipe: (draft: Draft<T>) => Promise<Draft<T> | T | undefined | void>, options?: DeepUpdateOptions): Promise<T>
	/**
	 * Runs a recipe on a draft of `value` and returns the next version, sharing every path the recipe
	 * did not change, or `value` itself when nothing changed. Pass `{ graph: true }` when the value holds
	 * shared or circular references that the recipe may not read. A class instance, Date or primitive is not
	 * drafted, so its recipe must return the next value.
	 * @example deepUpdate(state, draft => { draft.user.name = "Kim" }) //=> next state
	 */
	<T>(value: T, recipe: (draft: Draft<T>) => Draft<T> | T | undefined | void, options?: DeepUpdateOptions): T
}
type NotPlain = ((...args: never[]) => unknown) | ArrayBuffer | ArrayBufferView | Date | Error | Promise<unknown> | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | readonly unknown[] | RegExp | WeakMap<WeakKey, unknown> | WeakSet<WeakKey>
type OptionalValue<B, K extends keyof B> = { a: undefined } extends { a?: number }
	? B[K]
	: Required<Pick<B, K>>[K]
type Primitive = bigint | boolean | number | string | symbol | null | undefined
type MergeValue<A, B> = B extends NotPlain | Primitive
	? B
	: B extends WeakKey
		? A extends NotPlain | Primitive
			? B
			: A extends WeakKey
				? MergeObject<A, B>
				: B
		: B
type MergeKeys<T> = { [K in keyof T]: unknown }
type MergeObject<A, B, AB = MergeKeys<A> & MergeKeys<B>> = {
	[K in keyof AB]: K extends keyof B
		? K extends keyof A
			? {} extends Pick<B, K>
				? A[K] | MergeKey<K, A[K], OptionalValue<B, K>>
				: MergeKey<K, A[K], B[K]>
			: B[K]
		: K extends keyof A
			? A[K]
			: never
}
type MergeKey<K, A, B> = K extends symbol
	? B
	: MergeValue<A, B>
type MergeRest<A, T extends readonly unknown[]> = T extends readonly [infer B, ...infer Rest]
	? MergeRest<B extends null | undefined ? A : MergeValue<A, B>, Rest>
	: T extends readonly []
		? A
		: A | MergeValue<A, Exclude<T[number], null | undefined>>
/** The result of `deepMerge` with the values `T`. */
export type Merge<T extends readonly unknown[]> = T extends readonly [infer A, ...infer Rest]
	? MergeRest<A, Rest>
	: T extends readonly []
		? undefined
		: MergeValue<T[number], T[number]>
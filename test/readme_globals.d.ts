/* eslint-disable lube/svelte-naming-convention */
import type { http } from "async-lube"
declare global {
	type Cart = { items: number[] }
	type Item = { id: number }
	type Price = { value: number }
	type Quote = { id: string }
	type Receipt = { id: string }
	type User = { name: string }
	const api: ReturnType<typeof http>
	const box: HTMLElement
	const bytes: ArrayBuffer
	const cache: { read<T>(key: string): Promise<T> }
	const cart: Cart
	const chart: { draw(value?: Price[]): void }
	const day: string
	const db: { query(sql: string, params?: unknown): Promise<unknown[]> }
	const id: number
	const input: HTMLInputElement
	const key: string
	const order: unknown
	const orders: { insert(cart: Cart): Promise<{ id: string }> }
	const otpForm: HTMLFormElement
	const otpInput: HTMLInputElement
	const q: string
	const refresh: HTMLElement
	const request: { headers: Record<string, string> }
	const signal: AbortSignal
	const sql: string
	function getToken(): Promise<string>
	function get_cart(): Promise<Cart>
	function get_quote(cart: Cart, user: User): Promise<Quote>
	function get_user(): Promise<User>
	function pay(quote: Quote, code: string): Promise<Receipt>
	function refreshToken(): Promise<string>
	function render(value: unknown): void
	function reply(value: unknown): void
	function ship(order: unknown): Promise<string>
	function show(message: string): void
	function showError(error: unknown): void
}
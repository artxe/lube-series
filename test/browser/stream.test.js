import { channel, merge, throttle, until } from "async-lube"
import { assert, describe, it } from "vitest"
describe(
	"streams of a browser",
	() => {
		/**
		 * @param {string} html
		 * @returns {HTMLElement}
		 */
		function mount(html) {
			const host = document.createElement("div")
			host.innerHTML = html
			document.body.append(host)
			return host
		}
		/**
		 * @returns {Promise<void>}
		 */
		function settle() {
			return new Promise(
				resolve => setTimeout(resolve, 0)
			)
		}
		it(
			"cancels the default action in the handler that sends",
			async () => {
				const host = mount(
					"<a href=\"#gone\" id=\"link\">go</a>"
				)
				const link = /** @type {HTMLAnchorElement} */(host.querySelector("#link"))/**/
				/** @type {import("async-lube").Channel<MouseEvent>} */
				const clicks = channel()
				link.addEventListener(
					"click",
					event => {
						event.preventDefault()
						clicks.send(event)
					}
				)
				/** @type {MouseEvent[]} */
				const seen = []
				void (async () => {
					for await (const event of clicks) seen.push(event)
				})()
				await settle()
				link.click()
				await settle()
				assert.equal(location.hash, "")
				assert.equal(seen.length, 1)
				clicks.close()
				host.remove()
			}
		)
		it(
			"drags with nested loops",
			async () => {
				const host = mount(
					"<div id=\"box\" style=\"position:absolute;left:0;top:0;width:40px;height:40px\"></div>"
				)
				const box = /** @type {HTMLElement} */(host.querySelector("#box"))/**/
				/** @type {import("async-lube").Channel<MouseEvent>} */
				const downs = channel()
				/** @type {import("async-lube").Channel<number>} */
				const moves = channel()
				/** @type {import("async-lube").Channel<MouseEvent>} */
				const ups = channel()
				box.addEventListener(
					"mousedown",
					event => downs.send(event)
				)
				window.addEventListener(
					"mousemove",
					event => moves.send(event.clientX)
				)
				window.addEventListener(
					"mouseup",
					event => ups.send(event)
				)
				/** @type {number[]} */
				const dragged = []
				void (async () => {
					for await (const down of downs) {
						void down
						for await (const x of until(moves, ups)) {
							dragged.push(x)
							box.style.left = `${x}px`
						}
					}
				})()
				await settle()
				box.dispatchEvent(
					new MouseEvent("mousedown", { bubbles: true })
				)
				await settle()
				window.dispatchEvent(
					new MouseEvent("mousemove", { clientX: 30 })
				)
				await settle()
				window.dispatchEvent(
					new MouseEvent("mousemove", { clientX: 60 })
				)
				await settle()
				window.dispatchEvent(new MouseEvent("mouseup"))
				await settle()
				window.dispatchEvent(
					new MouseEvent("mousemove", { clientX: 200 })
				)
				await settle()
				assert.deepEqual(dragged, [ 30, 60 ])
				assert.equal(box.style.left, "60px")
				downs.close()
				moves.close()
				ups.close()
				host.remove()
			}
		)
		it(
			"merges and throttles clicks",
			async () => {
				const host = mount(
					"<button id=\"one\">1</button><button id=\"two\">2</button>"
				)
				/** @type {import("async-lube").Channel<string>} */
				const ones = channel()
				/** @type {import("async-lube").Channel<string>} */
				const twos = channel()
				const one = /** @type {HTMLElement} */(host.querySelector("#one"))/**/
				const two = /** @type {HTMLElement} */(host.querySelector("#two"))/**/
				one.addEventListener("click", () => ones.send("one"))
				two.addEventListener("click", () => twos.send("two"))
				/** @type {string[]} */
				const seen = []
				void (async () => {
					for await (const name of throttle(merge(ones, twos), 40)) seen.push(name)
				})()
				await settle()
				one.click()
				two.click()
				one.click()
				await new Promise(
					resolve => setTimeout(resolve, 120)
				)
				assert.equal(seen[0], "one")
				assert.isBelow(seen.length, 3)
				host.remove()
			}
		)
	}
)
const get_time = Date.prototype.getTime
/**
 * @param {string} name
 * @param {Date} date
 * @returns {number}
 */
export default function(name, date) {
	try {
		return get_time.call(date)
	} catch {
		throw new TypeError(
			`${name}: Expected a Date, got ${date === null ? "null" : typeof date}`
		)
	}
}
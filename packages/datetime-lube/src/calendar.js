const month_days = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ]
/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {number}
 */
function days_of(year, month, day) {
	if (month < 0 || month > 11) {
		year += Math.floor(month / 12)
		month = (month % 12 + 12) % 12
	}
	if (month < 2) year--
	const era = Math.floor(year / 400)
	const yoe = year - era * 400
	return era * 146097
		+ yoe * 365
		+ Math.floor(yoe / 4)
		- Math.floor(yoe / 100)
		+ Math.floor(
			(153 * (month < 2 ? month + 10 : month - 2) + 2) / 5
		)
		+ day
		- 719469
}
/**
 * @param {number} wall
 * @returns {number[]}
 */
function fields_of_wall(wall) {
	const days = Math.floor(wall / 86400000)
	let rest = wall - days * 86400000
	const hour = Math.floor(rest / 3600000)
	rest -= hour * 3600000
	const minute = Math.floor(rest / 60000)
	rest -= minute * 60000
	const second = Math.floor(rest / 1000)
	const z = days + 719468
	const era = Math.floor(z / 146097)
	const doe = z - era * 146097
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
	)
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
	const mp = Math.floor((5 * doy + 2) / 153)
	const month = mp < 10 ? mp + 2 : mp - 10
	return [
		yoe + era * 400 + (month < 2 ? 1 : 0),
		month,
		doy - Math.floor((153 * mp + 2) / 5) + 1,
		hour,
		minute,
		second,
		rest - second * 1000,
		(days % 7 + 11) % 7
	]
}
/**
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
function last_day(year, month) {
	return month == 1 && !(year % 4) && (year % 100 || !(year % 400))
		? 29
		: /** @type {number} */(month_days[month])/**/
}
/**
 * @param {number[]} fields
 * @returns {number}
 */
function wall_of_fields(fields) {
	return days_of(
		/** @type {number} */(fields[0])/**/,
		/** @type {number} */(fields[1])/**/,
		/** @type {number} */(fields[2])/**/
	) * 86400000
		+ /** @type {number} */(fields[3])/**/ * 3600000
		+ /** @type {number} */(fields[4])/**/ * 60000
		+ /** @type {number} */(fields[5])/**/ * 1000
		+ /** @type {number} */(fields[6])/**/
}
export {
	days_of,
	fields_of_wall,
	last_day,
	wall_of_fields
}
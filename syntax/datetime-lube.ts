import {
	type TimeZone,
	type Unit,
	add,
	dateToString,
	diff,
	endOf,
	startOf,
	stringToDate,
	timeUnit,
	timeZoneOffset
} from "datetime-lube"
const date = new Date()
const zone: TimeZone = "Asia/Seoul"
const unit: Unit = "D"
const milliseconds: Unit = "sss"
add(date, "")
add(date, "1M", zone)
dateToString(date)
dateToString(date, "")
dateToString(date, "YYYY-MM-DD", zone)
stringToDate("")
stringToDate("", "")
stringToDate("", "YYYY", zone)
stringToDate("", undefined, zone)
startOf(date, "D")
startOf(date, "M", zone)
endOf(date, "Y")
endOf(date, "s", zone)
const start_unit: Exclude<Unit, "sss"> = "W"
startOf(date, start_unit)
endOf(date, start_unit, zone)
// @ts-expect-error: startOf has no milliseconds
startOf(date, "sss")
// @ts-expect-error: endOf has no milliseconds
endOf(date, milliseconds as Unit)
const days: number = diff(date, date, "D")
const ms: number = diff(date, date, "sss", zone)
diff(date, date, milliseconds)
diff(date, date, unit, zone)
const offset: number = timeZoneOffset(date, zone)
timeUnit.DD
days.toFixed()
ms.toFixed()
offset.toFixed()
const array: TimeZone[] = [ "America/New_York", "Zulu" ]
for (const tz of array) dateToString(date, undefined, tz)
// @ts-expect-error: not a unit
startOf(date, "Q")
const resolved: string = Intl.DateTimeFormat().resolvedOptions().timeZone
dateToString(date, "YYYY", resolved)
add(date, "1D", "+09:00")
const named: TimeZone = "Asia/Seoul"
named.toUpperCase()
// @ts-expect-error: not a string
dateToString(date, "YYYY", 9)
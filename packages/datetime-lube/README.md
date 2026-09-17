# Datetime Lube
Date math, formatting and parsing for the platform's own `Date`, in any time zone.

There is no wrapper object: every function takes and returns the platform's own `Date`, and never changes the one it is given. A time zone needs no plugin or setup, since the math, formatting and parsing functions take one as their last argument, and use the local zone when it is left out.

## Installation
```bash
npm i datetime-lube
```

## Usage
The results below write a `Date` as `Date { … }`: without an offset it is the time on the local clock, and with `Z` or an offset such as `-04:00` it is the time at that offset.

### Add and subtract time
```ts
import { add } from "datetime-lube"

const date = new Date("2024-01-31T09:00")
const noon = new Date("2024-03-09T12:00-05:00")

add(date, "1M") //=> Date { 2024-02-29T09:00:00.000 }, clamped to the end of the month
add(date, "1Y-2W 3H30m") //=> Date { 2025-01-17T12:30:00.000 }
add(noon, "1D", "America/New_York") //=> Date { 2024-03-10T12:00:00.000-04:00 }, 23 hours later
```
- The sum lists numbers, each followed by a unit: `"Y"` years, `"M"` months, `"W"` weeks, `"D"` days, `"H"` hours, `"m"` minutes, `"s"` seconds or `"sss"` milliseconds. A number may have a sign and spaces may separate the parts; anything else, such as `"1d"` or an empty sum, throws a `RangeError`.
- Years, months, weeks and days follow the clock, so a day over a daylight saving change can be 23 or 25 hours, while the smaller units are elapsed time.
- Units apply from left to right, so `"1M-1D"` and `"-1D1M"` can differ at the end of a month.

### Format a date
```ts
import { dateToString } from "datetime-lube"

const date = new Date("2222-03-04T11:22:33.444")

dateToString(date) //=> "2222-03-04T11:22:33.444"
dateToString(date, "HHhmmmssSsss _ YYYY/MM/DD") //=> "11h22m33S444 _ 2222/03/04"
dateToString(new Date("2024-07-15T12:00Z"), "MM/DD HH:mm", "Asia/Seoul") //=> "07/15 21:00"
```
- Tokens are `YYYY` year, `MM` month, `DD` day, `HH` hour from 00 to 23, `mm` minute, `ss` second and `sss` millisecond, as in the ECMAScript date time string `YYYY-MM-DDTHH:mm:ss.sss`, which is also the default format. So milliseconds are `sss`, never `SSS`.
- Everything else is printed as it is, like `h`, `m` and `S` above or the `SSS`, `hh` and `a` of other libraries; there is no escape syntax.
- A year before 0 or after 9999 is printed as the ECMAScript expanded year, such as `+012345` or `-000005`, which `stringToDate` reads back.
- An invalid `Date` gives `"Invalid Date"`.
- For text that people read, such as month names, weekdays or AM and PM, use `Intl.DateTimeFormat`.

### Parse a string
```ts
import { stringToDate } from "datetime-lube"

stringToDate("2024-07-15") //=> Date { 2024-07-15T00:00:00.000 }
stringToDate("2024-07-15T12:00:00+09:00") //=> Date { 2024-07-15T03:00:00.000Z }
stringToDate("2024/7/1 9h05", "YYYY-MM-DD HH:mm") //=> Date { 2024-07-01T09:05:00.000 }
stringToDate("15.07.2024", "DD.MM.YYYY", "Asia/Seoul") //=> Date { 2024-07-15T00:00:00.000+09:00 }
stringToDate("2024-02-30", "YYYY-MM-DD") //=> Invalid Date
```
- Without a format, the platform parser reads the string and applies an offset in it, such as `Z`, `+09:00` or `EST`. A string without an offset is read in the time zone, even a date alone, which `new Date("2024-07-15")` would read as UTC. Check user input with a format.
- With a format, each token reads up to its own number of digits, and every other character skips one character of the string. Tokens missing from the format default to `0000-01-01T00:00:00.000`.
- A token with no digits or a value out of range, such as February 30, or text left after the format gives an invalid `Date`.
- [Parsing details](#parsing-details) covers separators, times without a date and strings read without a format.

### Start and end of a unit
```ts
import { endOf, startOf } from "datetime-lube"

const date = new Date("2024-07-17T09:30")

startOf(date, "W") //=> Date { 2024-07-15T00:00:00.000 }
endOf(date, "M") //=> Date { 2024-07-31T23:59:59.999 }
endOf(new Date("2024-07-17T09:30Z"), "D", "Asia/Seoul") //=> Date { 2024-07-17T23:59:59.999+09:00 }
```
- Units are `"Y"`, `"M"`, `"W"`, `"D"`, `"H"`, `"m"` and `"s"`, every `Unit` but `"sss"`, and a week starts on Monday, as in ISO 8601. Any other unit throws a `RangeError`.
- The end of a unit is the last millisecond before the next one starts, so a day ends at 23:59:59.999 even when daylight saving time starts at midnight.

### Count units between dates
```ts
import { diff } from "datetime-lube"

const from = new Date("2024-01-31T23:00")
const to = new Date("2024-02-29T01:00")

diff(from, to, "M") //=> 0, Feb 29 23:00 is not reached
diff(from, to, "D") //=> 29
diff(to, from, "W") //=> -4
```
- `"D"` and `"W"` count calendar days, whatever the time of day. `"Y"` and `"M"` count whole months; a month is complete once the day and time of the first date are reached, on the last day of a month that lacks that day, as `add` lands there: `diff(date, add(date, "1M"), "M")` is 1, also from Jan 31 or Feb 29.
- `"H"`, `"m"`, `"s"` and `"sss"` are elapsed time. Every count is truncated toward zero and negative when the second date is earlier. Any other unit throws a `RangeError`.
- To compare two dates, use the platform: `a < b`, `+a === +b` and `+b - +a` for milliseconds.

### Time zones
```ts
import { dateToString, timeZoneOffset } from "datetime-lube"
import type { TimeZone } from "datetime-lube"

const zone: TimeZone = "America/New_York"
const date = new Date("2024-07-15T12:00Z")

timeZoneOffset(date, zone) //=> -14400000
dateToString(date, undefined, zone) //=> "2024-07-15T08:00:00.000"
new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: zone }).format(date) //=> "08:00"
```
- To show a date in a time zone, pass the zone to `dateToString`, with `undefined` for the default format, or to `Intl.DateTimeFormat` for text that people read. The `Date` stays the same instant; there is no function that shifts it so the local clock shows another zone.
- A clock time inside a daylight saving gap moves forward, and one that occurs twice takes the first occurrence, as `new Date(2024, 2, 10, 2, 30)` does in New York. `stringToDate`, `add`, `startOf` and `endOf` follow this rule; [Daylight saving details](#daylight-saving-details) has the exceptions.
- `timeZoneOffset` is the offset east of UTC in milliseconds at the given date, so a summer date gives the summer offset.
- `TimeZone` suggests the IANA names but accepts any string, such as a name read from a database. An offset like `"+09:00"` works only on a runtime whose `Intl` accepts offset time zones, a recent addition; elsewhere it throws like any zone that `Intl` rejects.
- `datetime-lube` exports the `TimeZone` and `Unit` types next to its functions.

### Time units in milliseconds
```ts
import { timeUnit } from "datetime-lube"

timeUnit //=> { DD: 86400000, HH: 3600000, mm: 60000, ss: 1000 }
2 * timeUnit.HH + 30 * timeUnit.mm //=> 9000000
```

## Details
### Parsing details
- A format checks digits and length, not separators: a separator skips any one character, so `"YYYY-MM-DD"` also reads `2025/01/01`, `2025-1-01` and `25-01-01` (the year 25). To accept only one shape, test the string with a regular expression such as `/^\d{4}-\d{2}-\d{2}$/` first.
- `sss` reads its digits as a fraction, so `.5` is 500 ms, and ignores further digits; `YYYY` also reads an expanded year such as `+012345`.
- A format without a date reads the time on 0000-01-01, where a time zone is at its local mean time (`Asia/Seoul` is +08:27:52), so read a time alone with `"UTC"` and join it to a date before it becomes an instant:
  ```ts
  const time = stringToDate(input, "HH:mm", "UTC") // check the input
  const start = stringToDate(`${day} ${dateToString(time, "HH:mm", "UTC")}`, "YYYY-MM-DD HH:mm", "Asia/Seoul")
  ```
- Without a format, a date or time out of range in an ECMAScript date string, such as `2024-02-30` or `23:60`, gives an invalid `Date` instead of rolling over; `24:00` is the end of the day, as in ECMAScript. Other strings are read as the platform reads them, and V8 rolls `"2025/02/30"` and `"Feb 30 2025"` over to March 2.

### Daylight saving details
- A part of zero adds nothing, so `add(date, "0D")` is the same instant even in an hour that occurs twice. Every other part of years, months, weeks or days lands on a clock time and takes its first occurrence, so `"1D-1D"` from the second 01:30 of a night that repeats 01:00 to 02:00 ends on the first 01:30, as Temporal adds one part after the other.
- In an hour that occurs twice, `startOf` and `endOf` of `"H"`, `"m"` and `"s"` stay in the occurrence of the given date, so an hour is never longer than an hour and its end plus one millisecond starts the next.
- Without a time zone argument the local time zone comes from the platform's `Date`, mistakes included: V8 can report a stale offset right after a few historical transitions, such as Europe/Tirane in 1943. Pass the zone name when historical offsets matter.

### Errors
- An invalid `Date` gives an invalid `Date`, `NaN` or `"Invalid Date"`, while a mistake in the call throws, even for an invalid `Date`: a unit or duration the function does not know or a time zone that `Intl` rejects throws a `RangeError`, and a date that is not a `Date` (a string for `stringToDate`) throws a `TypeError`.
- The message starts with the function and quotes the value, such as `add: Invalid duration "1d"` or `startOf: Invalid time zone "Asia/Soul"`.

## What it is not
- **Not a replacement for `Temporal`.** When every runtime you target has it, use it: it is the standard, it separates an instant from a wall clock, and the results here are fuzzed against it, so moving over does not change what your code computes. This package is for the code that holds a `Date`.
- **Not text for people.** Month names, weekday names, AM and PM, and relative time such as "3 days ago" are `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`, which every runtime has.
- **Not a comparison library.** Two `Date` values compare with `<` and `>`, and their distance is `b - a`.
- **Not a calendar library.** Only the Gregorian calendar of `Date`, with no lunar, fiscal or business-day arithmetic.

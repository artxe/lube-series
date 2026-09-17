# Changelog

## 1.0.0

### Breaking

- **The package is an ES module only.** `import` loads `src/index.js`, and there is no CommonJS
  build: `require("datetime-lube")` works on Node.js 20.19+ and 22.12+, which load ES modules with `require`.
  Jest loads it once its ESM mode is on or the package is transformed.
- **Renamed to `datetime-lube`, and the version restarts at `1.0.0`.** `date-lube` is removed
  from npm. Replace `npm i date-lube` with `npm i datetime-lube`,
  and every `from "date-lube"` with `from "datetime-lube"`.
- **Every function returns a new `Date` and never changes the given one.** `add` used to change
  the date that was passed in, so `const tomorrow = add(today, "1D")` also moved `today`. Replace
  `add(date, "1D")` used for its side effect with `date = add(date, "1D")`.
- **`timeZone(date, zone, inversion?)` is removed.** It moved the instant so that the local clock
  showed another zone. Every function takes the zone instead: replace
  `dateToString(timeZone(date, zone), format)` with `dateToString(date, format, zone)`, use
  `Intl.DateTimeFormat` with `timeZone` for text that people read, and replace
  `timeZone(shifted, zone, true)` with `stringToDate(dateToString(shifted), undefined, zone)`.
- **`add` clamps years and months to the end of the month.** `add(new Date(2024, 0, 31), "1M")` was
  Mar 2 and is now Feb 29, and `"1Y"` from Feb 29 lands on Feb 28. Days are unaffected.
- **`add` adds hours, minutes, seconds and milliseconds as elapsed time.** Across a daylight saving
  transition `"1H"` is exactly one hour; it used to follow the local clock.
- **`add` throws a `RangeError` for a sum it cannot read.** `"1d"` and `"1 D"` were ignored and
  `"1.5D"` added 5 days; each throws now, as does an empty sum, while spaces between the parts of
  `"1Y 2D"` still work.
- **A mistake in the call throws, also for an invalid `Date`.** A duration or unit the function
  does not know or a time zone that `Intl` rejects throws a `RangeError` before an invalid `Date`
  returns its invalid result, and a date that is not a `Date` (for `stringToDate`, a string)
  throws a `TypeError`. The message names the function and quotes the value, such as
  `add: Invalid duration "1d"`, `startOf: Invalid unit "sss"` or
  `dateToString: Invalid time zone "Asia/Soul"`, and keeps the error of `Intl` as its `cause`.
- **`stringToDate` rejects out-of-range values and trailing text.** `2222-02-30` was Mar 2 and hour
  `24` was the next day; both return an invalid `Date` now, with and without a format. Without a
  format only `24:00` stays, as the end of the day in ECMAScript. With a format, text left after it,
  such as `"2024-07-15 junk"` for `"YYYY-MM-DD"`, gives an invalid `Date`, while digits after `sss`
  are still ignored.
- **`YYYY` prints years outside 0 to 9999 as ECMAScript expanded years**, `+012345` and `-000005`
  instead of `12345` and `-0005`, so the default format is a valid date string again, and
  `stringToDate` reads them back with and without a format.

### Added

- `package.json` declares `engines.node` as `>=18`: older Node.js cannot read time zone offsets
  as `longOffset`.
- **A time zone argument on every function.** `dateToString`, `stringToDate`, `add`, `startOf`,
  `endOf` and `diff` take a time zone as their last argument, the local one when left out. A wall clock inside a daylight saving
  gap moves forward and one that occurs twice takes the first occurrence, in every zone, as
  `new Date(2024, 2, 10, 2, 30)` does in the local zone. A result outside the `Date` range is an
  invalid `Date`, never a throw.
- `startOf(date, unit, zone?)` and `endOf(date, unit, zone?)` for `"Y"`, `"M"`, `"W"`, `"D"`,
  `"H"`, `"m"` and `"s"`; a week starts on Monday, as in ISO 8601. A unit ends at the last
  millisecond before the next one starts, so a day that begins with a daylight saving gap still
  ends at 23:59:59.999; `"H"`, `"m"` and `"s"` stay in the given occurrence of a repeated hour, and
  a unit whose first moment falls into a gap starts at the transition.
- `diff(from, to, unit, zone?)` counts whole units, following the clock for `"Y"`, `"M"`, `"W"`
  and `"D"` and elapsed time for the rest. Days are counted on the calendar, so a skipped date
  such as 2011-12-30 in `Pacific/Apia` still counts as a day, and a month is complete once the day
  and time of the first date are reached, on the last day of a month that lacks that day, so
  `diff` counts back what `add` added: from Feb 29, 2024 to Feb 28, 2025 is 1 year.
- `add` takes `"W"` for weeks, seven days following the clock.
- `timeZoneOffset(date, zone)` returns the offset east of UTC in milliseconds at that date.
- The `Unit` type is exported, next to `TimeZone`: `import type { Unit } from "datetime-lube"`.
  It lists `"Y"`, `"M"`, `"W"`, `"D"`, `"H"`, `"m"`, `"s"` and `"sss"`, the units of `diff` and of
  the sum of `add`; `startOf` and `endOf` take `Exclude<Unit, "sss">`.
- `TimeZone` accepts any string while still suggesting the IANA names, so a zone read from a
  database or `Intl.DateTimeFormat().resolvedOptions().timeZone` needs no cast; a zone that `Intl`
  rejects throws a `RangeError`. An offset such as `"+09:00"` works on a runtime whose `Intl`
  accepts offset time zones.
- `diff`, `startOf` and `endOf` throw a `RangeError` for a unit they do not know, as `add` does,
  instead of counting or rounding by another unit.

### Fixed

- `add` with a part of zero, such as `"0D"` or `"0M"`, moved a clock time that occurs twice to its
  first occurrence. A zero part adds nothing now, so the second 01:30 of a night that repeats an hour
  stays where it is.
- `dateToString` replaced only the first occurrence of each token: `"DD.MM.DD"` gave `04.03.DD`.
  `"sss ss"` gave `03s ss`, and negative years were padded as `00-1`.
- `stringToDate` returned an invalid `Date` for a format without `MM` or `DD`, such as
  `stringToDate("11:22", "HH:mm")`. The missing parts default to `0000-01-01T00:00:00.000` now. A
  format with `sss` before `ss` was misread.
- `stringToDate` without a format ignored a time zone in the string, so `"2024-07-15T12:00:00Z"`
  was read as local time. The platform parser reads the string now, while a date without a time,
  including `"2024-07"` or `"2024"`, stays local midnight instead of becoming UTC midnight. With a
  time zone argument the wall clock of the string is read in that zone, and an offset in the
  string, such as `Z`, `+09:00` or `EST`, still applies.
- `stringToDate` needed the exact number of digits, so `"2024-7-1"` with `"YYYY-MM-DD"` failed.
- `dateToString` printed `"0NaN-NaN-NaN..."` for an invalid Date instead of `"Invalid Date"`.
- The `TimeZone` type listed `"TZ identifier"`, `"DST"` and `"Factory"`, which `Intl` rejects, and
  lacked `"America/Coyhaique"`.

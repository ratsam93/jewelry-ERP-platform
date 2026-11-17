const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Upper bound for an inclusive `createdAt <= to` filter.
 *
 * Report date ranges arrive as `z.coerce.date()` values, so a date-only
 * `to` such as "2026-11-16" becomes midnight UTC and a plain `lte: to` drops
 * every row created later that day. When `to` has no time part we extend it
 * to the last millisecond of that UTC day; a `to` that already carries a time
 * is used as given.
 */
export function inclusiveRangeEnd(to: Date): Date {
  const isDateOnly =
    to.getUTCHours() === 0 &&
    to.getUTCMinutes() === 0 &&
    to.getUTCSeconds() === 0 &&
    to.getUTCMilliseconds() === 0;
  return isDateOnly ? new Date(to.getTime() + DAY_MS - 1) : to;
}

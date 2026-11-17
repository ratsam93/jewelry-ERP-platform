// Pure date helpers for report/dashboard date ranges.
//
// All values are built from the user's LOCAL calendar. Date-only strings
// ('YYYY-MM-DD') are never routed through toISOString(), which shifts local
// midnight back a day in timezones ahead of UTC (e.g. IST) and caused the
// "presets are off by one day" bug (HK-REP-03).
//
// A range is always sent as `from` = start of the local day and
// `to` = end (23:59:59.999) of the local day, so both bounds are inclusive.
//
// "This Quarter" is the CALENDAR quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec):
// the app has no fiscal-year setting to base an Indian financial-year quarter on.

export type DatePresetKey =
  | 'today'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter';

export interface DateRangeValue {
  from: Date;
  to: Date;
}

export const DATE_PRESETS: ReadonlyArray<{ key: DatePresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisQuarter', label: 'This Quarter (calendar)' },
];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 'YYYY-MM-DD' from the LOCAL date parts of `d`. */
export function toLocalDateString(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local start of day for a 'YYYY-MM-DD' string; null if malformed or not a real date. */
export function parseLocalDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Resolve a preset to an inclusive local range, relative to `now`. */
export function computePreset(key: DatePresetKey, now: Date = new Date()): DateRangeValue {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const today = new Date(y, m, d);
  switch (key) {
    case 'today':
      return { from: startOfDay(today), to: endOfDay(today) };
    case 'last7':
      return { from: new Date(y, m, d - 6), to: endOfDay(today) };
    case 'last30':
      return { from: new Date(y, m, d - 29), to: endOfDay(today) };
    case 'thisMonth':
      return { from: new Date(y, m, 1), to: endOfDay(today) };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) };
    case 'thisQuarter':
      return { from: new Date(y, Math.floor(m / 3) * 3, 1), to: endOfDay(today) };
  }
}

/** Default report range: first of the current month to today (inclusive). */
export function defaultMonthToDate(now: Date = new Date()): DateRangeValue {
  return computePreset('thisMonth', now);
}

/** Inclusive range from two date-only strings (as typed into <input type="date">). */
export function rangeFromDateStrings(from: string, to: string): DateRangeValue | null {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t) return null;
  return { from: startOfDay(f), to: endOfDay(t) };
}

/** True when `to` falls on or after the calendar day of `from`. */
export function isRangeOrdered(from: Date, to: Date): boolean {
  return toLocalDateString(to) >= toLocalDateString(from);
}

export const END_BEFORE_START_MESSAGE = 'End date must be on or after start date';

/** File-name friendly range: '2026-11-01_to_2026-11-17'. */
export function rangeFileSuffix(from: Date | string, to: Date | string): string {
  const f = typeof from === 'string' ? from : toLocalDateString(from);
  const t = typeof to === 'string' ? to : toLocalDateString(to);
  return `${f}_to_${t}`;
}

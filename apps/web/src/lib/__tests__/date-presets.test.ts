import { describe, it, expect } from 'vitest';
import {
  computePreset,
  parseLocalDate,
  rangeFileSuffix,
  rangeFromDateStrings,
  isRangeOrdered,
  toLocalDateString,
  type DatePresetKey,
} from '../date-presets';

const at = (y: number, m: number, d: number, h = 15, min = 30) => new Date(y, m - 1, d, h, min);
const ymd = (d: Date) => toLocalDateString(d);
const range = (key: DatePresetKey, now: Date) => {
  const r = computePreset(key, now);
  return { from: ymd(r.from), to: ymd(r.to), r };
};

describe('toLocalDateString / parseLocalDate', () => {
  it('uses local parts, never UTC', () => {
    // Local midnight must stay on the same calendar day (toISOString would shift it in IST).
    expect(toLocalDateString(new Date(2026, 10, 1, 0, 0, 0))).toBe('2026-11-01');
    expect(toLocalDateString(new Date(2026, 10, 1, 23, 59, 59, 999))).toBe('2026-11-01');
  });
  it('parses valid and rejects invalid strings', () => {
    expect(ymd(parseLocalDate('2028-02-29')!)).toBe('2028-02-29');
    expect(parseLocalDate('2027-02-29')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate('17/11/2026')).toBeNull();
  });
});

describe('computePreset (fixed now = 2026-11-17 15:30 local)', () => {
  const now = at(2026, 11, 17);
  it('Today is today to today', () => {
    const { from, to, r } = range('today', now);
    expect([from, to]).toEqual(['2026-11-17', '2026-11-17']);
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getHours()).toBe(23);
    expect(r.to.getMilliseconds()).toBe(999);
  });
  it('Last 7 Days is 7 days inclusive', () => {
    const { from, to } = range('last7', now);
    expect([from, to]).toEqual(['2026-11-11', '2026-11-17']);
  });
  it('Last 30 Days is 30 days inclusive', () => {
    const { from, to } = range('last30', now);
    expect([from, to]).toEqual(['2026-10-19', '2026-11-17']);
  });
  it('This Month is the 1st to today', () => {
    expect(range('thisMonth', now)).toMatchObject({ from: '2026-11-01', to: '2026-11-17' });
  });
  it('Last Month is the first to last day of the previous month', () => {
    expect(range('lastMonth', now)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('This Quarter is the calendar quarter start to today', () => {
    expect(range('thisQuarter', now)).toMatchObject({ from: '2026-10-01', to: '2026-11-17' });
  });
});

describe('computePreset boundaries', () => {
  it('Jan 1: last month is December of the previous year, quarter starts Jan 1', () => {
    const now = at(2027, 1, 1, 0, 5);
    expect(range('lastMonth', now)).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(range('thisMonth', now)).toMatchObject({ from: '2027-01-01', to: '2027-01-01' });
    expect(range('thisQuarter', now)).toMatchObject({ from: '2027-01-01', to: '2027-01-01' });
    expect(range('last7', now)).toMatchObject({ from: '2026-12-26', to: '2027-01-01' });
  });
  it('leap day: March 1 2028 last month ends Feb 29', () => {
    const now = at(2028, 3, 1);
    expect(range('lastMonth', now)).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
    expect(range('last30', now)).toMatchObject({ from: '2028-02-01', to: '2028-03-01' });
  });
  it('non-leap year: March 1 2027 last month ends Feb 28', () => {
    expect(range('lastMonth', at(2027, 3, 1))).toMatchObject({ to: '2027-02-28' });
  });
  it('last day of month (Dec 31) and quarter boundaries', () => {
    expect(range('thisMonth', at(2026, 12, 31, 23, 59))).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(range('thisQuarter', at(2026, 3, 31))).toMatchObject({ from: '2026-01-01' });
    expect(range('thisQuarter', at(2026, 4, 1))).toMatchObject({ from: '2026-04-01' });
    expect(range('thisQuarter', at(2026, 9, 30))).toMatchObject({ from: '2026-07-01' });
  });
  it('last month from a 31-day month into a 30-day month (Dec 31 -> Nov)', () => {
    expect(range('lastMonth', at(2026, 12, 31))).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('rangeFromDateStrings', () => {
  it('builds start/end of the local days', () => {
    const r = rangeFromDateStrings('2026-11-01', '2026-11-17')!;
    expect(r.from.getTime()).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).getTime());
    expect(r.to.getTime()).toBe(new Date(2026, 10, 17, 23, 59, 59, 999).getTime());
  });
  it('returns null for invalid input', () => {
    expect(rangeFromDateStrings('', '2026-11-17')).toBeNull();
    expect(rangeFromDateStrings('2026-11-01', 'nope')).toBeNull();
  });
  it('round-trips what the inputs display', () => {
    const p = computePreset('lastMonth', at(2026, 11, 17));
    const back = rangeFromDateStrings(ymd(p.from), ymd(p.to))!;
    expect(back.from.getTime()).toBe(p.from.getTime());
    expect(back.to.getTime()).toBe(p.to.getTime());
  });
});

describe('isRangeOrdered', () => {
  it('accepts same day and rejects end before start', () => {
    expect(isRangeOrdered(at(2026, 11, 17, 0, 0), at(2026, 11, 17, 23, 59))).toBe(true);
    expect(isRangeOrdered(at(2026, 11, 17), at(2026, 11, 16))).toBe(false);
  });
});

describe('HK-REP-02: sales report and dashboard agree on Last Month', () => {
  it('both resolve the same inclusive range for the same inputs', () => {
    const now = at(2026, 11, 17);
    // Dashboard path: preset -> range straight into the query.
    const dashboard = computePreset('lastMonth', now);
    // Report page path: preset shown in <input type="date">, parsed back from the strings.
    const report = rangeFromDateStrings(ymd(dashboard.from), ymd(dashboard.to))!;
    expect(report.from.getTime()).toBe(dashboard.from.getTime());
    expect(report.to.getTime()).toBe(dashboard.to.getTime());
    expect(ymd(report.from)).toBe('2026-10-01');
    expect(ymd(report.to)).toBe('2026-10-31');
  });
});

describe('rangeFileSuffix', () => {
  it('formats dates and strings', () => {
    expect(rangeFileSuffix(at(2026, 11, 1), at(2026, 11, 17))).toBe('2026-11-01_to_2026-11-17');
    expect(rangeFileSuffix('2026-11-01', '2026-11-17')).toBe('2026-11-01_to_2026-11-17');
  });
});

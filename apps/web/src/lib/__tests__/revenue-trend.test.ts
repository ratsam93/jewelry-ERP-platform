import { describe, it, expect } from 'vitest';
import { fillDailySeries, formatCompactRupees, formatDayLabel } from '../revenue-trend';

describe('fillDailySeries', () => {
  it('fills missing days with zero across the whole range', () => {
    const r = fillDailySeries(['2026-11-03', '2026-11-06'], [500, 900], '2026-11-01', '2026-11-07');
    expect(r.labels).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    expect(r.data).toEqual([0, 0, 500, 0, 0, 900, 0]);
  });
  it('is continuous across a month and year boundary and over a leap day', () => {
    const r = fillDailySeries([], [], '2028-02-27', '2028-03-01');
    expect(r.labels).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
    const y = fillDailySeries([], [], '2026-12-30', '2027-01-02');
    expect(y.labels).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
  it('keeps days the server returned outside the range', () => {
    const r = fillDailySeries(['2026-10-31'], [700], '2026-11-01', '2026-11-02');
    expect(r.labels).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(r.data).toEqual([700, 0, 0]);
  });
  it('sums duplicate days and accepts ISO timestamps', () => {
    const r = fillDailySeries(['2026-11-01T00:00:00.000Z', '2026-11-01'], [100, 50], '2026-11-01', '2026-11-01');
    expect(r).toEqual({ labels: ['2026-11-01'], data: [150] });
  });
});

describe('formatDayLabel', () => {
  it('formats as 03 Nov', () => {
    expect(formatDayLabel('2026-11-03')).toBe('03 Nov');
    expect(formatDayLabel('2027-01-31')).toBe('31 Jan');
  });
  it('leaves other labels untouched', () => {
    expect(formatDayLabel('Week 3')).toBe('Week 3');
  });
});

describe('formatCompactRupees (paise in)', () => {
  it.each([
    [0, '₹0'],
    [95000, '₹950'],
    [1250000, '₹12.5K'],
    [15000000, '₹1.5L'],
    [120000000, '₹12L'],
    [1000000000, '₹1Cr'],
    [2550000000, '₹2.55Cr'],
    [-15000000, '-₹1.5L'],
  ])('%d -> %s', (paise, out) => {
    expect(formatCompactRupees(paise)).toBe(out);
  });
  it('is safe for NaN', () => {
    expect(formatCompactRupees(Number.NaN)).toBe('₹0');
  });
});

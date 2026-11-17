// Helpers for the dashboard Revenue Trend chart (HK-DASH-03).

import { parseLocalDate, toLocalDateString } from './date-presets';

export interface DailySeries {
  labels: string[]; // 'YYYY-MM-DD', continuous, ascending
  data: number[];
}

/**
 * Make a daily series continuous: every calendar day from `from` to `to`
 * (inclusive, 'YYYY-MM-DD') gets a point, missing days are 0. Days that the
 * server returned outside the range are kept so no revenue disappears.
 */
export function fillDailySeries(
  labels: readonly string[],
  data: readonly number[],
  from: string,
  to: string,
): DailySeries {
  const byDay = new Map<string, number>();
  labels.forEach((label, i) => {
    const day = label.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (data[i] ?? 0));
  });

  const days = [...byDay.keys()].sort();
  const startStr = [from, days[0]].filter((v): v is string => !!v).sort()[0];
  const endStr = [to, days[days.length - 1]].filter((v): v is string => !!v).sort().slice(-1)[0];
  const start = startStr ? parseLocalDate(startStr) : null;
  const end = endStr ? parseLocalDate(endStr) : null;
  if (!start || !end || end < start) {
    return { labels: days, data: days.map((d) => byDay.get(d) ?? 0) };
  }

  const outLabels: string[] = [];
  const outData: number[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const key = toLocalDateString(d);
    outLabels.push(key);
    outData.push(byDay.get(key) ?? 0);
  }
  return { labels: outLabels, data: outData };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-03' -> '03 Nov'. Anything that is not a date-only string is returned unchanged. */
export function formatDayLabel(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label);
  if (!m) return label;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${m[3]} ${month}` : label;
}

/**
 * Compact Indian-style rupee label for a paise amount, for chart axes:
 * 0 -> '₹0', 95000 paise -> '₹950', 12_50_000 paise -> '₹12.5K',
 * 25_00_000 paise -> '₹25K', 1_50_00_000 paise -> '₹1.5L', 12_00_00_000 paise -> '₹12L',
 * 1_00_00_00_000 paise -> '₹1Cr'.
 */
export function formatCompactRupees(paise: number): string {
  if (!Number.isFinite(paise)) return '₹0';
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  const trim = (n: number) => String(Number(n.toFixed(2)));
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${trim(abs)}`;
}

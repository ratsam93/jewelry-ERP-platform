/**
 * Date helpers for the finance / payroll pages.
 *
 * Calendar-date fields (attendance day, due date, period start/end, scheme start)
 * are stored as @db.Date and serialised as UTC midnight ("2026-11-17T00:00:00.000Z").
 * Passing those through `new Date(x).toLocaleDateString()` shifts them by the
 * browser's UTC offset (a day earlier west of UTC), so they must be read with the
 * UTC getters. Real timestamps (createdAt...) are formatted in the viewer's timezone.
 *
 * One display format everywhere: dd/MM/yyyy.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** dd/MM/yyyy for a calendar-date value (no timezone conversion). '-' when empty/invalid. */
export function formatDateOnly(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') {
    const m = DATE_ONLY_RE.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** dd/MM/yyyy for a real timestamp, in the viewer's timezone. */
export function formatTimestampDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '-';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "YYYY-MM-DD" -> Date at UTC midnight: the same calendar day for every viewer and server timezone. */
export function dateInputToUtcMidnight(text: string): Date | null {
  const m = DATE_ONLY_RE.exec(text.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

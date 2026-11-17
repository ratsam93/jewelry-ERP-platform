import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dateInputToUtcMidnight, formatDateOnly, formatTimestampDate } from '@/lib/date-only';
import { buildAttendanceInput, emptyAttendance } from '@/lib/finance-form';

describe('date-only helpers', () => {
  it('formats a stored @db.Date value (UTC midnight) without shifting the day', () => {
    expect(formatDateOnly('2026-11-17T00:00:00.000Z')).toBe('17/11/2026');
    expect(formatDateOnly('2026-11-17')).toBe('17/11/2026');
    expect(formatDateOnly(new Date(Date.UTC(2026, 10, 3)))).toBe('03/11/2026');
    expect(formatDateOnly(null)).toBe('-');
    expect(formatDateOnly('garbage')).toBe('-');
  });

  it('formats real timestamps in dd/MM/yyyy', () => {
    expect(formatTimestampDate(new Date(2026, 10, 3, 12, 0))).toBe('03/11/2026');
  });

  it('turns a date input into UTC midnight and rejects impossible dates', () => {
    expect(dateInputToUtcMidnight('2026-11-17')?.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(dateInputToUtcMidnight('2026-02-30')).toBeNull();
    expect(dateInputToUtcMidnight('17/11/2026')).toBeNull();
  });

  it('attendance payload carries the same calendar day for the API', () => {
    const f = { ...emptyAttendance(), employeeId: '11111111-1111-4111-8111-111111111111', date: '2026-11-17', status: 'PRESENT' };
    const { input } = buildAttendanceInput(f as never);
    expect((input as { date: Date }).date.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  // The day must survive in any viewer timezone: run the same assertions in child processes with TZ set.
  for (const tz of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
    it(`keeps 17/11/2026 under TZ=${tz}`, () => {
      const code = `
        const d = new Date('2026-11-17T00:00:00.000Z');
        const pad = (n) => String(n).padStart(2, '0');
        const utc = pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
        const naive = d.toLocaleDateString('en-GB');
        console.log(JSON.stringify({ utc, naive }));
      `;
      const out = JSON.parse(execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz } }).toString());
      expect(out.utc).toBe('17/11/2026');
      if (tz === 'America/Los_Angeles') expect(out.naive).toBe('16/11/2026'); // the old bug
    });
  }
});

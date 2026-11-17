import { describe, it, expect } from 'vitest';
import {
  AttendanceInputSchema,
  EmployeeInputSchema,
  EmployeeUpdateSchema,
  PayrollAttendanceStatus,
  PayrollPeriodInputSchema,
} from '../payroll';

const GUID = '550e8400-e29b-41d4-a716-446655440000';

describe('PayrollPeriodInputSchema', () => {
  const dates = { startDate: '2026-04-01', endDate: '2026-04-30' };

  it('accepts a valid YYYY-MM label', () => {
    expect(PayrollPeriodInputSchema.safeParse({ periodLabel: '2026-04', ...dates }).success).toBe(true);
    expect(PayrollPeriodInputSchema.safeParse({ periodLabel: '2026-12', ...dates }).success).toBe(true);
  });

  it('rejects month 13 (HK-FIN-07), month 00 and malformed labels', () => {
    for (const periodLabel of ['2026-13', '2026-00', '2026-99', '26-04', '2026-4', '2026/04', '']) {
      const r = PayrollPeriodInputSchema.safeParse({ periodLabel, ...dates });
      expect(r.success, periodLabel).toBe(false);
    }
  });

  it('gives a readable message for month 13', () => {
    const r = PayrollPeriodInputSchema.safeParse({ periodLabel: '2026-13', ...dates });
    expect(r.success ? '' : r.error.issues[0]!.message).toMatch(/01 to 12/);
  });

  it('rejects an end date before the start date', () => {
    const r = PayrollPeriodInputSchema.safeParse({ periodLabel: '2026-04', startDate: '2026-04-30', endDate: '2026-04-01' });
    expect(r.success).toBe(false);
  });
});

describe('EmployeeInputSchema format checks', () => {
  const base = { employeeCode: 'E1', firstName: 'A', lastName: 'B', joinedAt: '2026-04-01' };

  it('accepts well-formed PAN, Aadhaar and IFSC and defaults salary to 0', () => {
    const r = EmployeeInputSchema.safeParse({ ...base, panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012', bankIfsc: 'HDFC0001234' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.basicSalaryPaise).toBe(0);
  });

  it('rejects malformed PAN, Aadhaar and IFSC', () => {
    expect(EmployeeInputSchema.safeParse({ ...base, panNumber: 'abcde1234f' }).success).toBe(false);
    expect(EmployeeInputSchema.safeParse({ ...base, panNumber: 'ABCDE12345' }).success).toBe(false);
    expect(EmployeeInputSchema.safeParse({ ...base, aadhaarNumber: '1234' }).success).toBe(false);
    expect(EmployeeInputSchema.safeParse({ ...base, bankIfsc: 'HDFC1001234' }).success).toBe(false);
  });

  it('applies the same checks to updates and keeps unsent fields undefined', () => {
    expect(EmployeeUpdateSchema.safeParse({ panNumber: 'bad' }).success).toBe(false);
    const r = EmployeeUpdateSchema.safeParse({ firstName: 'X' });
    expect(r.success && r.data.basicSalaryPaise).toBeUndefined();
  });
});

describe('AttendanceInputSchema bounds', () => {
  const base = { employeeId: GUID, date: '2026-04-05', status: PayrollAttendanceStatus.PRESENT };

  it('accepts 0-24 hours', () => {
    expect(AttendanceInputSchema.safeParse({ ...base, hoursWorked: 8, overtimeHours: 2 }).success).toBe(true);
  });

  it('rejects more than 24 hours and the unknown LEAVE status', () => {
    expect(AttendanceInputSchema.safeParse({ ...base, hoursWorked: 25 }).success).toBe(false);
    expect(AttendanceInputSchema.safeParse({ ...base, overtimeHours: 30 }).success).toBe(false);
    expect(AttendanceInputSchema.safeParse({ ...base, status: 'LEAVE' }).success).toBe(false);
  });
});

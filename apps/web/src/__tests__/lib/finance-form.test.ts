import { describe, it, expect } from 'vitest';
import {
  EMPTY_EMI_PLAN,
  EMPTY_EMPLOYEE,
  EMPTY_PROVIDER,
  EMPTY_SALARY_STRUCTURE,
  EMPTY_SCHEME,
  buildAttendanceInput,
  buildBnplProviderInput,
  buildEmiPlanInput,
  buildEmployeeInput,
  buildEmployeeUpdate,
  buildEnrollInput,
  buildGoldSavingsInput,
  buildKittySchemeInput,
  buildPeriodInput,
  buildSalaryStructureInput,
  emptyAttendance,
  employeeToFormValues,
  errorSummary,
  monthRange,
  paiseToRupeesText,
  payslipView,
  planRow,
  providerRow,
  readableError,
  schemeRow,
  transactionRow,
} from '@/lib/finance-form';

const GUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date(2026, 10, 17, 12);

describe('buildPeriodInput (HK-FIN-07 / HK-FIN-13)', () => {
  it('rejects month 13', () => {
    const r = buildPeriodInput('2026-13');
    expect(r.input).toBeNull();
    expect(r.errors.periodLabel).toMatch(/01 to 12/);
  });
  it('rejects month 00 and garbage', () => {
    expect(buildPeriodInput('2026-00').input).toBeNull();
    expect(buildPeriodInput('26-04').input).toBeNull();
  });
  it('shows a message on empty submit', () => {
    const r = buildPeriodInput('  ');
    expect(r.input).toBeNull();
    expect(r.errors.periodLabel).toMatch(/Choose the payroll month/);
  });
  it('builds month boundaries (leap year February)', () => {
    const r = buildPeriodInput('2028-02');
    expect(r.input?.periodLabel).toBe('2028-02');
    expect(r.input?.startDate.toISOString().slice(0, 10)).toBe('2028-02-01');
    expect(r.input?.endDate.toISOString().slice(0, 10)).toBe('2028-02-29');
  });
  it('monthRange covers the whole last day', () => {
    const r = monthRange('2026-04')!;
    expect(r.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(r.end.getUTCDate()).toBe(30);
    expect(r.end.getUTCHours()).toBe(23);
    expect(monthRange('2026-13')).toBeNull();
  });
});

describe('employee form (HK-FIN-11)', () => {
  const valid = {
    ...EMPTY_EMPLOYEE,
    employeeCode: 'E100',
    firstName: 'Asha',
    lastName: 'Rao',
    joinedAt: '2026-04-01',
    basicSalary: '35000',
  };

  it('converts rupees to paise and defaults optional components to 0', () => {
    const r = buildEmployeeInput(valid, NOW);
    expect(r.errors).toEqual({});
    expect(r.input?.basicSalaryPaise).toBe(3500000);
    expect(r.input?.hraPaise).toBe(0);
    expect(r.input?.otherAllowancePaise).toBe(0);
  });
  it('keeps paise exact for decimals', () => {
    const r = buildEmployeeInput({ ...valid, basicSalary: '35000.55', hra: '0.1' }, NOW);
    expect(r.input?.basicSalaryPaise).toBe(3500055);
    expect(r.input?.hraPaise).toBe(10);
  });
  it('requires everything mandatory on an empty form', () => {
    const r = buildEmployeeInput(EMPTY_EMPLOYEE, NOW);
    expect(Object.keys(r.errors)).toEqual(
      expect.arrayContaining(['employeeCode', 'firstName', 'lastName', 'joinedAt', 'basicSalaryPaise']),
    );
    expect(r.input).toBeNull();
  });
  it('rejects bad salary text', () => {
    expect(buildEmployeeInput({ ...valid, basicSalary: '35,000' }, NOW).errors.basicSalaryPaise).toMatch(/rupees/);
    expect(buildEmployeeInput({ ...valid, hra: '-5' }, NOW).errors.hraPaise).toBeDefined();
  });
  it('validates PAN, Aadhaar and IFSC and upper-cases', () => {
    const ok = buildEmployeeInput(
      { ...valid, panNumber: 'abcde1234f', aadhaarNumber: '1234 5678 9012', bankAccountNumber: '123456789012', bankIfsc: 'hdfc0001234' },
      NOW,
    );
    expect(ok.errors).toEqual({});
    expect(ok.input?.panNumber).toBe('ABCDE1234F');
    expect(ok.input?.aadhaarNumber).toBe('123456789012');
    expect(ok.input?.bankIfsc).toBe('HDFC0001234');
    const bad = buildEmployeeInput(
      { ...valid, panNumber: 'ABCDE12345', aadhaarNumber: '1234', bankAccountNumber: '12ab', bankIfsc: 'HDFC1001234' },
      NOW,
    );
    expect(bad.errors.panNumber).toBeDefined();
    expect(bad.errors.aadhaarNumber).toBeDefined();
    expect(bad.errors.bankAccountNumber).toBeDefined();
    expect(bad.errors.bankIfsc).toBeDefined();
  });
  it('requires an IFSC when a bank account is given', () => {
    expect(buildEmployeeInput({ ...valid, bankAccountNumber: '123456789' }, NOW).errors.bankIfsc).toMatch(/required/);
  });
  it('rejects a future date of birth', () => {
    expect(buildEmployeeInput({ ...valid, dob: '2030-01-01' }, NOW).errors.dob).toMatch(/future/);
  });
  it('round-trips an API row through the edit form', () => {
    const row = {
      employeeCode: 'E1', firstName: 'A', lastName: 'B', joinedAt: '2026-04-01T00:00:00.000Z',
      basicSalaryPaise: '3500050', hraPaise: 1000000, daPaise: '0', status: 'ACTIVE', panNumber: null,
    };
    const f = employeeToFormValues(row);
    expect(f.basicSalary).toBe('35000.5');
    expect(f.hra).toBe('10000');
    expect(f.panNumber).toBe('');
    const upd = buildEmployeeUpdate(f, NOW);
    expect(upd.errors).toEqual({});
    expect(upd.input?.basicSalaryPaise).toBe(3500050);
    expect(upd.input?.status).toBe('ACTIVE');
    expect(upd.input).not.toHaveProperty('employeeCode');
  });
  it('paiseToRupeesText handles blanks and bigint-ish strings', () => {
    expect(paiseToRupeesText(null)).toBe('');
    expect(paiseToRupeesText('3500000')).toBe('35000');
    expect(paiseToRupeesText(1)).toBe('0.01');
  });
});

describe('buildAttendanceInput (HK-FIN-09)', () => {
  const base = { ...emptyAttendance(NOW), employeeId: GUID };

  it('builds a valid present record', () => {
    const r = buildAttendanceInput(base);
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ employeeId: GUID, status: 'PRESENT', hoursWorked: 0, overtimeHours: 0, source: 'MANUAL' });
    // date-only value: UTC midnight, the same calendar day in every timezone
    expect((r.input!.date as Date).toISOString()).toBe(`${base.date}T00:00:00.000Z`);
  });
  it('requires an employee', () => {
    expect(buildAttendanceInput(emptyAttendance(NOW)).errors.employeeId).toBeDefined();
  });
  it('derives hours from check-in/out', () => {
    const r = buildAttendanceInput({ ...base, checkIn: '09:30', checkOut: '18:00' });
    expect(r.input?.hoursWorked).toBe(8.5);
    expect(r.input?.checkInTime).toBeInstanceOf(Date);
  });
  it('rejects check-out before check-in and out-of-range hours', () => {
    expect(buildAttendanceInput({ ...base, checkIn: '18:00', checkOut: '09:00' }).errors.checkOut).toBeDefined();
    expect(buildAttendanceInput({ ...base, hoursWorked: '25' }).errors.hoursWorked).toBeDefined();
    expect(buildAttendanceInput({ ...base, overtimeHours: 'x' }).errors.overtimeHours).toBeDefined();
  });
  it('rejects the old LEAVE status that the API does not know', () => {
    expect(buildAttendanceInput({ ...base, status: 'LEAVE' }).errors.status).toBeDefined();
  });
});

describe('buildSalaryStructureInput', () => {
  const valid = { ...EMPTY_SALARY_STRUCTURE, name: 'Senior', basicPercent: '50', hraPercent: '20', daPercent: '10', effectiveFrom: '2026-04-01', conveyance: '1600' };
  it('builds paise and percents', () => {
    const r = buildSalaryStructureInput(valid);
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ name: 'Senior', basicPercent: 50, conveyancePaise: 160000, medicalPaise: 0 });
  });
  it('requires name, percents and date', () => {
    const r = buildSalaryStructureInput(EMPTY_SALARY_STRUCTURE);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['name', 'basicPercent', 'hraPercent', 'daPercent', 'effectiveFrom']));
  });
  it('rejects totals above 100 and reversed dates', () => {
    expect(buildSalaryStructureInput({ ...valid, basicPercent: '80' }).errors.basicPercent).toMatch(/100/);
    expect(buildSalaryStructureInput({ ...valid, effectiveTo: '2026-01-01' }).errors.effectiveTo).toBeDefined();
  });
});

describe('scheme builders (HK-FIN-08)', () => {
  const gold = { ...EMPTY_SCHEME, schemeName: 'Swarna 11', monthlyAmount: '5000', durationMonths: '11', startDate: '2026-12-01' };
  it('builds a gold savings input matching GoldSavingsSchemeInputSchema', () => {
    const r = buildGoldSavingsInput({ ...gold, bonusMonths: '1', maturityBonusPercent: '2.5', terms: ' t ' });
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({
      schemeName: 'Swarna 11', monthlyAmountPaise: 500000, durationMonths: 11, bonusMonths: 1, maturityBonusPercent: 250, terms: 't',
    });
    expect(r.input?.startDate).toBeInstanceOf(Date);
  });
  it('defaults bonuses to 0 and validates bonus months against duration', () => {
    expect(buildGoldSavingsInput(gold).input).toMatchObject({ bonusMonths: 0, maturityBonusPercent: 0 });
    expect(buildGoldSavingsInput({ ...gold, bonusMonths: '11' }).errors.bonusMonths).toBeDefined();
  });
  it('requires name, amount, duration and start date', () => {
    const r = buildGoldSavingsInput(EMPTY_SCHEME);
    expect(Object.keys(r.errors)).toEqual(
      expect.arrayContaining(['schemeName', 'monthlyAmountPaise', 'durationMonths', 'startDate']),
    );
  });
  it('bounds duration to 1-120', () => {
    expect(buildGoldSavingsInput({ ...gold, durationMonths: '121' }).errors.durationMonths).toBeDefined();
    expect(buildGoldSavingsInput({ ...gold, durationMonths: '0' }).errors.durationMonths).toBeDefined();
  });
  it('builds a kitty input', () => {
    const r = buildKittySchemeInput({ ...gold, schemeType: 'CHIT', maxMembers: '20', bonusPercent: '5' });
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ schemeType: 'CHIT', maxMembers: 20, bonusPercent: 5, monthlyAmountPaise: 500000 });
  });
  it('kitty requires max members', () => {
    expect(buildKittySchemeInput(gold).errors.maxMembers).toBeDefined();
  });
  it('enroll input validates customer and date', () => {
    expect(buildEnrollInput({ customerId: '', joinedDate: '2026-12-01' }, 'kittySchemeId', GUID).errors.customerId).toBeDefined();
    const ok = buildEnrollInput({ customerId: GUID, joinedDate: '2026-12-01' }, 'goldSavingsSchemeId', GUID);
    expect(ok.input).toMatchObject({ goldSavingsSchemeId: GUID, customerId: GUID });
  });
  it('maps real list rows (schemeName / _count.members / currentMembers), not "-"', () => {
    const goldRow = schemeRow({ id: 'g1', schemeName: 'Swarna 11', durationMonths: 11, monthlyAmountPaise: '500000', status: 'OPEN', _count: { members: 3 } });
    expect(goldRow).toMatchObject({ name: 'Swarna 11', members: 3, durationMonths: 11, status: 'OPEN' });
    const kitty = schemeRow({ id: 'k1', schemeName: 'Diwali', currentMembers: 7, maxMembers: 10, status: 'ACTIVE' });
    expect(kitty).toMatchObject({ name: 'Diwali', members: 7 });
    expect(schemeRow({ id: 'x' }).name).toBe('-');
  });
});

describe('BNPL builders (HK-FIN-10)', () => {
  const provider = { ...EMPTY_PROVIDER, displayName: 'Simpl', minOrder: '1000', maxOrder: '200000', supportedTenures: '12, 3, 6, 3' };
  it('builds a provider input in paise with sorted unique tenures', () => {
    const r = buildBnplProviderInput(provider);
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ providerName: 'CUSTOM', minOrderPaise: 100000, maxOrderPaise: 20000000, supportedTenures: [3, 6, 12], processingFeePct: 0, isActive: true });
  });
  it('requires fields and enforces min < max', () => {
    expect(Object.keys(buildBnplProviderInput(EMPTY_PROVIDER).errors)).toEqual(
      expect.arrayContaining(['displayName', 'minOrderPaise', 'maxOrderPaise', 'supportedTenures']),
    );
    expect(buildBnplProviderInput({ ...provider, minOrder: '5000', maxOrder: '5000' }).errors.maxOrderPaise).toBeDefined();
    expect(buildBnplProviderInput({ ...provider, supportedTenures: '3, abc' }).errors.supportedTenures).toBeDefined();
  });
  const plan = { ...EMPTY_EMI_PLAN, bankName: 'HDFC', tenure: '6', interestRate: '12.5', minAmount: '5000', maxAmount: '100000' };
  it('stores the interest rate as percent x 100', () => {
    const r = buildEmiPlanInput(plan);
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ bankName: 'HDFC', tenure: 6, interestRatePct: 1250, minAmountPaise: 500000, maxAmountPaise: 10000000, processingFeePaise: 0, subventionPct: 0, isNoCostEmi: false });
  });
  it('requires a bank or provider, interest, amounts', () => {
    const r = buildEmiPlanInput(EMPTY_EMI_PLAN);
    expect(Object.keys(r.errors)).toEqual(
      expect.arrayContaining(['bankName', 'tenure', 'interestRatePct', 'minAmountPaise', 'maxAmountPaise']),
    );
    expect(buildEmiPlanInput({ ...plan, interestRate: '101' }).errors.interestRatePct).toBeDefined();
    expect(buildEmiPlanInput({ ...plan, minAmount: '200000' }).errors.maxAmountPaise).toBeDefined();
  });
  it('allows a provider instead of a bank, and no-cost EMI without an interest value', () => {
    const r = buildEmiPlanInput({ ...plan, bankName: '', providerId: GUID, interestRate: '', isNoCostEmi: true });
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ providerId: GUID, interestRatePct: 0, isNoCostEmi: true });
  });
  it('maps real BNPL rows to display fields', () => {
    expect(providerRow({ id: 'p', providerName: 'SIMPL', displayName: 'Simpl Pay', supportedTenures: [3, 6], processingFeePct: 2, isActive: true })).toMatchObject({ name: 'Simpl Pay', type: 'SIMPL', tenures: '3m, 6m', processingFeePct: '2%' });
    expect(planRow({ id: 'e', bankName: null, tenure: 6, interestRatePct: 1200, isNoCostEmi: true, isActive: true })).toMatchObject({ name: 'Any bank (No-cost EMI)', tenure: '6 months', interest: '12%' });
    expect(transactionRow({ id: 't', orderId: 'ORD-1', customerId: GUID, providerName: 'SIMPL', orderAmountPaise: 100, status: 'ACTIVE', tenure: 3 })).toMatchObject({ reference: 'ORD-1', amountPaise: 100, customer: '550e8400' });
  });
});

describe('payslipView', () => {
  it('maps a payslip with joined employee and period', () => {
    const v = payslipView({
      id: 's', employeeId: 'e1', payrollPeriodId: 'p1', basicSalary: '1000', hra: '500', grossSalary: '1500', pfDeduction: '120', totalDeductions: '120', netSalary: '1380', status: 'DRAFT',
      employee: { firstName: 'A', lastName: 'B', employeeCode: 'E1' }, payrollPeriod: { periodLabel: '2026-04' },
    });
    expect(v).toMatchObject({ employeeName: 'A B', employeeCode: 'E1', periodLabel: '2026-04', net: '1380', periodId: 'p1' });
    expect(v.deductions[0]).toEqual(['Provident fund', '120']);
  });
});

describe('server errors and summaries', () => {
  it('flattens a Zod JSON message', () => {
    const msg = JSON.stringify([{ path: ['periodLabel'], message: 'Period must be YYYY-MM with a month from 01 to 12' }]);
    expect(readableError({ message: msg })).toBe('periodLabel: Period must be YYYY-MM with a month from 01 to 12');
  });
  it('passes plain messages and falls back', () => {
    expect(readableError({ message: 'Period 2026-04 already exists' })).toBe('Period 2026-04 already exists');
    expect(readableError(null, 'x')).toBe('x');
  });
  it('summarises invalid fields', () => {
    expect(errorSummary({ firstName: 'r', basicSalaryPaise: 'r' }, { firstName: 'First name', basicSalaryPaise: 'Basic salary' })).toBe(
      'Fix 2 fields before saving: First name, Basic salary.',
    );
    expect(errorSummary({})).toBe('');
  });
});

describe('payslipView earnings reconcile to gross (HK-PAY-04)', () => {
  it('itemises allowances and adds an Other earnings row for the remainder', () => {
    const v = payslipView({
      basicSalary: 3000000, hra: 1200000, overtimePay: 0, grossSalary: 4500000,
      allowances: { da: 0, conveyance: 100000, medical: 50000, other: 0 },
    });
    const rows = Object.fromEntries(v.earnings.map(([k, val]) => [k, Number(val)]));
    expect(rows['Conveyance allowance']).toBe(100000);
    expect(rows['Medical allowance']).toBe(50000);
    expect(rows['Other earnings / adjustments']).toBe(150000);
    expect(v.earnings.reduce((s, [, val]) => s + Number(val), 0)).toBe(4500000);
  });
  it('adds no reconciling row when the parts already equal gross', () => {
    const v = payslipView({ basicSalary: 100, hra: 50, overtimePay: 0, grossSalary: 150, allowances: {} });
    expect(v.earnings.map(([k]) => k)).toEqual(['Basic', 'HRA', 'Overtime pay']);
  });
});

describe('EMI plan rows show the provider (HK-BNPL-12)', () => {
  it('falls back to the provider name instead of "Any bank"', async () => {
    const { planRow } = await import('@/lib/finance-form');
    const names = new Map([['prov-1', 'Bajaj Finserv']]);
    expect(planRow({ id: 'p', providerId: 'prov-1', bankName: null, tenure: 6, interestRatePct: 0 }, names).name).toBe('Bajaj Finserv');
    expect(planRow({ id: 'p', providerId: null, bankName: null }).name).toBe('Any bank');
    expect(planRow({ id: 'p', providerId: 'prov-1', bankName: 'HDFC' }, names).name).toBe('HDFC');
  });
});

describe('journal and negative price messages', () => {
  it('invoice builder says why a negative unit price is rejected', async () => {
    const { buildInvoiceInput } = await import('@/lib/finance-forms');
    const { errors } = buildInvoiceInput({
      invoiceType: 'SALES', customerId: '', supplierId: '', locationId: '', sourceState: '', destState: '', dueDate: '', notes: '',
      lines: [{ description: 'x', quantity: '1', unitPrice: '-5', discount: '', gstPercent: '3', hsnCode: '7113' }],
    } as never);
    expect(errors['lines.0.unitPrice']).toBe('Unit price must be zero or more');
  });
});

// Pure helpers for the payroll, savings-scheme and BNPL admin forms.
// Money is integer paise (inputs are RUPEES converted on the decimal string, so
// no float rounding creeps in). Every builder mirrors the matching Zod input in
// packages/shared-types (payroll.ts, india.ts, bnpl.ts) and returns either a
// ready-to-send input or per-field error messages.

import { dateInputToUtcMidnight } from './date-only';

export type FieldErrors = Record<string, string>;
export interface BuildResult<T> {
  input: T | null;
  errors: FieldErrors;
}

// ─── Primitive parsers ──────────────────────────────────────────

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: string): boolean => GUID_RE.test(v);

export const PERIOD_LABEL_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const AADHAAR_RE = /^\d{12}$/;

/** "12.5" with scale 2 -> 1250. Null for blank / malformed / too many decimals. */
export function parseScaled(text: string, scale: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d+)(?:\.(\d*))?$/.exec(t);
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > scale) return null;
  const n = Number(m[1]) * 10 ** scale + Number(frac.padEnd(scale, '0') || '0');
  return Number.isSafeInteger(n) ? n : null;
}

export const rupeesToPaise = (text: string): number | null => parseScaled(text, 2);

export function parseIntStrict(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Plain non-negative decimal ("12.5"), no exponent / sign. */
export function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** paise (number | numeric string | bigint) -> rupee text for an input ("35000" or "35000.5"). */
export function paiseToRupeesText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return '';
  const rupees = n / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date | ISO string -> "YYYY-MM-DD" for <input type=date>; '' when unparsable. */
export function toDateInput(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * "YYYY-MM-DD" -> Date at UTC midnight. Date-only columns (@db.Date) are written from the
 * UTC date, so UTC midnight is the same calendar day for every browser and server timezone.
 */
export function dateInputToDate(text: string): Date | null {
  return dateInputToUtcMidnight(text);
}

export const todayInput = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

// ─── Server error text ──────────────────────────────────────────

/**
 * tRPC wraps Zod failures as a JSON array string in `message`
 * (e.g. '[{"path":["periodLabel"],"message":"Period must be YYYY-MM ..."}]').
 * Turn that into readable lines; pass ordinary messages through.
 */
export function readableError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = (err as { message?: unknown } | null | undefined)?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message) return fallback;
  if (message.startsWith('[') || message.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(message);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const lines = list
        .map((i) => {
          const issue = i as { path?: unknown[]; message?: string };
          if (!issue || typeof issue.message !== 'string') return null;
          const where = Array.isArray(issue.path) && issue.path.length ? issue.path.join(' > ') : '';
          return where ? `${where}: ${issue.message}` : issue.message;
        })
        .filter((l): l is string => Boolean(l));
      if (lines.length) return lines.join('; ');
    } catch {
      /* fall through */
    }
  }
  return message;
}

/** One line summarising why a form was not submitted ("Fix 2 fields: Last name, Basic salary"). */
export function errorSummary(errors: FieldErrors, labels: Record<string, string> = {}): string {
  const keys = Object.keys(errors);
  if (!keys.length) return '';
  const names = keys.map((k) => labels[k] ?? k);
  return `Fix ${keys.length} ${keys.length === 1 ? 'field' : 'fields'} before saving: ${names.join(', ')}.`;
}

const finish = <T>(input: T, errors: FieldErrors): BuildResult<T> =>
  Object.keys(errors).length ? { input: null, errors } : { input, errors };

function checkMax(errors: FieldErrors, key: string, value: string, max: number) {
  if (value.length > max) errors[key] = `Must be at most ${max} characters`;
}

// ─── Payroll period ─────────────────────────────────────────────

export interface PeriodInput {
  periodLabel: string;
  startDate: Date;
  endDate: Date;
}

/** `month` is the <input type=month> value, e.g. "2026-04". */
export function buildPeriodInput(month: string): BuildResult<PeriodInput> {
  const errors: FieldErrors = {};
  const label = month.trim();
  if (!label) {
    errors.periodLabel = 'Choose the payroll month (e.g. 2026-04)';
    return { input: null, errors };
  }
  if (!PERIOD_LABEL_RE.test(label)) {
    errors.periodLabel = 'Enter a valid month as YYYY-MM (month 01 to 12)';
    return { input: null, errors };
  }
  const y = Number(label.slice(0, 4));
  const m = Number(label.slice(5, 7));
  return {
    input: {
      periodLabel: label,
      startDate: new Date(Date.UTC(y, m - 1, 1)),
      endDate: new Date(Date.UTC(y, m, 0)),
    },
    errors,
  };
}

/** UTC [start, end] covering the whole month (end is 23:59:59.999 UTC on the last day): date-only columns compare by UTC date. */
export function monthRange(month: string): { start: Date; end: Date } | null {
  if (!PERIOD_LABEL_RE.test(month)) return null;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return { start: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)), end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
}

// ─── Employee ───────────────────────────────────────────────────

export interface EmployeeFormValues {
  employeeCode: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  joinedAt: string;
  designation: string;
  department: string;
  basicSalary: string; // rupees
  hra: string;
  da: string;
  conveyance: string;
  medical: string;
  otherAllowance: string;
  panNumber: string;
  aadhaarNumber: string;
  pfNumber: string;
  esiNumber: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  status: string;
}

export const EMPTY_EMPLOYEE: EmployeeFormValues = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  joinedAt: '',
  designation: '',
  department: '',
  basicSalary: '',
  hra: '',
  da: '',
  conveyance: '',
  medical: '',
  otherAllowance: '',
  panNumber: '',
  aadhaarNumber: '',
  pfNumber: '',
  esiNumber: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
  status: 'ACTIVE',
};

export const EMPLOYEE_LABELS: Record<string, string> = {
  employeeCode: 'Employee code',
  firstName: 'First name',
  lastName: 'Last name',
  dob: 'Date of birth',
  gender: 'Gender',
  joinedAt: 'Joining date',
  designation: 'Designation',
  department: 'Department',
  basicSalaryPaise: 'Basic salary',
  hraPaise: 'HRA',
  daPaise: 'DA',
  conveyancePaise: 'Conveyance',
  medicalPaise: 'Medical',
  otherAllowancePaise: 'Other allowance',
  panNumber: 'PAN',
  aadhaarNumber: 'Aadhaar',
  pfNumber: 'PF number',
  esiNumber: 'ESI number',
  bankAccountNumber: 'Bank account',
  bankIfsc: 'IFSC',
  bankName: 'Bank name',
};

const MONEY_FIELDS: Array<[keyof EmployeeFormValues, string, boolean]> = [
  ['basicSalary', 'basicSalaryPaise', true],
  ['hra', 'hraPaise', false],
  ['da', 'daPaise', false],
  ['conveyance', 'conveyancePaise', false],
  ['medical', 'medicalPaise', false],
  ['otherAllowance', 'otherAllowancePaise', false],
];

export interface EmployeeInputOut {
  [key: string]: unknown;
}

function employeeFields(
  v: EmployeeFormValues,
  now: Date,
): { out: EmployeeInputOut; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const out: EmployeeInputOut = {};
  const t = (s: string) => s.trim();

  const first = t(v.firstName);
  if (!first) errors.firstName = 'First name is required';
  else checkMax(errors, 'firstName', first, 100);
  out.firstName = first;

  const last = t(v.lastName);
  if (!last) errors.lastName = 'Last name is required';
  else checkMax(errors, 'lastName', last, 100);
  out.lastName = last;

  const joined = dateInputToDate(v.joinedAt);
  if (!t(v.joinedAt)) errors.joinedAt = 'Joining date is required';
  else if (!joined) errors.joinedAt = 'Enter a valid joining date';
  else if (joined.getFullYear() < 1950) errors.joinedAt = 'Joining date is too far in the past';
  else out.joinedAt = joined;

  if (t(v.dob)) {
    const dob = dateInputToDate(v.dob);
    if (!dob) errors.dob = 'Enter a valid date of birth';
    else if (dob.getTime() > now.getTime()) errors.dob = 'Date of birth cannot be in the future';
    else if (dob.getFullYear() < 1900) errors.dob = 'Enter a valid date of birth';
    else out.dob = dob;
  }

  for (const key of ['gender', 'designation', 'department'] as const) {
    const s = t(v[key]);
    if (s) {
      checkMax(errors, key, s, key === 'gender' ? 20 : 100);
      out[key] = s;
    }
  }

  for (const [formKey, apiKey, required] of MONEY_FIELDS) {
    const text = t(v[formKey]);
    if (!text) {
      if (required) errors[apiKey] = `${EMPLOYEE_LABELS[apiKey]} is required (amount in rupees)`;
      else out[apiKey] = 0;
      continue;
    }
    const paise = rupeesToPaise(text);
    if (paise === null) errors[apiKey] = 'Enter an amount in rupees, up to 2 decimals (e.g. 35000 or 35000.50)';
    else out[apiKey] = paise;
  }

  const pan = t(v.panNumber).toUpperCase();
  if (pan) {
    if (!PAN_RE.test(pan)) errors.panNumber = 'PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)';
    else out.panNumber = pan;
  }

  const aadhaar = t(v.aadhaarNumber).replace(/[\s-]/g, '');
  if (aadhaar) {
    if (!AADHAAR_RE.test(aadhaar)) errors.aadhaarNumber = 'Aadhaar must be exactly 12 digits';
    else out.aadhaarNumber = aadhaar;
  }

  for (const key of ['pfNumber', 'esiNumber', 'bankName'] as const) {
    const s = t(v[key]);
    if (s) {
      checkMax(errors, key, s, key === 'bankName' ? 100 : 50);
      out[key] = s;
    }
  }

  const account = t(v.bankAccountNumber).replace(/\s/g, '');
  const ifsc = t(v.bankIfsc).toUpperCase();
  if (account) {
    if (!/^\d{6,20}$/.test(account)) errors.bankAccountNumber = 'Account number must be 6 to 20 digits';
    else out.bankAccountNumber = account;
    if (!ifsc) errors.bankIfsc = 'IFSC is required with a bank account';
  }
  if (ifsc) {
    if (!IFSC_RE.test(ifsc)) errors.bankIfsc = 'IFSC must be 4 letters, a 0, then 6 letters/digits (e.g. HDFC0001234)';
    else out.bankIfsc = ifsc;
  }

  return { out, errors };
}

/** Create: matches EmployeeInputSchema. Salary fields are rupees in, paise out. */
export function buildEmployeeInput(
  v: EmployeeFormValues,
  now: Date = new Date(),
): BuildResult<EmployeeInputOut> {
  const { out, errors } = employeeFields(v, now);
  const code = v.employeeCode.trim();
  if (!code) errors.employeeCode = 'Employee code is required';
  else checkMax(errors, 'employeeCode', code, 50);
  out.employeeCode = code;
  return finish(out, errors);
}

/** Edit: matches EmployeeUpdateSchema (code is immutable here; blank optionals are left unchanged). */
export function buildEmployeeUpdate(
  v: EmployeeFormValues,
  now: Date = new Date(),
): BuildResult<EmployeeInputOut> {
  const { out, errors } = employeeFields(v, now);
  if (['ACTIVE', 'INACTIVE', 'TERMINATED'].includes(v.status)) out.status = v.status;
  return finish(out, errors);
}

/** API employee row -> form values (paise back to rupees, dates to YYYY-MM-DD). */
export function employeeToFormValues(e: Record<string, unknown>): EmployeeFormValues {
  const s = (k: string) => (e[k] === null || e[k] === undefined ? '' : String(e[k]));
  return {
    employeeCode: s('employeeCode'),
    firstName: s('firstName'),
    lastName: s('lastName'),
    dob: toDateInput(e.dob),
    gender: s('gender'),
    joinedAt: toDateInput(e.joinedAt),
    designation: s('designation'),
    department: s('department'),
    basicSalary: paiseToRupeesText(e.basicSalaryPaise),
    hra: paiseToRupeesText(e.hraPaise),
    da: paiseToRupeesText(e.daPaise),
    conveyance: paiseToRupeesText(e.conveyancePaise),
    medical: paiseToRupeesText(e.medicalPaise),
    otherAllowance: paiseToRupeesText(e.otherAllowancePaise),
    panNumber: s('panNumber'),
    aadhaarNumber: s('aadhaarNumber'),
    pfNumber: s('pfNumber'),
    esiNumber: s('esiNumber'),
    bankAccountNumber: s('bankAccountNumber'),
    bankIfsc: s('bankIfsc'),
    bankName: s('bankName'),
    status: s('status') || 'ACTIVE',
  };
}

// ─── Attendance ─────────────────────────────────────────────────

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'PAID_LEAVE',
  'UNPAID_LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
] as const;

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  PAID_LEAVE: 'Paid leave',
  UNPAID_LEAVE: 'Unpaid leave',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
};

export interface AttendanceFormValues {
  employeeId: string;
  date: string;
  status: string;
  checkIn: string; // HH:MM
  checkOut: string;
  hoursWorked: string;
  overtimeHours: string;
}

export const emptyAttendance = (now: Date = new Date()): AttendanceFormValues => ({
  employeeId: '',
  date: todayInput(now),
  status: 'PRESENT',
  checkIn: '',
  checkOut: '',
  hoursWorked: '',
  overtimeHours: '',
});

function timeOnDate(date: Date, hhmm: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), Number(m[1]), Number(m[2]), 0, 0);
}

export function buildAttendanceInput(v: AttendanceFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};

  if (!v.employeeId) errors.employeeId = 'Select an employee';
  else if (!isGuid(v.employeeId)) errors.employeeId = 'Select a valid employee';
  else out.employeeId = v.employeeId;

  const date = dateInputToDate(v.date);
  if (!v.date.trim()) errors.date = 'Date is required';
  else if (!date) errors.date = 'Enter a valid date';
  else out.date = date;

  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(v.status)) errors.status = 'Select a status';
  else out.status = v.status;

  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  if (v.checkIn.trim()) {
    checkIn = date ? timeOnDate(date, v.checkIn) : null;
    if (!checkIn && date) errors.checkIn = 'Enter check-in as HH:MM';
  }
  if (v.checkOut.trim()) {
    checkOut = date ? timeOnDate(date, v.checkOut) : null;
    if (!checkOut && date) errors.checkOut = 'Enter check-out as HH:MM';
  }
  if (checkOut && !checkIn && !errors.checkIn) errors.checkIn = 'Enter check-in time as well';
  if (checkIn && checkOut && checkOut.getTime() <= checkIn.getTime()) {
    errors.checkOut = 'Check-out must be after check-in';
  }
  if (checkIn && !errors.checkIn) out.checkInTime = checkIn;
  if (checkOut && !errors.checkOut) out.checkOutTime = checkOut;

  let hours = 0;
  if (v.hoursWorked.trim()) {
    const h = parseDecimal(v.hoursWorked);
    if (h === null || h > 24) errors.hoursWorked = 'Hours worked must be between 0 and 24';
    else hours = h;
  } else if (checkIn && checkOut && checkOut.getTime() > checkIn.getTime()) {
    hours = Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100;
  }
  out.hoursWorked = hours;

  let ot = 0;
  if (v.overtimeHours.trim()) {
    const o = parseDecimal(v.overtimeHours);
    if (o === null || o > 24) errors.overtimeHours = 'Overtime must be between 0 and 24 hours';
    else ot = o;
  }
  out.overtimeHours = ot;
  out.source = 'MANUAL';
  return finish(out, errors);
}

// ─── Salary structure ───────────────────────────────────────────

export interface SalaryStructureFormValues {
  name: string;
  designation: string;
  basicPercent: string;
  hraPercent: string;
  daPercent: string;
  conveyance: string; // rupees
  medical: string;
  otherAllowance: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export const EMPTY_SALARY_STRUCTURE: SalaryStructureFormValues = {
  name: '',
  designation: '',
  basicPercent: '',
  hraPercent: '',
  daPercent: '',
  conveyance: '',
  medical: '',
  otherAllowance: '',
  effectiveFrom: '',
  effectiveTo: '',
};

export function buildSalaryStructureInput(v: SalaryStructureFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};

  const name = v.name.trim();
  if (!name) errors.name = 'Structure name is required';
  else checkMax(errors, 'name', name, 100);
  out.name = name;

  const desig = v.designation.trim();
  if (desig) {
    checkMax(errors, 'designation', desig, 100);
    out.designation = desig;
  }

  let pctSum = 0;
  for (const [formKey, label] of [
    ['basicPercent', 'Basic %'],
    ['hraPercent', 'HRA %'],
    ['daPercent', 'DA %'],
  ] as const) {
    const text = v[formKey].trim();
    if (!text) {
      errors[formKey] = `${label} is required`;
      continue;
    }
    const n = parseDecimal(text);
    if (n === null || n > 100) errors[formKey] = `${label} must be a number from 0 to 100`;
    else {
      out[formKey] = n;
      pctSum += n;
    }
  }
  if (!errors.basicPercent && !errors.hraPercent && !errors.daPercent && pctSum > 100) {
    errors.basicPercent = 'Basic + HRA + DA cannot exceed 100%';
  }

  for (const [formKey, apiKey, label] of [
    ['conveyance', 'conveyancePaise', 'Conveyance'],
    ['medical', 'medicalPaise', 'Medical'],
    ['otherAllowance', 'otherAllowancePaise', 'Other allowance'],
  ] as const) {
    const text = v[formKey].trim();
    if (!text) {
      out[apiKey] = 0;
      continue;
    }
    const paise = rupeesToPaise(text);
    if (paise === null) errors[apiKey] = `${label}: enter rupees, up to 2 decimals`;
    else out[apiKey] = paise;
  }

  const from = dateInputToDate(v.effectiveFrom);
  if (!v.effectiveFrom.trim()) errors.effectiveFrom = 'Effective-from date is required';
  else if (!from) errors.effectiveFrom = 'Enter a valid date';
  else out.effectiveFrom = from;

  if (v.effectiveTo.trim()) {
    const to = dateInputToDate(v.effectiveTo);
    if (!to) errors.effectiveTo = 'Enter a valid date';
    else if (from && to.getTime() < from.getTime()) errors.effectiveTo = 'Effective-to must not be before effective-from';
    else out.effectiveTo = to;
  }
  return finish(out, errors);
}

// ─── Savings schemes ────────────────────────────────────────────

export interface SchemeFormValues {
  schemeName: string;
  schemeType: string; // kitty only: KITTY | CHIT
  monthlyAmount: string; // rupees
  durationMonths: string;
  maxMembers: string; // kitty only
  bonusPercent: string; // kitty: whole percent
  bonusMonths: string; // gold only
  maturityBonusPercent: string; // gold only: percent, 2 decimals -> basis points
  startDate: string;
  terms: string;
}

export const EMPTY_SCHEME: SchemeFormValues = {
  schemeName: '',
  schemeType: 'KITTY',
  monthlyAmount: '',
  durationMonths: '',
  maxMembers: '',
  bonusPercent: '',
  bonusMonths: '',
  maturityBonusPercent: '',
  startDate: '',
  terms: '',
};

function commonSchemeFields(v: SchemeFormValues, errors: FieldErrors, out: Record<string, unknown>) {
  const name = v.schemeName.trim();
  if (!name) errors.schemeName = 'Scheme name is required';
  else checkMax(errors, 'schemeName', name, 255);
  out.schemeName = name;

  const monthly = v.monthlyAmount.trim();
  if (!monthly) errors.monthlyAmountPaise = 'Monthly installment is required (amount in rupees)';
  else {
    const paise = rupeesToPaise(monthly);
    if (paise === null || paise <= 0) errors.monthlyAmountPaise = 'Enter an installment above 0 in rupees (up to 2 decimals)';
    else out.monthlyAmountPaise = paise;
  }

  const dur = v.durationMonths.trim();
  let duration: number | null = null;
  if (!dur) errors.durationMonths = 'Duration in months is required';
  else {
    duration = parseIntStrict(dur);
    if (duration === null || duration < 1 || duration > 120) {
      errors.durationMonths = 'Duration must be a whole number of months from 1 to 120';
      duration = null;
    } else out.durationMonths = duration;
  }

  const start = dateInputToDate(v.startDate);
  if (!v.startDate.trim()) errors.startDate = 'Start date is required';
  else if (!start) errors.startDate = 'Enter a valid start date';
  else out.startDate = start;

  const terms = v.terms.trim();
  if (terms) {
    checkMax(errors, 'terms', terms, 10000);
    out.terms = terms;
  }
  return duration;
}

/** Matches KittySchemeInputSchema. */
export function buildKittySchemeInput(v: SchemeFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};
  commonSchemeFields(v, errors, out);

  if (v.schemeType !== 'KITTY' && v.schemeType !== 'CHIT') errors.schemeType = 'Choose Kitty or Chit';
  else out.schemeType = v.schemeType;

  const mm = v.maxMembers.trim();
  if (!mm) errors.maxMembers = 'Maximum members is required';
  else {
    const n = parseIntStrict(mm);
    if (n === null || n < 1 || n > 100000) errors.maxMembers = 'Maximum members must be a whole number of at least 1';
    else out.maxMembers = n;
  }

  if (v.bonusPercent.trim()) {
    const b = parseIntStrict(v.bonusPercent);
    if (b === null || b > 100) errors.bonusPercent = 'Bonus must be a whole percentage from 0 to 100';
    else out.bonusPercent = b;
  }
  return finish(out, errors);
}

/** Matches GoldSavingsSchemeInputSchema (maturityBonusPercent is stored in basis points). */
export function buildGoldSavingsInput(v: SchemeFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};
  const duration = commonSchemeFields(v, errors, out);

  const bm = v.bonusMonths.trim() === '' ? '0' : v.bonusMonths;
  const bonusMonths = parseIntStrict(bm);
  if (bonusMonths === null) errors.bonusMonths = 'Bonus months must be a whole number (0 or more)';
  else if (duration !== null && bonusMonths >= duration) {
    errors.bonusMonths = 'Bonus months must be less than the duration (customers pay at least one month)';
  } else out.bonusMonths = bonusMonths;

  const mb = v.maturityBonusPercent.trim() === '' ? '0' : v.maturityBonusPercent;
  const bp = parseScaled(mb, 2);
  if (bp === null || bp > 10000) errors.maturityBonusPercent = 'Maturity bonus must be 0 to 100 percent, up to 2 decimals';
  else out.maturityBonusPercent = bp;

  return finish(out, errors);
}

export interface EnrollFormValues {
  customerId: string;
  joinedDate: string;
}

export function buildEnrollInput(
  v: EnrollFormValues,
  idKey: 'kittySchemeId' | 'goldSavingsSchemeId',
  schemeId: string,
): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  if (!v.customerId) errors.customerId = 'Select a customer';
  else if (!isGuid(v.customerId)) errors.customerId = 'Select a valid customer';
  const joined = dateInputToDate(v.joinedDate);
  if (!v.joinedDate.trim()) errors.joinedDate = 'Joining date is required';
  else if (!joined) errors.joinedDate = 'Enter a valid date';
  return finish({ [idKey]: schemeId, customerId: v.customerId, joinedDate: joined }, errors);
}

/** List/detail row for either scheme kind (fields differ: schemeName, _count.members | currentMembers). */
export interface SchemeRow {
  id: string;
  name: string;
  durationMonths: number | null;
  monthlyAmountPaise: unknown;
  members: number;
  status: string;
}

export function schemeRow(s: Record<string, unknown>): SchemeRow {
  const count = (s._count as { members?: number } | undefined)?.members;
  const membersArr = Array.isArray(s.members) ? s.members.length : undefined;
  const members = Number(count ?? s.currentMembers ?? s.memberCount ?? membersArr ?? 0);
  const name = (s.schemeName ?? s.name) as string | undefined;
  return {
    id: String(s.id ?? ''),
    name: name && name.trim() ? name : '-',
    durationMonths: s.durationMonths === undefined || s.durationMonths === null ? null : Number(s.durationMonths),
    monthlyAmountPaise: s.monthlyAmountPaise,
    members: Number.isFinite(members) ? members : 0,
    status: (s.status as string) ?? '-',
  };
}

// ─── BNPL ───────────────────────────────────────────────────────

export const BNPL_PROVIDER_NAMES = ['SIMPL', 'LAZYPAY', 'ZESTMONEY', 'BAJAJ_FINSERV', 'HDFC_FLEXIPAY', 'CUSTOM'] as const;
export const EMI_CARD_TYPES = ['CREDIT', 'DEBIT', 'BOTH'] as const;

export interface BnplProviderFormValues {
  providerName: string;
  displayName: string;
  minOrder: string; // rupees
  maxOrder: string;
  supportedTenures: string; // "3, 6, 9, 12"
  processingFeePct: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  isActive: boolean;
}

export const EMPTY_PROVIDER: BnplProviderFormValues = {
  providerName: 'CUSTOM',
  displayName: '',
  minOrder: '',
  maxOrder: '',
  supportedTenures: '',
  processingFeePct: '',
  apiKey: '',
  apiSecret: '',
  webhookSecret: '',
  isActive: true,
};

/** Matches BnplProviderInputSchema (+ service rule min < max). */
export function buildBnplProviderInput(v: BnplProviderFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};

  if (!(BNPL_PROVIDER_NAMES as readonly string[]).includes(v.providerName)) errors.providerName = 'Select a provider';
  else out.providerName = v.providerName;

  const dn = v.displayName.trim();
  if (!dn) errors.displayName = 'Display name is required';
  else checkMax(errors, 'displayName', dn, 255);
  out.displayName = dn;

  let min: number | null = null;
  let max: number | null = null;
  if (!v.minOrder.trim()) errors.minOrderPaise = 'Minimum order amount is required (rupees)';
  else {
    min = rupeesToPaise(v.minOrder);
    if (min === null) errors.minOrderPaise = 'Enter rupees, up to 2 decimals';
    else out.minOrderPaise = min;
  }
  if (!v.maxOrder.trim()) errors.maxOrderPaise = 'Maximum order amount is required (rupees)';
  else {
    max = rupeesToPaise(v.maxOrder);
    if (max === null || max <= 0) {
      errors.maxOrderPaise = 'Enter an amount above 0 in rupees';
      max = null;
    } else out.maxOrderPaise = max;
  }
  if (min !== null && max !== null && min >= max) errors.maxOrderPaise = 'Maximum must be greater than the minimum order amount';

  const tenures = parseTenureList(v.supportedTenures);
  if (!v.supportedTenures.trim()) errors.supportedTenures = 'Enter at least one tenure in months (e.g. 3, 6, 12)';
  else if (!tenures) errors.supportedTenures = 'Use whole numbers of months from 1 to 60, separated by commas';
  else out.supportedTenures = tenures;

  const fee = v.processingFeePct.trim() === '' ? '0' : v.processingFeePct;
  const feeN = parseIntStrict(fee);
  if (feeN === null || feeN > 100) errors.processingFeePct = 'Processing fee must be a whole percentage from 0 to 100';
  else out.processingFeePct = feeN;

  for (const key of ['apiKey', 'apiSecret', 'webhookSecret'] as const) {
    const s = v[key].trim();
    if (s) {
      checkMax(errors, key, s, 500);
      out[key] = s;
    }
  }
  out.isActive = v.isActive;
  return finish(out, errors);
}

/** "3, 6, 12" -> [3,6,12] (unique, sorted); null when any entry is invalid. */
export function parseTenureList(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (!parts.length) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseIntStrict(p);
    if (n === null || n < 1 || n > 60) return null;
    nums.push(n);
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

export interface EmiPlanFormValues {
  providerId: string;
  bankName: string;
  tenure: string;
  interestRate: string; // percent a year, 2 decimals -> stored x100
  processingFee: string; // rupees
  minAmount: string;
  maxAmount: string;
  isNoCostEmi: boolean;
  subventionPct: string;
  cardType: string;
  isActive: boolean;
}

export const EMPTY_EMI_PLAN: EmiPlanFormValues = {
  providerId: '',
  bankName: '',
  tenure: '',
  interestRate: '',
  processingFee: '',
  minAmount: '',
  maxAmount: '',
  isNoCostEmi: false,
  subventionPct: '',
  cardType: '',
  isActive: true,
};

/** Matches EmiPlanInputSchema. interestRatePct is annual % x 100 (1200 = 12%). */
export function buildEmiPlanInput(v: EmiPlanFormValues): BuildResult<Record<string, unknown>> {
  const errors: FieldErrors = {};
  const out: Record<string, unknown> = {};

  if (v.providerId) {
    if (!isGuid(v.providerId)) errors.providerId = 'Select a valid provider';
    else out.providerId = v.providerId;
  }
  const bank = v.bankName.trim();
  if (bank) {
    checkMax(errors, 'bankName', bank, 255);
    out.bankName = bank;
  }
  if (!v.providerId && !bank) errors.bankName = 'Enter a bank name or choose a provider';

  const ten = v.tenure.trim();
  if (!ten) errors.tenure = 'Tenure in months is required';
  else {
    const n = parseIntStrict(ten);
    if (n === null || n < 1 || n > 60) errors.tenure = 'Tenure must be a whole number of months from 1 to 60';
    else out.tenure = n;
  }

  const rate = v.interestRate.trim() === '' ? (v.isNoCostEmi ? '0' : '') : v.interestRate;
  if (!rate.trim()) errors.interestRatePct = 'Interest rate is required (enter 0 for no interest)';
  else {
    const r = parseScaled(rate, 2);
    if (r === null || r > 10000) errors.interestRatePct = 'Interest must be 0 to 100 percent a year, up to 2 decimals';
    else out.interestRatePct = r;
  }

  if (v.processingFee.trim()) {
    const f = rupeesToPaise(v.processingFee);
    if (f === null) errors.processingFeePaise = 'Enter rupees, up to 2 decimals';
    else out.processingFeePaise = f;
  } else out.processingFeePaise = 0;

  let min: number | null = null;
  let max: number | null = null;
  if (!v.minAmount.trim()) errors.minAmountPaise = 'Minimum amount is required (rupees)';
  else {
    min = rupeesToPaise(v.minAmount);
    if (min === null) errors.minAmountPaise = 'Enter rupees, up to 2 decimals';
    else out.minAmountPaise = min;
  }
  if (!v.maxAmount.trim()) errors.maxAmountPaise = 'Maximum amount is required (rupees)';
  else {
    max = rupeesToPaise(v.maxAmount);
    if (max === null || max <= 0) {
      errors.maxAmountPaise = 'Enter an amount above 0 in rupees';
      max = null;
    } else out.maxAmountPaise = max;
  }
  if (min !== null && max !== null && min >= max) errors.maxAmountPaise = 'Maximum must be greater than the minimum amount';

  out.isNoCostEmi = v.isNoCostEmi;
  const sub = v.subventionPct.trim() === '' ? '0' : v.subventionPct;
  const subN = parseIntStrict(sub);
  if (subN === null || subN > 100) errors.subventionPct = 'Subvention must be a whole percentage from 0 to 100';
  else out.subventionPct = subN;

  if (v.cardType) {
    if (!(EMI_CARD_TYPES as readonly string[]).includes(v.cardType)) errors.cardType = 'Select a card type';
    else out.cardType = v.cardType;
  }
  out.isActive = v.isActive;
  return finish(out, errors);
}

export function providerRow(p: Record<string, unknown>) {
  const tenures = Array.isArray(p.supportedTenures) ? (p.supportedTenures as number[]) : [];
  return {
    id: String(p.id ?? ''),
    name: String(p.displayName ?? p.providerName ?? '-'),
    type: String(p.providerName ?? '-'),
    minOrderPaise: p.minOrderPaise,
    maxOrderPaise: p.maxOrderPaise,
    tenures: tenures.length ? tenures.map((t) => `${t}m`).join(', ') : '-',
    processingFeePct: p.processingFeePct === undefined || p.processingFeePct === null ? '-' : `${p.processingFeePct}%`,
    isActive: Boolean(p.isActive),
  };
}

/**
 * `providerNames` maps provider id -> display name so a plan created under a provider
 * (no bank name) shows that provider instead of "Any bank".
 */
export function planRow(p: Record<string, unknown>, providerNames?: ReadonlyMap<string, string>) {
  const rate = Number(p.interestRatePct);
  const tenure = p.tenure ?? p.tenureMonths;
  const embedded = p.provider as { displayName?: string; providerName?: string } | null | undefined;
  const providerName =
    (p.providerId ? providerNames?.get(String(p.providerId)) : undefined) ||
    embedded?.displayName ||
    embedded?.providerName ||
    '';
  const bank = (p.bankName as string | null | undefined) || providerName || 'Any bank';
  return {
    id: String(p.id ?? ''),
    provider: providerName || '-',
    name: `${bank}${p.isNoCostEmi ? ' (No-cost EMI)' : ''}`,
    tenure: tenure === undefined || tenure === null ? '-' : `${tenure} months`,
    interest: Number.isFinite(rate) ? `${(rate / 100).toFixed(2).replace(/\.?0+$/, '')}%` : '-',
    minAmountPaise: p.minAmountPaise,
    maxAmountPaise: p.maxAmountPaise,
    isActive: Boolean(p.isActive),
  };
}

export function transactionRow(t: Record<string, unknown>) {
  const cust = String(t.customerId ?? '');
  return {
    id: String(t.id ?? ''),
    reference: String(t.externalTransactionId ?? t.orderId ?? '-'),
    customer: cust ? cust.slice(0, 8) : '-',
    provider: String(t.providerName ?? '-'),
    amountPaise: t.orderAmountPaise ?? t.amountPaise,
    emiPaise: t.emiAmountPaise,
    tenure: t.tenure === undefined || t.tenure === null ? '-' : `${t.tenure} months`,
    status: String(t.status ?? '-'),
    createdAt: t.createdAt,
  };
}

// ─── Payslip ────────────────────────────────────────────────────

const toNum = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const ALLOWANCE_LABELS: Record<string, string> = {
  da: 'Dearness allowance',
  conveyance: 'Conveyance allowance',
  medical: 'Medical allowance',
  special: 'Special allowance',
  other: 'Other allowance',
  bonus: 'Bonus',
};

const allowanceLabel = (key: string): string =>
  ALLOWANCE_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/**
 * Earnings rows for a payslip: Basic, HRA, every allowance component the API returns
 * (non-zero), overtime, plus a reconciling "Other earnings" row whenever the itemised
 * rows do not add up to the gross, so the displayed rows always sum to Gross.
 */
export function payslipEarnings(p: Record<string, unknown>): Array<[string, unknown]> {
  const rows: Array<[string, unknown]> = [
    ['Basic', p.basicSalary],
    ['HRA', p.hra],
  ];
  const allowances = p.allowances && typeof p.allowances === 'object' && !Array.isArray(p.allowances)
    ? (p.allowances as Record<string, unknown>)
    : {};
  for (const [key, val] of Object.entries(allowances)) {
    if (toNum(val) !== 0) rows.push([allowanceLabel(key), val]);
  }
  rows.push(['Overtime pay', p.overtimePay]);
  const itemised = rows.reduce((s, [, v]) => s + toNum(v), 0);
  const diff = toNum(p.grossSalary) - itemised;
  if (p.grossSalary !== undefined && p.grossSalary !== null && diff !== 0) rows.push(['Other earnings / adjustments', diff]);
  return rows;
}

export function payslipView(p: Record<string, unknown>) {
  const emp = (p.employee as Record<string, unknown> | undefined) ?? {};
  const period = (p.payrollPeriod as Record<string, unknown> | undefined) ?? {};
  const name = `${(emp.firstName as string) ?? ''} ${(emp.lastName as string) ?? ''}`.trim();
  return {
    employeeName: name || '-',
    employeeCode: (emp.employeeCode as string) ?? '-',
    employeeId: (p.employeeId as string) ?? (emp.id as string) ?? '',
    periodLabel: (period.periodLabel as string) ?? '-',
    periodId: (p.payrollPeriodId as string) ?? (period.id as string) ?? '',
    earnings: payslipEarnings(p),
    deductions: [
      ['Provident fund', p.pfDeduction],
      ['ESI', p.esiDeduction],
      ['TDS', p.tdsDeduction],
      ['Professional tax', p.professionalTax],
    ] as Array<[string, unknown]>,
    gross: p.grossSalary,
    totalDeductions: p.totalDeductions,
    net: p.netSalary,
    status: (p.status as string) ?? '-',
    workDays: p.workDays,
    presentDays: p.presentDays,
    leaveDays: p.leaveDays,
    overtimeHours: p.overtimeHours,
  };
}

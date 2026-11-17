// Custom report builder + scheduled report helpers (HK-REP-07 / HK-REP-08).
//
// Shapes follow packages/shared-types/src/reporting.ts:
//   executeCustomReport  <- CustomReportRequestSchema
//   createSavedReport    <- SavedReportInputSchema   (reportType 'CUSTOM')
//   createScheduledReport<- ScheduledReportInputSchema

export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like' | 'between' | 'isNull' | 'isNotNull';

export interface EntityField {
  name: string;
  label: string;
  type: string; // 'string' | 'number' | 'date' | 'boolean'
  filterable: boolean;
  sortable: boolean;
  aggregatable: boolean;
}

export interface EntityDef {
  name: string;
  label: string;
  fields: EntityField[];
}

export interface BuilderFilter {
  field: string;
  operator: FilterOperator;
  value: string; // raw text from the input; coerced by buildReportRequest
}

export interface BuilderSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface BuilderState {
  entityType: string;
  columns: string[];
  filters: BuilderFilter[];
  sort: BuilderSort | null;
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'equals',
  neq: 'does not equal',
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  in: 'is one of (comma separated)',
  like: 'contains',
  between: 'between (two values, comma separated)',
  isNull: 'is empty',
  isNotNull: 'is not empty',
};

/** Operators that make sense for a field type. */
export function operatorsForType(type: string): FilterOperator[] {
  switch (type) {
    case 'number':
    case 'date':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull', 'isNotNull'];
    case 'boolean':
      return ['eq', 'neq'];
    default:
      return ['eq', 'neq', 'like', 'in', 'isNull', 'isNotNull'];
  }
}

const NO_VALUE_OPS: FilterOperator[] = ['isNull', 'isNotNull'];

export function needsValue(op: FilterOperator): boolean {
  return !NO_VALUE_OPS.includes(op);
}

function splitList(text: string): string[] {
  return text.split(',').map((p) => p.trim()).filter((p) => p !== '');
}

function coerceScalar(text: string, type: string): string | number | boolean {
  const t = text.trim();
  if (type === 'number') return Number(t);
  if (type === 'boolean') return t.toLowerCase() === 'true' || t === '1' || t.toLowerCase() === 'yes';
  return t;
}

/** Turn a builder filter into the API filter (typed value, arrays for in/between). */
export function toApiFilter(
  f: BuilderFilter,
  field: EntityField | undefined,
): { field: string; operator: FilterOperator; value: unknown } {
  const type = field?.type ?? 'string';
  if (!needsValue(f.operator)) return { field: f.field, operator: f.operator, value: null };
  if (f.operator === 'in') {
    return { field: f.field, operator: f.operator, value: splitList(f.value).map((v) => coerceScalar(v, type)) };
  }
  if (f.operator === 'between') {
    return { field: f.field, operator: f.operator, value: splitList(f.value).map((v) => coerceScalar(v, type)) };
  }
  return { field: f.field, operator: f.operator, value: coerceScalar(f.value, type) };
}

export interface CustomReportRequestBody {
  entityType: string;
  columns: string[];
  filters: Array<{ field: string; operator: FilterOperator; value: unknown }>;
  groupBy: string[];
  aggregations: never[];
  sortBy: BuilderSort[];
  pagination: { page: number; limit: number; sortOrder: 'asc' | 'desc' };
}

/** Request for executeCustomReport. `limit` is capped at 100 by the API schema. */
export function buildReportRequest(state: BuilderState, entity: EntityDef | undefined, limit = 50): CustomReportRequestBody {
  const fieldByName = new Map((entity?.fields ?? []).map((f) => [f.name, f]));
  return {
    entityType: state.entityType,
    columns: state.columns,
    filters: state.filters.map((f) => toApiFilter(f, fieldByName.get(f.field))),
    groupBy: [],
    aggregations: [],
    sortBy: state.sort ? [state.sort] : [],
    pagination: { page: 1, limit: Math.min(Math.max(1, limit), 100), sortOrder: 'desc' },
  };
}

/** Human readable problems that stop a report from running. Empty = OK. */
export function validateBuilder(state: BuilderState, entity: EntityDef | undefined): string[] {
  const errors: string[] = [];
  if (!entity) {
    errors.push('Choose a data source.');
    return errors;
  }
  if (state.columns.length === 0) errors.push('Select at least one column.');
  const fieldByName = new Map(entity.fields.map((f) => [f.name, f]));
  state.filters.forEach((f, i) => {
    const n = i + 1;
    const field = fieldByName.get(f.field);
    if (!field) {
      errors.push(`Filter ${n}: choose a field.`);
      return;
    }
    if (!needsValue(f.operator)) return;
    if (f.value.trim() === '') {
      errors.push(`Filter ${n} (${field.label}): enter a value.`);
      return;
    }
    if (f.operator === 'between' && splitList(f.value).length !== 2) {
      errors.push(`Filter ${n} (${field.label}): "between" needs exactly two values, e.g. 100, 500.`);
      return;
    }
    if (field.type === 'number') {
      const parts = f.operator === 'in' || f.operator === 'between' ? splitList(f.value) : [f.value];
      if (parts.some((p) => !Number.isFinite(Number(p.trim())) || p.trim() === '')) {
        errors.push(`Filter ${n} (${field.label}): value must be a number.`);
      }
    }
  });
  return errors;
}

/** Input for reporting.createSavedReport. The query config lives in `filters` (read by the scheduler). */
export function toSavedReportInput(name: string, description: string, request: CustomReportRequestBody) {
  return {
    name: name.trim(),
    description: description.trim() || undefined,
    reportType: 'CUSTOM' as const,
    filters: {
      entityType: request.entityType,
      filters: request.filters,
      sortBy: request.sortBy,
      groupBy: request.groupBy,
      aggregations: request.aggregations,
    },
    columns: request.columns,
    sortBy: request.sortBy,
    isDefault: false,
  };
}

export function validateReportName(name: string): string | null {
  const t = name.trim();
  if (!t) return 'Enter a report name.';
  if (t.length > 255) return 'Report name must be 255 characters or fewer.';
  return null;
}

/** Rebuild an executeCustomReport request from a stored SavedReport row. */
export function requestFromSavedReport(saved: {
  filters?: unknown;
  columns?: unknown;
  sortBy?: unknown;
}): CustomReportRequestBody | null {
  const cfg = (saved.filters && typeof saved.filters === 'object' ? saved.filters : {}) as Record<string, unknown>;
  const entityType = typeof cfg.entityType === 'string' ? cfg.entityType : '';
  const columns = Array.isArray(saved.columns) ? (saved.columns as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  if (!entityType || columns.length === 0) return null;
  const sortSrc = Array.isArray(saved.sortBy) ? saved.sortBy : Array.isArray(cfg.sortBy) ? cfg.sortBy : [];
  return {
    entityType,
    columns,
    filters: (Array.isArray(cfg.filters) ? cfg.filters : []) as CustomReportRequestBody['filters'],
    groupBy: [],
    aggregations: [],
    sortBy: sortSrc as BuilderSort[],
    pagination: { page: 1, limit: 100, sortOrder: 'desc' },
  };
}

/**
 * Column labels from getSupportedEntities say "(Paise)" but the report shows rupee amounts
 * (formatReportCell divides by 100), so the label must not claim paise.
 * 'Total (Paise)' -> 'Total'; 'SUM(Total (Paise))' -> 'SUM(Total)'.
 */
export function reportColumnLabel(label: string): string {
  return label.replace(/\s*\(\s*Paise\s*\)/gi, '').trim();
}

/** Format a cell from executeCustomReport for display, using the header type. Paise columns show rupees. */
export function formatReportCell(value: unknown, key: string, type: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'date') {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  if (type === 'boolean') return value === true || value === 1 || value === '1' ? 'Yes' : 'No';
  if (type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    if (/Paise$/.test(key)) {
      return (n / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
    }
    return n.toLocaleString('en-IN');
  }
  return String(value);
}

// ─── Scheduled reports ─────────────────────────────────────────

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

/** Split a comma / semicolon / newline separated list and validate each address. */
export function parseRecipients(text: string): { emails: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (EMAIL_RE.test(p)) {
      if (!emails.some((e) => e.toLowerCase() === p.toLowerCase())) emails.push(p);
    } else {
      invalid.push(p);
    }
  }
  return { emails, invalid };
}

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReportFormat = 'PDF' | 'XLSX' | 'CSV';

export interface ScheduleForm {
  savedReportId: string;
  frequency: Frequency;
  dayOfWeek: number; // 0 = Sunday
  dayOfMonth: number; // 1-31
  timeOfDay: string; // HH:mm
  format: ReportFormat;
  recipients: string;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function validateSchedule(form: ScheduleForm): string[] {
  const errors: string[] = [];
  if (!form.savedReportId) errors.push('Pick a saved report.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.timeOfDay)) errors.push('Enter the time as HH:mm (24 hour).');
  if (form.frequency === 'WEEKLY' && !(form.dayOfWeek >= 0 && form.dayOfWeek <= 6)) errors.push('Pick a day of the week.');
  if (form.frequency === 'MONTHLY' && !(Number.isInteger(form.dayOfMonth) && form.dayOfMonth >= 1 && form.dayOfMonth <= 31)) {
    errors.push('Day of month must be between 1 and 31.');
  }
  const { emails, invalid } = parseRecipients(form.recipients);
  if (invalid.length > 0) errors.push(`Invalid email address: ${invalid.join(', ')}.`);
  else if (emails.length === 0) errors.push('Add at least one recipient email.');
  return errors;
}

/** Input for reporting.createScheduledReport. */
export function toScheduledReportInput(form: ScheduleForm) {
  return {
    savedReportId: form.savedReportId,
    frequency: form.frequency,
    ...(form.frequency === 'WEEKLY' ? { dayOfWeek: form.dayOfWeek } : {}),
    ...(form.frequency === 'MONTHLY' ? { dayOfMonth: form.dayOfMonth } : {}),
    timeOfDay: form.timeOfDay,
    format: form.format,
    recipients: parseRecipients(form.recipients).emails,
    isActive: true,
  };
}

/** 'Weekly on Monday', 'Monthly on day 5', 'Daily'. */
export function describeSchedule(s: { frequency?: string; dayOfWeek?: number | null; dayOfMonth?: number | null }): string {
  switch (s.frequency) {
    case 'DAILY':
      return 'Daily';
    case 'WEEKLY':
      return s.dayOfWeek != null ? `Weekly on ${WEEKDAYS[s.dayOfWeek] ?? '?'}` : 'Weekly';
    case 'MONTHLY':
      return s.dayOfMonth != null ? `Monthly on day ${s.dayOfMonth}` : 'Monthly';
    default:
      return s.frequency ?? '-';
  }
}

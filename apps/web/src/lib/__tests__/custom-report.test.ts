import { describe, it, expect } from 'vitest';
import {
  buildReportRequest,
  describeSchedule,
  formatReportCell,
  operatorsForType,
  parseRecipients,
  reportColumnLabel,
  requestFromSavedReport,
  toSavedReportInput,
  toScheduledReportInput,
  validateBuilder,
  validateReportName,
  validateSchedule,
  type BuilderState,
  type EntityDef,
  type ScheduleForm,
} from '../custom-report';

// Real shape of reporting.getSupportedEntities (see reporting.custom.service ENTITY_REGISTRY).
const sales: EntityDef = {
  name: 'sales',
  label: 'Sales',
  fields: [
    { name: 'saleNumber', label: 'Sale Number', type: 'string', filterable: true, sortable: true, aggregatable: false },
    { name: 'totalPaise', label: 'Total (Paise)', type: 'number', filterable: true, sortable: true, aggregatable: true },
    { name: 'createdAt', label: 'Created At', type: 'date', filterable: true, sortable: true, aggregatable: false },
    { name: 'isActive', label: 'Active', type: 'boolean', filterable: true, sortable: false, aggregatable: false },
  ],
};

const base: BuilderState = { entityType: 'sales', columns: ['saleNumber', 'totalPaise'], filters: [], sort: null };

describe('operatorsForType', () => {
  it('offers type-appropriate operators', () => {
    expect(operatorsForType('number')).toContain('between');
    expect(operatorsForType('string')).toContain('like');
    expect(operatorsForType('string')).not.toContain('gt');
    expect(operatorsForType('boolean')).toEqual(['eq', 'neq']);
  });
});

describe('buildReportRequest', () => {
  it('coerces numbers, lists and between ranges and keeps sort', () => {
    const req = buildReportRequest(
      {
        ...base,
        filters: [
          { field: 'totalPaise', operator: 'gte', value: '500000' },
          { field: 'totalPaise', operator: 'between', value: '100, 900' },
          { field: 'saleNumber', operator: 'in', value: 'S-1, S-2' },
          { field: 'saleNumber', operator: 'isNull', value: '' },
          { field: 'isActive', operator: 'eq', value: 'true' },
        ],
        sort: { field: 'totalPaise', order: 'desc' },
      },
      sales,
    );
    expect(req.filters).toEqual([
      { field: 'totalPaise', operator: 'gte', value: 500000 },
      { field: 'totalPaise', operator: 'between', value: [100, 900] },
      { field: 'saleNumber', operator: 'in', value: ['S-1', 'S-2'] },
      { field: 'saleNumber', operator: 'isNull', value: null },
      { field: 'isActive', operator: 'eq', value: true },
    ]);
    expect(req.sortBy).toEqual([{ field: 'totalPaise', order: 'desc' }]);
    expect(req.pagination.limit).toBe(50);
    expect(buildReportRequest(base, sales, 5000).pagination.limit).toBe(100);
  });
});

describe('validateBuilder', () => {
  it('requires an entity and at least one column', () => {
    expect(validateBuilder(base, undefined)).toEqual(['Choose a data source.']);
    expect(validateBuilder({ ...base, columns: [] }, sales)).toEqual(['Select at least one column.']);
    expect(validateBuilder(base, sales)).toEqual([]);
  });
  it('checks filter values', () => {
    const errs = validateBuilder(
      {
        ...base,
        filters: [
          { field: 'totalPaise', operator: 'gt', value: '' },
          { field: 'totalPaise', operator: 'gt', value: 'abc' },
          { field: 'totalPaise', operator: 'between', value: '5' },
          { field: 'saleNumber', operator: 'isNotNull', value: '' },
          { field: 'ghost', operator: 'eq', value: 'x' },
        ],
      },
      sales,
    );
    expect(errs).toEqual([
      'Filter 1 (Total (Paise)): enter a value.',
      'Filter 2 (Total (Paise)): value must be a number.',
      'Filter 3 (Total (Paise)): "between" needs exactly two values, e.g. 100, 500.',
      'Filter 5: choose a field.',
    ]);
  });
});

describe('saved report mapping', () => {
  it('builds a CUSTOM SavedReportInput that the scheduler can read back', () => {
    const req = buildReportRequest({ ...base, filters: [{ field: 'totalPaise', operator: 'gt', value: '10' }] }, sales);
    const input = toSavedReportInput('  Big sales ', ' ', req);
    expect(input).toMatchObject({ name: 'Big sales', description: undefined, reportType: 'CUSTOM', columns: ['saleNumber', 'totalPaise'], isDefault: false });
    expect(input.filters.entityType).toBe('sales');
    // round trip
    const back = requestFromSavedReport({ filters: input.filters, columns: input.columns, sortBy: input.sortBy });
    expect(back?.entityType).toBe('sales');
    expect(back?.filters).toEqual(req.filters);
    expect(back?.columns).toEqual(req.columns);
  });
  it('returns null for reports without a query config', () => {
    expect(requestFromSavedReport({ filters: null, columns: null })).toBeNull();
    expect(requestFromSavedReport({ filters: { entityType: 'sales' }, columns: [] })).toBeNull();
  });
  it('validates the name', () => {
    expect(validateReportName('  ')).toBe('Enter a report name.');
    expect(validateReportName('x'.repeat(256))).toMatch(/255/);
    expect(validateReportName('Weekly sales')).toBeNull();
  });
});

describe('formatReportCell', () => {
  it('formats paise as rupees, booleans, dates and empties', () => {
    expect(formatReportCell(150000, 'totalPaise', 'number')).toContain('1,500.00');
    expect(formatReportCell(1, 'isActive', 'boolean')).toBe('Yes');
    expect(formatReportCell(null, 'x', 'string')).toBe('-');
    expect(formatReportCell('2026-11-03T10:00:00.000Z', 'createdAt', 'date')).toMatch(/Nov 2026/);
    expect(formatReportCell(12000, 'quantity', 'number')).toBe('12,000');
  });
});

describe('parseRecipients', () => {
  it('splits, dedupes and flags invalid addresses', () => {
    expect(parseRecipients('a@x.com, b@y.in;a@X.com\nbad, c@z')).toEqual({
      emails: ['a@x.com', 'b@y.in'],
      invalid: ['bad', 'c@z'],
    });
    expect(parseRecipients('')).toEqual({ emails: [], invalid: [] });
  });
});

describe('schedule', () => {
  const form: ScheduleForm = {
    savedReportId: '11111111-1111-4111-8111-111111111111',
    frequency: 'WEEKLY',
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: '08:30',
    format: 'CSV',
    recipients: 'owner@shop.in, accounts@shop.in',
  };
  it('validates required fields', () => {
    expect(validateSchedule(form)).toEqual([]);
    expect(validateSchedule({ ...form, savedReportId: '' })).toContain('Pick a saved report.');
    expect(validateSchedule({ ...form, timeOfDay: '8:30' })).toContain('Enter the time as HH:mm (24 hour).');
    expect(validateSchedule({ ...form, timeOfDay: '25:00' })).toContain('Enter the time as HH:mm (24 hour).');
    expect(validateSchedule({ ...form, recipients: '' })).toContain('Add at least one recipient email.');
    expect(validateSchedule({ ...form, recipients: 'nope' })).toContain('Invalid email address: nope.');
    expect(validateSchedule({ ...form, frequency: 'MONTHLY', dayOfMonth: 32 })).toContain('Day of month must be between 1 and 31.');
  });
  it('builds the createScheduledReport input per frequency', () => {
    expect(toScheduledReportInput(form)).toEqual({
      savedReportId: form.savedReportId,
      frequency: 'WEEKLY',
      dayOfWeek: 1,
      timeOfDay: '08:30',
      format: 'CSV',
      recipients: ['owner@shop.in', 'accounts@shop.in'],
      isActive: true,
    });
    const monthly = toScheduledReportInput({ ...form, frequency: 'MONTHLY', dayOfMonth: 5 });
    expect(monthly).toMatchObject({ frequency: 'MONTHLY', dayOfMonth: 5 });
    expect('dayOfWeek' in monthly).toBe(false);
    const daily = toScheduledReportInput({ ...form, frequency: 'DAILY' });
    expect('dayOfWeek' in daily || 'dayOfMonth' in daily).toBe(false);
  });
  it('describes schedules', () => {
    expect(describeSchedule({ frequency: 'DAILY' })).toBe('Daily');
    expect(describeSchedule({ frequency: 'WEEKLY', dayOfWeek: 1 })).toBe('Weekly on Monday');
    expect(describeSchedule({ frequency: 'MONTHLY', dayOfMonth: 5 })).toBe('Monthly on day 5');
  });
});

describe('reportColumnLabel (HK-RPT-02)', () => {
  it('drops the Paise unit because values display as rupees', () => {
    expect(reportColumnLabel('Total (Paise)')).toBe('Total');
    expect(reportColumnLabel('Cost Price (Paise)')).toBe('Cost Price');
    expect(reportColumnLabel('SUM(Total (Paise))')).toBe('SUM(Total)');
    expect(reportColumnLabel('Invoice Number')).toBe('Invoice Number');
    expect(formatReportCell(1250000, 'totalPaise', 'number')).toMatch(/12,500.00/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  renderTemplatePreview,
  validateTemplate,
  toTemplatePayload,
  EMPTY_TEMPLATE,
} from '@/features/notifications/template-utils';

describe('notification template utils', () => {
  it('extracts unique variables', () => {
    expect(extractVariables('Hi {{name}} {{ amount }} {{name}}', '{{invoiceNumber}}')).toEqual([
      'name',
      'amount',
      'invoiceNumber',
    ]);
  });
  it('renders sample data', () => {
    expect(renderTemplatePreview('Hi {{customerName}} {{unknown}}')).toBe('Hi Priya Sharma {{unknown}}');
  });
  it('validates required fields and broken braces', () => {
    const e = validateTemplate({ ...EMPTY_TEMPLATE });
    expect(e.name).toBeTruthy();
    expect(e.subject).toBeTruthy();
    expect(e.body).toBeTruthy();
    expect(
      validateTemplate({ ...EMPTY_TEMPLATE, name: 'a', channel: 'SMS', body: 'Hi {{name' }).body,
    ).toMatch(/Variables/);
    expect(validateTemplate({ ...EMPTY_TEMPLATE, name: 'a', channel: 'SMS', body: 'Hi {{name}}' })).toEqual({});
  });
  it('builds payload with derived variables and no subject for non-email', () => {
    const p = toTemplatePayload({ ...EMPTY_TEMPLATE, name: ' A ', channel: 'SMS', subject: 'x', body: 'Hi {{name}}' });
    expect(p).toMatchObject({ name: 'A', channel: 'SMS', subject: undefined, variables: ['name'] });
  });
});

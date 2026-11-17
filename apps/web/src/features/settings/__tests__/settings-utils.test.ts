import { describe, it, expect } from 'vitest';
import { flattenSettings, toBool } from '../settings-utils';
import { validatePasswordChange } from '../password-validation';
import { branchDisplayHint } from '../branch-utils';

describe('flattenSettings', () => {
  it('reads real getAll shape regardless of stored category', () => {
    const loaded = {
      settings: [
        { settingKey: 'pos.showBarcode', settingValue: false, category: 'general' },
        { settingKey: 'billing.invoicePrefix', settingValue: 'INV', category: 'billing' },
      ],
      grouped: { general: { 'pos.showBarcode': false }, billing: { 'billing.invoicePrefix': 'INV' } },
    };
    expect(flattenSettings(loaded)).toEqual({ 'pos.showBarcode': false, 'billing.invoicePrefix': 'INV' });
  });

  it('falls back to the grouped shape and tolerates empty input', () => {
    expect(flattenSettings({ grouped: { pos: { 'pos.showBarcode': true } } })).toEqual({ 'pos.showBarcode': true });
    expect(flattenSettings(undefined)).toEqual({});
  });

  it('toBool handles stored strings', () => {
    expect(toBool('false', true)).toBe(false);
    expect(toBool(undefined, true)).toBe(true);
  });
});

describe('validatePasswordChange', () => {
  const ok = { currentPassword: 'old-Pass1!', newPassword: 'NewPassw0rd!x', confirmPassword: 'NewPassw0rd!x' };
  it('accepts a strong matching password', () => {
    expect(validatePasswordChange(ok)).toEqual({});
  });
  it('rejects short, weak, mismatched and missing-current', () => {
    expect(validatePasswordChange({ ...ok, newPassword: 'Ab1!', confirmPassword: 'Ab1!' }).newPassword).toMatch(/10/);
    expect(validatePasswordChange({ ...ok, newPassword: 'alllowercase123', confirmPassword: 'alllowercase123' }).newPassword).toMatch(/Mix/);
    expect(validatePasswordChange({ ...ok, confirmPassword: 'different' }).confirmPassword).toMatch(/match/);
    expect(validatePasswordChange({ ...ok, currentPassword: '' }).currentPassword).toBeDefined();
  });
});

describe('branchDisplayHint', () => {
  it('shows city/state and a short ref to tell same-named branches apart', () => {
    expect(branchDisplayHint({ id: '41692d3e-1111', city: 'Mumbai', state: 'MH' })).toBe('Mumbai, MH - #41692d');
    expect(branchDisplayHint({ id: '60c2a413-2222' })).toBe('Ref #60c2a4');
  });
});

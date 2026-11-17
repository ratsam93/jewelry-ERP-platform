import { describe, it, expect } from 'vitest';
import { entityLabel, actionLabel, auditUserLabel, dayStartIso, dayEndIso } from '../audit-format';

describe('audit-format', () => {
  it('labels entities', () => {
    expect(entityLabel('platform.settings')).toBe('Settings');
    expect(entityLabel('hardware.devices')).toBe('Hardware device');
    expect(entityLabel('hardware.device')).toBe('Hardware device');
    expect(entityLabel('platform.i18n')).toBe('Translation');
    expect(entityLabel('inventory.stockItems')).toBe('Inventory stock item');
    expect(entityLabel(null)).toBe('-');
  });
  it('labels actions with the real verb', () => {
    expect(actionLabel('created')).toBe('Created');
    expect(actionLabel('deleted')).toBe('Deleted');
    expect(actionLabel('stock_adjusted')).toBe('Stock adjusted');
  });
  it('shows the user name or email, never a uuid', () => {
    expect(
      auditUserLabel({ user: { firstName: 'Admin', lastName: 'User', email: 'a@x.com' }, userId: 'u1' }),
    ).toBe('Admin User (a@x.com)');
    expect(auditUserLabel({ user: { email: 'a@x.com' } })).toBe('a@x.com');
    expect(auditUserLabel({ userId: '123e4567' })).toBe('Unknown user');
    expect(auditUserLabel({})).toBe('System');
  });
  it('builds inclusive day bounds', () => {
    const start = dayStartIso('2026-01-05') as string;
    const end = dayEndIso('2026-01-05') as string;
    expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
    expect(dayStartIso('')).toBeUndefined();
  });
});

import { entityFilterOptions } from '../audit-format';

describe('entityFilterOptions', () => {
  it('lists each label once and merges the raw types behind it', () => {
    const opts = entityFilterOptions(['platform.branches', 'platform.branch', 'platform.users', 'platform.roles']);
    expect(opts.filter((o) => o.label === 'Branch')).toEqual([{ label: 'Branch', value: 'platform.branches,platform.branch' }]);
    expect(opts.map((o) => o.label)).toEqual(['Branch', 'Role', 'User']);
  });
});

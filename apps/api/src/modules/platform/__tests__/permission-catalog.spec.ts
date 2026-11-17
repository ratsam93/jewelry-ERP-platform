import { describe, it, expect } from 'vitest';
import { DEFAULT_PERMISSIONS } from '@caratflow/db';

describe('DEFAULT_PERMISSIONS catalog (used by roles.seedPermissions and packages/db seed-permissions)', () => {
  it('is non-empty with unique module.resource.action keys', () => {
    expect(DEFAULT_PERMISSIONS.length).toBeGreaterThan(100);
    const keys = DEFAULT_PERMISSIONS.map((p) => p.module + '.' + p.resource + '.' + p.action);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('fits the permissions table column widths', () => {
    for (const p of DEFAULT_PERMISSIONS) {
      expect(p.module.length).toBeLessThanOrEqual(50);
      expect(p.resource.length).toBeLessThanOrEqual(50);
      expect(p.action.length).toBeLessThanOrEqual(50);
      expect(p.description.length).toBeLessThanOrEqual(255);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { mapCrmDashboard } from '../../lib/crm-dashboard';

describe('mapCrmDashboard', () => {
  it('maps API fields to hub stats and excludes closed leads', () => {
    const s = mapCrmDashboard({
      activeCustomers: 51,
      newLeads: 4,
      leadPipeline: { NEW: 4, CONTACTED: 3, QUALIFIED: 2, WON: 5, LOST: 6 },
    });
    expect(s).toEqual({ totalCustomers: 51, activeLeads: 9, newLeads30d: 4 });
  });
  it('is zero-safe for missing data', () => {
    expect(mapCrmDashboard(undefined)).toEqual({ totalCustomers: 0, activeLeads: 0, newLeads30d: 0 });
  });
});

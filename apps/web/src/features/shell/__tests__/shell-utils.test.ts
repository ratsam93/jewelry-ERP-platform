import { describe, it, expect, vi } from 'vitest';
import { buildCommandItems } from '../command-items';
import { toLocationOptions, toLocationFilter } from '../location-utils';
import { userIdFromToken } from '../current-user';

const nav = [
  { label: 'Dashboard', href: '/dashboard' },
  {
    label: 'Finance',
    href: '/finance',
    children: [
      { label: 'Overview', href: '/finance' },
      { label: 'Invoices', href: '/finance/invoices' },
    ],
  },
  {
    label: 'CRM',
    href: '/crm',
    children: [
      { label: 'Overview', href: '/crm' },
      { label: 'Customers', href: '/crm/customers' },
    ],
  },
];

describe('buildCommandItems', () => {
  it('includes quick actions pointing at the real create pages', () => {
    const go = vi.fn();
    const items = buildCommandItems(nav, go);
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    byLabel['New invoice']!.onSelect();
    byLabel['New customer']!.onSelect();
    byLabel['New sale']!.onSelect();
    expect(go.mock.calls.map((c) => c[0])).toEqual([
      '/finance/invoices/new',
      '/crm/customers/new',
      '/retail/pos',
    ]);
  });

  it('lists every route once with unique, section-prefixed labels', () => {
    const items = buildCommandItems(nav, vi.fn());
    const labels = items.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('Finance / Invoices');
    expect(labels).toContain('CRM / Customers');
    // child "Overview" duplicates the parent route and is dropped
    expect(labels.filter((l) => l.includes('Overview'))).toHaveLength(0);
    expect(labels).toEqual(expect.arrayContaining(['Profile', 'Notifications', 'Settings']));
  });

  it('navigates with the raw route (router applies the basePath)', () => {
    const go = vi.fn();
    buildCommandItems(nav, go).find((i) => i.label === 'Finance / Invoices')!.onSelect();
    expect(go).toHaveBeenCalledWith('/finance/invoices');
  });
});

describe('location helpers', () => {
  const rows = [
    { id: '41692d3e-0000-4000-8000-000000000001', name: 'Main Showroom - Zaveri Bazaar', city: 'Mumbai', isActive: true },
    { id: '60c2a413-0000-4000-8000-000000000002', name: 'Main Showroom - Zaveri Bazaar', city: 'Mumbai', isActive: true },
    { id: '90c05b11-0000-4000-8000-000000000003', name: 'Workshop & Vault', city: 'Mumbai', isActive: true },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', name: 'Closed', isActive: false },
  ];

  it('disambiguates duplicate names and hides inactive locations', () => {
    const opts = toLocationOptions(rows);
    expect(opts).toHaveLength(3);
    expect(opts[0]!.name).toBe('Main Showroom - Zaveri Bazaar (Mumbai, #41692d)');
    expect(opts[1]!.name).toBe('Main Showroom - Zaveri Bazaar (Mumbai, #60c2a4)');
    expect(opts[2]!.name).toBe('Workshop & Vault');
  });

  it('only forwards real uuids as a locationId filter', () => {
    expect(toLocationFilter(null)).toBeUndefined();
    expect(toLocationFilter('branch-1')).toBeUndefined();
    expect(toLocationFilter('90c05b11-0000-4000-8000-000000000003')).toBe('90c05b11-0000-4000-8000-000000000003');
  });
});

describe('userIdFromToken', () => {
  it('reads sub from a JWT payload', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u-1', tenantId: 't' })).toString('base64url');
    expect(userIdFromToken('h.' + payload + '.s')).toBe('u-1');
    expect(userIdFromToken('garbage')).toBeNull();
    expect(userIdFromToken(null)).toBeNull();
  });
});

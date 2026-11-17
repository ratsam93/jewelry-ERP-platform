import { describe, it, expect } from 'vitest';
import { invoiceCounterpartyName } from '../../lib/invoice-party';
import { dedupeBranches, branchOptionLabels } from '../../lib/pos-location';

describe('invoiceCounterpartyName', () => {
  it('uses customer first/last name', () => {
    expect(invoiceCounterpartyName({ customer: { firstName: 'Shreya', lastName: 'Bhatt' } })).toBe('Shreya Bhatt');
  });
  it('falls back to supplier name then dash', () => {
    expect(invoiceCounterpartyName({ customer: null, supplier: { name: 'Bullion Co' } })).toBe('Bullion Co');
    expect(invoiceCounterpartyName({})).toBe('-');
  });
});

describe('POS branch list', () => {
  const a = { id: 'aaaa-1', name: 'Main Showroom', locationType: 'SHOWROOM' };
  const b = { id: 'bbbb-2', name: 'Main Showroom', locationType: 'SHOWROOM' };
  it('dedupes by id', () => {
    expect(dedupeBranches([a, a, b])).toHaveLength(2);
  });
  it('disambiguates same-name distinct locations', () => {
    const l = branchOptionLabels([a, b, { id: 'c', name: 'Vault', locationType: 'WORKSHOP' }]);
    expect(l.get('aaaa-1')).toBe('Main Showroom (SHOWROOM) #aaaa');
    expect(l.get('bbbb-2')).toBe('Main Showroom (SHOWROOM) #bbbb');
    expect(l.get('c')).toBe('Vault (WORKSHOP)');
  });
});

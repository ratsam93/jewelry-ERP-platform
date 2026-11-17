import { describe, it, expect } from 'vitest';
import { listItems, customerLabel, exportOrderBlockers, exportInvoiceBlockers } from '../form-helpers';

describe('export form helpers', () => {
  it('reads items from the real crm.customerList / export list shape', () => {
    const res = { items: [{ id: 'c1', firstName: 'Asha', lastName: 'Rao' }], total: 1, page: 1, limit: 100 };
    expect(listItems<{ id: string }>(res)).toHaveLength(1);
    expect(listItems({ data: [{ id: 'x' }] })).toEqual([]);
    expect(listItems(undefined)).toEqual([]);
  });
  it('labels customers', () => {
    expect(customerLabel({ id: 'c1', firstName: 'Asha', lastName: 'Rao' })).toBe('Asha Rao');
    expect(customerLabel({ id: 'c1' })).toBe('c1');
  });
  it('lists order blockers', () => {
    const msgs = exportOrderBlockers({
      buyerId: '', buyerCountry: 'U', locationId: '',
      items: [{ description: '', quantity: 1, unitPriceDecimal: 0 }],
    });
    expect(msgs).toHaveLength(5);
    expect(exportOrderBlockers({
      buyerId: 'b', buyerCountry: 'US', locationId: 'l',
      items: [{ description: 'Ring', quantity: 1, unitPriceDecimal: 10 }],
    })).toEqual([]);
  });
  it('lists invoice blockers', () => {
    expect(exportInvoiceBlockers({ exportOrderId: '', buyerId: '', ieCode: ' ', items: [] })).toHaveLength(3);
  });
});

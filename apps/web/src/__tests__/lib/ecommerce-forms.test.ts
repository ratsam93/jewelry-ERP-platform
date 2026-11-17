import { describe, it, expect } from 'vitest';
import {
  buildChannelInput, EMPTY_CHANNEL_FORM, buildOrderFilters, orderDateRangeError, orderActionsFor,
  orderAmountLines, reviewFiltersFor, dashboardKpis, EMPTY_ORDER_FILTERS,
} from '@/lib/ecommerce-forms';

describe('buildChannelInput', () => {
  it('requires a name and rejects a non-URL store URL', () => {
    const r = buildChannelInput({ ...EMPTY_CHANNEL_FORM, storeUrl: 'not a url' });
    expect(r.input).toBeNull();
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.storeUrl).toBeTruthy();
  });

  it('builds a SalesChannelInputSchema payload, dropping blank optional fields', () => {
    const r = buildChannelInput({
      ...EMPTY_CHANNEL_FORM, name: '  Shopify store ', channelType: 'SHOPIFY',
      storeUrl: 'https://shop.example.com', apiKey: ' key ', apiSecret: '', webhookSecret: '',
    });
    expect(r.input).toEqual({
      name: 'Shopify store', channelType: 'SHOPIFY', isActive: true,
      storeUrl: 'https://shop.example.com', apiKey: 'key',
    });
  });

  it('rejects an unknown channel type and over-long credentials', () => {
    const r = buildChannelInput({ ...EMPTY_CHANNEL_FORM, name: 'x', channelType: 'NOPE', apiKey: 'k'.repeat(501) });
    expect(r.errors.channelType).toBeTruthy();
    expect(r.errors.apiKey).toBeTruthy();
  });
});

describe('order filters', () => {
  it('sends only non-empty, valid filters', () => {
    expect(buildOrderFilters(EMPTY_ORDER_FILTERS)).toEqual({});
    expect(buildOrderFilters({ search: ' ON/B2C ', status: 'CONFIRMED', dateFrom: '2026-11-01', dateTo: '2026-11-17' })).toEqual({
      search: 'ON/B2C', status: 'CONFIRMED', dateFrom: '2026-11-01', dateTo: '2026-11-17',
    });
    expect(buildOrderFilters({ ...EMPTY_ORDER_FILTERS, status: 'BOGUS' })).toEqual({});
  });

  it('flags an inverted date range', () => {
    expect(orderDateRangeError({ ...EMPTY_ORDER_FILTERS, dateFrom: '2026-11-18', dateTo: '2026-11-17' })).toBeTruthy();
    expect(orderDateRangeError({ ...EMPTY_ORDER_FILTERS, dateFrom: '2026-11-17', dateTo: '2026-11-17' })).toBeNull();
  });
});

describe('orderActionsFor', () => {
  it('offers the next step plus cancel for a confirmed order', () => {
    const a = orderActionsFor('CONFIRMED');
    expect(a.map((x) => x.status)).toEqual(['PROCESSING', 'CANCELLED']);
    expect(a[1].kind).toBe('cancel');
  });
  it('offers return and refund after delivery, nothing for terminal states', () => {
    expect(orderActionsFor('DELIVERED').map((x) => x.status)).toEqual(['RETURNED', 'REFUNDED']);
    expect(orderActionsFor('CANCELLED')).toEqual([]);
    expect(orderActionsFor('REFUNDED')).toEqual([]);
  });
});

describe('orderAmountLines', () => {
  it('lists subtotal, discount, shipping and tax in paise, skipping zeros', () => {
    expect(orderAmountLines({ subtotalPaise: 100000, discountPaise: 5000, shippingPaise: 0, taxPaise: 3000 })).toEqual([
      { label: 'Subtotal', paise: 100000 },
      { label: 'Discount', paise: 5000, negative: true },
      { label: 'Tax', paise: 3000 },
    ]);
  });
});

describe('reviewFiltersFor', () => {
  it('maps tabs to isPublished', () => {
    expect(reviewFiltersFor('all')).toEqual({});
    expect(reviewFiltersFor('pending')).toEqual({ isPublished: false });
    expect(reviewFiltersFor('published')).toEqual({ isPublished: true });
  });
});

describe('dashboardKpis', () => {
  it('reads the fields getDashboard actually returns', () => {
    expect(dashboardKpis({ activeChannels: 1, mtdOrders: 2, mtdRevenuePaise: 99577846, pendingShipments: 2 })).toEqual({
      activeChannels: 1, mtdOrders: 2, mtdRevenuePaise: 99577846, pendingShipments: 2,
    });
  });
  it('falls back to channelBreakdown / onlineRevenuePaise for older responses', () => {
    const k = dashboardKpis({ channelBreakdown: [{}], onlineRevenuePaise: 500, pendingShipments: 0 });
    expect(k.activeChannels).toBe(1);
    expect(k.mtdRevenuePaise).toBe(500);
  });
});

import { paymentMethodLabel, paymentStatusLabel, orderPaymentRows } from '@/lib/ecommerce-forms';

describe('payment helpers', () => {
  it('labels COD payments and statuses', () => {
    expect(paymentMethodLabel('cod')).toBe('Cash on delivery');
    expect(paymentMethodLabel(null)).toBe('-');
    expect(paymentStatusLabel('cod', 'INITIATED')).toBe('Pending (COD)');
    expect(paymentStatusLabel('upi', 'INITIATED')).toBe('Pending');
    expect(paymentStatusLabel('upi', 'CAPTURED')).toBe('Paid');
  });

  it('builds order payment rows from the getOrder payments array', () => {
    expect(orderPaymentRows({ payments: [{ id: 'p1', method: 'cod', status: 'INITIATED', amountPaise: 3326900 }] })).toEqual([
      { id: 'p1', method: 'Cash on delivery', status: 'Pending (COD)', amountPaise: 3326900 },
    ]);
    expect(orderPaymentRows({})).toEqual([]);
  });
});

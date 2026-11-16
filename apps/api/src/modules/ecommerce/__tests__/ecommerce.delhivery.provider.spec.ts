import { describe, it, expect, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { DelhiveryProvider } from '../ecommerce.delhivery.provider';

const consignee = {
  name: 'Asha', phone: '9999999999', line1: '1 MG Road', city: 'Pune',
  state: 'MH', postalCode: '411001', country: 'IN',
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('DelhiveryProvider', () => {
  it('reports not configured without a token', async () => {
    const p = new DelhiveryProvider({}, vi.fn());
    expect(p.isConfigured()).toBe(false);
    await expect(
      p.createShipment({ shipmentNumber: 'SH/1', orderNumber: 'O1', consignee, amountPaise: 100 }),
    ).rejects.toMatchObject({ response: { status: 'NOT_CONFIGURED' } });
  });

  it('requires DELHIVERY_PICKUP_LOCATION to create a shipment', async () => {
    const fetchMock = vi.fn();
    const p = new DelhiveryProvider({ DELHIVERY_API_TOKEN: 't' }, fetchMock);
    await expect(
      p.createShipment({ shipmentNumber: 'SH/1', orderNumber: 'O1', consignee, amountPaise: 100 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a shipment via /api/cmu/create.json and returns the waybill as AWB', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, packages: [{ waybill: '1234567890', status: 'Success' }] }),
    );
    const p = new DelhiveryProvider(
      { DELHIVERY_API_TOKEN: 'tok', DELHIVERY_PICKUP_LOCATION: 'Main WH' },
      fetchMock,
    );
    const res = await p.createShipment({
      shipmentNumber: 'SH/2604/0001', orderNumber: 'O1', consignee, amountPaise: 150000, weightGrams: 50,
    });

    expect(res.awbCode).toBe('1234567890');
    expect(res.labelUrl).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://track.delhivery.com/api/cmu/create.json');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token tok');
    const data = JSON.parse(new URLSearchParams(init.body as string).get('data') as string);
    expect(data.pickup_location.name).toBe('Main WH');
    expect(data.shipments[0].order).toBe('SH/2604/0001');
    expect(data.shipments[0].total_amount).toBe('1500.00');
  });

  it('throws when Delhivery reports failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: false, packages: [{ remarks: ['Invalid pin'] }] }),
    );
    const p = new DelhiveryProvider(
      { DELHIVERY_API_TOKEN: 'tok', DELHIVERY_PICKUP_LOCATION: 'Main WH' },
      fetchMock,
    );
    await expect(
      p.createShipment({ shipmentNumber: 'SH/1', orderNumber: 'O1', consignee, amountPaise: 1 }),
    ).rejects.toThrow('Invalid pin');
  });

  it('tracks an AWB via /api/v1/packages/json/', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ShipmentData: [] }));
    const p = new DelhiveryProvider({ DELHIVERY_API_TOKEN: 'tok' }, fetchMock);
    await p.track('1234567890');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://track.delhivery.com/api/v1/packages/json/?waybill=1234567890');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token tok');
  });
});

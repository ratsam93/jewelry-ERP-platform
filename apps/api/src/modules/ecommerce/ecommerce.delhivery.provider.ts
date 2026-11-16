// ─── Delhivery Shipping Provider ──────────────────────────────
// Thin REST client for Delhivery's B2C API. Env-gated:
//   DELHIVERY_API_TOKEN       required; sent as "Authorization: Token <t>"
//   DELHIVERY_PICKUP_LOCATION required for create (registered warehouse name)
//   DELHIVERY_API_BASE        optional, default https://track.delhivery.com
//
// Endpoints used (as documented by Delhivery):
//   POST {base}/api/cmu/create.json        create shipment, returns waybill (AWB)
//   GET  {base}/api/v1/packages/json/?waybill=...  track package
//
// UNVERIFIED against the live API: request/response field names follow
// Delhivery's public docs but have not been exercised against a real
// account. No label PDF endpoint is used; labelUrl is always null.

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export interface CarrierConsignee {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface CarrierShipmentInput {
  shipmentNumber: string;
  orderNumber: string;
  consignee: CarrierConsignee;
  amountPaise: number;
  weightGrams?: number | null;
}

export interface CarrierShipmentResult {
  labelUrl: string | null;
  awbCode: string | null;
  trackingUrl: string | null;
}

/** Common surface for carrier integrations. */
export interface ShippingCarrierProvider {
  readonly carrier: string;
  isConfigured(): boolean;
  createShipment(input: CarrierShipmentInput): Promise<CarrierShipmentResult>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class DelhiveryProvider implements ShippingCarrierProvider {
  readonly carrier = 'DELHIVERY';

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  isConfigured(): boolean {
    return !!this.env.DELHIVERY_API_TOKEN;
  }

  private get baseUrl(): string {
    return (this.env.DELHIVERY_API_BASE ?? 'https://track.delhivery.com').replace(/\/$/, '');
  }

  private requireToken(): string {
    const token = this.env.DELHIVERY_API_TOKEN;
    if (!token) {
      throw new ServiceUnavailableException({
        status: 'NOT_CONFIGURED',
        message: 'Delhivery is not configured: set DELHIVERY_API_TOKEN',
      });
    }
    return token;
  }

  async createShipment(input: CarrierShipmentInput): Promise<CarrierShipmentResult> {
    const token = this.requireToken();
    const pickup = this.env.DELHIVERY_PICKUP_LOCATION;
    if (!pickup) {
      throw new ServiceUnavailableException({
        status: 'NOT_CONFIGURED',
        message: 'Delhivery is not configured: set DELHIVERY_PICKUP_LOCATION',
      });
    }

    const c = input.consignee;
    const shipment = {
      name: c.name,
      add: [c.line1, c.line2].filter(Boolean).join(', '),
      pin: c.postalCode,
      city: c.city,
      state: c.state,
      country: c.country,
      phone: c.phone ?? '',
      order: input.shipmentNumber,
      payment_mode: 'Prepaid',
      products_desc: 'Jewellery',
      total_amount: (input.amountPaise / 100).toFixed(2),
      cod_amount: '0',
      quantity: '1',
      weight: input.weightGrams ? String(input.weightGrams) : '',
    };

    const body = new URLSearchParams({
      format: 'json',
      data: JSON.stringify({ shipments: [shipment], pickup_location: { name: pickup } }),
    });

    const res = await this.fetchImpl(`${this.baseUrl}/api/cmu/create.json`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(`Delhivery create HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      success?: boolean;
      rmk?: string;
      packages?: Array<{ waybill?: string; status?: string; remarks?: string[] }>;
    };
    const waybill = json.packages?.[0]?.waybill;
    if (!json.success || !waybill) {
      const reason = json.packages?.[0]?.remarks?.join('; ') || json.rmk || 'no waybill returned';
      throw new BadRequestException(`Delhivery shipment creation failed: ${reason}`);
    }

    return {
      labelUrl: null,
      awbCode: waybill,
      trackingUrl: `https://www.delhivery.com/track/package/${encodeURIComponent(waybill)}`,
    };
  }

  /** Fetch raw tracking data for an AWB. Returns Delhivery's JSON as-is. */
  async track(awb: string): Promise<unknown> {
    const token = this.requireToken();
    const res = await this.fetchImpl(
      `${this.baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`,
      {
        method: 'GET',
        headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
      },
    );
    if (!res.ok) {
      throw new Error(`Delhivery track HTTP ${res.status}`);
    }
    return res.json();
  }
}

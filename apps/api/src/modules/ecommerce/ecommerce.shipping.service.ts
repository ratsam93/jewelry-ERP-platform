// ─── E-Commerce Shipping Service ──────────────────────────────
// Create shipment, generate label (placeholder for Shiprocket/
// Delhivery API), track shipment, update delivery status.

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import type {
  ShipmentInput,
  ShipmentResponse,
  TrackingUpdate,
  ShipmentListFilter,
} from '@caratflow/shared-types';
import type { PaginatedResult, Pagination } from '@caratflow/shared-types';
import { ShipmentStatus, OnlineOrderStatus } from '@caratflow/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { TenantAwareService } from '../../common/base.service';
import { DelhiveryProvider } from './ecommerce.delhivery.provider';
import { v4 as uuidv4 } from 'uuid';

/** Error surfaced when a carrier has no credentials configured. */
function notConfigured(carrier: string, hint: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    status: 'NOT_CONFIGURED',
    carrier,
    message: `Shipping carrier ${carrier} is not configured: ${hint}`,
  });
}

@Injectable()
export class EcommerceShippingService extends TenantAwareService {
  private readonly logger = new Logger(EcommerceShippingService.name);
  private readonly delhivery = new DelhiveryProvider();

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Generate shipment number in format: SH/YYMM/SEQ
   */
  private async generateShipmentNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;

    const count = await this.prisma.shipment.count({
      where: {
        tenantId,
        shipmentNumber: { contains: `/SH/${yymm}/` },
      },
    });

    const seq = String(count + 1).padStart(4, '0');
    return `SH/${yymm}/${seq}`;
  }

  /**
   * Create a shipment for an order.
   */
  async createShipment(tenantId: string, userId: string, input: ShipmentInput): Promise<ShipmentResponse> {
    const order = await this.prisma.onlineOrder.findFirst({
      where: { id: input.orderId, tenantId },
    });
    if (!order) {
      throw new NotFoundException('Online order not found');
    }

    if (['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException(`Cannot create shipment for order in ${order.status} status`);
    }

    const shipmentNumber = await this.generateShipmentNumber(tenantId);

    const shipment = await this.prisma.shipment.create({
      data: {
        id: uuidv4(),
        tenantId,
        orderId: input.orderId,
        shipmentNumber,
        carrier: input.carrier ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        status: 'LABEL_CREATED',
        estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
        weightGrams: input.weightGrams ?? null,
        shippingCostPaise: BigInt(input.shippingCostPaise ?? 0),
        labelUrl: input.labelUrl ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    // Update order status to PROCESSING if it was CONFIRMED
    if (order.status === 'CONFIRMED') {
      await this.prisma.onlineOrder.update({
        where: { id: input.orderId },
        data: { status: 'PROCESSING', updatedBy: userId },
      });
    }

    this.logger.log(`Shipment created: ${shipmentNumber} for order ${order.orderNumber}`);

    return this.mapShipmentToResponse(shipment);
  }

  /**
   * Update shipment tracking information and status.
   */
  async updateTracking(tenantId: string, userId: string, update: TrackingUpdate): Promise<ShipmentResponse> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: update.shipmentId, tenantId },
    });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    const data: Record<string, unknown> = {
      status: update.status,
      updatedBy: userId,
    };

    if (update.trackingNumber) data.trackingNumber = update.trackingNumber;
    if (update.trackingUrl) data.trackingUrl = update.trackingUrl;
    if (update.actualDeliveryDate) data.actualDeliveryDate = update.actualDeliveryDate;

    // If delivered, set actual delivery date
    if (update.status === ShipmentStatus.DELIVERED && !update.actualDeliveryDate) {
      data.actualDeliveryDate = new Date();
    }

    const updated = await this.prisma.shipment.update({
      where: { id: update.shipmentId },
      data,
    });

    // Update order status based on shipment status
    if (update.status === ShipmentStatus.PICKED_UP || update.status === ShipmentStatus.IN_TRANSIT) {
      await this.prisma.onlineOrder.update({
        where: { id: shipment.orderId },
        data: {
          status: 'SHIPPED',
          shippedAt: new Date(),
          updatedBy: userId,
        },
      });
    } else if (update.status === ShipmentStatus.DELIVERED) {
      await this.prisma.onlineOrder.update({
        where: { id: shipment.orderId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          updatedBy: userId,
        },
      });
    }

    this.logger.log(`Shipment ${shipment.shipmentNumber} tracking updated: ${update.status}`);

    return this.mapShipmentToResponse(updated);
  }

  /**
   * Get a single shipment.
   */
  async getShipment(tenantId: string, shipmentId: string): Promise<ShipmentResponse> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
    });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }
    return this.mapShipmentToResponse(shipment);
  }

  /**
   * List shipments by order.
   */
  async getShipmentsByOrder(tenantId: string, orderId: string): Promise<ShipmentResponse[]> {
    const shipments = await this.prisma.shipment.findMany({
      where: { tenantId, orderId },
      orderBy: { createdAt: 'desc' },
    });
    return shipments.map((s) => this.mapShipmentToResponse(s));
  }

  /**
   * List shipments with filters and pagination.
   */
  async listShipments(
    tenantId: string,
    filters: ShipmentListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<ShipmentResponse>> {
    const where: Record<string, unknown> = { tenantId };

    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.status) where.status = filters.status;
    if (filters.carrier) where.carrier = { contains: filters.carrier };
    if (filters.search) {
      where.OR = [
        { shipmentNumber: { contains: filters.search } },
        { trackingNumber: { contains: filters.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        orderBy: { createdAt: pagination.sortOrder ?? 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      items: items.map((s) => this.mapShipmentToResponse(s)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrevious: pagination.page > 1,
    };
  }

  /**
   * Generate a shipping label via carrier API.
   *
   * Carriers:
   *   SHIPROCKET  requires SHIPROCKET_EMAIL + SHIPROCKET_PASSWORD
   *   DELHIVERY   requires DELHIVERY_API_TOKEN + DELHIVERY_PICKUP_LOCATION
   *
   * When credentials are missing the call throws a 503 with
   * `{ status: 'NOT_CONFIGURED' }`. No fake label is ever returned, except
   * when SHIPPING_MOCK=true is set explicitly and NODE_ENV is not
   * production; the mock URL uses a non-HTTP scheme so it cannot be
   * mistaken for a real label.
   */
  async generateLabel(
    tenantId: string,
    shipmentId: string,
    carrier: string,
  ): Promise<ShipmentResponse> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, tenantId },
      include: { order: true },
    });
    if (!shipment) {
      throw new NotFoundException('Shipment not found');
    }

    let labelUrl: string | null = null;
    let trackingNumber: string | null = shipment.trackingNumber ?? null;
    let trackingUrl: string | null = shipment.trackingUrl ?? null;

    const carrierKey = carrier.toUpperCase();
    const mockAllowed =
      process.env.SHIPPING_MOCK === 'true' && process.env.NODE_ENV !== 'production';

    if (mockAllowed) {
      this.logger.warn(
        `SHIPPING_MOCK=true: mock (non-printable) label for ${shipment.shipmentNumber} carrier=${carrier}`,
      );
      labelUrl = `mock://shipping-label/${shipment.shipmentNumber}`;
    } else if (carrierKey === 'SHIPROCKET') {
      if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
        throw notConfigured('SHIPROCKET', 'set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD');
      }
      const real = await this.callShiprocket(shipment.shipmentNumber);
      labelUrl = real.labelUrl ?? null;
      if (real.awbCode) trackingNumber = real.awbCode;
      if (real.trackingUrl) trackingUrl = real.trackingUrl;
      this.logger.log(`[SHIPROCKET] Label for ${shipment.shipmentNumber}: awb=${real.awbCode}`);
    } else if (carrierKey === 'DELHIVERY') {
      if (!this.delhivery.isConfigured()) {
        throw notConfigured('DELHIVERY', 'set DELHIVERY_API_TOKEN and DELHIVERY_PICKUP_LOCATION');
      }
      const order = shipment.order as unknown as {
        orderNumber?: string;
        customerName?: string | null;
        customerPhone?: string | null;
        totalPaise?: bigint | number;
        shippingAddress?: Record<string, unknown> | null;
      } | null;
      const addr = order?.shippingAddress ?? null;
      if (!addr) {
        throw new BadRequestException('Order has no shipping address; required for Delhivery');
      }
      const real = await this.delhivery.createShipment({
        shipmentNumber: shipment.shipmentNumber,
        orderNumber: order?.orderNumber ?? shipment.shipmentNumber,
        consignee: {
          name: String(addr.name ?? order?.customerName ?? ''),
          phone: (addr.phone as string | undefined) ?? order?.customerPhone ?? undefined,
          line1: String(addr.line1 ?? ''),
          line2: (addr.line2 as string | undefined) ?? undefined,
          city: String(addr.city ?? ''),
          state: String(addr.state ?? ''),
          postalCode: String(addr.postalCode ?? ''),
          country: String(addr.country ?? 'IN'),
        },
        amountPaise: Number(order?.totalPaise ?? 0),
        weightGrams: shipment.weightGrams ?? null,
      });
      labelUrl = real.labelUrl;
      if (real.awbCode) trackingNumber = real.awbCode;
      if (real.trackingUrl) trackingUrl = real.trackingUrl;
      this.logger.log(`[DELHIVERY] Shipment for ${shipment.shipmentNumber}: awb=${real.awbCode}`);
    } else {
      throw notConfigured(carrier, 'no label integration for this carrier');
    }

    const updated = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        carrier,
        labelUrl,
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
      },
    });

    return this.mapShipmentToResponse(updated);
  }

  /**
   * Minimal Shiprocket integration: login -> create ad-hoc order ->
   * request AWB. Shiprocket's API responds with a `label_url` and
   * `awb_code`. Called only when creds are set.
   */
  private async callShiprocket(
    shipmentNumber: string,
  ): Promise<{ labelUrl?: string; awbCode?: string; trackingUrl?: string }> {
    const base = process.env.SHIPROCKET_API_BASE ?? 'https://apiv2.shiprocket.in/v1/external';
    const email = process.env.SHIPROCKET_EMAIL!;
    const password = process.env.SHIPROCKET_PASSWORD!;

    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      throw new Error(`Shiprocket login HTTP ${loginRes.status}`);
    }
    const { token } = (await loginRes.json()) as { token?: string };
    if (!token) {
      throw new Error('Shiprocket login returned no token');
    }

    const labelRes = await fetch(`${base}/courier/generate/label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ order_id: shipmentNumber }),
    });
    if (!labelRes.ok) {
      throw new Error(`Shiprocket label HTTP ${labelRes.status}`);
    }
    const label = (await labelRes.json()) as {
      label_url?: string;
      awb_code?: string;
      tracking_url?: string;
    };
    return {
      labelUrl: label.label_url,
      awbCode: label.awb_code,
      trackingUrl: label.tracking_url,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private mapShipmentToResponse(s: Record<string, unknown>): ShipmentResponse {
    return {
      id: s.id as string,
      tenantId: s.tenantId as string,
      orderId: s.orderId as string,
      shipmentNumber: s.shipmentNumber as string,
      carrier: (s.carrier as string) ?? null,
      trackingNumber: (s.trackingNumber as string) ?? null,
      trackingUrl: (s.trackingUrl as string) ?? null,
      status: s.status as ShipmentStatus,
      estimatedDeliveryDate: s.estimatedDeliveryDate ? new Date(s.estimatedDeliveryDate as string) : null,
      actualDeliveryDate: s.actualDeliveryDate ? new Date(s.actualDeliveryDate as string) : null,
      weightGrams: (s.weightGrams as number) ?? null,
      shippingCostPaise: Number(s.shippingCostPaise),
      labelUrl: (s.labelUrl as string) ?? null,
      createdAt: new Date(s.createdAt as string),
      updatedAt: new Date(s.updatedAt as string),
    };
  }
}

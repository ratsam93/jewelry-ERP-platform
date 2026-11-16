import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventBusService } from '../../event-bus/event-bus.service';
import { PrismaService } from '../../common/prisma.service';
import { ManufacturingService } from './manufacturing.service';
import {
  JobPriority,
  type RetailCustomOrderCreatedEvent,
  type InventoryStockAdjustedEvent,
  type DomainEvent,
} from '@caratflow/shared-types';

/**
 * Optional fields the retail custom-order event may carry in addition to the
 * base payload. productId and locationId are required to create a job order;
 * without them the handler logs and skips.
 */
type CustomOrderCreatedPayload = RetailCustomOrderCreatedEvent['payload'] & {
  productId?: string;
  locationId?: string;
  targetWeightMg?: number;
  metalPurity?: string;
};

/** Marker stored in JobOrder.notes so a custom order is only turned into one job order. */
export function customOrderReferenceMarker(orderId: string): string {
  return `[custom-order-ref:${orderId}]`;
}

@Injectable()
export class ManufacturingEventHandler implements OnModuleInit {
  private readonly logger = new Logger(ManufacturingEventHandler.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly manufacturingService: ManufacturingService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('retail.custom_order.created', (event: DomainEvent) => this.handleCustomOrderCreated(event as RetailCustomOrderCreatedEvent));
    this.eventBus.subscribe('inventory.stock.adjusted', (event: DomainEvent) => this.handleStockAdjusted(event as InventoryStockAdjustedEvent));
  }

  /**
   * Creates a DRAFT job order for a retail custom order. Idempotent: if a job
   * order already references the custom order id (via its notes marker), no
   * second job order is created.
   */
  private async handleCustomOrderCreated(event: RetailCustomOrderCreatedEvent) {
    try {
      const tenantId = event.tenantId;
      const userId = event.userId;
      const payload = (event.payload ?? {}) as Partial<CustomOrderCreatedPayload>;
      const orderId = payload.orderId;

      if (!tenantId || !orderId) {
        this.logger.warn('Custom order event missing tenantId or orderId; no job order created.');
        return;
      }

      const marker = customOrderReferenceMarker(orderId);
      const existing = await this.prisma.jobOrder.findFirst({
        where: { tenantId, notes: { contains: marker } },
        select: { id: true, jobNumber: true },
      });
      if (existing) {
        this.logger.log(
          `Custom order ${orderId} already linked to job order ${existing.jobNumber}; skipping.`,
        );
        return;
      }

      if (!payload.productId || !payload.locationId) {
        this.logger.warn(
          `Custom order ${orderId} event has no productId/locationId; cannot create a draft job order. ` +
          `The retail event must include them.`,
        );
        return;
      }

      const noteLines = [
        marker,
        `Draft job order from custom order ${orderId}.`,
        payload.description ? `Description: ${payload.description}` : null,
        payload.targetWeightMg !== undefined ? `Target weight (mg): ${payload.targetWeightMg}` : null,
        payload.metalPurity ? `Metal purity: ${payload.metalPurity}` : null,
      ].filter((line): line is string => line !== null);

      const job = await this.manufacturingService.createJobOrder(tenantId, userId, {
        productId: payload.productId,
        locationId: payload.locationId,
        customerId: payload.customerId ?? null,
        bomId: null,
        priority: JobPriority.MEDIUM,
        quantity: 1,
        assignedKarigarId: null,
        estimatedStartDate: null,
        estimatedEndDate: null,
        notes: noteLines.join('\n'),
        specialInstructions: payload.description ?? null,
      });

      this.logger.log(`Created draft job order ${job.jobNumber} for custom order ${orderId}.`);
    } catch (error) {
      this.logger.error(
        `Failed to create draft job order for custom order ${event.payload?.orderId}: ${(error as Error).message}`,
      );
    }
  }

  private async handleStockAdjusted(event: InventoryStockAdjustedEvent) {
    this.logger.log(
      `Stock adjusted for product ${event.payload.productId} at location ${event.payload.locationId}. ` +
        `Checking material availability for pending jobs.`,
    );
    // In a full implementation, this could:
    // 1. Check pending job orders that need this material
    // 2. Update material availability status on those jobs
    // 3. Notify production if materials are now available
  }
}

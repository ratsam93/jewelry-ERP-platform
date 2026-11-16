// ─── HUID Management Service ──────────────────────────────────
// Register, verify, lookup, and enforce HUID on gold jewelry.

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../event-bus/event-bus.service';
import type {
  HuidRecordInput,
  HuidListInput,
  BulkHuidRegister,
} from '@caratflow/shared-types';
import type { PaginatedResult } from '@caratflow/shared-types';
import { isValidHuid } from '@caratflow/utils';
import { v4 as uuid } from 'uuid';

export type HuidEnforcementMode = 'block' | 'warn';

export type HuidSaleEligibilityReason =
  | 'PRODUCT_NOT_FOUND'
  | 'NOT_GOLD'
  | 'HUID_PRESENT'
  | 'HUID_MISSING';

export interface HuidSaleEligibility {
  productId: string;
  eligible: boolean;
  reason: HuidSaleEligibilityReason;
  huidNumber: string | null;
}

/**
 * Domain error raised when a sale must be stopped because gold items lack a
 * registered HUID. Callers on the sale path should let it propagate.
 */
export class HuidSaleBlockedError extends Error {
  readonly code = 'HUID_SALE_BLOCKED';
  readonly blockedItems: HuidSaleEligibility[];

  constructor(blockedItems: HuidSaleEligibility[]) {
    const ids = blockedItems.map((b) => b.productId).join(', ');
    super(`Sale blocked: gold product(s) without an active HUID: ${ids}`);
    this.name = 'HuidSaleBlockedError';
    this.blockedItems = blockedItems;
  }
}

/**
 * HUID_ENFORCEMENT env: 'block' stops gold sales without HUID; anything else
 * (including unset) is 'warn', which only logs.
 */
export function getHuidEnforcementMode(): HuidEnforcementMode {
  return process.env.HUID_ENFORCEMENT?.trim().toLowerCase() === 'block' ? 'block' : 'warn';
}

@Injectable()
export class ComplianceHuidService extends TenantAwareService {
  constructor(
    prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {
    super(prisma);
  }

  async register(tenantId: string, userId: string, input: HuidRecordInput) {
    const huid = input.huidNumber.toUpperCase();
    if (!isValidHuid(huid)) {
      throw new BadRequestException('Invalid HUID format. Must be 6 alphanumeric characters.');
    }

    // Check uniqueness within tenant
    const existing = await this.prisma.huidRecord.findFirst({
      where: this.tenantWhere(tenantId, { huidNumber: huid }),
    });
    if (existing) {
      throw new BadRequestException(`HUID ${huid} is already registered in this tenant.`);
    }

    // Verify product exists
    const product = await this.prisma.product.findFirst({
      where: this.tenantWhere(tenantId, { id: input.productId }),
    });
    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const record = await this.prisma.huidRecord.create({
      data: {
        id: uuid(),
        tenantId,
        productId: input.productId,
        huidNumber: huid,
        articleType: input.articleType,
        metalType: input.metalType,
        purityFineness: input.purityFineness,
        weightMg: BigInt(input.weightMg),
        hallmarkCenterId: input.hallmarkCenterId ?? null,
        registeredAt: input.registeredAt ?? new Date(),
        status: 'ACTIVE',
        createdBy: userId,
        updatedBy: userId,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    // Also update product huidNumber
    await this.prisma.product.update({
      where: { id: input.productId },
      data: { huidNumber: huid, updatedBy: userId },
    });

    await this.eventBus.publish({
      id: uuid(),
      tenantId,
      userId,
      timestamp: new Date().toISOString(),
      type: 'compliance.huid.registered',
      payload: { productId: input.productId, huidNumber: huid },
    });

    return this.serializeHuidRecord(record);
  }

  async bulkRegister(tenantId: string, userId: string, input: BulkHuidRegister) {
    const results: Array<{ huidNumber: string; success: boolean; error?: string; id?: string }> = [];

    for (const item of input.items) {
      try {
        const record = await this.register(tenantId, userId, item);
        results.push({ huidNumber: item.huidNumber, success: true, id: record.id as string });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ huidNumber: item.huidNumber, success: false, error: message });
      }
    }

    return results;
  }

  async verify(tenantId: string, huidNumber: string) {
    const huid = huidNumber.toUpperCase();
    if (!isValidHuid(huid)) {
      return { huidNumber: huid, isValid: false, message: 'Invalid HUID format.' };
    }

    const record = await this.prisma.huidRecord.findFirst({
      where: this.tenantWhere(tenantId, { huidNumber: huid }),
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    if (!record) {
      return { huidNumber: huid, isValid: false, message: 'HUID not found in registry.' };
    }

    return {
      huidNumber: huid,
      isValid: true,
      status: record.status,
      record: this.serializeHuidRecord(record),
    };
  }

  async findByProduct(tenantId: string, productId: string) {
    const records = await this.prisma.huidRecord.findMany({
      where: this.tenantWhere(tenantId, { productId }),
      include: { product: { select: { id: true, sku: true, name: true } } },
      orderBy: { registeredAt: 'desc' },
    });
    return records.map(this.serializeHuidRecord);
  }

  async findById(tenantId: string, id: string) {
    const record = await this.prisma.huidRecord.findFirst({
      where: this.tenantWhere(tenantId, { id }),
      include: {
        product: { select: { id: true, sku: true, name: true } },
        hallmarkCenter: true,
      },
    });
    if (!record) {
      throw new NotFoundException('HUID record not found.');
    }
    return this.serializeHuidRecord(record);
  }

  async list(tenantId: string, input: HuidListInput): Promise<PaginatedResult<unknown>> {
    const { page, limit, sortBy, sortOrder, status, search } = input;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { huidNumber: { contains: search } },
        { product: { name: { contains: search } } },
        { product: { sku: { contains: search } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.huidRecord.findMany({
        where,
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: { [sortBy ?? 'registeredAt']: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.huidRecord.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items: items.map(this.serializeHuidRecord),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  /**
   * Structured HUID eligibility check for a single product sale.
   * eligible=true when the product is not gold, or is gold with an ACTIVE HUID.
   */
  async checkSaleEligibility(tenantId: string, productId: string): Promise<HuidSaleEligibility> {
    const product = await this.prisma.product.findFirst({
      where: this.tenantWhere(tenantId, { id: productId }),
    });
    if (!product) {
      return { productId, eligible: false, reason: 'PRODUCT_NOT_FOUND', huidNumber: null };
    }

    // Only gold products require HUID
    if (product.productType !== 'GOLD') {
      return { productId, eligible: true, reason: 'NOT_GOLD', huidNumber: null };
    }

    const huid = await this.prisma.huidRecord.findFirst({
      where: this.tenantWhere(tenantId, { productId, status: 'ACTIVE' }),
    });
    if (!huid) {
      return { productId, eligible: false, reason: 'HUID_MISSING', huidNumber: null };
    }
    return {
      productId,
      eligible: true,
      reason: 'HUID_PRESENT',
      huidNumber: huid.huidNumber,
    };
  }

  /**
   * Throws HuidSaleBlockedError when the product cannot be sold under HUID rules.
   * Intended for the synchronous sale path (call before the sale is committed).
   */
  async assertSaleEligible(tenantId: string, productId: string): Promise<void> {
    const result = await this.checkSaleEligibility(tenantId, productId);
    if (!result.eligible) {
      throw new HuidSaleBlockedError([result]);
    }
  }

  /**
   * Boolean wrapper kept for existing callers. True when the product is sellable.
   */
  async enforceHuidOnSale(tenantId: string, productId: string): Promise<boolean> {
    const result = await this.checkSaleEligibility(tenantId, productId);
    return result.eligible;
  }

  async getCoverageReport(tenantId: string) {
    const [totalGoldProducts, productsWithHuid] = await Promise.all([
      this.prisma.product.count({
        where: this.tenantWhere(tenantId, { productType: 'GOLD', isActive: true }),
      }),
      this.prisma.huidRecord.count({
        where: this.tenantWhere(tenantId, { status: 'ACTIVE' }),
      }),
    ]);

    const coveragePercent = totalGoldProducts > 0
      ? Math.round((productsWithHuid / totalGoldProducts) * 10000) / 100
      : 100;

    return {
      totalGoldProducts,
      productsWithHuid,
      coveragePercent,
    };
  }

  private serializeHuidRecord(record: Record<string, unknown>): Record<string, unknown> {
    return {
      ...record,
      weightMg: record.weightMg ? Number(record.weightMg) : 0,
    };
  }
}

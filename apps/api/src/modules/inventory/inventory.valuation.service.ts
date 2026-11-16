// ─── Inventory Valuation Service ──────────────────────────────
// Calculates stock value using different valuation methods. FIFO / AVG / LAST_PURCHASE /
// GROSS_PROFIT are derived from stock-movement cost layers (StockMovement.unitCostPaise),
// falling back to product cost price only when no movement carries cost data.

import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import type { StockValuationRequest } from '@caratflow/shared-types';

interface ValuationItem {
  productId: string;
  productName: string;
  sku: string;
  category: string | null;
  quantity: number;
  unitValuePaise: bigint;
  totalValuePaise: bigint;
}

interface StockItemWithCost {
  productId: string;
  quantityOnHand: number;
  product: {
    name: string;
    sku: string;
    costPricePaise?: bigint | number | null;
    sellingPricePaise?: bigint | number | null;
    category?: { name: string } | null;
  };
  movements?: CostMovement[];
}

interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  totalValuePaise: bigint;
  itemCount: number;
}


// ─── Cost-layer helpers (pure, exported for tests) ────────────

export interface CostMovement {
  quantityChange: number;
  unitCostPaise?: bigint | number | null;
  movedAt: Date;
}

interface CostLayer {
  qty: number;
  unitCost: bigint;
}

export interface CostResult {
  unitCostPaise: bigint;
  totalValuePaise: bigint;
  /** true when value was derived from movement cost data; false => product cost fallback */
  fromMovements: boolean;
}

function hasCostData(movements: CostMovement[]): boolean {
  return movements.some((m) => m.quantityChange > 0 && m.unitCostPaise != null);
}

function sortedMovements(movements: CostMovement[]): CostMovement[] {
  return [...movements].sort((a, b) => new Date(a.movedAt).getTime() - new Date(b.movedAt).getTime());
}

function fallbackResult(fallbackUnitCost: bigint, onHand: number): CostResult {
  return {
    unitCostPaise: fallbackUnitCost,
    totalValuePaise: fallbackUnitCost * BigInt(onHand),
    fromMovements: false,
  };
}

/**
 * FIFO: receipts form cost layers (oldest first); issues consume from the oldest layer.
 * Receipts with no recorded cost use the product cost price. If the layers do not add up
 * to quantityOnHand (e.g. opening stock without movements) the shortfall is valued at the
 * fallback cost and any excess is trimmed from the oldest layers.
 */
export function computeFifoCost(
  movements: CostMovement[],
  onHand: number,
  fallbackUnitCost: bigint,
): CostResult {
  if (!hasCostData(movements)) return fallbackResult(fallbackUnitCost, onHand);

  const layers: CostLayer[] = [];
  for (const m of sortedMovements(movements)) {
    if (m.quantityChange > 0) {
      layers.push({
        qty: m.quantityChange,
        unitCost: m.unitCostPaise != null ? BigInt(m.unitCostPaise) : fallbackUnitCost,
      });
    } else if (m.quantityChange < 0) {
      let toConsume = -m.quantityChange;
      while (toConsume > 0 && layers.length > 0) {
        const head = layers[0]!;
        const take = Math.min(head.qty, toConsume);
        head.qty -= take;
        toConsume -= take;
        if (head.qty === 0) layers.shift();
      }
    }
  }

  let layerQty = layers.reduce((sum, l) => sum + l.qty, 0);
  while (layerQty > onHand && layers.length > 0) {
    const head = layers[0]!;
    const take = Math.min(head.qty, layerQty - onHand);
    head.qty -= take;
    layerQty -= take;
    if (head.qty === 0) layers.shift();
  }
  if (layerQty < onHand) layers.push({ qty: onHand - layerQty, unitCost: fallbackUnitCost });

  const total = layers.reduce((sum, l) => sum + l.unitCost * BigInt(l.qty), 0n);
  return {
    unitCostPaise: onHand > 0 ? total / BigInt(onHand) : 0n,
    totalValuePaise: total,
    fromMovements: true,
  };
}

/**
 * Moving weighted average: each receipt re-averages the unit cost, issues are taken out at
 * the current average. Final value = average unit cost x quantity on hand.
 */
export function computeAverageCost(
  movements: CostMovement[],
  onHand: number,
  fallbackUnitCost: bigint,
): CostResult {
  if (!hasCostData(movements)) return fallbackResult(fallbackUnitCost, onHand);

  let qty = 0;
  let value = 0n;
  for (const m of sortedMovements(movements)) {
    if (m.quantityChange > 0) {
      const cost = m.unitCostPaise != null ? BigInt(m.unitCostPaise) : fallbackUnitCost;
      qty += m.quantityChange;
      value += cost * BigInt(m.quantityChange);
    } else if (m.quantityChange < 0 && qty > 0) {
      const out = Math.min(-m.quantityChange, qty);
      value -= (value * BigInt(out)) / BigInt(qty);
      qty -= out;
    }
  }

  const unit = qty > 0 ? value / BigInt(qty) : fallbackUnitCost;
  return { unitCostPaise: unit, totalValuePaise: unit * BigInt(onHand), fromMovements: true };
}

/** Last purchase: unit cost of the most recent costed receipt x quantity on hand. */
export function computeLastPurchaseCost(
  movements: CostMovement[],
  onHand: number,
  fallbackUnitCost: bigint,
): CostResult {
  const receipts = sortedMovements(movements).filter(
    (m) => m.quantityChange > 0 && m.unitCostPaise != null,
  );
  if (receipts.length === 0) return fallbackResult(fallbackUnitCost, onHand);
  const unit = BigInt(receipts[receipts.length - 1]!.unitCostPaise as bigint | number);
  return { unitCostPaise: unit, totalValuePaise: unit * BigInt(onHand), fromMovements: true };
}

/**
 * Gross-profit (retail) method: stock is taken at selling price less the average gross
 * margin of the whole inventory. marginBps = (sum(sell) - sum(cost)) / sum(sell) * 10000,
 * computed across items that have both prices; value = sell x (10000 - marginBps) / 10000.
 */
export function computeAverageMarginBps(
  rows: Array<{ quantity: number; sellingPricePaise: bigint; costUnitPaise: bigint }>,
): bigint {
  let sell = 0n;
  let cost = 0n;
  for (const r of rows) {
    if (r.sellingPricePaise > 0n && r.costUnitPaise > 0n && r.quantity > 0) {
      sell += r.sellingPricePaise * BigInt(r.quantity);
      cost += r.costUnitPaise * BigInt(r.quantity);
    }
  }
  if (sell === 0n) return 0n;
  return ((sell - cost) * 10000n) / sell;
}

@Injectable()
export class InventoryValuationService extends TenantAwareService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async calculateValuation(tenantId: string, input: StockValuationRequest) {
    switch (input.method) {
      case 'FIFO':
        return this.calculateFIFO(tenantId, input.locationId ?? null);
      case 'AVG':
        return this.calculateWeightedAverage(tenantId, input.locationId ?? null);
      case 'LAST_PURCHASE':
        return this.calculateLastPurchase(tenantId, input.locationId ?? null);
      case 'GROSS_PROFIT':
        return this.calculateGrossProfit(tenantId, input.locationId ?? null);
      case 'MARKET':
        return this.calculateMarketValue(tenantId, input.locationId ?? null, input.currentRatePaise ?? 0n);
      default:
        return this.calculateWeightedAverage(tenantId, input.locationId ?? null);
    }
  }

  private toValuationItem(
    si: StockItemWithCost,
    cost: CostResult,
  ): ValuationItem {
    return {
      productId: si.productId,
      productName: si.product.name,
      sku: si.product.sku,
      category: si.product.category?.name ?? null,
      quantity: si.quantityOnHand,
      unitValuePaise: cost.unitCostPaise,
      totalValuePaise: cost.totalValuePaise,
    };
  }

  private productCost(si: StockItemWithCost): bigint {
    return si.product.costPricePaise ? BigInt(si.product.costPricePaise) : 0n;
  }

  async calculateFIFO(tenantId: string, locationId: string | null) {
    const stockItems = await this.getStockItemsWithMovements(tenantId, locationId);
    const items = stockItems.map((si) =>
      this.toValuationItem(si, computeFifoCost(si.movements ?? [], si.quantityOnHand, this.productCost(si))),
    );
    return this.buildValuationResponse('FIFO', locationId, items);
  }

  async calculateWeightedAverage(tenantId: string, locationId: string | null) {
    const stockItems = await this.getStockItemsWithMovements(tenantId, locationId);
    const items = stockItems.map((si) =>
      this.toValuationItem(si, computeAverageCost(si.movements ?? [], si.quantityOnHand, this.productCost(si))),
    );
    return this.buildValuationResponse('AVG', locationId, items);
  }

  async calculateLastPurchase(tenantId: string, locationId: string | null) {
    const stockItems = await this.getStockItemsWithMovements(tenantId, locationId);
    const items = stockItems.map((si) =>
      this.toValuationItem(si, computeLastPurchaseCost(si.movements ?? [], si.quantityOnHand, this.productCost(si))),
    );
    return this.buildValuationResponse('LAST_PURCHASE', locationId, items);
  }

  async calculateGrossProfit(tenantId: string, locationId: string | null) {
    const stockItems = await this.getStockItemsWithMovements(tenantId, locationId);

    // Cost basis per item = movement-derived weighted average (fallback: product cost price).
    const costs = stockItems.map((si) =>
      computeAverageCost(si.movements ?? [], si.quantityOnHand, this.productCost(si)),
    );
    const marginBps = computeAverageMarginBps(
      stockItems.map((si, i) => ({
        quantity: si.quantityOnHand,
        sellingPricePaise: si.product.sellingPricePaise ? BigInt(si.product.sellingPricePaise) : 0n,
        costUnitPaise: costs[i]!.unitCostPaise,
      })),
    );

    const items = stockItems.map((si, i) => {
      const selling = si.product.sellingPricePaise ? BigInt(si.product.sellingPricePaise) : 0n;
      if (selling > 0n) {
        const unit = (selling * (10000n - marginBps)) / 10000n;
        return this.toValuationItem(si, {
          unitCostPaise: unit,
          totalValuePaise: unit * BigInt(si.quantityOnHand),
          fromMovements: costs[i]!.fromMovements,
        });
      }
      // No selling price: cannot apply retail method, use cost basis.
      return this.toValuationItem(si, costs[i]!);
    });

    return this.buildValuationResponse('GROSS_PROFIT', locationId, items);
  }

  async calculateMarketValue(tenantId: string, locationId: string | null, currentRatePaise: bigint) {
    const stockItems = await this.getStockItemsWithMovements(tenantId, locationId);
    const items: ValuationItem[] = [];

    for (const si of stockItems) {
      // Market value: use current market rate for metal-based products
      let unitValue: bigint;
      if (currentRatePaise > 0n && si.product.metalWeightMg) {
        // Value = (metalWeightMg / 1000) * (purity / 1000) * ratePerGram
        const weightG = Number(si.product.metalWeightMg) / 1000;
        const purityFactor = (si.product.metalPurity ?? 999) / 1000;
        unitValue = BigInt(Math.round(weightG * purityFactor * Number(currentRatePaise)));
      } else {
        unitValue = si.product.sellingPricePaise ? BigInt(si.product.sellingPricePaise) : 0n;
      }

      items.push({
        productId: si.productId,
        productName: si.product.name,
        sku: si.product.sku,
        category: si.product.category?.name ?? null,
        quantity: si.quantityOnHand,
        unitValuePaise: unitValue,
        totalValuePaise: unitValue * BigInt(si.quantityOnHand),
      });
    }

    return this.buildValuationResponse('MARKET', locationId, items);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getStockItemsWithMovements(tenantId: string, locationId: string | null) {
    const where: Record<string, unknown> = { tenantId };
    if (locationId) where.locationId = locationId;

    return this.prisma.stockItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            costPricePaise: true,
            sellingPricePaise: true,
            metalWeightMg: true,
            metalPurity: true,
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
        },
        movements: {
          orderBy: { movedAt: 'asc' },
        },
      },
    });
  }

  private buildValuationResponse(
    method: string,
    locationId: string | null,
    items: ValuationItem[],
  ) {
    const totalValuePaise = items.reduce((sum, item) => sum + item.totalValuePaise, 0n);

    // Category breakdown
    const categoryMap = new Map<string | null, { categoryName: string; totalValuePaise: bigint; itemCount: number }>();
    for (const item of items) {
      const key = item.category;
      const existing = categoryMap.get(key) ?? {
        categoryName: key ?? 'Uncategorized',
        totalValuePaise: 0n,
        itemCount: 0,
      };
      existing.totalValuePaise += item.totalValuePaise;
      existing.itemCount += 1;
      categoryMap.set(key, existing);
    }

    const categoryBreakdown: CategoryBreakdownItem[] = Array.from(categoryMap.entries()).map(
      ([categoryId, data]) => ({
        categoryId,
        ...data,
      }),
    );

    return {
      method,
      locationId,
      totalValuePaise,
      items,
      categoryBreakdown,
      generatedAt: new Date(),
    };
  }
}

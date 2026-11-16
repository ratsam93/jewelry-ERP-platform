// ─── Retail Pricing Engine ─────────────────────────────────────
// Handles jewelry pricing: metal rate * weight + making + wastage + GST.

import { Injectable } from '@nestjs/common';
import type { SaleLineItemInput, PricingCalculation, DiscountValidation } from '@caratflow/shared-types';
import { IndianGstCalculator } from '@caratflow/utils';
import { PrismaService } from '../../common/prisma.service';
import { TenantAwareService } from '../../common/base.service';

interface TaxParams {
  sourceState: string;
  destinationState: string;
}

export interface DiscountCartItem {
  productId?: string | null;
  quantity: number;
  unitPricePaise: number;
}

interface LineItemWithTax {
  item: SaleLineItemInput;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lineTotalPaise: number;
}

/** Jewelry (HSN 7113) metal GST: 3%, stored as percent * 100. */
const JEWELRY_GST_RATE = 300n;
/** GST on making charges (job work / service): 5%, stored as percent * 100. */
const MAKING_CHARGES_GST_RATE = 500n;

/** Integer division rounding half up (non-negative operands). */
function roundDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

@Injectable()
export class RetailPricingService extends TenantAwareService {
  private readonly gstCalc = new IndianGstCalculator();

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Calculate price for a single line item based on metal rate, weight,
   * making charges, and wastage.
   * Formula: (metalRatePaisePerGram * weightInGrams) + makingCharges + wastageCharges
   */
  calculateLineItemPrice(
    metalRatePaisePerGram: number,
    metalWeightMg: number,
    makingChargesPaise: number,
    wastageChargesPaise: number,
    quantity: number,
  ): PricingCalculation {
    // Convert mg to grams for calculation, then back to paise
    const weightInGrams = metalWeightMg / 1000;
    const metalValuePaise = Math.round(metalRatePaisePerGram * weightInGrams);

    const subtotalPaise = (metalValuePaise + makingChargesPaise + wastageChargesPaise) * quantity;

    return {
      metalRatePaisePerGram,
      metalWeightMg,
      metalValuePaise,
      makingChargesPaise,
      wastageChargesPaise,
      subtotalPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalTaxPaise: 0,
      totalPaise: subtotalPaise,
    };
  }

  /**
   * Calculate GST for a set of line items.
   * Jewelry HSN 7113 = 3% GST.
   * Making charges = 5% GST: when an item carries makingChargesPaise and the
   * item rate is the 3% jewelry rate, the making portion is taxed at 5% and the
   * rest at 3% (discount apportioned pro-rata). Integer (BigInt) math only.
   * Intra-state: CGST + SGST. Inter-state: IGST.
   */
  calculateTax(
    lineItems: SaleLineItemInput[],
    taxParams: TaxParams,
  ): LineItemWithTax[] {
    const isInterState = IndianGstCalculator.isInterState(
      taxParams.sourceState,
      taxParams.destinationState,
    );

    return lineItems.map((item) => {
      const quantity = BigInt(item.quantity);
      const baseAmount = BigInt(item.unitPricePaise) * quantity;
      const discountAmount = BigInt(item.discountPaise ?? 0);
      const taxable = baseAmount - discountAmount;

      // GST rate from item (stored as percent * 100, e.g. 300 = 3%)
      const itemRate = BigInt(item.gstRate ?? 300);

      // Jewelry (3% metal rate): making charges are a service and attract 5%.
      // The line's discount is apportioned pro-rata between metal and making.
      let makingTaxable = 0n;
      const makingGross = BigInt(item.makingChargesPaise ?? 0) * quantity;
      if (itemRate === JEWELRY_GST_RATE && makingGross > 0n && baseAmount > 0n) {
        const cappedMaking = makingGross > baseAmount ? baseAmount : makingGross;
        makingTaxable = cappedMaking - (discountAmount * cappedMaking) / baseAmount;
        if (makingTaxable > taxable) makingTaxable = taxable;
        if (makingTaxable < 0n) makingTaxable = 0n;
      }
      const metalTaxable = taxable - makingTaxable;
      const makingRate = makingTaxable > 0n ? MAKING_CHARGES_GST_RATE : itemRate;

      // Tax numerators over a denominator of 10000 (rate is percent * 100)
      const totalNumerator = metalTaxable * itemRate + makingTaxable * makingRate;

      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;

      if (isInterState) {
        igstPaise = Number(roundDiv(totalNumerator, 10000n));
      } else {
        // each half = numerator / 2 / 10000
        const half = Number(roundDiv(totalNumerator, 20000n));
        cgstPaise = half;
        sgstPaise = half;
      }

      const totalTax = cgstPaise + sgstPaise + igstPaise;
      const lineTotalPaise = Number(taxable) + totalTax;

      return {
        item,
        cgstPaise,
        sgstPaise,
        igstPaise,
        lineTotalPaise,
      };
    });
  }

  /**
   * Apply a discount to line items. Validates the discount rules first.
   */
  async applyDiscount(
    tenantId: string,
    discountId: string,
    subtotalPaise: number,
    productIds: string[],
    cartItems?: DiscountCartItem[],
  ): Promise<DiscountValidation> {
    const discount = await this.prisma.discount.findFirst({
      where: this.tenantWhere(tenantId, { id: discountId }),
    });

    if (!discount) {
      return { discountId, isValid: false, applicableAmount: 0, reason: 'Discount not found' };
    }

    const now = new Date();
    if (!discount.isActive || now < discount.startDate || now > discount.endDate) {
      return { discountId, isValid: false, applicableAmount: 0, reason: 'Discount is inactive or expired' };
    }

    if (discount.usageLimit && discount.usedCount >= discount.usageLimit) {
      return { discountId, isValid: false, applicableAmount: 0, reason: 'Discount usage limit reached' };
    }

    if (discount.minPurchasePaise && subtotalPaise < Number(discount.minPurchasePaise)) {
      return { discountId, isValid: false, applicableAmount: 0, reason: 'Minimum purchase amount not met' };
    }

    // Check applicable categories/products
    const applicableProducts = discount.applicableProducts as string[] | null;
    if (applicableProducts && applicableProducts.length > 0) {
      const hasApplicable = productIds.some((id) => applicableProducts.includes(id));
      if (!hasApplicable) {
        return { discountId, isValid: false, applicableAmount: 0, reason: 'No applicable products in cart' };
      }
    }

    let applicableAmount = 0;
    switch (discount.discountType) {
      case 'PERCENTAGE':
        applicableAmount = Math.round((subtotalPaise * discount.value) / 10000);
        break;
      case 'FIXED':
        applicableAmount = discount.value;
        break;
      case 'BUY_X_GET_Y': {
        const rule = this.computeBuyXGetYDiscount(
          {
            buyQuantity: (discount as { buyQuantity?: number | null }).buyQuantity ?? null,
            getQuantity: (discount as { getQuantity?: number | null }).getQuantity ?? null,
            applicableProducts,
          },
          cartItems ?? [],
        );
        if (!rule.isConfigured) {
          return { discountId, isValid: false, applicableAmount: 0, reason: 'Buy X Get Y rule is not configured' };
        }
        if (rule.freeUnits === 0) {
          return { discountId, isValid: false, applicableAmount: 0, reason: 'Cart does not satisfy the Buy X Get Y quantity' };
        }
        applicableAmount = rule.discountPaise;
        break;
      }
    }

    // Cap at maximum discount if set
    if (discount.maxDiscountPaise && applicableAmount > Number(discount.maxDiscountPaise)) {
      applicableAmount = Number(discount.maxDiscountPaise);
    }

    return { discountId, isValid: true, applicableAmount };
  }

  /**
   * Buy X Get Y: for every (X + Y) qualifying units in the cart, the Y cheapest
   * units are free. Qualifying = in applicableProducts (or all items if unset).
   * Pure integer math in paise.
   */
  computeBuyXGetYDiscount(
    rule: { buyQuantity: number | null; getQuantity: number | null; applicableProducts: string[] | null },
    cartItems: DiscountCartItem[],
  ): { isConfigured: boolean; freeUnits: number; discountPaise: number } {
    const buy = rule.buyQuantity ?? 0;
    const get = rule.getQuantity ?? 0;
    if (!Number.isInteger(buy) || !Number.isInteger(get) || buy < 1 || get < 1) {
      return { isConfigured: false, freeUnits: 0, discountPaise: 0 };
    }

    const restrict = rule.applicableProducts && rule.applicableProducts.length > 0 ? rule.applicableProducts : null;
    const unitPrices: number[] = [];
    for (const ci of cartItems) {
      if (restrict && (!ci.productId || !restrict.includes(ci.productId))) continue;
      for (let i = 0; i < ci.quantity; i++) unitPrices.push(ci.unitPricePaise);
    }

    const groupSize = buy + get;
    const freeUnits = Math.floor(unitPrices.length / groupSize) * get;
    unitPrices.sort((a, b) => a - b);
    const discountPaise = unitPrices.slice(0, freeUnits).reduce((sum, p) => sum + p, 0);
    return { isConfigured: true, freeUnits, discountPaise };
  }

  /**
   * Calculate the complete total for a sale: subtotal, discount, tax, roundoff, grand total.
   */
  calculateTotal(
    lineItemsWithTax: LineItemWithTax[],
    discountPaise: number,
  ): {
    subtotalPaise: number;
    discountPaise: number;
    taxPaise: number;
    roundOffPaise: number;
    totalPaise: number;
  } {
    let subtotalPaise = 0;
    let taxPaise = 0;

    for (const li of lineItemsWithTax) {
      const baseAmount = Number(li.item.unitPricePaise) * li.item.quantity;
      const itemDiscount = Number(li.item.discountPaise ?? 0);
      subtotalPaise += baseAmount - itemDiscount;
      taxPaise += li.cgstPaise + li.sgstPaise + li.igstPaise;
    }

    const beforeRoundOff = subtotalPaise - discountPaise + taxPaise;

    // Round to nearest rupee (100 paise)
    const roundedTotal = Math.round(beforeRoundOff / 100) * 100;
    const roundOffPaise = roundedTotal - beforeRoundOff;

    return {
      subtotalPaise,
      discountPaise,
      taxPaise,
      roundOffPaise,
      totalPaise: roundedTotal,
    };
  }
}

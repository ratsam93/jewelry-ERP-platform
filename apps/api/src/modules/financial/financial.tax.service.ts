// ─── Financial Tax Service ─────────────────────────────────────
// GST computation, TDS/TCS tracking, GSTR-1 / GSTR-3B generation.

import { Injectable } from '@nestjs/common';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import { splitInvoiceGst } from './financial.gst-split';
import type {
  GstComputationInput,
  GstComputationResult,
  TaxReportInput,
  Gstr1Data,
  Gstr3bData,
} from '@caratflow/shared-types';

@Injectable()
export class FinancialTaxService extends TenantAwareService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // ─── GST Computation ─────────────────────────────────────────

  computeGst(input: GstComputationInput): GstComputationResult {
    const { taxableAmountPaise, gstRate, sourceState, destState } = input;
    const isInterState = sourceState.toUpperCase() !== destState.toUpperCase();
    const ratePercent = gstRate / 100;

    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;

    if (isInterState) {
      igstRate = gstRate;
      igstPaise = Math.round((taxableAmountPaise * ratePercent) / 100);
    } else {
      const halfRate = ratePercent / 2;
      cgstRate = gstRate / 2;
      sgstRate = gstRate / 2;
      cgstPaise = Math.round((taxableAmountPaise * halfRate) / 100);
      sgstPaise = Math.round((taxableAmountPaise * halfRate) / 100);
    }

    return {
      taxableAmountPaise,
      cgstRate,
      sgstRate,
      igstRate,
      cgstPaise,
      sgstPaise,
      igstPaise,
      totalTaxPaise: cgstPaise + sgstPaise + igstPaise,
      isInterState,
    };
  }

  // ─── TDS Computation (Section 194Q) ───────────────────────────

  async computeTds(
    tenantId: string,
    supplierId: string,
    purchaseAmountPaise: number,
    financialYearStart: Date,
    financialYearEnd: Date,
    hasPan: boolean,
  ) {
    const THRESHOLD_PAISE = 5_000_000_00; // Rs. 50 lakh

    // Get cumulative purchase amount from this supplier in the FY
    const cumulativeResult = await this.prisma.invoice.aggregate({
      _sum: { totalPaise: true },
      where: {
        tenantId,
        supplierId,
        invoiceType: 'PURCHASE',
        status: { not: 'VOIDED' },
        createdAt: { gte: financialYearStart, lte: financialYearEnd },
      },
    });

    const cumulativePurchasePaise = Number(cumulativeResult._sum.totalPaise ?? 0);
    if (cumulativePurchasePaise + purchaseAmountPaise <= THRESHOLD_PAISE) {
      return { tdsAmountPaise: 0, isApplicable: false, cumulativePurchasePaise };
    }

    const rate = hasPan ? 0.1 : 5; // 0.1% with PAN, 5% without
    const tdsAmountPaise = Math.round((purchaseAmountPaise * rate) / 100);

    return { tdsAmountPaise, isApplicable: true, cumulativePurchasePaise };
  }

  // ─── TCS Computation (Section 206C) ───────────────────────────

  async computeTcs(
    tenantId: string,
    customerId: string,
    saleAmountPaise: number,
    financialYearStart: Date,
    financialYearEnd: Date,
    hasPan: boolean,
  ) {
    const THRESHOLD_PAISE = 5_000_000_00; // Rs. 50 lakh

    const cumulativeResult = await this.prisma.invoice.aggregate({
      _sum: { totalPaise: true },
      where: {
        tenantId,
        customerId,
        invoiceType: 'SALES',
        status: { not: 'VOIDED' },
        createdAt: { gte: financialYearStart, lte: financialYearEnd },
      },
    });

    const cumulativeSalePaise = Number(cumulativeResult._sum.totalPaise ?? 0);
    if (cumulativeSalePaise + saleAmountPaise <= THRESHOLD_PAISE) {
      return { tcsAmountPaise: 0, isApplicable: false, cumulativeSalePaise };
    }

    const rate = hasPan ? 0.1 : 1; // 0.1% with PAN, 1% without
    const tcsAmountPaise = Math.round((saleAmountPaise * rate) / 100);

    return { tcsAmountPaise, isApplicable: true, cumulativeSalePaise };
  }

  // ─── GSTR-1 Data Generation ───────────────────────────────────

  async generateGstr1Data(tenantId: string, input: TaxReportInput): Promise<Gstr1Data> {
    const { month, year } = input.period;
    // Half-open [first of month, first of next month): includes the whole
    // last day (no lte-with-midnight bug).
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        invoiceType: 'SALES',
        status: { not: 'VOIDED' },
        createdAt: { gte: startDate, lt: endDate },
      },
      include: {
        // narrow select: GSTR-1 needs buyer GSTIN + state only (no PAN / Aadhaar)
        customer: { select: { id: true, firstName: true, lastName: true, gstinNumber: true, state: true } },
        location: true,
        lineItems: true,
        taxTransactions: true,
      },
    });

    // B2B: Sales to registered dealers (with GSTIN)
    const b2bMap = new Map<string, Array<{
      invoiceNumber: string;
      invoiceDate: string;
      totalPaise: number;
      taxableAmountPaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
    }>>();

    // B2C: Sales to unregistered buyers
    const b2c: Array<{
      invoiceNumber: string;
      invoiceDate: string;
      totalPaise: number;
      taxableAmountPaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
    }> = [];

    // HSN summary
    const hsnMap = new Map<string, {
      description: string;
      quantity: number;
      taxableAmountPaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
      cessPaise: number;
    }>();

    let totalTaxableAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const invoice of invoices) {
      const split = splitInvoiceGst({
        subtotalPaise: invoice.subtotalPaise,
        discountPaise: invoice.discountPaise,
        taxPaise: invoice.taxPaise,
        taxTransactions: invoice.taxTransactions,
        lineItems: invoice.lineItems,
        partyState: invoice.customer?.state,
        locationState: invoice.location?.state,
      });
      const taxableAmount = split.taxableAmountPaise;
      const cgst = split.cgstPaise;
      const sgst = split.sgstPaise;
      const igst = split.igstPaise;

      totalTaxableAmount += taxableAmount;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toISOString().split('T')[0]!,
        totalPaise: Number(invoice.totalPaise),
        taxableAmountPaise: taxableAmount,
        cgstPaise: cgst,
        sgstPaise: sgst,
        igstPaise: igst,
      };

      const gstin = invoice.customer?.gstinNumber;
      if (gstin) {
        if (!b2bMap.has(gstin)) b2bMap.set(gstin, []);
        b2bMap.get(gstin)!.push(invoiceData);
      } else {
        b2c.push(invoiceData);
      }

      // HSN summary. Invoices without stored lines are reported at invoice
      // level under the default jewellery HSN so the summary reconciles.
      if (invoice.lineItems.length === 0 && taxableAmount > 0) {
        const hsn = '7113';
        const existing = hsnMap.get(hsn);
        if (existing) {
          existing.taxableAmountPaise += taxableAmount;
          existing.cgstPaise += cgst;
          existing.sgstPaise += sgst;
          existing.igstPaise += igst;
        } else {
          hsnMap.set(hsn, {
            description: 'Jewellery (invoice level)',
            quantity: 0,
            taxableAmountPaise: taxableAmount,
            cgstPaise: cgst,
            sgstPaise: sgst,
            igstPaise: igst,
            cessPaise: 0,
          });
        }
      }
      for (const line of invoice.lineItems) {
        const hsn = line.hsnCode;
        const existing = hsnMap.get(hsn);
        if (existing) {
          existing.quantity += line.quantity;
          existing.taxableAmountPaise += Number(line.taxableAmountPaise);
          existing.cgstPaise += Number(line.cgstPaise);
          existing.sgstPaise += Number(line.sgstPaise);
          existing.igstPaise += Number(line.igstPaise);
        } else {
          hsnMap.set(hsn, {
            description: line.description,
            quantity: line.quantity,
            taxableAmountPaise: Number(line.taxableAmountPaise),
            cgstPaise: Number(line.cgstPaise),
            sgstPaise: Number(line.sgstPaise),
            igstPaise: Number(line.igstPaise),
            cessPaise: 0,
          });
        }
      }
    }

    const b2b = Array.from(b2bMap.entries()).map(([gstin, invs]) => ({
      gstin,
      invoices: invs,
    }));

    const hsnSummary = Array.from(hsnMap.entries()).map(([hsnCode, data]) => ({
      hsnCode,
      ...data,
      totalTaxPaise: data.cgstPaise + data.sgstPaise + data.igstPaise + data.cessPaise,
    }));

    return {
      period: `${month.toString().padStart(2, '0')}-${year}`,
      b2b,
      b2c,
      hsnSummary,
      totalTaxableAmount,
      totalCgst,
      totalSgst,
      totalIgst,
    };
  }

  // ─── GSTR-3B Data Generation ──────────────────────────────────

  async generateGstr3bData(tenantId: string, input: TaxReportInput): Promise<Gstr3bData> {
    const { month, year } = input.period;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1); // exclusive: whole last day included

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        invoiceType: { in: ['SALES', 'PURCHASE'] },
        status: { not: 'VOIDED' },
        createdAt: { gte: startDate, lt: endDate },
      },
      include: {
        // narrow select: GST summary only needs the party state
        customer: { select: { state: true } },
        supplier: { select: { state: true } },
        location: true,
        lineItems: true,
        taxTransactions: true,
      },
    });

    const zero = () => ({ taxableAmountPaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0 });
    const out = zero();
    const inn = zero();
    for (const inv of invoices) {
      const split = splitInvoiceGst({
        subtotalPaise: inv.subtotalPaise,
        discountPaise: inv.discountPaise,
        taxPaise: inv.taxPaise,
        taxTransactions: inv.taxTransactions,
        lineItems: inv.lineItems,
        partyState: inv.invoiceType === 'SALES' ? inv.customer?.state : inv.supplier?.state,
        locationState: inv.location?.state,
      });
      const bucket = inv.invoiceType === 'SALES' ? out : inn;
      bucket.taxableAmountPaise += split.taxableAmountPaise;
      bucket.igstPaise += split.igstPaise;
      bucket.cgstPaise += split.cgstPaise;
      bucket.sgstPaise += split.sgstPaise;
    }

    const outIgst = out.igstPaise;
    const outCgst = out.cgstPaise;
    const outSgst = out.sgstPaise;
    const inIgst = inn.igstPaise;
    const inCgst = inn.cgstPaise;
    const inSgst = inn.sgstPaise;

    return {
      period: `${month.toString().padStart(2, '0')}-${year}`,
      outwardSupplies: {
        taxableAmountPaise: out.taxableAmountPaise,
        igstPaise: outIgst,
        cgstPaise: outCgst,
        sgstPaise: outSgst,
        cessPaise: 0,
      },
      inwardSupplies: {
        taxableAmountPaise: inn.taxableAmountPaise,
        igstPaise: inIgst,
        cgstPaise: inCgst,
        sgstPaise: inSgst,
        cessPaise: 0,
      },
      itcAvailable: {
        igstPaise: inIgst,
        cgstPaise: inCgst,
        sgstPaise: inSgst,
        cessPaise: 0,
      },
      taxPayable: {
        igstPaise: Math.max(0, outIgst - inIgst),
        cgstPaise: Math.max(0, outCgst - inCgst),
        sgstPaise: Math.max(0, outSgst - inSgst),
        cessPaise: 0,
      },
    };
  }

  // ─── Tax Liability ────────────────────────────────────────────

  async getTaxLiability(tenantId: string, period: { month: number; year: number }) {
    const gstr3b = await this.generateGstr3bData(tenantId, { period });
    return {
      period: gstr3b.period,
      igstPayable: gstr3b.taxPayable.igstPaise,
      cgstPayable: gstr3b.taxPayable.cgstPaise,
      sgstPayable: gstr3b.taxPayable.sgstPaise,
      cessPayable: gstr3b.taxPayable.cessPaise,
      totalPayable:
        gstr3b.taxPayable.igstPaise +
        gstr3b.taxPayable.cgstPaise +
        gstr3b.taxPayable.sgstPaise +
        gstr3b.taxPayable.cessPaise,
    };
  }
}

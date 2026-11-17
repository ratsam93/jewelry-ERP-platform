// ─── CaratFlow Wholesale Types ─────────────────────────────────
// Types for purchase orders, goods receipts, consignments (in/out),
// agents/brokers, credit limits, outstanding balances, rate contracts.

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────

export enum WholesalePOStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum WholesaleGRStatus {
  DRAFT = 'DRAFT',
  INSPECTED = 'INSPECTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum WholesaleConsignmentOutStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
  RETURNED = 'RETURNED',
  CONVERTED_TO_SALE = 'CONVERTED_TO_SALE',
  EXPIRED = 'EXPIRED',
}

export enum WholesaleConsignmentOutItemStatus {
  ISSUED = 'ISSUED',
  RETURNED = 'RETURNED',
  SOLD = 'SOLD',
}

export enum WholesaleConsignmentInStatus {
  RECEIVED = 'RECEIVED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
  RETURNED = 'RETURNED',
  PURCHASED = 'PURCHASED',
  EXPIRED = 'EXPIRED',
}

export enum WholesaleConsignmentInItemStatus {
  RECEIVED = 'RECEIVED',
  RETURNED = 'RETURNED',
  PURCHASED = 'PURCHASED',
}

export enum WholesaleCommissionType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_PER_PIECE = 'FIXED_PER_PIECE',
  FIXED_PER_WEIGHT = 'FIXED_PER_WEIGHT',
}

export enum WholesaleCommissionRefType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
}

export enum WholesaleCommissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

export enum WholesaleCreditEntityType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
}

export enum WholesaleOutstandingStatus {
  CURRENT = 'CURRENT',
  OVERDUE = 'OVERDUE',
  PAID = 'PAID',
}

// ─── Purchase Order Schemas ───────────────────────────────────────

export const PurchaseOrderItemInputSchema = z.object({
  productId: z.guid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().positive(),
  unitPricePaise: z.number().int().nonnegative(),
  weightMg: z.number().int().nonnegative().optional(),
  purityFineness: z.number().int().min(0).max(999).optional(),
});

export type PurchaseOrderItemInput = z.infer<typeof PurchaseOrderItemInputSchema>;

export const PurchaseOrderInputSchema = z.object({
  supplierId: z.guid(),
  locationId: z.guid(),
  items: z.array(PurchaseOrderItemInputSchema).min(1),
  currencyCode: z.string().length(3).default('INR'),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type PurchaseOrderInput = z.infer<typeof PurchaseOrderInputSchema>;

export const PoStatusUpdateSchema = z.object({
  status: z.nativeEnum(WholesalePOStatus),
});

export type PoStatusUpdate = z.infer<typeof PoStatusUpdateSchema>;

export interface PurchaseOrderItemResponse {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPricePaise: number;
  weightMg: number | null;
  purityFineness: number | null;
  totalPaise: number;
  receivedQuantity: number;
}

export interface PurchaseOrderResponse {
  id: string;
  tenantId: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  locationId: string;
  locationName?: string;
  status: WholesalePOStatus;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currencyCode: string;
  expectedDate: string | null;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  items: PurchaseOrderItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export const PurchaseOrderListFilterSchema = z.object({
  status: z.nativeEnum(WholesalePOStatus).optional(),
  supplierId: z.guid().optional(),
  locationId: z.guid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().optional(),
});

export type PurchaseOrderListFilter = z.infer<typeof PurchaseOrderListFilterSchema>;

// ─── Goods Receipt Schemas ────────────────────────────────────────

export const GoodsReceiptItemInputSchema = z.object({
  poItemId: z.guid().optional(),
  productId: z.guid(),
  receivedQuantity: z.number().int().nonnegative(),
  acceptedQuantity: z.number().int().nonnegative().default(0),
  rejectedQuantity: z.number().int().nonnegative().default(0),
  weightMg: z.number().int().nonnegative(),
  notes: z.string().optional(),
});

export type GoodsReceiptItemInput = z.infer<typeof GoodsReceiptItemInputSchema>;

export const GoodsReceiptInputSchema = z.object({
  purchaseOrderId: z.guid(),
  items: z.array(GoodsReceiptItemInputSchema).min(1),
  receivedDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type GoodsReceiptInput = z.infer<typeof GoodsReceiptInputSchema>;

export interface GoodsReceiptItemResponse {
  id: string;
  poItemId: string | null;
  productId: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  weightMg: number;
  notes: string | null;
}

export interface GoodsReceiptResponse {
  id: string;
  tenantId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  locationId: string;
  status: WholesaleGRStatus;
  receivedDate: string;
  notes: string | null;
  items: GoodsReceiptItemResponse[];
  createdAt: string;
  updatedAt: string;
}

// ─── Consignment Out Schemas ──────────────────────────────────────

export const ConsignmentOutItemInputSchema = z.object({
  productId: z.guid(),
  quantity: z.number().int().positive(),
  weightMg: z.number().int().nonnegative(),
  valuePaise: z.number().int().nonnegative(),
});

export type ConsignmentOutItemInput = z.infer<typeof ConsignmentOutItemInputSchema>;

export const ConsignmentOutInputSchema = z.object({
  customerId: z.guid(),
  locationId: z.guid(),
  items: z.array(ConsignmentOutItemInputSchema).min(1),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type ConsignmentOutInput = z.infer<typeof ConsignmentOutInputSchema>;

export interface ConsignmentOutItemResponse {
  id: string;
  productId: string;
  quantity: number;
  weightMg: number;
  valuePaise: number;
  returnedQuantity: number;
  soldQuantity: number;
  status: WholesaleConsignmentOutItemStatus;
}

export interface ConsignmentOutResponse {
  id: string;
  tenantId: string;
  consignmentNumber: string;
  customerId: string;
  customerName?: string;
  locationId: string;
  status: WholesaleConsignmentOutStatus;
  issuedDate: string | null;
  dueDate: string | null;
  totalWeightMg: number;
  totalValuePaise: number;
  notes: string | null;
  items: ConsignmentOutItemResponse[];
  createdAt: string;
  updatedAt: string;
}

// ─── Consignment In Schemas ───────────────────────────────────────

export const ConsignmentInItemInputSchema = z.object({
  productId: z.guid(),
  quantity: z.number().int().positive(),
  weightMg: z.number().int().nonnegative(),
  valuePaise: z.number().int().nonnegative(),
});

export type ConsignmentInItemInput = z.infer<typeof ConsignmentInItemInputSchema>;

export const ConsignmentInInputSchema = z.object({
  supplierId: z.guid(),
  locationId: z.guid(),
  items: z.array(ConsignmentInItemInputSchema).min(1),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type ConsignmentInInput = z.infer<typeof ConsignmentInInputSchema>;

export interface ConsignmentInItemResponse {
  id: string;
  productId: string;
  quantity: number;
  weightMg: number;
  valuePaise: number;
  returnedQuantity: number;
  purchasedQuantity: number;
  status: WholesaleConsignmentInItemStatus;
}

export interface ConsignmentInResponse {
  id: string;
  tenantId: string;
  consignmentNumber: string;
  supplierId: string;
  supplierName?: string;
  locationId: string;
  status: WholesaleConsignmentInStatus;
  receivedDate: string | null;
  dueDate: string | null;
  totalWeightMg: number;
  totalValuePaise: number;
  notes: string | null;
  items: ConsignmentInItemResponse[];
  createdAt: string;
  updatedAt: string;
}

// ─── Agent / Broker Schemas ───────────────────────────────────────

export const AgentBrokerInputSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  commissionType: z.nativeEnum(WholesaleCommissionType),
  commissionRate: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  bankAccountNumber: z.string().max(30).optional(),
  ifscCode: z.string().max(11).optional(),
  panNumber: z.string().max(10).optional(),
});

export type AgentBrokerInput = z.infer<typeof AgentBrokerInputSchema>;

export interface AgentBrokerResponse {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  commissionType: WholesaleCommissionType;
  commissionRate: number;
  isActive: boolean;
  bankAccountNumber: string | null;
  ifscCode: string | null;
  panNumber: string | null;
  totalCommissionPaise: number;
  pendingCommissionPaise: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Commission Schemas ───────────────────────────────────────────

export const CommissionInputSchema = z.object({
  agentBrokerId: z.guid(),
  referenceType: z.nativeEnum(WholesaleCommissionRefType),
  referenceId: z.guid(),
  amountPaise: z.number().int().nonnegative(),
});

export type CommissionInput = z.infer<typeof CommissionInputSchema>;

export interface CommissionResponse {
  id: string;
  tenantId: string;
  agentBrokerId: string;
  agentName?: string;
  referenceType: WholesaleCommissionRefType;
  referenceId: string;
  amountPaise: number;
  status: WholesaleCommissionStatus;
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Credit Limit Schemas ─────────────────────────────────────────

export const CreditLimitInputSchema = z.object({
  entityType: z.nativeEnum(WholesaleCreditEntityType),
  entityId: z.guid(),
  creditLimitPaise: z.number().int().nonnegative(),
});

export type CreditLimitInput = z.infer<typeof CreditLimitInputSchema>;

export interface CreditLimitResponse {
  id: string;
  tenantId: string;
  entityType: WholesaleCreditEntityType;
  entityId: string;
  entityName?: string;
  creditLimitPaise: number;
  usedPaise: number;
  availablePaise: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Outstanding Balance Schemas ──────────────────────────────────

export interface OutstandingBalanceResponse {
  id: string;
  tenantId: string;
  entityType: WholesaleCreditEntityType;
  entityId: string;
  entityName?: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  originalPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: WholesaleOutstandingStatus;
  daysOverdue: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Rate Contract Schemas ────────────────────────────────────────

export const RateContractInputSchema = z.object({
  supplierId: z.guid(),
  productCategoryId: z.guid().optional(),
  metalType: z.string().max(50).optional(),
  ratePerGramPaise: z.number().int().positive().optional(),
  makingChargesPercent: z.number().int().nonnegative().optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  isActive: z.boolean().default(true),
  terms: z.string().optional(),
});

export type RateContractInput = z.infer<typeof RateContractInputSchema>;

export interface RateContractResponse {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierName?: string;
  productCategoryId: string | null;
  metalType: string | null;
  ratePerGramPaise: number | null;
  makingChargesPercent: number | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Supplier Schemas ─────────────────────────────────────────────

// ─── Supplier field formats (HK-WHL-01) ─────────────────────────
// Blank strings count as "not provided". GSTIN / PAN are upper-cased before
// they are checked, so "27abcde1234f1z5" is accepted and stored upper-case.

export const SUPPLIER_GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const SUPPLIER_PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const SUPPLIER_INDIA_PINCODE_REGEX = /^[1-9][0-9]{5}$/;
/** Non-Indian postal codes: 3-10 letters, digits, spaces or hyphens. */
const GENERIC_POSTAL_REGEX = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

const blankToUndefined = (upper: boolean) => (v: unknown) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === '') return undefined;
  return upper ? t.toUpperCase() : t;
};

const optionalTrimmed = (schema: z.ZodType<string>, upper = false) =>
  z.preprocess(blankToUndefined(upper), schema.optional());

/**
 * Cross-field postal code rule: an Indian supplier (country IN, or no country given)
 * needs a 6 digit pincode; other countries use a generic postal format.
 * Returns an error message, or null when fine / not provided.
 */
export function supplierPostalCodeError(
  country: string | null | undefined,
  postalCode: string | null | undefined,
): string | null {
  const code = (postalCode ?? '').trim();
  if (!code) return null;
  const c = (country ?? '').trim().toUpperCase();
  if (c === '' || c === 'IN') {
    return SUPPLIER_INDIA_PINCODE_REGEX.test(code) ? null : 'Pincode must be 6 digits (e.g. 400001)';
  }
  return GENERIC_POSTAL_REGEX.test(code) ? null : 'Enter a valid postal code';
}

export const SupplierInputSchema = z
  .object({
    name: z.preprocess(blankToUndefined(false), z.string({ error: 'Supplier name is required' }).min(1).max(255)),
    contactPerson: z.string().max(200).optional(),
    email: optionalTrimmed(z.string().email('Enter a valid email address').max(255)),
    phone: optionalTrimmed(
      z
        .string()
        .max(20)
        .regex(/^\+?[0-9][0-9 ().-]*$/, 'Enter a valid phone number')
        .refine((v) => {
          const digits = v.replace(/\D/g, '').length;
          return digits >= 7 && digits <= 15;
        }, 'Phone number must have 7 to 15 digits'),
    ),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.preprocess(blankToUndefined(true), z.string().length(2, 'Use a 2-letter country code (e.g. IN)').optional()),
    postalCode: optionalTrimmed(z.string().max(20)),
    gstinNumber: optionalTrimmed(
      z.string().regex(SUPPLIER_GSTIN_REGEX, 'Enter a valid 15 character GSTIN (e.g. 27ABCDE1234F1Z5)'),
      true,
    ),
    panNumber: optionalTrimmed(z.string().regex(SUPPLIER_PAN_REGEX, 'Enter a valid 10 character PAN (e.g. ABCDE1234F)'), true),
    supplierType: z.string().max(50).optional(),
    rating: z.number().int().min(0).max(5).optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    const message = supplierPostalCodeError(val.country, val.postalCode);
    if (message) ctx.addIssue({ code: 'custom', path: ['postalCode'], message });
  });

export type SupplierInput = z.infer<typeof SupplierInputSchema>;

export const SupplierListFilterSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  supplierType: z.string().optional(),
});

export type SupplierListFilter = z.infer<typeof SupplierListFilterSchema>;

export interface SupplierResponse {
  id: string;
  tenantId: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  gstinNumber: string | null;
  panNumber: string | null;
  supplierType: string | null;
  rating: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  completedOrders: number;
  onTimeDeliveryPercent: number;
  qualityRejectionPercent: number;
  priceCompliancePercent: number;
  averageLeadTimeDays: number;
  totalPurchaseValuePaise: number;
}

// ─── Dashboard Schema ─────────────────────────────────────────────

export interface WholesaleDashboardResponse {
  pendingPOs: number;
  activeConsignmentsOut: number;
  activeConsignmentsIn: number;
  totalOutstandingReceivablePaise: number;
  totalOutstandingPayablePaise: number;
  commissionsPendingPaise: number;
  recentPOs: PurchaseOrderResponse[];
  recentConsignmentsOut: ConsignmentOutResponse[];
}

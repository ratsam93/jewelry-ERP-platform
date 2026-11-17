// Presentation helpers for order detail / confirmation.
import { countryName } from "@/lib/countries";

/** The API stores the shipping address JSON as line1/line2/postalCode; older rows used addressLine1/pincode. */
export interface RawShippingAddress {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface ShippingAddressView {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
}

export function normalizeShippingAddress(a: RawShippingAddress): ShippingAddressView {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    name: s(a.fullName) || `${s(a.firstName)} ${s(a.lastName)}`.trim(),
    line1: s(a.addressLine1) || s(a.line1),
    line2: s(a.addressLine2) || s(a.line2),
    city: s(a.city),
    state: s(a.state),
    pincode: s(a.pincode) || s(a.postalCode),
    country: a.country ? countryName(s(a.country)) : "",
    phone: s(a.phone),
  };
}

export interface OrderPaymentLike {
  method?: string | null;
  status?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  cash_on_delivery: "Cash on Delivery",
  razorpay: "Online (Razorpay)",
  upi: "UPI",
  card: "Card",
  credit_card: "Card",
  debit_card: "Card",
  net_banking: "Net Banking",
  netbanking: "Net Banking",
  wallet: "Wallet",
  online: "Online",
};

export function paymentMethodLabel(method?: string | null): string {
  if (!method) return "Not available";
  const key = method.trim().toLowerCase();
  return METHOD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function paymentStatusLabel(status?: string | null): string {
  if (!status) return "Unknown";
  const t = status.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Summarise the order's payments: latest payment's method and status. */
export function summarizePayment(payments?: OrderPaymentLike[] | null): { method: string; status: string } | null {
  if (!payments || payments.length === 0) return null;
  const p = payments[payments.length - 1];
  return { method: paymentMethodLabel(p.method), status: paymentStatusLabel(p.status) };
}

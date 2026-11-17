/** Pure helpers for the export order / invoice "new" forms. */

/** Paginated list responses are `{ items, total, ... }`; never `{ data }`. */
export function listItems<T>(result: unknown): T[] {
  const items = (result as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

export function customerLabel(c: { id: string; firstName?: string; lastName?: string }): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.id;
}

export interface OrderFormState {
  buyerId: string;
  buyerCountry: string;
  locationId: string;
  items: Array<{ description: string; quantity: number; unitPriceDecimal: number }>;
}

/** Reasons the Create button on the export order form cannot be used yet. */
export function exportOrderBlockers(s: OrderFormState): string[] {
  const out: string[] = [];
  if (!s.buyerId) out.push('Select a buyer.');
  if (!/^[A-Za-z]{2}$/.test(s.buyerCountry)) out.push('Enter a 2-letter destination country code.');
  if (!s.locationId) out.push('Select a ship-from location.');
  if (s.items.some((i) => !i.description.trim())) out.push('Every line item needs a description.');
  if (s.items.some((i) => !(i.unitPriceDecimal > 0))) out.push('Every line item needs a unit price above 0.');
  return out;
}

export interface InvoiceFormState {
  exportOrderId: string;
  buyerId: string;
  ieCode: string;
  items: Array<{ description: string; quantity: number; unitPriceDecimal: number }>;
}

export function exportInvoiceBlockers(s: InvoiceFormState): string[] {
  const out: string[] = [];
  if (!s.exportOrderId) out.push('Select an export order.');
  if (!s.buyerId) out.push('Select a buyer (filled automatically from the order).');
  if (!s.ieCode.trim()) out.push('Enter the Importer-Exporter (IE) code.');
  if (s.items.some((i) => !i.description.trim())) out.push('Every line item needs a description.');
  if (s.items.some((i) => !(i.unitPriceDecimal > 0))) out.push('Every line item needs a unit price above 0.');
  return out;
}

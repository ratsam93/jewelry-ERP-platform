/**
 * The finance invoice list API returns the related `customer` (firstName /
 * lastName) or `supplier` (name) objects, not a flattened counterparty name.
 */
export function invoiceCounterpartyName(inv: Record<string, unknown>): string {
  if (typeof inv.counterpartyName === 'string' && inv.counterpartyName) return inv.counterpartyName;
  const c = inv.customer as { firstName?: string; lastName?: string } | null | undefined;
  if (c) {
    const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    if (n) return n;
  }
  const s = inv.supplier as { name?: string } | null | undefined;
  return s?.name ?? '-';
}

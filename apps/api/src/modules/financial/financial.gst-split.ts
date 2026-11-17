// ─── GST split helper ─────────────────────────────────────────
// Returns the CGST / SGST / IGST amounts of one invoice for GSTR reports.
//
// Order of preference:
//   1. stored tax transactions (written by createInvoice)
//   2. stored line-level cgst/sgst/igst
//   3. derive from the invoice-level tax amount (taxPaise) using place of
//      supply: IGST when the party state differs from the location state,
//      otherwise CGST + SGST split in half: SGST = floor(tax / 2) and CGST = tax - SGST
//      (CGST gets the odd paisa) so CGST + SGST == tax exactly. An odd paisa cannot
//      be split, so aggregate CGST exceeds SGST by at most 1 paisa per such invoice. The invoice detail
//      page (apps/web finance-forms) uses the identical rule so GSTR-1 ties to invoices.
// Invoices imported/seeded without line or tax breakdown therefore still
// report their tax instead of 0.

export interface GstSplitInput {
  subtotalPaise: bigint | number;
  discountPaise: bigint | number;
  taxPaise: bigint | number;
  taxTransactions?: Array<{ taxType: string; taxAmountPaise: bigint | number }>;
  lineItems?: Array<{
    cgstPaise: bigint | number;
    sgstPaise: bigint | number;
    igstPaise: bigint | number;
  }>;
  /** Buyer (sales) or supplier (purchase) state */
  partyState?: string | null;
  /** Invoicing location state */
  locationState?: string | null;
}

export interface GstSplit {
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  source: 'transactions' | 'lines' | 'derived';
}

function normState(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

export function isInterStatePlace(
  partyState: string | null | undefined,
  locationState: string | null | undefined,
): boolean {
  const a = normState(partyState);
  const b = normState(locationState);
  return a !== '' && b !== '' && a !== b;
}

export function splitInvoiceGst(inv: GstSplitInput): GstSplit {
  const taxable = Number(inv.subtotalPaise) - Number(inv.discountPaise);
  const sumTx = (type: string) =>
    (inv.taxTransactions ?? [])
      .filter((t) => t.taxType === type)
      .reduce((s, t) => s + Number(t.taxAmountPaise), 0);

  const txCgst = sumTx('CGST');
  const txSgst = sumTx('SGST');
  const txIgst = sumTx('IGST');
  if (txCgst + txSgst + txIgst > 0) {
    return { taxableAmountPaise: taxable, cgstPaise: txCgst, sgstPaise: txSgst, igstPaise: txIgst, source: 'transactions' };
  }

  const lines = inv.lineItems ?? [];
  const lCgst = lines.reduce((s, l) => s + Number(l.cgstPaise), 0);
  const lSgst = lines.reduce((s, l) => s + Number(l.sgstPaise), 0);
  const lIgst = lines.reduce((s, l) => s + Number(l.igstPaise), 0);
  if (lCgst + lSgst + lIgst > 0) {
    return { taxableAmountPaise: taxable, cgstPaise: lCgst, sgstPaise: lSgst, igstPaise: lIgst, source: 'lines' };
  }

  const tax = Number(inv.taxPaise);
  if (tax <= 0) {
    return { taxableAmountPaise: taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, source: 'derived' };
  }
  if (isInterStatePlace(inv.partyState, inv.locationState)) {
    return { taxableAmountPaise: taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: tax, source: 'derived' };
  }
  const sgst = Math.floor(tax / 2);
  return { taxableAmountPaise: taxable, cgstPaise: tax - sgst, sgstPaise: sgst, igstPaise: 0, source: 'derived' };
}

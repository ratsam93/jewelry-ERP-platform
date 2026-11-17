// Pure helpers for the inventory forms (unit-tested; no React).
// Money is paise and weight is mg. Both cross tRPC as decimal strings because
// plain JSON cannot carry a BigInt (the API router converts them back).

/**
 * Parse a user-typed decimal ("12.5", "-3", "1,250.75") into an integer string at
 * `scale` decimal places (scale 3: grams -> mg, scale 2: rupees -> paise) without
 * floating point. Returns null for blanks, junk, or more decimals than `scale`.
 */
export function decimalToScaledInt(
  raw: string,
  scale: number,
  opts: { allowNegative?: boolean } = {},
): string | null {
  const text = raw.replace(/,/g, '').trim();
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(text);
  if (!m) return null;
  const sign = m[1];
  const whole = m[2] ?? '';
  const frac = m[3] ?? '';
  if (sign && !opts.allowNegative) return null;
  if (frac.length > scale) return null;
  const digits = (whole + frac.padEnd(scale, '0')).replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(digits)) return '0';
  return `${sign ?? ''}${digits}`;
}

export const gramsToMgString = (g: string, allowNegative = false) =>
  decimalToScaledInt(g, 3, { allowNegative });
export const rupeesToPaiseString = (r: string, allowNegative = false) =>
  decimalToScaledInt(r, 2, { allowNegative });

export interface MetalAdjustForm {
  locationId: string;
  metalType: string;
  purityFineness: string;
  weightGrams: string;
  valueRupees: string;
  notes: string;
}

export interface MetalAdjustPayload {
  locationId: string;
  metalType: 'GOLD' | 'SILVER' | 'PLATINUM';
  purityFineness: number;
  weightChangeMg: string;
  valueChangePaise: string;
  notes?: string;
}

export type MetalAdjustResult =
  | { ok: true; input: MetalAdjustPayload }
  | { ok: false; errors: Partial<Record<keyof MetalAdjustForm, string>> };

/** Validate the Adjust Metal Stock form and build the metalStock.adjust payload. */
export function buildMetalAdjustInput(form: MetalAdjustForm): MetalAdjustResult {
  const errors: Partial<Record<keyof MetalAdjustForm, string>> = {};
  if (!form.locationId) errors.locationId = 'Select a location first.';
  if (!['GOLD', 'SILVER', 'PLATINUM'].includes(form.metalType)) {
    errors.metalType = 'Choose a metal type.';
  }
  const purity = Number(form.purityFineness);
  if (!Number.isInteger(purity) || purity < 1 || purity > 999) {
    errors.purityFineness = 'Purity must be a whole number between 1 and 999 (e.g. 916 for 22K).';
  }
  const weight = gramsToMgString(form.weightGrams, true);
  if (form.weightGrams.trim() === '') errors.weightGrams = 'Enter the weight to add or deduct in grams.';
  else if (weight === null) errors.weightGrams = 'Weight must be a number in grams with at most 3 decimals (use a minus sign to deduct).';
  else if (weight === '0') errors.weightGrams = 'Weight change cannot be zero.';
  let value: string | null = '0';
  if (form.valueRupees.trim() !== '') {
    value = rupeesToPaiseString(form.valueRupees, true);
    if (value === null) errors.valueRupees = 'Value must be an amount in rupees with at most 2 decimals.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      locationId: form.locationId,
      metalType: form.metalType as MetalAdjustPayload['metalType'],
      purityFineness: purity,
      weightChangeMg: weight as string,
      valueChangePaise: value as string,
      notes: form.notes.trim() || undefined,
    },
  };
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuidLike = (v: string) => UUID_LIKE.test(v);

/** Human summary of a transfer's lines, e.g. "Gold Ring (SJ-R-1) x 3". */
export function transferLineLabels(
  items:
    | Array<{
        quantityRequested?: number;
        product?: { sku?: string; name?: string } | null;
        productId?: string;
      }>
    | undefined,
): string[] {
  return (items ?? []).map((i) => {
    const name = i.product?.name ?? i.productId?.slice(0, 8) ?? 'Item';
    const sku = i.product?.sku ? ` (${i.product.sku})` : '';
    return `${name}${sku} x ${i.quantityRequested ?? 0}`;
  });
}

export function totalRequested(items: Array<{ quantityRequested?: number }> | undefined): number {
  return (items ?? []).reduce((s, i) => s + (i.quantityRequested ?? 0), 0);
}

/** Stock take progress: counted lines vs total lines and lines with variance. */
export function stockTakeCounts(
  items: Array<{ countedQuantity: number | null; varianceQuantity: number | null }> | undefined,
) {
  const list = items ?? [];
  const counted = list.filter((i) => i.countedQuantity !== null && i.countedQuantity !== undefined).length;
  const varianceLines = list.filter((i) => (i.varianceQuantity ?? 0) !== 0).length;
  return { total: list.length, counted, uncounted: list.length - counted, varianceLines };
}

export const VALUATION_METHOD_LABELS: Record<string, string> = {
  FIFO: 'FIFO',
  AVG: 'Weighted Average',
  LAST_PURCHASE: 'Last Purchase',
  GROSS_PROFIT: 'Gross Profit',
  MARKET: 'Market Value',
};
export const valuationMethodLabel = (m: string | undefined | null) =>
  (m && VALUATION_METHOD_LABELS[m]) || m || '';

/**
 * Pure helpers for the Girvi (pledge loan) create form.
 * Units match GirviLoanInputSchema: weights in integer mg, money in integer
 * paise, interest rate in basis points (annual percent * 100).
 */

/** Parse a decimal string ("12.345") into an integer scaled by 10^decimals, without float drift. */
export function parseScaled(value: string, decimals: number): number {
  const s = (value ?? '').trim();
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return 0;
  const [whole = '0', frac = ''] = s.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return parseInt(whole || '0', 10) * 10 ** decimals + (padded ? parseInt(padded, 10) : 0);
}

export interface GirviFormValues {
  customerId: string;
  locationId: string;
  metalType: string;
  grossWeightG: string;
  stoneWeightG: string;
  purityFineness: string;
  appraisedRatePer10g: string; // rupees, rate for 24K (999) metal
  loanPercentage: string;
  interestRate: string; // annual percent
  interestType: 'SIMPLE' | 'COMPOUND';
  compoundingPeriod: string;
  durationMonths: string;
  collateralDescription: string;
  notes: string;
}

export interface GirviValuation {
  grossWeightMg: number;
  stoneWeightMg: number;
  netWeightMg: number;
  purity: number;
  ratePer10gPaise: number;
  appraisedValuePaise: number;
  loanPercentage: number;
  loanAmountPaise: number;
}

/** round(n / d) with halves rounded up, for non-negative BigInts, returned as a number. */
function divRoundHalfUp(n: bigint, d: bigint): number {
  return Number((n * 2n + d) / (d * 2n));
}

export function computeGirviValuation(v: GirviFormValues): GirviValuation {
  const grossWeightMg = parseScaled(v.grossWeightG, 3);
  const stoneWeightMg = parseScaled(v.stoneWeightG, 3);
  const netWeightMg = Math.max(0, grossWeightMg - stoneWeightMg);
  const purity = parseInt(v.purityFineness || '0', 10) || 0;
  const ratePer10gPaise = parseScaled(v.appraisedRatePer10g, 2);
  // netMg / 10g(=10000mg) * rate * purity/999
  const appraisedValuePaise = divRoundHalfUp(
    BigInt(netWeightMg) * BigInt(ratePer10gPaise) * BigInt(purity),
    10000n * 999n,
  );
  const loanPercentage = parseInt(v.loanPercentage || '0', 10) || 0;
  // Exact integer math, half-up on paise; never above the appraised value.
  const loanAmountPaise = Math.min(
    appraisedValuePaise,
    divRoundHalfUp(BigInt(appraisedValuePaise) * BigInt(loanPercentage), 100n),
  );
  return {
    grossWeightMg,
    stoneWeightMg,
    netWeightMg,
    purity,
    ratePer10gPaise,
    appraisedValuePaise,
    loanPercentage,
    loanAmountPaise,
  };
}

/**
 * Dropdown label for a customer so duplicate names can be told apart:
 * "Priya Sharma - +919820000001 - demo.customer@example.com" (+ KYC when known).
 */
export function girviCustomerLabel(c: Record<string, unknown>, kyc?: { aadhaar?: boolean; pan?: boolean } | null): string {
  const name = `${(c.firstName as string) ?? ''} ${(c.lastName as string) ?? ''}`.trim() || String(c.id ?? '');
  const parts = [name];
  const contact = [c.phone, c.email].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (contact.length) parts.push(contact.join(' / '));
  else parts.push(`ID ${String(c.id ?? '').slice(0, 8)}`);
  if (kyc) parts.push(kyc.aadhaar || kyc.pan ? 'KYC verified' : 'KYC pending');
  return parts.join(' - ');
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0); // clamp month overflow (31 Jan + 1 month)
  return d;
}

export function validateGirviForm(v: GirviFormValues): Record<string, string> {
  const val = computeGirviValuation(v);
  const e: Record<string, string> = {};
  if (!v.customerId) e.customerId = 'Select a customer';
  if (!v.locationId) e.locationId = 'Select a location';
  if (val.grossWeightMg <= 0) e.grossWeightG = 'Enter the gross weight';
  if (val.stoneWeightMg > val.grossWeightMg) e.stoneWeightG = 'Stone weight cannot exceed gross weight';
  else if (val.grossWeightMg > 0 && val.netWeightMg <= 0) e.stoneWeightG = 'Net weight must be greater than zero';
  if (val.ratePer10gPaise <= 0) e.appraisedRatePer10g = 'Enter the rate per 10g';
  if (!/^\d+$/.test(v.loanPercentage.trim()) || val.loanPercentage < 1 || val.loanPercentage > 100) {
    e.loanPercentage = 'Loan percentage must be a whole number between 1 and 100';
  }
  const rate = parseScaled(v.interestRate, 2);
  if (rate < 1 || rate > 10000) e.interestRate = 'Interest rate must be between 0.01 and 100';
  const months = parseInt(v.durationMonths || '0', 10);
  if (!(months >= 1 && months <= 60)) e.durationMonths = 'Duration must be 1 to 60 months';
  if (!v.collateralDescription.trim()) e.collateralDescription = 'Describe the pledged items';
  if (v.interestType === 'COMPOUND' && !v.compoundingPeriod) e.compoundingPeriod = 'Select a compounding period';
  if (!e.loanPercentage && val.appraisedValuePaise > 0 && val.loanAmountPaise <= 0) e.loanPercentage = 'Loan amount is zero';
  return e;
}

/** Build the payload for trpc.india.girvi.create (GirviLoanInputSchema). */
export function buildGirviCreateInput(v: GirviFormValues, now: Date = new Date()) {
  const val = computeGirviValuation(v);
  return {
    customerId: v.customerId,
    locationId: v.locationId,
    collateralDescription: v.collateralDescription.trim(),
    metalType: v.metalType,
    grossWeightMg: val.grossWeightMg,
    netWeightMg: val.netWeightMg,
    purityFineness: val.purity,
    appraisedValuePaise: val.appraisedValuePaise,
    loanAmountPaise: val.loanAmountPaise,
    interestRate: parseScaled(v.interestRate, 2), // basis points
    interestType: v.interestType,
    ...(v.interestType === 'COMPOUND' ? { compoundingPeriod: v.compoundingPeriod } : {}),
    disbursedDate: now,
    dueDate: addMonths(now, parseInt(v.durationMonths, 10)),
    ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
  };
}

/**
 * Normalise a girvi loan row from india.girvi.list / getById. The API returns
 * loanAmountPaise, outstandingPrincipalPaise + outstandingInterestPaise,
 * interestRate (basis points) and disbursedDate (BigInts arrive as decimal
 * strings). Legacy names are accepted as fallbacks.
 */
export function girviLoanView(g: Record<string, unknown>) {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const principal = num(g.loanAmountPaise) ?? num(g.principalPaise);
  const outPrincipal = num(g.outstandingPrincipalPaise);
  const outInterest = num(g.outstandingInterestPaise) ?? 0;
  const outstanding = outPrincipal !== null ? outPrincipal + outInterest : num(g.outstandingPaise);
  const bps = num(g.interestRate);
  const interestRatePercent = bps !== null ? bps / 100 : num(g.interestRatePercent);
  const appraised = num(g.appraisedValuePaise);
  const net = num(g.netWeightMg);
  const purity = num(g.purityFineness);
  // The saved loan does not store the rate or LTV %, so derive them from the stored values.
  const loanPercent =
    appraised && principal !== null ? Math.round((principal / appraised) * 10000) / 100 : null;
  const ratePer10gPaise =
    appraised && net && purity ? Math.round((appraised * 10000 * 999) / (net * purity)) : null;
  const disbursed = new Date(String(g.disbursedDate ?? g.issuedDate ?? ''));
  const due = new Date(String(g.dueDate ?? ''));
  const durationMonths =
    Number.isNaN(disbursed.getTime()) || Number.isNaN(due.getTime())
      ? null
      : (due.getUTCFullYear() - disbursed.getUTCFullYear()) * 12 +
        (due.getUTCMonth() - disbursed.getUTCMonth());
  const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return {
    principalPaise: principal,
    outstandingPaise: outstanding,
    interestRatePercent,
    issuedDate: (g.disbursedDate ?? g.issuedDate) as unknown,
    dueDate: g.dueDate as unknown,
    metalType: text(g.metalType),
    grossWeightMg: num(g.grossWeightMg),
    netWeightMg: net,
    purityFineness: purity,
    appraisedValuePaise: appraised,
    loanPercent,
    ratePer10gPaise,
    interestType: text(g.interestType),
    compoundingPeriod: text(g.compoundingPeriod),
    durationMonths,
    collateralDescription: text(g.collateralDescription),
    notes: text(g.notes),
    aadhaarVerified: g.aadhaarVerified === true,
    panVerified: g.panVerified === true,
  };
}

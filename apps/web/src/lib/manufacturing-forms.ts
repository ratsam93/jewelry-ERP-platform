import { JOB_ORDER_TRANSITIONS } from '@caratflow/shared-types';

/**
 * Pure helpers for the manufacturing forms (BOM builder, job order, karigar)
 * and detail pages. Money is integer paise, weights are integer mg and BOM
 * wastage is stored in basis points (200 = 2%); the forms work in rupees,
 * grams and percent and convert here.
 */

// ─── Number parsing / conversion ────────────────────────────────

/**
 * Parse a non-negative decimal string into an integer scaled by 10^scale
 * without float error ("1.005" scale 2 -> 101, half-up). Returns null when
 * the text is blank or not a plain non-negative decimal.
 */
export function parseDecimalToInt(text: string, scale: number): number | null {
  const s = text.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [intPart, fracPart = ''] = s.split('.');
  const frac = fracPart.padEnd(scale + 1, '0');
  let n = BigInt(intPart + frac.slice(0, scale));
  if (frac.charCodeAt(scale) >= 53) n += BigInt(1); // digit >= 5 rounds up
  const out = Number(n);
  return Number.isSafeInteger(out) ? out : null;
}

export const rupeesToPaise = (text: string) => parseDecimalToInt(text, 2);
export const gramsToMg = (text: string) => parseDecimalToInt(text, 3);
/** Wastage % -> basis points ("2" -> 200, "2.5" -> 250). */
export const percentToBps = (text: string) => parseDecimalToInt(text, 2);
/** Basis points -> percent text for display / edit fields (200 -> "2"). */
export const bpsToPercent = (bps: number) => String(bps / 100);

/** BigInt-serialized strings, numbers and bigints from the API -> number. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ─── Server error text ──────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  productId: 'Product',
  bomId: 'BOM',
  locationId: 'Location',
  customerId: 'Customer',
  assignedKarigarId: 'Assigned karigar',
  quantity: 'Quantity',
  estimatedStartDate: 'Estimated start',
  estimatedEndDate: 'Estimated end',
  priority: 'Priority',
  name: 'Name',
  outputQuantity: 'Output quantity',
  employeeCode: 'Employee code',
  firstName: 'First name',
  lastName: 'Last name',
  dailyWagePaise: 'Daily wage',
  items: 'Components',
  email: 'Email',
  phone: 'Phone',
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface ZodIssueLike {
  code?: string;
  path?: Array<string | number>;
  message?: string;
  minimum?: number;
  maximum?: number;
  format?: string;
  expected?: string;
}

function issueText(issue: ZodIssueLike): string {
  const path = issue.path ?? [];
  const key = path.filter((p) => typeof p === 'string').pop() as string | undefined;
  const label = key ? FIELD_LABELS[key] ?? humanizeKey(key) : 'Value';
  const where = path.length > 1 && typeof path[0] === 'string' && typeof path[1] === 'number'
    ? ` (${humanizeKey(path[0])} line ${path[1] + 1})`
    : '';
  switch (issue.code) {
    case 'too_small':
      if (typeof issue.minimum === 'number') {
        return `${label}${where} must be at least ${issue.minimum}`;
      }
      return `${label}${where} is required`;
    case 'too_big':
      return `${label}${where} must be at most ${issue.maximum}`;
    case 'invalid_format':
      return issue.format === 'guid' || issue.format === 'uuid'
        ? `${label}${where} is not valid; pick one from the list`
        : `${label}${where} is not in a valid format`;
    case 'invalid_type':
      return `${label}${where} is required`;
    case 'invalid_value':
      return `${label}${where} has an unsupported value`;
    default:
      return `${label}${where}: ${issue.message ?? 'is invalid'}`;
  }
}

/**
 * Turn a tRPC/Nest error into human text. tRPC input failures arrive as a
 * JSON array of Zod issues in `message`; show one readable line per issue.
 */
export function formatServerError(error: unknown): string {
  const message =
    typeof error === 'string' ? error : ((error as { message?: string } | null)?.message ?? '');
  const trimmed = message.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const issues = (Array.isArray(parsed) ? parsed : [parsed]) as ZodIssueLike[];
      const lines = issues
        .filter((i) => i && typeof i === 'object' && ('code' in i || 'message' in i))
        .map(issueText);
      if (lines.length > 0) return Array.from(new Set(lines)).join('. ') + '.';
    } catch {
      /* fall through to the raw message */
    }
  }
  return trimmed || 'Something went wrong. Please try again.';
}

// ─── Location options (HK-RPT-02) ───────────────────────────────

/** Fold same-name (and same-type) locations into one entry so the dropdown has no look-alike rows. */
export function dedupeLocationsByName<T extends { id: string; name: string; locationType?: string }>(
  locations: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const loc of locations) {
    const key = `${loc.name.trim().toLowerCase()}|${loc.locationType ?? ''}`;
    if (seen.has(key) || seen.has(`id:${loc.id}`)) continue;
    seen.add(key);
    seen.add(`id:${loc.id}`);
    out.push(loc);
  }
  return out;
}

// ─── BOM builder ────────────────────────────────────────────────

export const METAL_TYPES = ['GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM'] as const;
export const PURITY_OPTIONS: Record<(typeof METAL_TYPES)[number], string[]> = {
  GOLD: ['999', '995', '916', '750', '585', '375'],
  SILVER: ['999', '925', '800'],
  PLATINUM: ['950', '900'],
  PALLADIUM: ['950', '500'],
};

export interface MetalLineForm {
  metalType: (typeof METAL_TYPES)[number];
  purity: string;
  weightG: string;
  ratePerGram: string;
  wastagePct: string;
}
export interface StoneLineForm {
  name: string;
  pieces: string;
  weightG: string;
  costPerPiece: string;
}
export interface BomFormValues {
  name: string;
  productId: string;
  outputQuantity: string;
  estimatedTimeMins: string;
  notes: string;
  metals: MetalLineForm[];
  stones: StoneLineForm[];
  makingCharge: string;
  labour: string;
}

export const emptyMetalLine = (): MetalLineForm => ({
  metalType: 'GOLD',
  purity: '916',
  weightG: '',
  ratePerGram: '',
  wastagePct: '0',
});
export const emptyStoneLine = (): StoneLineForm => ({ name: '', pieces: '1', weightG: '', costPerPiece: '' });
export const emptyBomForm = (): BomFormValues => ({
  name: '',
  productId: '',
  outputQuantity: '1',
  estimatedTimeMins: '',
  notes: '',
  metals: [emptyMetalLine()],
  stones: [],
  makingCharge: '',
  labour: '',
});

/**
 * Cost of a metal line in paise: weight(mg) x rate(paise/g) / 1000, plus
 * wastage (bps). All integer maths in BigInt, rounded half-up.
 */
export function metalLineCostPaise(weightMg: number, ratePaisePerG: number, wastageBps: number): number {
  const num = BigInt(weightMg) * BigInt(ratePaisePerG) * BigInt(10000 + wastageBps);
  const den = BigInt(1000) * BigInt(10000);
  return Number((num * BigInt(2) + den) / (den * BigInt(2)));
}

export interface BomEstimate {
  metalPaise: number;
  stonePaise: number;
  makingPaise: number;
  labourPaise: number;
  totalPaise: number;
}

/** Live estimate for the summary panel; invalid / blank lines count as zero. */
export function computeBomEstimate(form: BomFormValues): BomEstimate {
  let metalPaise = 0;
  for (const m of form.metals) {
    const mg = gramsToMg(m.weightG);
    if (!mg) continue;
    metalPaise += metalLineCostPaise(mg, rupeesToPaise(m.ratePerGram) ?? 0, percentToBps(m.wastagePct) ?? 0);
  }
  let stonePaise = 0;
  for (const s of form.stones) {
    const pieces = parseDecimalToInt(s.pieces, 0) ?? 0;
    stonePaise += pieces * (rupeesToPaise(s.costPerPiece) ?? 0);
  }
  const makingPaise = rupeesToPaise(form.makingCharge) ?? 0;
  const labourPaise = rupeesToPaise(form.labour) ?? 0;
  return { metalPaise, stonePaise, makingPaise, labourPaise, totalPaise: metalPaise + stonePaise + makingPaise + labourPaise };
}

export interface BomItemPayload {
  itemType: 'METAL' | 'STONE' | 'LABOR' | 'OVERHEAD';
  description: string;
  quantityRequired: number;
  unitOfMeasure: string;
  weightMg: number | null;
  estimatedCostPaise: number;
  wastagePercent: number;
  sortOrder: number;
}

export interface BomPayload {
  name: string;
  productId: string;
  outputQuantity: number;
  notes: string | null;
  estimatedCostPaise: number;
  estimatedTimeMins: number;
  items: BomItemPayload[];
}

export type FormErrors = Record<string, string>;

/** Validate the BOM form and build the `manufacturing.bom.create` input (BomInputSchema). */
export function buildBomInput(form: BomFormValues): { input: BomPayload | null; errors: FormErrors; estimate: BomEstimate } {
  const errors: FormErrors = {};
  const items: BomItemPayload[] = [];
  const estimate = computeBomEstimate(form);

  const name = form.name.trim();
  if (!name) errors.name = 'BOM name is required';
  else if (name.length > 255) errors.name = 'Name must be at most 255 characters';
  if (!form.productId) errors.productId = 'Select a product';

  const outputQuantity = parseDecimalToInt(form.outputQuantity, 0);
  if (!outputQuantity || outputQuantity < 1) errors.outputQuantity = 'Output quantity must be a whole number of at least 1';

  let estimatedTimeMins = 0;
  if (form.estimatedTimeMins.trim()) {
    const t = parseDecimalToInt(form.estimatedTimeMins, 0);
    if (t === null) errors.estimatedTimeMins = 'Enter whole minutes (0 or more)';
    else estimatedTimeMins = t;
  }

  form.metals.forEach((m, i) => {
    const touched = m.weightG.trim() !== '' || m.ratePerGram.trim() !== '';
    if (!touched) return; // blank row: ignored
    const weightMg = gramsToMg(m.weightG);
    if (!weightMg) errors[`metals.${i}.weightG`] = 'Enter the weight in grams (more than 0)';
    if (m.ratePerGram.trim() && rupeesToPaise(m.ratePerGram) === null) {
      errors[`metals.${i}.ratePerGram`] = 'Enter a valid rate in rupees';
    }
    const bps = percentToBps(m.wastagePct.trim() === '' ? '0' : m.wastagePct);
    if (bps === null) errors[`metals.${i}.wastagePct`] = 'Enter wastage as a percent (e.g. 2)';
    else if (bps > 10000) errors[`metals.${i}.wastagePct`] = 'Wastage cannot exceed 100%';
    if (!weightMg || bps === null || bps > 10000) return;
    items.push({
      itemType: 'METAL',
      description: `${m.metalType} ${m.purity}`.trim(),
      quantityRequired: weightMg / 1000,
      unitOfMeasure: 'g',
      weightMg,
      estimatedCostPaise: metalLineCostPaise(weightMg, rupeesToPaise(m.ratePerGram) ?? 0, bps),
      wastagePercent: bps,
      sortOrder: 0,
    });
  });

  form.stones.forEach((s, i) => {
    const touched = s.name.trim() !== '' || s.costPerPiece.trim() !== '' || s.weightG.trim() !== '';
    if (!touched) return;
    if (!s.name.trim()) errors[`stones.${i}.name`] = 'Enter the stone name';
    const pieces = parseDecimalToInt(s.pieces, 0);
    if (!pieces || pieces < 1) errors[`stones.${i}.pieces`] = 'Pieces must be a whole number of at least 1';
    const costEach = s.costPerPiece.trim() === '' ? 0 : rupeesToPaise(s.costPerPiece);
    if (costEach === null) errors[`stones.${i}.costPerPiece`] = 'Enter a valid cost in rupees';
    let weightMg: number | null = null;
    if (s.weightG.trim()) {
      weightMg = gramsToMg(s.weightG);
      if (weightMg === null) errors[`stones.${i}.weightG`] = 'Enter the weight in grams';
    }
    if (!s.name.trim() || !pieces || costEach === null || (s.weightG.trim() && weightMg === null)) return;
    items.push({
      itemType: 'STONE',
      description: s.name.trim(),
      quantityRequired: pieces,
      unitOfMeasure: 'pcs',
      weightMg,
      estimatedCostPaise: pieces * costEach,
      wastagePercent: 0,
      sortOrder: 0,
    });
  });

  const charge = (text: string, key: string, itemType: 'OVERHEAD' | 'LABOR', description: string) => {
    if (!text.trim()) return;
    const paise = rupeesToPaise(text);
    if (paise === null) {
      errors[key] = 'Enter a valid amount in rupees';
      return;
    }
    if (paise === 0) return;
    items.push({
      itemType,
      description,
      quantityRequired: 1,
      unitOfMeasure: 'lot',
      weightMg: null,
      estimatedCostPaise: paise,
      wastagePercent: 0,
      sortOrder: 0,
    });
  };
  charge(form.makingCharge, 'makingCharge', 'OVERHEAD', 'Making charge');
  charge(form.labour, 'labour', 'LABOR', 'Labour');

  if (items.length === 0 && !Object.keys(errors).some((k) => /^(metals|stones|makingCharge|labour)/.test(k))) {
    errors.items = 'Add at least one metal, stone, making charge or labour line';
  }

  if (Object.keys(errors).length > 0) return { input: null, errors, estimate };
  items.forEach((it, i) => { it.sortOrder = i; });
  return {
    input: {
      name,
      productId: form.productId,
      outputQuantity: outputQuantity as number,
      notes: form.notes.trim() || null,
      estimatedCostPaise: items.reduce((sum, it) => sum + it.estimatedCostPaise, 0),
      estimatedTimeMins,
      items,
    },
    errors,
    estimate,
  };
}

// ─── BOM detail ─────────────────────────────────────────────────

export interface BomDetailRow {
  key: string;
  name: string;
  type: string;
  weightMg: number | null;
  quantity: number;
  unit: string;
  wastagePct: string | null;
  costPaise: number;
}

export interface BomDetailView {
  productName: string;
  outputQuantity: number;
  estimatedCostPaise: number;
  estimatedTimeMins: number;
  itemsCostPaise: number;
  rows: BomDetailRow[];
}

/** Read the `bom.getById` response: components live in `items` (not `components`), cost per item is `estimatedCostPaise`. */
export function bomDetailView(bom: Record<string, unknown>): BomDetailView {
  const items = (Array.isArray(bom.items) ? bom.items : []) as Array<Record<string, unknown>>;
  const rows = items.map((it, idx): BomDetailRow => {
    const productName = (it.product as { name?: string } | null | undefined)?.name;
    const weight = toNumber(it.weightMg);
    const bps = toNumber(it.wastagePercent);
    return {
      key: (it.id as string) ?? String(idx),
      name: productName ?? (it.description as string) ?? '-',
      type: (it.itemType as string) ?? '-',
      weightMg: weight > 0 ? weight : null,
      quantity: toNumber(it.quantityRequired),
      unit: (it.unitOfMeasure as string) ?? '',
      wastagePct: bps > 0 ? `${bpsToPercent(bps)}%` : null,
      costPaise: toNumber(it.estimatedCostPaise),
    };
  });
  return {
    productName: (bom.product as { name?: string } | null | undefined)?.name ?? '-',
    outputQuantity: toNumber(bom.outputQuantity) || 1,
    estimatedCostPaise: toNumber(bom.estimatedCostPaise),
    estimatedTimeMins: toNumber(bom.estimatedTimeMins),
    itemsCostPaise: rows.reduce((sum, r) => sum + r.costPaise, 0),
    rows,
  };
}

// ─── Job order form ─────────────────────────────────────────────

export interface JobFormValues {
  productId: string;
  locationId: string;
  assignedKarigarId: string;
  bomId: string;
  customerId: string;
  priority: string;
  quantity: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
  notes: string;
  specialInstructions: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the job form and build the `manufacturing.job.create` input. */
export function buildJobInput(form: JobFormValues): { input: Record<string, unknown> | null; errors: FormErrors } {
  const errors: FormErrors = {};
  if (!form.productId) errors.productId = 'Select a product';
  if (!form.locationId) errors.locationId = 'Select a location';

  const qtyText = form.quantity.trim();
  let quantity = 0;
  if (!qtyText) errors.quantity = 'Quantity is required';
  else if (!/^\d+$/.test(qtyText) || Number(qtyText) < 1) errors.quantity = 'Quantity must be a whole number of at least 1';
  else quantity = Number(qtyText);

  if (form.estimatedStartDate && form.estimatedEndDate && form.estimatedEndDate < form.estimatedStartDate) {
    errors.estimatedEndDate = 'Estimated end cannot be before the estimated start';
  }
  if (form.customerId.trim() && !UUID_RE.test(form.customerId.trim())) {
    errors.customerId = 'Customer ID must be a valid UUID';
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      productId: form.productId,
      locationId: form.locationId,
      bomId: form.bomId || undefined,
      customerId: form.customerId.trim() || undefined,
      assignedKarigarId: form.assignedKarigarId || undefined,
      priority: form.priority,
      quantity,
      estimatedStartDate: form.estimatedStartDate ? new Date(form.estimatedStartDate) : undefined,
      estimatedEndDate: form.estimatedEndDate ? new Date(form.estimatedEndDate) : undefined,
      notes: form.notes.trim() || undefined,
      specialInstructions: form.specialInstructions.trim() || undefined,
    },
    errors,
  };
}

/** BOMs that can be used for a job of `productId` (a BOM is made for one product). No product yet: none. */
export function bomsForProduct<T extends { productId?: string | null }>(boms: T[], productId: string): T[] {
  if (!productId) return [];
  return boms.filter((b) => b.productId === productId);
}

/** Warning (not an error) when the chosen BOM is for a different product than the job. */
export function bomProductMismatch(
  bom: { productId?: string | null; product?: { name?: string } | null } | undefined,
  jobProductId: string,
): string | null {
  if (!bom || !jobProductId || !bom.productId || bom.productId === jobProductId) return null;
  return `This BOM is for ${bom.product?.name ?? 'a different product'}, not the selected product.`;
}

// ─── Job status actions ─────────────────────────────────────────

export const JOB_STATUS_ACTION_LABELS: Record<string, string> = {
  PLANNED: 'Mark as planned',
  MATERIAL_ISSUED: 'Mark material issued',
  IN_PROGRESS: 'Start work',
  QC_PENDING: 'Send to QC',
  QC_PASSED: 'Pass QC',
  QC_FAILED: 'Fail QC',
  COMPLETED: 'Complete job',
  CANCELLED: 'Cancel job',
};

/** Next statuses the API allows from `status`, cancel always last. */
export function nextJobStatuses(status: string): string[] {
  const allowed = (JOB_ORDER_TRANSITIONS as Record<string, string[] | undefined>)[status] ?? [];
  return [...allowed.filter((s) => s !== 'CANCELLED'), ...allowed.filter((s) => s === 'CANCELLED')];
}

export function jobStatusActionLabel(status: string): string {
  return JOB_STATUS_ACTION_LABELS[status] ?? humanizeKey(status.toLowerCase().replace(/_/g, ' '));
}

// ─── Job detail ─────────────────────────────────────────────────

export interface JobDatesView {
  estimatedStart: unknown;
  estimatedEnd: unknown;
}

/** The API stores `estimatedStartDate` / `estimatedEndDate` (there is no `dueDate`). */
export function jobDates(job: Record<string, unknown>): JobDatesView {
  return { estimatedStart: job.estimatedStartDate ?? null, estimatedEnd: job.estimatedEndDate ?? job.dueDate ?? null };
}

// ─── Karigar form ───────────────────────────────────────────────

export interface KarigarFormValues {
  employeeCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  specialization: string;
  skillLevel: string;
  dailyWage: string;
  locationId: string;
  joiningDate: string;
  address: string;
  isActive: boolean;
}

export const SKILL_LEVELS = ['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER'] as const;

export const emptyKarigarForm = (): KarigarFormValues => ({
  employeeCode: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  specialization: '',
  skillLevel: 'JUNIOR',
  dailyWage: '',
  locationId: '',
  joiningDate: '',
  address: '',
  isActive: true,
});

/** Validate the karigar form and build the `karigar.create` / `karigar.update` data (KarigarInputSchema). */
export function buildKarigarInput(form: KarigarFormValues): { input: Record<string, unknown> | null; errors: FormErrors } {
  const errors: FormErrors = {};
  const code = form.employeeCode.trim();
  const first = form.firstName.trim();
  const last = form.lastName.trim();
  if (!code) errors.employeeCode = 'Employee code is required';
  else if (code.length > 50) errors.employeeCode = 'Employee code must be at most 50 characters';
  if (!first) errors.firstName = 'First name is required';
  else if (first.length > 100) errors.firstName = 'First name must be at most 100 characters';
  if (!last) errors.lastName = 'Last name is required';
  else if (last.length > 100) errors.lastName = 'Last name must be at most 100 characters';
  if (!form.locationId) errors.locationId = 'Select a location';

  const phone = form.phone.trim();
  if (phone && !/^[0-9+\-()\s]{7,20}$/.test(phone)) errors.phone = 'Enter a valid phone number (7-20 digits)';
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
  if (form.specialization.trim().length > 255) errors.specialization = 'Specialization must be at most 255 characters';
  if (form.address.trim().length > 500) errors.address = 'Address must be at most 500 characters';

  let dailyWagePaise = 0;
  if (form.dailyWage.trim()) {
    const p = rupeesToPaise(form.dailyWage);
    if (p === null) errors.dailyWage = 'Enter the daily wage in rupees (0 or more)';
    else dailyWagePaise = p;
  }

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      employeeCode: code,
      firstName: first,
      lastName: last,
      phone: phone || null,
      email: email || null,
      specialization: form.specialization.trim() || null,
      skillLevel: form.skillLevel,
      dailyWagePaise,
      locationId: form.locationId,
      isActive: form.isActive,
      joiningDate: form.joiningDate ? new Date(form.joiningDate) : null,
      address: form.address.trim() || null,
    },
    errors,
  };
}

/** Prefill the karigar form from a `karigar.getById` response. */
export function karigarToFormValues(k: Record<string, unknown>): KarigarFormValues {
  const wage = toNumber(k.dailyWagePaise);
  const joining = k.joiningDate ? new Date(k.joiningDate as string) : null;
  return {
    employeeCode: (k.employeeCode as string) ?? '',
    firstName: (k.firstName as string) ?? '',
    lastName: (k.lastName as string) ?? '',
    phone: (k.phone as string) ?? '',
    email: (k.email as string) ?? '',
    specialization: (k.specialization as string) ?? '',
    skillLevel: (k.skillLevel as string) ?? 'JUNIOR',
    dailyWage: wage ? String(wage / 100) : '',
    locationId: (k.locationId as string) ?? '',
    joiningDate: joining && !Number.isNaN(joining.getTime()) ? joining.toISOString().slice(0, 10) : '',
    address: (k.address as string) ?? '',
    isActive: k.isActive !== false,
  };
}

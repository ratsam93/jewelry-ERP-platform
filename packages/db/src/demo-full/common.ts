/**
 * Shared, pure building blocks for the full demo seed (seed-demo-full.ts).
 * No database access here: everything is deterministic given (tenantId, now) so it
 * can be unit tested and so a second run plans the very same row ids.
 *
 * Units follow the rest of CaratFlow: money = integer paise (BigInt in Prisma),
 * weights = integer milligrams, wastage / interest rates = basis points.
 */
import * as crypto from 'crypto';
import { demoId } from '../seed-demo-catalog-data';
import { withVerhoeffDigit } from '../seed-demo-customer';

export type Row = Record<string, unknown>;

/** One Prisma delegate (lower-camel model name) and the rows to createMany into it. */
export interface TablePlan {
  model: string;
  rows: Row[];
}

export interface ModulePlan {
  name: string;
  /** If this row already exists the whole module was seeded before and is skipped. */
  sentinel: { model: string; id: string };
  tables: TablePlan[];
  /** Absolute quantity changes applied to EXISTING stock rows (inside the module transaction). */
  stockDeltas: Array<{ stockItemId: string; delta: number }>;
}

// ─── Context ───────────────────────────────────────────────────────

export interface LocationInfo {
  id: string;
  name: string;
  city: string;
  state: string;
}

export interface ProductInfo {
  id: string;
  sku: string;
  name: string;
  productType: string;
  purity: number | null;
  metalWeightMg: bigint;
  netWeightMg: bigint;
  grossWeightMg: bigint;
  makingPaise: bigint;
  wastageBps: number;
  sellingPaise: bigint;
  costPaise: bigint;
  /** Fixed-price (diamond, gemstone, kundan) items are not priced from the metal rate. */
  fixedPrice: boolean;
  /** Showroom quantity the catalog seeded (immutable baseline for planning). */
  qty0: number;
  huid: string | null;
  /** Existing stock row at the showroom, when there is one. */
  showroomStockId: string | null;
}

export interface CustomerRef {
  id: string;
  firstName: string;
  lastName: string;
  state: string;
  city: string;
  phone: string | null;
}

export interface DemoContext {
  tenantId: string;
  slug: string;
  now: Date;
  adminUserId: string;
  showroom: LocationInfo;
  warehouse: LocationInfo;
  workshop: LocationInfo;
  /** Locations that must be inserted (missing warehouse / workshop). */
  newLocations: Row[];
  products: ProductInfo[];
  existingCustomers: CustomerRef[];
  /** Existing ledger accounts by code (so we reuse them instead of inserting duplicates). */
  accountIdByCode: Record<string, string>;
  /** metal_rate_history: earliest existing recordedAt per "METAL_purity" (history is only added before it). */
  earliestRateAt: Record<string, Date | null>;
  /** Permission catalog strings "module.resource.action" for role subsets. */
  permissionStrings: string[];
  imageBase: string;
  /** Optional: bcrypt hash for the demo staff users (only when DEMO_STAFF_PASSWORD was provided). */
  staffPasswordHash: string | null;
  /** Existing global hallmark center ids by code. */
  hallmarkCenterIds: Record<string, string>;
}

// ─── Deterministic ids and randomness ──────────────────────────────

export function eid(ctx: Pick<DemoContext, 'tenantId'>, entity: string, key: string | number): string {
  return demoId(`demo-full:${ctx.tenantId}:${entity}:${key}`);
}

/** Id for GLOBAL (non tenant scoped) reference rows. */
export function gid(entity: string, key: string | number): string {
  return demoId(`demo-full:global:${entity}:${key}`);
}

/** mulberry32: tiny seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;
  constructor(seedKey: string) {
    const h = crypto.createHash('sha1').update(seedKey).digest();
    this.next = mulberry32(h.readUInt32BE(0));
  }
  float(): number {
    return this.next();
  }
  /** Inclusive integer range. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

// ─── Dates (always relative to the run time) ───────────────────────

const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `n` days before `now`, at the given local hour/minute (never later than `now`). */
export function daysAgoAt(now: Date, n: number, hour = 12, minute = 0): Date {
  const base = startOfDay(new Date(now.getTime() - n * DAY_MS));
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute);
  return d.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : d;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function previousMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** yymm exactly as the API number generators compute it (local time). */
export function yymm(d: Date): string {
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** yyyymm as used by the financial number generator. */
export function yyyymm(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function pad(n: number, width = 4): string {
  return String(n).padStart(width, '0');
}

/** Per-prefix counters; numbers are contiguous from 1, like the API's count()+1 generators. */
export class Sequencer {
  private readonly counters = new Map<string, number>();
  next(key: string): number {
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    return n;
  }
}

/**
 * Pick `count` day offsets (0 = today) over the last `spanDays`, weighted towards recent days
 * (about half in the last 30 days), while guaranteeing `minThisMonth` in the current calendar
 * month and `minLastMonth` in the previous one. Result is sorted oldest first (largest offset first).
 */
export function spreadDayOffsets(
  rng: Rng,
  now: Date,
  count: number,
  spanDays = 90,
  minThisMonth = 8,
  minLastMonth = 12,
): number[] {
  const today0 = startOfDay(now).getTime();
  const thisStart = monthStart(now).getTime();
  const lastStart = previousMonthStart(now).getTime();
  const sinceThis = Math.round((today0 - thisStart) / DAY_MS); // 0 on the 1st
  const lastLen = Math.round((thisStart - lastStart) / DAY_MS);
  const out: number[] = [];
  for (let i = 0; i < Math.min(minThisMonth, count); i++) out.push(rng.int(0, sinceThis));
  for (let i = 0; i < Math.min(minLastMonth, Math.max(0, count - out.length)); i++) {
    out.push(sinceThis + 1 + rng.int(0, lastLen - 1));
  }
  while (out.length < count) out.push(Math.min(spanDays, Math.floor(spanDays * Math.pow(rng.float(), 1.6))));
  return out.sort((a, b) => b - a);
}

/** Business-hours minute-of-day for a counter / sale. */
export function businessTime(rng: Rng): { hour: number; minute: number } {
  return { hour: rng.int(10, 20), minute: rng.int(0, 59) };
}

// ─── Money ─────────────────────────────────────────────────────────

export function rupees(n: number): bigint {
  return BigInt(Math.round(n * 100));
}

export function bsum(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

/** Integer division, rounding half up (non-negative operands), like the retail pricing service. */
export function roundDiv(n: bigint, d: bigint): bigint {
  return (n + d / 2n) / d;
}

/** Round paise to the nearest whole rupee (half up). */
export function roundToRupee(p: bigint): bigint {
  return roundDiv(p, 100n) * 100n;
}

// ─── Identity pools ────────────────────────────────────────────────

export const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Isha', 'Vikram', 'Meera', 'Kabir', 'Diya', 'Arjun', 'Saanvi',
  'Rahul', 'Neha', 'Siddharth', 'Pooja', 'Aditya', 'Kavya', 'Nikhil', 'Tanvi', 'Manish', 'Riya',
  'Harsh', 'Shreya', 'Yash', 'Nisha', 'Varun', 'Anjali', 'Gaurav', 'Swati', 'Karan', 'Divya',
  'Mohit', 'Pallavi', 'Sameer', 'Ritika', 'Ashish', 'Komal', 'Deepak', 'Sneha', 'Pranav', 'Bhavna',
  'Tarun', 'Aditi', 'Rajat', 'Simran', 'Vivek', 'Lakshmi', 'Suresh', 'Geeta', 'Imran', 'Farah',
];

export const LAST_NAMES = [
  'Sharma', 'Patel', 'Mehta', 'Iyer', 'Reddy', 'Nair', 'Kapoor', 'Agarwal', 'Jain', 'Singh',
  'Desai', 'Joshi', 'Bansal', 'Chopra', 'Menon', 'Rao', 'Shah', 'Verma', 'Gupta', 'Banerjee',
  'Khan', 'Malhotra', 'Pillai', 'Bhatt', 'Kulkarni',
];

export interface CityInfo {
  city: string;
  state: string;
  stateCode: string;
  pin: string;
  bank: string;
  ifscPrefix: string;
}

export const CITIES: readonly CityInfo[] = [
  { city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pin: '400001', bank: 'HDFC Bank', ifscPrefix: 'HDFC' },
  { city: 'Pune', state: 'Maharashtra', stateCode: '27', pin: '411001', bank: 'ICICI Bank', ifscPrefix: 'ICIC' },
  { city: 'Delhi', state: 'Delhi', stateCode: '07', pin: '110001', bank: 'State Bank of India', ifscPrefix: 'SBIN' },
  { city: 'Jaipur', state: 'Rajasthan', stateCode: '08', pin: '302001', bank: 'Axis Bank', ifscPrefix: 'UTIB' },
  { city: 'Ahmedabad', state: 'Gujarat', stateCode: '24', pin: '380001', bank: 'Bank of Baroda', ifscPrefix: 'BARB' },
  { city: 'Bengaluru', state: 'Karnataka', stateCode: '29', pin: '560001', bank: 'Kotak Mahindra Bank', ifscPrefix: 'KKBK' },
  { city: 'Hyderabad', state: 'Telangana', stateCode: '36', pin: '500001', bank: 'ICICI Bank', ifscPrefix: 'ICIC' },
  { city: 'Kolkata', state: 'West Bengal', stateCode: '19', pin: '700001', bank: 'State Bank of India', ifscPrefix: 'SBIN' },
  { city: 'Chennai', state: 'Tamil Nadu', stateCode: '33', pin: '600001', bank: 'HDFC Bank', ifscPrefix: 'HDFC' },
  { city: 'Surat', state: 'Gujarat', stateCode: '24', pin: '395001', bank: 'Bank of Baroda', ifscPrefix: 'BARB' },
];

/** Customers are weighted towards the home city (Mumbai / Maharashtra) so most sales are intra-state. */
export function pickCity(rng: Rng): CityInfo {
  return rng.chance(0.5) ? (rng.chance(0.65) ? CITIES[0]! : CITIES[1]!) : rng.pick(CITIES);
}

const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function randDigits(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += DIGITS[rng.int(0, 9)];
  return s;
}

export function randLetters(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += UPPER[rng.int(0, 25)];
  return s;
}

/**
 * Fake but format-valid PAN. All demo PANs start with "DMO" so they are recognisably not real.
 * `holder` is the 4th character (P person, C company, F firm, H HUF).
 */
export function fakePan(rng: Rng, holder: 'P' | 'C' | 'F' | 'H', initial: string): string {
  return `DMO${holder}${initial}${randDigits(rng, 4)}${randLetters(rng, 1)}`;
}

/** Fake but checksum-valid (Verhoeff) Aadhaar; never starts with 0 or 1. */
export function fakeAadhaar(rng: Rng): string {
  return withVerhoeffDigit(`${rng.int(2, 9)}${randDigits(rng, 10)}`);
}

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN with the official mod-36 check character. */
export function fakeGstin(stateCode: string, pan: string, entityNo = 1): string {
  const body = `${stateCode}${pan}${entityNo}Z`;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const v = GSTIN_CHARS.indexOf(body[i]!);
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = v * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
  return body + check;
}

/** Valid-format IFSC: 4 letters + 0 + 6 alphanumerics. */
export function fakeIfsc(rng: Rng, prefix: string): string {
  return `${prefix}0${randDigits(rng, 6)}`;
}

export function fakeBankAccount(rng: Rng): string {
  return `${rng.int(1, 9)}${randDigits(rng, 11)}`;
}

/** Unique +91 mobile numbers that never collide with the catalog demo customer (+919820000001). */
export class PhoneBook {
  private readonly used = new Set<string>(['+919820000001']);
  constructor(private readonly rng: Rng) {}
  next(): string {
    for (;;) {
      const p = `+91${this.rng.int(6, 9)}${randDigits(this.rng, 9)}`;
      if (!this.used.has(p)) {
        this.used.add(p);
        return p;
      }
    }
  }
}

export function emailFor(first: string, last: string, n: number): string {
  return `${first}.${last}${n}@example.com`.toLowerCase();
}

// ─── Metal rates ───────────────────────────────────────────────────

/** Rupees per gram, keyed like tenant.settings.metalRates (see seed-demo-catalog-data). */
export function rateKey(productType: string, purity: number | null): string {
  return `${productType}_${purity ?? 0}`;
}

/** Smooth, deterministic price history: exactly 1 today, up to ~7% cheaper 90 days ago. */
export function rateFactor(daysAgo: number): number {
  return 1 + 0.03 * Math.sin(daysAgo / 10) - 0.0004 * daysAgo;
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function pickWeighted<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng.float() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![0];
}

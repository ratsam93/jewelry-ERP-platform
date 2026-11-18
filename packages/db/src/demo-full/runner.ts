/**
 * Orchestration for the full demo seed: plan every module (pure), then insert ONLY the rows
 * whose id does not exist yet, one transaction per module. No process.env / console here so it
 * can be unit tested with an in-memory fake Prisma.
 *
 * Stock: the retail planner emits no stock rows. Stock quantity decrements/increments are carried by
 * `ModulePlan.stockDeltas` (the ops planner turns retail's StockMoves into StockMovement rows plus
 * deltas). They are applied (clamped at 0) once, only when the module's sentinel row is absent at
 * the start of the run, so a second run never applies them again.
 */
import * as bcrypt from 'bcryptjs';
import { chunk, type DemoContext, type ModulePlan, type Row } from './common';
import { DemoSeedRefusal, delegateOf, loadDemoContext, type Db } from './load-context';
import { planCrm, planCustomers } from './plan-crm';
import { planFinance } from './plan-finance';
import { planOps } from './plan-ops';
import { planPeopleCommerce } from './plan-people-commerce';
import { planRetail } from './plan-retail';
import { validatePlans } from './validate-plan';

export const MODULE_KEYS = ['crm', 'retail', 'finance', 'ops', 'peopleCommerce'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface PlannedModule {
  key: ModuleKey | 'locations';
  plan: ModulePlan;
}

/** Earliest `createdAt` of any row that references a customer (used to keep customer.createdAt before it). */
function firstActivityByCustomer(plans: ModulePlan[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const p of plans) {
    for (const t of p.tables) {
      for (const r of t.rows) {
        const cid = r.customerId;
        const at = r.createdAt;
        if (typeof cid !== 'string' || !(at instanceof Date)) continue;
        const prev = out.get(cid);
        if (!prev || at < prev) out.set(cid, at);
      }
    }
  }
  return out;
}

/** Plan everything (pure, deterministic). Order is FK order: crm -> retail -> finance -> ops -> peopleCommerce. */
export function planAll(ctx: DemoContext): PlannedModule[] {
  const customers = planCustomers(ctx);
  const retail = planRetail(ctx, customers);
  const out: PlannedModule[] = [];
  const finance = planFinance(ctx, customers, retail);
  const ops = planOps(ctx, customers, retail);
  const people = planPeopleCommerce(ctx, customers, retail);
  const firstActivity = firstActivityByCustomer([retail.module, finance, ops, people]);
  if (ctx.newLocations.length > 0) {
    out.push({
      key: 'locations',
      plan: {
        name: 'locations',
        sentinel: { model: 'location', id: String(ctx.newLocations[0]!.id) },
        tables: [{ model: 'location', rows: ctx.newLocations }],
        stockDeltas: [],
      },
    });
  }
  out.push({ key: 'crm', plan: planCrm(ctx, customers, retail.salesByCustomer, firstActivity) });
  out.push({ key: 'retail', plan: retail.module });
  out.push({ key: 'finance', plan: finance });
  out.push({ key: 'ops', plan: ops });
  out.push({ key: 'peopleCommerce', plan: people });
  return out;
}

// ─── options ───────────────────────────────────────────────────────

export interface RunOptions {
  dry: boolean;
  only: ModuleKey[] | null;
  skip: ModuleKey[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');
const ALIASES: Record<string, ModuleKey> = {
  crm: 'crm', retail: 'retail', finance: 'finance', financial: 'finance', ops: 'ops', operations: 'ops',
  people: 'peopleCommerce', commerce: 'peopleCommerce', peoplecommerce: 'peopleCommerce', hr: 'peopleCommerce',
};

export function parseRunOptions(env: Record<string, string | undefined>): { ok: true; options: RunOptions } | { ok: false; error: string } {
  const list = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const resolve = (names: string[], label: string): ModuleKey[] | string => {
    const out: ModuleKey[] = [];
    for (const n of names) {
      const k = ALIASES[norm(n)];
      if (!k) return `${label}: unknown module "${n}" (valid: ${MODULE_KEYS.join(', ')})`;
      if (!out.includes(k)) out.push(k);
    }
    return out;
  };
  const only = list(env.ONLY);
  const skip = list(env.SKIP);
  const o = only.length ? resolve(only, 'ONLY') : null;
  const s = resolve(skip, 'SKIP');
  if (typeof o === 'string') return { ok: false, error: o };
  if (typeof s === 'string') return { ok: false, error: s };
  return { ok: true, options: { dry: (env.DRY_RUN ?? '').toLowerCase() === 'true', only: o, skip: s } };
}

export function isSelected(key: PlannedModule['key'], options: RunOptions): boolean {
  if (key === 'locations') return true; // prerequisite of every module
  if (options.only && !options.only.includes(key)) return false;
  return !options.skip.includes(key);
}

// ─── execution ─────────────────────────────────────────────────────

export interface TableReport {
  model: string;
  planned: number;
  alreadyThere: number;
  inserted: number;
}

export interface ModuleReport {
  name: string;
  skipped: boolean;
  tables: TableReport[];
  inserted: number;
  stockDeltasApplied: number;
  ms: number;
}

export interface RunReport {
  dry: boolean;
  modules: ModuleReport[];
  total: number;
  ms: number;
}

export class DemoSeedError extends Error {
  constructor(readonly module: string, readonly table: string | null, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`module "${module}"${table ? `, table "${table}"` : ''}: ${msg.split('\n').slice(-3).join(' ').slice(0, 400)}`);
  }
}

interface WriteDelegate {
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  createMany(args: { data: Row[]; skipDuplicates?: boolean }): Promise<{ count?: number } | undefined>;
  update(args: { where: Record<string, unknown>; data: Row }): Promise<unknown>;
}

const EXISTS_CHUNK = 500;
const INSERT_CHUNK = 250;
const TX_OPTIONS = { maxWait: 60_000, timeout: 900_000 };

async function existingIds(d: WriteDelegate, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(ids, EXISTS_CHUNK)) {
    const rows = await d.findMany({ where: { id: { in: part } }, select: { id: true } });
    for (const r of rows) found.add(String(r.id));
  }
  return found;
}

async function runModule(db: Db, plan: ModulePlan, dry: boolean): Promise<ModuleReport> {
  const started = Date.now();
  const tables: TableReport[] = [];
  let stockApplied = 0;

  const work = async (tx: Db): Promise<void> => {
    const sentinelDelegate = delegateOf<WriteDelegate>(tx, plan.sentinel.model);
    const firstRun = (await existingIds(sentinelDelegate, [plan.sentinel.id])).size === 0;

    for (const table of plan.tables) {
      let current = '';
      try {
        current = table.model;
        const d = delegateOf<WriteDelegate>(tx, table.model);
        const withId = table.rows.filter((r) => typeof r.id === 'string');
        const noId = table.rows.filter((r) => typeof r.id !== 'string');
        const have = await existingIds(d, withId.map((r) => String(r.id)));
        const fresh = [...withId.filter((r) => !have.has(String(r.id))), ...noId];
        let inserted = fresh.length;
        if (!dry && fresh.length > 0) {
          inserted = 0;
          for (const part of chunk(fresh, INSERT_CHUNK)) {
            const res = await d.createMany({ data: part, skipDuplicates: true });
            inserted += typeof res?.count === 'number' ? res.count : part.length;
          }
        }
        tables.push({ model: table.model, planned: table.rows.length, alreadyThere: have.size, inserted });
      } catch (e) {
        throw new DemoSeedError(plan.name, current, e);
      }
    }

    if (firstRun && plan.stockDeltas.length > 0) {
      try {
        const totals = new Map<string, number>();
        for (const s of plan.stockDeltas) totals.set(s.stockItemId, (totals.get(s.stockItemId) ?? 0) + s.delta);
        const stock = delegateOf<WriteDelegate>(tx, 'stockItem');
        for (const part of chunk([...totals.keys()], EXISTS_CHUNK)) {
          const rows = await stock.findMany({ where: { id: { in: part } }, select: { id: true, quantityOnHand: true } });
          for (const r of rows) {
            const next = Math.max(0, Number(r.quantityOnHand ?? 0) + (totals.get(String(r.id)) ?? 0));
            if (!dry) await stock.update({ where: { id: String(r.id) }, data: { quantityOnHand: next } });
            stockApplied++;
          }
        }
      } catch (e) {
        throw new DemoSeedError(plan.name, 'stockItem (stock deltas)', e);
      }
    }
  };

  try {
    if (dry) await work(db);
    else {
      const tx = (db as { $transaction: (fn: (t: Db) => Promise<void>, o: typeof TX_OPTIONS) => Promise<void> }).$transaction;
      await tx.call(db, work, TX_OPTIONS);
    }
  } catch (e) {
    if (e instanceof DemoSeedError) throw e;
    throw new DemoSeedError(plan.name, null, e);
  }
  const inserted = tables.reduce((a, t) => a + t.inserted, 0);
  return { name: plan.name, skipped: false, tables, inserted, stockDeltasApplied: stockApplied, ms: Date.now() - started };
}

export async function runPlans(db: Db, modules: PlannedModule[], options: RunOptions): Promise<RunReport> {
  const started = Date.now();
  const reports: ModuleReport[] = [];
  for (const m of modules) {
    if (!isSelected(m.key, options)) {
      reports.push({ name: m.plan.name, skipped: true, tables: [], inserted: 0, stockDeltasApplied: 0, ms: 0 });
      continue;
    }
    reports.push(await runModule(db, m.plan, options.dry));
  }
  return { dry: options.dry, modules: reports, total: reports.reduce((a, r) => a + r.inserted, 0), ms: Date.now() - started };
}

export function formatReport(report: RunReport, slug: string): string[] {
  const w = report.dry ? 'would insert' : 'inserted';
  const lines = [`demo-full seed [${slug}]${report.dry ? ' (DRY RUN, nothing written)' : ''}`];
  for (const m of report.modules) {
    if (m.skipped) {
      lines.push(`- ${m.name}: skipped (ONLY/SKIP)`);
      continue;
    }
    lines.push(`- ${m.name}: ${w} ${m.inserted} rows${m.stockDeltasApplied ? `, stock rows ${report.dry ? 'to adjust' : 'adjusted'}: ${m.stockDeltasApplied}` : ''} (${m.ms} ms)`);
    for (const t of m.tables) lines.push(`    ${t.model}: ${w} ${t.inserted} of ${t.planned}${t.alreadyThere ? ` (${t.alreadyThere} already present)` : ''}`);
  }
  lines.push(`TOTAL ${w}: ${report.total} rows in ${report.ms} ms`);
  return lines;
}

// ─── top level (env in, report out) ────────────────────────────────

export interface DemoFullResult {
  slug: string;
  report: RunReport;
  staffUsers: boolean;
}

/** Whole pipeline: parse env, load the context (read-only), plan, run. Used by cli.ts and the specs. */
export async function runDemoFull(
  db: Db,
  env: Record<string, string | undefined>,
  now: Date = new Date(),
  hashPassword: (pw: string) => Promise<string> = (pw) => bcrypt.hash(pw, 12), // same library / cost as bootstrap-tenant
): Promise<DemoFullResult> {
  const parsed = parseRunOptions(env);
  if (!parsed.ok) throw new DemoSeedRefusal(parsed.error);
  const slug = (env.TENANT_SLUG ?? '').trim();
  const tenantId = (env.TENANT_ID ?? '').trim();
  if (!slug && !tenantId) throw new DemoSeedRefusal('Set TENANT_SLUG (or TENANT_ID) to the tenant to seed.');
  const staffPw = env.DEMO_STAFF_PASSWORD ?? '';
  let staffPasswordHash: string | null = null;
  if (staffPw) {
    if (staffPw.length < 8) throw new DemoSeedRefusal('DEMO_STAFF_PASSWORD must be at least 8 characters.');
    staffPasswordHash = await hashPassword(staffPw);
  }
  const ctx = await loadDemoContext(db, { tenantId: tenantId || undefined, slug: slug || undefined, now, env, staffPasswordHash });
  const planned = planAll(ctx);
  // Schema check before anything is written (columns, enums, types, duplicate keys). FKs to rows that already exist are trusted.
  const problems = validatePlans(planned.map((m) => m.plan), { isExternal: () => true });
  if (problems.length > 0) throw new DemoSeedRefusal(`Planned data does not match the schema, nothing written: ${problems.slice(0, 5).join('; ')}`);
  const report = await runPlans(db, planned, parsed.options);
  return { slug: ctx.slug, report, staffUsers: staffPasswordHash !== null };
}

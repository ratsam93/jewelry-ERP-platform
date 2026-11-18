/**
 * Validates planned rows against the generated Prisma data model (Prisma.dmmf): known columns, required
 * columns, enum values, value types, primary / unique keys inside the plan, and foreign keys (a referenced
 * row must be planned too, or be reported as existing by `isExternal`). Used by DRY_RUN and by the specs.
 */
import { Prisma } from '@prisma/client';
import type { ModulePlan, Row } from './common';

type DmmfField = {
  name: string; kind: string; type: string; isList: boolean; isRequired: boolean; hasDefaultValue: boolean; isUpdatedAt: boolean; isId: boolean; isUnique?: boolean;
  relationFromFields?: readonly string[]; relationToFields?: readonly string[];
};
type DmmfModel = { name: string; fields: readonly DmmfField[]; uniqueFields: readonly (readonly string[])[] };

export const datamodel = Prisma.dmmf.datamodel as unknown as { models: DmmfModel[]; enums: Array<{ name: string; values: Array<{ name: string }> }> };
const modelsByDelegate = new Map(datamodel.models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), m]));
const modelsByName = new Map(datamodel.models.map((m) => [m.name, m]));
const enumValues = new Map(datamodel.enums.map((e) => [e.name, new Set(e.values.map((v) => v.name))]));

export function modelOf(delegate: string): DmmfModel | undefined {
  return modelsByDelegate.get(delegate);
}

/** Composite uniques shaped [tenantId, field] (the document-number constraints) per delegate. */
export function numberUniques(delegate: string): string[] {
  const m = modelsByDelegate.get(delegate);
  if (!m) return [];
  return m.uniqueFields.filter((u) => u.length === 2 && u[0] === 'tenantId').map((u) => u[1]!);
}

export interface ValidationOptions {
  /** True when (model, id) is known to exist in the database already. */
  isExternal: (modelName: string, field: string, value: unknown) => boolean;
}

export function validatePlans(plans: ModulePlan[], opts: ValidationOptions): string[] {
  const errors: string[] = [];
  const err = (m: string) => {
    if (errors.length < 60) errors.push(m);
  };
  const planned = new Map<string, Row[]>();
  for (const p of plans) for (const t of p.tables) planned.set(t.model, [...(planned.get(t.model) ?? []), ...t.rows]);

  // index primary keys / referenced columns lazily
  const index = new Map<string, Set<unknown>>();
  const has = (delegate: string, field: string, value: unknown): boolean => {
    const k = `${delegate}.${field}`;
    let s = index.get(k);
    if (!s) {
      s = new Set((planned.get(delegate) ?? []).map((r) => r[field]));
      index.set(k, s);
    }
    return s.has(value);
  };

  for (const [delegate, rows] of planned) {
    const model = modelsByDelegate.get(delegate);
    if (!model) {
      err(`unknown model delegate "${delegate}"`);
      continue;
    }
    const scalar = new Map(model.fields.filter((f) => f.kind !== 'object').map((f) => [f.name, f]));
    const relations = model.fields.filter((f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 0);
    const uniques: string[][] = [...model.uniqueFields.map((u) => [...u]), ...model.fields.filter((f) => f.isUnique || f.isId).map((f) => [f.name])];
    const seen = uniques.map(() => new Set<string>());
    rows.forEach((row, ri) => {
      const where = `${model.name}[${ri}]`;
      for (const key of Object.keys(row)) if (!scalar.has(key)) err(`${where}: unknown column ${key}`);
      for (const f of scalar.values()) {
        const v = row[f.name];
        const missing = v === undefined;
        if (missing) {
          if (f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt) err(`${where}: required column ${f.name} is missing`);
          continue;
        }
        if (v === null) {
          if (f.isRequired) err(`${where}: ${f.name} is null but required`);
          continue;
        }
        if (f.kind === 'enum') {
          if (!enumValues.get(f.type)?.has(String(v))) err(`${where}: ${f.name}=${String(v)} is not a valid ${f.type}`);
        } else if (f.type === 'BigInt') {
          if (typeof v !== 'bigint') err(`${where}: ${f.name} must be BigInt`);
        } else if (f.type === 'Int') {
          if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > 2_147_483_647) err(`${where}: ${f.name} must be a 32-bit integer, got ${String(v)}`);
        } else if (f.type === 'Float' || f.type === 'Decimal') {
          if (typeof v !== 'number') err(`${where}: ${f.name} must be a number`);
        } else if (f.type === 'String') {
          if (typeof v !== 'string') err(`${where}: ${f.name} must be a string`);
        } else if (f.type === 'Boolean') {
          if (typeof v !== 'boolean') err(`${where}: ${f.name} must be a boolean`);
        } else if (f.type === 'DateTime') {
          if (!(v instanceof Date) || Number.isNaN(v.getTime())) err(`${where}: ${f.name} must be a valid Date`);
        }
      }
      uniques.forEach((cols, ui) => {
        const vals = cols.map((c) => row[c]);
        if (vals.some((x) => x === null || x === undefined)) return;
        const key = vals.map((x) => String(x)).join('\u0001');
        if (seen[ui]!.has(key)) err(`${where}: duplicate unique key (${cols.join(',')}) = ${key.replace('\u0001', ',')}`);
        seen[ui]!.add(key);
      });
      for (const rel of relations) {
        const from = rel.relationFromFields![0]!;
        const to = rel.relationToFields![0]!;
        const v = row[from];
        if (v === null || v === undefined) continue;
        const target = modelsByName.get(rel.type);
        if (!target) continue;
        const delegate2 = target.name.charAt(0).toLowerCase() + target.name.slice(1);
        if (!has(delegate2, to, v) && !opts.isExternal(target.name, to, v)) err(`${where}: ${from}=${String(v)} has no ${target.name}.${to}`);
      }
    });
  }
  return errors;
}

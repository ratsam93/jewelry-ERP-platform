// ─── Generic tRPC mutation audit ───────────────────────────────
// Every successful staff mutation is recorded in the AuditLog table by a
// fire-and-forget hook. Only ids and a whitelisted set of non-sensitive
// scalar fields are kept: never raw input payloads.

import { Logger } from '@nestjs/common';

const logger = new Logger('MutationAudit');

export interface MutationAuditEvent {
  tenantId: string;
  userId?: string;
  /** Full procedure path, e.g. `hardware.devices.register`. */
  path: string;
  /** Entity code derived from the path minus the verb, e.g. `hardware.devices`. */
  entityType: string;
  /** created | updated | deleted | <verb> */
  action: string;
  entityId: string;
  /** Whitelisted, non-sensitive summary of the call. */
  newValues: Record<string, unknown>;
}

export type MutationAuditSink = (event: MutationAuditEvent) => Promise<unknown> | void;

let sink: MutationAuditSink | null = null;

/** Registered once by PlatformAuditService on module init. */
export function setMutationAuditSink(fn: MutationAuditSink | null): void {
  sink = fn;
}

const CREATE_VERBS = ['create', 'add', 'register', 'insert', 'import', 'upload', 'issue'];
const DELETE_VERBS = ['delete', 'remove', 'archive', 'cancel', 'revoke', 'void'];
const UPDATE_VERBS = [
  'update', 'set', 'save', 'upsert', 'edit', 'toggle', 'assign', 'change', 'rename',
  'activate', 'deactivate', 'approve', 'reject',
];

/** Paths that must never be audited (audit's own procedures, credential changes). */
const SKIP_PATH = /^(platform\.audit\.|auth\.|platform\.users\.(changePassword|resetPassword|setPassword))/i;

/** Keys whose values must never be copied (secrets, tokens, PAN/Aadhaar etc.). */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|otp|\bpin\b|\bpan\b|pannumber|aadhaar|aadhar|card|cvv|account(number)?|ifsc|authorization|apikey|api_key|credential|signature|biometric/i;

/** Non-id scalar fields that are safe and useful to show in the audit trail. */
const SAFE_FIELDS = new Set([
  'name', 'title', 'status', 'type', 'code', 'sku', 'key', 'locale', 'language', 'channel',
  'deviceType', 'connectionType', 'isActive', 'active', 'entityType', 'category', 'label',
  'quantity', 'width', 'height', 'description', 'role', 'subject', 'event',
]);

export function classifyVerb(verb: string): string {
  const v = verb.toLowerCase();
  const starts = (list: string[]) => list.some((p) => v === p || v.startsWith(p));
  if (starts(CREATE_VERBS)) return 'created';
  if (starts(DELETE_VERBS)) return 'deleted';
  if (starts(UPDATE_VERBS)) return 'updated';
  return verb.slice(0, 50);
}

export function deriveEntity(path: string): { entityType: string; action: string } {
  const parts = path.split('.');
  const verb = parts.pop() ?? '';
  return { entityType: parts.join('.').slice(0, 50) || 'unknown', action: classifyVerb(verb) };
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function pickSafe(source: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!isPlain(source)) return out;
  for (const [k, v] of Object.entries(source)) {
    if (SENSITIVE_KEY.test(k)) continue;
    const idLike = k === 'id' || /Id$/.test(k);
    if (!idLike && !SAFE_FIELDS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

const CONTEXT_ID = /^(tenant|user|location|branch|customer|supplier)Id$/;

function firstId(...sources: unknown[]): string | null {
  for (const s of sources) {
    if (!isPlain(s)) continue;
    if (typeof s.id === 'string' && s.id) return s.id;
  }
  for (const s of sources) {
    if (!isPlain(s)) continue;
    for (const [k, v] of Object.entries(s)) {
      if (/Id$/.test(k) && !SENSITIVE_KEY.test(k) && !CONTEXT_ID.test(k) && typeof v === 'string' && v) {
        return v;
      }
    }
  }
  return null;
}

export function buildMutationAuditEvent(args: {
  path: string;
  tenantId: string;
  userId?: string;
  rawInput: unknown;
  output: unknown;
}): MutationAuditEvent | null {
  const { path, tenantId, userId, rawInput, output } = args;
  if (SKIP_PATH.test(path)) return null;
  const { entityType, action } = deriveEntity(path);
  const nested = isPlain(rawInput) && isPlain(rawInput.data) ? rawInput.data : undefined;
  const entityId = firstId(output, rawInput, nested) ?? tenantId;
  return {
    tenantId,
    userId,
    path,
    entityType,
    action,
    entityId: entityId.slice(0, 36),
    newValues: { procedure: path, ...pickSafe(nested), ...pickSafe(rawInput), ...pickSafe(output) },
  };
}

/** Fire-and-forget: never throws, never delays or fails the request. */
export function recordMutationAudit(args: {
  path: string;
  tenantId?: string;
  userId?: string;
  rawInput: unknown;
  output: unknown;
}): void {
  if (!sink || !args.tenantId) return;
  try {
    const event = buildMutationAuditEvent({ ...args, tenantId: args.tenantId });
    if (!event) return;
    Promise.resolve(sink(event)).catch((err: unknown) => {
      logger.debug(`audit write failed for ${args.path}: ${err instanceof Error ? err.message : String(err)}`);
    });
  } catch (err) {
    logger.debug(`audit build failed for ${args.path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

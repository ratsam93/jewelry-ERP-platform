/**
 * RBAC for tRPC procedures.
 *
 * Permission strings come from the JWT (`ctx.userPermissions`), produced by
 * AuthService.extractPermissions from Role.permissions JSON:
 *   Admin            { '*': [create,read,update,delete] }  -> '*.create', '*.read', ... (or bare '*')
 *   Manager          { 'inventory.*': [create,read,update] } -> 'inventory.*.create', ...
 *   Sales Associate  { 'retail.sale': [create,read] }        -> 'retail.sale.read', ...
 *   Accountant       { 'financial.*': [...], 'reports.*': ['read'] }
 * Custom roles created via platform.roles.create use 'module.resource.action'.
 * A ':' separator (module:action) is also accepted.
 *
 * Automatic enforcement works at module + action granularity (resource names
 * in procedure paths do not line up with catalog resource names, e.g. router
 * `retail.sales` vs permission `retail.sale`). `permissionProcedure()` is
 * resource-exact for explicit use.
 */

export type RbacAction = 'read' | 'write';

/** Router (first path segment) -> acceptable permission module names. */
export const MODULE_ALIASES: Record<string, string[]> = {
  inventory: ['inventory'],
  manufacturing: ['manufacturing'],
  financial: ['financial', 'finance'],
  retail: ['retail'],
  crm: ['crm'],
  wholesale: ['wholesale'],
  ecommerce: ['ecommerce'],
  compliance: ['compliance'],
  reporting: ['reporting', 'reports'],
  platform: ['platform'],
  // No payroll permission exists in the role catalog, so payroll rides on financial.
  payroll: ['financial', 'finance', 'payroll'],
  // POS devices (scale, label printers, displays) belong to the retail module
  hardware: ['retail'],
  // India suite: rates, KYC, Girvi, schemes, payments
  india: ['financial', 'finance'],
  // Mapped onto the nearest catalog module
  aml: ['compliance'],
  cms: ['ecommerce'],
  preorder: ['retail'],
  referral: ['crm'],
  digitalGold: ['financial', 'finance'],
  bnpl: ['financial', 'finance'],
  export: ['reporting', 'reports'],
};

/** Routers whose reads are open to any authenticated user holding at least one permission. */
export const ANY_PERMISSION_READ_MODULES = new Set<string>(['search']);

/** Platform sub-routers that every staff user may read (UI shell needs them). */
export const PLATFORM_OPEN_READ_SEGMENTS = new Set<string>(['branches', 'notifications', 'i18n']);

/** Path segments that always require admin-level permission (any router). */
export const SENSITIVE_SEGMENTS = new Set<string>([
  'roles', 'users', 'auth', 'settings', 'billing', 'backup', 'permissions',
]);
/** india sub-routers whose reads every staff user may perform (live metal rates at POS). */
export const INDIA_OPEN_READ_SEGMENTS = new Set<string>(['rates']);

/** Exact procedure paths that require admin-level permission regardless of router mapping. */
export const ADMIN_ONLY_PATHS = new Set<string>(['india.rates.refreshNow']);

/** Sensitive paths that are explicitly self-service and only need authentication. */
export const SENSITIVE_EXEMPT_PATHS = new Set<string>(['platform.users.changePassword']);

export const READ_VERBS = new Set<string>([
  'list', 'get', 'getall', 'search', 'find', 'count', 'summary', 'report', 'preview', 'export',
  'view', 'fetch', 'check', 'lookup', 'stats', 'history', 'calculate', 'validate', 'verify',
  'is', 'has', 'dashboard', 'ledger', 'balance', 'status', 'download', 'compare', 'estimate',
]);
export const WRITE_VERBS = new Set<string>([
  'create', 'add', 'update', 'delete', 'remove', 'set', 'assign', 'invite', 'activate',
  'deactivate', 'approve', 'reject', 'cancel', 'adjust', 'transfer', 'import', 'seed', 'send',
  'register', 'record', 'issue', 'post', 'reverse', 'refund', 'void', 'close', 'reopen',
  'submit', 'confirm', 'complete', 'start', 'finish', 'process', 'generate', 'sync', 'upload',
  'change', 'reset', 'revoke', 'archive', 'restore', 'merge', 'split', 'redeem', 'convert',
]);

/** First camelCase word of a procedure name, lower-cased (getById -> get). */
export function firstWord(name: string): string {
  return (name.match(/^[a-z0-9]+|^[A-Z][a-z0-9]*/)?.[0] ?? name).toLowerCase();
}

/** Classify a procedure action. `type` (query|mutation) is the fallback for unlisted verbs. */
export function classifyAction(procName: string, type?: string): RbacAction {
  const verb = firstWord(procName);
  if (READ_VERBS.has(verb)) return 'read';
  if (WRITE_VERBS.has(verb)) return 'write';
  return type === 'query' ? 'read' : 'write';
}

const parse = (p: string): string[] => p.trim().replace(/:/g, '.').split('.').filter(Boolean);

/** Does a granted action satisfy a required action category? write implies read. */
function actionSatisfies(granted: string, required: RbacAction): boolean {
  if (granted === '*') return true;
  if (required === 'read') return true; // any granted action implies visibility
  return granted !== 'read' && granted !== 'export';
}

function grantedAction(parts: string[]): string {
  return parts.length <= 1 ? '*' : parts[parts.length - 1]!;
}

/** Admin-level: bare '*' or a global wildcard module ('*', '*.read', '*.create', ...). */
export function hasAdminPermission(perms: readonly string[] | undefined, action: RbacAction): boolean {
  for (const raw of perms ?? []) {
    const parts = parse(raw);
    if (parts[0] !== '*') continue;
    if (parts.length > 2) continue; // '*.x.y' is not a global grant
    if (actionSatisfies(grantedAction(parts), action)) return true;
  }
  return false;
}

/** Module-level check used by automatic enforcement. */
export function hasModulePermission(
  perms: readonly string[] | undefined,
  modules: readonly string[],
  action: RbacAction,
): boolean {
  for (const raw of perms ?? []) {
    const parts = parse(raw);
    if (parts[0] !== '*' && !modules.includes(parts[0]!)) continue;
    if (actionSatisfies(grantedAction(parts), action)) return true;
  }
  return false;
}

/** Exact `module.resource.action` check (explicit permissionProcedure). */
export function hasExactPermission(perms: readonly string[] | undefined, required: string): boolean {
  const req = parse(required);
  const rm = req[0];
  const rr = req[1] ?? '*';
  const ra = req[2] ?? '*';
  for (const raw of perms ?? []) {
    const p = parse(raw);
    const m = p[0];
    if (m === '*' && p.length <= 2) return true; // admin global grant (seed '*.create' etc.)
    const a = p.length <= 1 ? '*' : p[p.length - 1]!;
    const r = p.length >= 3 ? p[1]! : '*';
    if (m !== '*' && m !== rm) continue;
    if (r !== '*' && r !== rr) continue;
    if (a !== '*' && a !== ra) continue;
    return true;
  }
  return false;
}

export type RbacDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string; required: string };

/** Decide access for an automatically-derived permission. */
export function evaluateProcedureAccess(
  path: string,
  type: string | undefined,
  perms: readonly string[] | undefined,
): RbacDecision {
  const segs = path.split('.');
  const router = segs[0] ?? '';
  const proc = segs[segs.length - 1] ?? '';
  const action = classifyAction(proc, type);

  if ((perms ?? []).includes('*') || hasAdminPermission(perms, action)) {
    return { allowed: true, reason: 'admin' };
  }

  if (ADMIN_ONLY_PATHS.has(path)) {
    return { allowed: false, reason: 'admin-only procedure', required: `*.${action}` };
  }

  if (SENSITIVE_EXEMPT_PATHS.has(path)) return { allowed: true, reason: 'self-service' };

  if (segs.some((s) => SENSITIVE_SEGMENTS.has(s))) {
    return {
      allowed: false,
      reason: 'sensitive procedure requires admin permission',
      required: `*.${action}`,
    };
  }

  if (ANY_PERMISSION_READ_MODULES.has(router) && action === 'read') {
    return (perms ?? []).length > 0
      ? { allowed: true, reason: 'any-permission-read' }
      : { allowed: false, reason: 'no permissions granted', required: 'any' };
  }

  if (router === 'platform' && action === 'read' && PLATFORM_OPEN_READ_SEGMENTS.has(segs[1] ?? '')) {
    return (perms ?? []).length > 0
      ? { allowed: true, reason: 'platform-open-read' }
      : { allowed: false, reason: 'no permissions granted', required: 'any' };
  }

  if (router === 'india' && action === 'read' && INDIA_OPEN_READ_SEGMENTS.has(segs[1] ?? '')) {
    return (perms ?? []).length > 0
      ? { allowed: true, reason: 'india-open-read' }
      : { allowed: false, reason: 'no permissions granted', required: 'any' };
  }

  const modules = MODULE_ALIASES[router];
  if (!modules) {
    return {
      allowed: false,
      reason: `unmapped router '${router}' requires admin permission`,
      required: `*.${action}`,
    };
  }
  return hasModulePermission(perms, modules, action)
    ? { allowed: true, reason: 'module-permission' }
    : { allowed: false, reason: 'missing permission', required: `${modules[0]}.*.${action}` };
}

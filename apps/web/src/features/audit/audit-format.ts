// Display helpers for the audit log page.

const ENTITY_LABELS: Record<string, string> = {
  'platform.settings': 'Settings',
  'platform.users': 'User',
  'platform.user': 'User',
  'platform.roles': 'Role',
  'platform.branches': 'Branch',
  'platform.branch': 'Branch',
  'platform.i18n': 'Translation',
  'platform.import': 'Data import',
  'platform.export': 'Data export',
  'hardware.devices': 'Hardware device',
  'hardware.device': 'Hardware device',
  'hardware.printer.templates': 'Label template',
  'hardware.rfid': 'RFID tag',
  'crm.customer': 'Customer',
  'inventory.product': 'Product',
  'financial.invoice': 'Invoice',
};

const WORD_FIX: Record<string, string> = { i18n: 'translation', crm: 'CRM', rfid: 'RFID', pos: 'POS', gst: 'GST' };

function singular(word: string): string {
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y');
  if (/(ss|us)$/.test(word)) return word;
  return word.replace(/s$/, '');
}

/** `platform.settings` -> "Settings", `hardware.devices` -> "Hardware device", unknown -> humanized. */
export function entityLabel(entityType: string | null | undefined): string {
  if (!entityType) return '-';
  const known = ENTITY_LABELS[entityType];
  if (known) return known;
  const parts = entityType.split('.').filter(Boolean);
  if (parts.length === 0) return entityType;
  const words = parts.map((p, i) => {
    const lower = WORD_FIX[p.toLowerCase()] ?? p.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return i === parts.length - 1 ? singular(lower) : lower;
  });
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  create: 'Created',
  updated: 'Updated',
  update: 'Updated',
  deleted: 'Deleted',
  delete: 'Deleted',
};

export function actionLabel(action: string | null | undefined): string {
  if (!action) return '-';
  const known = ACTION_LABELS[action.toLowerCase()];
  if (known) return known;
  const spaced = action.replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface AuditUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/** Prefer the joined user's name, then email, then userName; never a raw UUID. */
export function auditUserLabel(row: {
  user?: AuditUser | null;
  userName?: string | null;
  userId?: string | null;
}): string {
  const u = row.user;
  if (u) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    if (name) return u.email ? `${name} (${u.email})` : name;
    if (u.email) return u.email;
  }
  if (row.userName) return row.userName;
  return row.userId ? 'Unknown user' : 'System';
}

/** Convert a yyyy-mm-dd input into an inclusive ISO range bound. */
export function dayStartIso(date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return new Date(`${date}T00:00:00`).toISOString();
}
export function dayEndIso(date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export interface EntityFilterOption {
  label: string;
  /** Comma-separated raw entity types; pass as the `entityType` filter. */
  value: string;
}

/** Entity filter options deduped by display label (merging all raw types that share one label), sorted by label. */
export function entityFilterOptions(types: ReadonlyArray<string>): EntityFilterOption[] {
  const byLabel = new Map<string, string[]>();
  for (const t of types) {
    const label = entityLabel(t);
    const list = byLabel.get(label) ?? [];
    if (!list.includes(t)) list.push(t);
    byLabel.set(label, list);
  }
  return Array.from(byLabel, ([label, values]) => ({ label, value: values.join(',') })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

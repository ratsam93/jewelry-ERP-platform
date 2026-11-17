interface SettingRow {
  settingKey: string;
  settingValue: unknown;
}

/**
 * Flatten platform.settings.getAll output ({ settings: rows[], grouped }) into
 * { key: value }, independent of the category a row happens to be stored under
 * (a key stored under another category used to fall back to the UI default,
 * which made the saved value read back inconsistently).
 */
export function flattenSettings(loaded: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!loaded || typeof loaded !== 'object') return out;
  const obj = loaded as { settings?: SettingRow[]; grouped?: Record<string, Record<string, unknown>> };
  if (Array.isArray(obj.settings)) {
    for (const row of obj.settings) out[row.settingKey] = row.settingValue;
    return out;
  }
  const grouped = obj.grouped ?? (loaded as Record<string, Record<string, unknown>>);
  for (const bucket of Object.values(grouped)) {
    if (bucket && typeof bucket === 'object') Object.assign(out, bucket);
  }
  return out;
}

/** Coerce a stored JSON value to boolean (handles "true"/"false" strings). */
export function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

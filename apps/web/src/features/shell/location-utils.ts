const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LocationRow {
  id: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

export interface LocationOption {
  id: string;
  name: string;
}

/**
 * Active, de-duplicated labels for the location switcher. Locations that share
 * a name get " (city, #ref)" appended so they can be told apart.
 */
export function toLocationOptions(rows: ReadonlyArray<LocationRow> | undefined): LocationOption[] {
  const active = (rows ?? []).filter((r) => r.isActive !== false);
  const counts = new Map<string, number>();
  for (const r of active) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return active.map((r) => {
    if ((counts.get(r.name) ?? 0) < 2) return { id: r.id, name: r.name };
    const ref = r.id.replace(/-/g, '').slice(0, 6);
    return { id: r.id, name: `${r.name} (${r.city ? `${r.city}, ` : ''}#${ref})` };
  });
}

/**
 * Value to send as `locationId` to procedures. Returns undefined for "All
 * locations" and for stale persisted values (the old UI stored fake ids such
 * as "branch-1", which the API's uuid validation would reject).
 */
export function toLocationFilter(activeBranchId: string | null | undefined): string | undefined {
  return activeBranchId && UUID_RE.test(activeBranchId) ? activeBranchId : undefined;
}

export interface PosBranch {
  id: string;
  name: string;
  locationType: string;
  isActive?: boolean;
  isDefault?: boolean;
  isPrimary?: boolean;
}

/**
 * Choose the location the POS should open on.
 * Preference: primary/default location with stock, then a showroom with stock,
 * then any location with stock, then (no stock data) primary/showroom/first.
 */
export function pickDefaultLocation(
  branches: PosBranch[],
  locationIdsWithStock?: ReadonlySet<string> | null,
): string {
  if (branches.length === 0) return '';
  const isPrimary = (b: PosBranch) => Boolean(b.isPrimary || b.isDefault);
  const isShowroom = (b: PosBranch) => b.locationType === 'SHOWROOM';
  const hasStock = (b: PosBranch) => !locationIdsWithStock || locationIdsWithStock.has(b.id);
  const stocked = branches.filter(hasStock);
  const pool = stocked.length > 0 ? stocked : branches;
  const pick = pool.find(isPrimary) ?? pool.find(isShowroom) ?? pool[0];
  return pick.id;
}

/** Drop repeated ids (a branch listed twice) keeping the first occurrence. */
export function dedupeBranches<T extends { id: string }>(branches: T[]): T[] {
  const seen = new Set<string>();
  return branches.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

/**
 * Option labels for the location selector. Distinct locations that share the
 * same name and type get a short id suffix so they can be told apart.
 */
export function branchOptionLabels(branches: PosBranch[]): Map<string, string> {
  const counts = new Map<string, number>();
  const key = (b: PosBranch) => `${b.name}|${b.locationType}`;
  for (const b of branches) counts.set(key(b), (counts.get(key(b)) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const b of branches) {
    const base = `${b.name} (${b.locationType})`;
    out.set(b.id, (counts.get(key(b)) ?? 0) > 1 ? `${base} #${b.id.slice(0, 6)}` : base);
  }
  return out;
}

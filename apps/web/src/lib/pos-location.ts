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

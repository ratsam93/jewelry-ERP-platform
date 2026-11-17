export interface BranchLike {
  id: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

/**
 * Short disambiguator for locations that share a name (the demo has two
 * "Main Showroom - Zaveri Bazaar"): "<city>, <state> - #<first 6 of id>".
 */
export function branchDisplayHint(b: BranchLike): string {
  const place = [b.city, b.state].filter((x): x is string => !!x && x.trim().length > 0).join(', ');
  const ref = `#${b.id.replace(/-/g, '').slice(0, 6)}`;
  return place ? `${place} - ${ref}` : `Ref ${ref}`;
}

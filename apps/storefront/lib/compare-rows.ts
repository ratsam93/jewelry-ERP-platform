// Row building for the compare table: merge duplicate labels and fix label spacing.

/** "Making Charges(Flat)" -> "Making Charges (Flat)" */
export function normalizeLabel(label: string): string {
  return label.replace(/(\S)\(/g, "$1 (").replace(/\s{2,}/g, " ").trim();
}

function key(label: string): string {
  return normalizeLabel(label).toLowerCase();
}

/**
 * Specification labels that duplicate a built-in row (e.g. "Occasion") are
 * dropped from the spec list and their values are merged into that built-in row.
 */
export function dedupeSpecLabels(specLabels: string[], builtinLabels: string[]): string[] {
  const seen = new Set(builtinLabels.map(key));
  const out: string[] = [];
  for (const raw of specLabels) {
    const k = key(raw);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(raw);
  }
  return out;
}

/** Merge comma-separated value lists case-insensitively, keeping first-seen casing. */
export function mergeValues(...lists: Array<string | string[] | undefined | null>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lists) {
    const parts = Array.isArray(l) ? l : (l ?? "").split(",");
    for (const p of parts) {
      const v = p.trim();
      if (!v || v === "-") continue;
      const k = v.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    }
  }
  return out.join(", ");
}

/** Look up a spec value tolerant of label spacing/case differences. */
export function specValue(specs: Record<string, string>, label: string): string | undefined {
  const k = key(label);
  for (const [name, value] of Object.entries(specs)) {
    if (key(name) === k) return value;
  }
  return undefined;
}

/** Global throttler bucket settings resolved from the environment. */
export interface ThrottleConfig {
  /** Max requests per IP within `ttl`. */
  limit: number;
  /** Window length in milliseconds. */
  ttl: number;
}

export const DEFAULT_THROTTLE_LIMIT = 100;
export const DEFAULT_THROTTLE_TTL_MS = 60_000;

/** Returns `raw` as a positive integer, or `fallback` when unset or invalid. */
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Resolves the global throttler config from THROTTLE_LIMIT and THROTTLE_TTL_MS.
 * Unset, non-numeric, zero, negative or non-integer values fall back to the defaults.
 */
export function resolveThrottleConfig(
  env: Record<string, string | undefined>,
): ThrottleConfig {
  return {
    limit: parsePositiveInt(env.THROTTLE_LIMIT, DEFAULT_THROTTLE_LIMIT),
    ttl: parsePositiveInt(env.THROTTLE_TTL_MS, DEFAULT_THROTTLE_TTL_MS),
  };
}

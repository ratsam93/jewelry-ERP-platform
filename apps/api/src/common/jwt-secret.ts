import { randomBytes } from 'crypto';

/** Algorithms accepted for every JWT verification in the API. */
export const JWT_ALGORITHMS: ['HS256'] = ['HS256'];

const MIN_SECRET_LENGTH = 32;
let devSecret: string | undefined;

/**
 * Single source of truth for the JWT signing secret.
 * - Production: JWT_SECRET is mandatory and must be >= 32 chars, otherwise throws.
 * - Non-production: if JWT_SECRET is unset, a random per-process secret is used
 *   (tokens do not survive a restart). There is no publicly known default.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`,
    );
  }
  if (secret) {
    // Set but too short outside production: allow it, but it is weak.
    return secret;
  }
  if (!devSecret) {
    devSecret = randomBytes(48).toString('hex');
    // eslint-disable-next-line no-console
    console.warn('[security] JWT_SECRET not set; using a random per-process dev secret');
  }
  return devSecret;
}

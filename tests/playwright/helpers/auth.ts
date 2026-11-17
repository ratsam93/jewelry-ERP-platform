import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from '@playwright/test';

/**
 * Shared auth + login-rate-limit helpers.
 *
 * The API login route is limited to 5 requests/minute/IP. Instead of every test logging in:
 *  - global-setup logs in ONCE and caches the tokens (reused across chunked runs while still valid);
 *  - tests that must exercise the real login endpoint/form call `loginSlot()` first, which spaces
 *    login attempts (cross-process, via a small timestamp file) so they never hit 429.
 */
export const DEMO = {
  tenantSlug: 'sharma-jewellers',
  email: 'admin@sharmajewellers.com',
  password: 'admin123',
};

/** Storefront (B2C) test customer. Staff users are not storefront customers, so global-setup registers it once. */
export const E2E_CUSTOMER = {
  tenantSlug: DEMO.tenantSlug,
  email: process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@example.com',
  password: process.env.E2E_CUSTOMER_PASSWORD || 'E2eCustomer#2026',
  firstName: 'E2E',
  lastName: 'Customer',
};

const TOKEN_FILE = path.join(os.tmpdir(), 'caratflow-e2e-tokens.json');
const SLOT_FILE = path.join(os.tmpdir(), 'caratflow-e2e-login-slots.json');
const LOCK_DIR = path.join(os.tmpdir(), 'caratflow-e2e-login-slots.lock');
const WINDOW_MS = 62_000;
const MAX_PER_WINDOW = 4; // API limit is 5/min; keep one spare for manual requests

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  customer?: { accessToken: string; refreshToken: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 600; i++) {
    try {
      fs.mkdirSync(LOCK_DIR);
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(LOCK_DIR).mtimeMs > 120_000) fs.rmdirSync(LOCK_DIR);
      } catch {
        /* ignore */
      }
      await sleep(100);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.rmdirSync(LOCK_DIR);
    } catch {
      /* ignore */
    }
  }
}

/** Reserve a login slot; resolves when a login request may be sent without tripping the 5/min limit. */
export async function loginSlot(): Promise<void> {
  // Make sure the running test's timeout tolerates the wait.
  try {
    test.info().setTimeout(test.info().timeout + 70_000);
  } catch {
    /* not inside a test (global setup) */
  }
  // The lock is held while waiting so concurrent workers queue up in order.
  await withLock(async () => {
    for (;;) {
      let slots: number[] = [];
      try {
        slots = JSON.parse(fs.readFileSync(SLOT_FILE, 'utf8'));
      } catch {
        /* none yet */
      }
      const now = Date.now();
      slots = slots.filter((t) => now - t < WINDOW_MS);
      if (slots.length < MAX_PER_WINDOW) {
        slots.push(now);
        fs.writeFileSync(SLOT_FILE, JSON.stringify(slots));
        return;
      }
      await sleep(Math.max(250, WINDOW_MS - (now - slots[0]) + 100));
    }
  });
}

export function readTokens(): Tokens | null {
  try {
    const t = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    return t?.accessToken ? t : null;
  } catch {
    return null;
  }
}

export function writeTokens(t: Tokens): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t));
}

/** True if the JWT is valid for at least `minMs` more milliseconds. */
export function tokenFresh(accessToken: string, minMs = 5 * 60_000): boolean {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
    return payload.exp * 1000 - Date.now() > minMs;
  } catch {
    return false;
  }
}

/** Access token produced by global setup (throws if setup did not run). */
export function sharedAccessToken(): string {
  const t = readTokens();
  if (!t) throw new Error('No shared auth tokens: global-setup did not run or login failed');
  return t.accessToken;
}

/** Storefront customer tokens produced by global setup. */
export function customerTokens(): { accessToken: string; refreshToken: string } {
  const t = readTokens();
  if (!t?.customer) throw new Error('No shared customer tokens: global-setup did not run or customer login failed');
  return t.customer;
}

export function sharedTokens(): Tokens {
  const t = readTokens();
  if (!t) throw new Error('No shared auth tokens: global-setup did not run or login failed');
  return t;
}

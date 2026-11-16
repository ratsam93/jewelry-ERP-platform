import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_KEYS = ['JWT_SECRET', 'NODE_ENV'] as const;
const LONG_SECRET = 'x'.repeat(32);

/** Re-import the module so its module-level dev secret cache starts empty. */
async function loadFresh() {
  vi.resetModules();
  return await import('../jwt-secret');
}

describe('jwt-secret', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  describe('JWT_ALGORITHMS', () => {
    it('allows only HS256', async () => {
      const { JWT_ALGORITHMS } = await loadFresh();
      expect(JWT_ALGORITHMS).toEqual(['HS256']);
    });
  });

  describe('getJwtSecret in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns JWT_SECRET when it is at least 32 characters', async () => {
      process.env.JWT_SECRET = LONG_SECRET;
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toBe(LONG_SECRET);
    });

    it('accepts a secret of exactly 32 characters', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toHaveLength(32);
    });

    it('throws when JWT_SECRET is unset', async () => {
      delete process.env.JWT_SECRET;
      const { getJwtSecret } = await loadFresh();
      expect(() => getJwtSecret()).toThrow(/JWT_SECRET must be set to at least 32 characters/);
    });

    it('throws when JWT_SECRET is empty', async () => {
      process.env.JWT_SECRET = '';
      const { getJwtSecret } = await loadFresh();
      expect(() => getJwtSecret()).toThrow(/at least 32 characters in production/);
    });

    it('throws when JWT_SECRET is shorter than 32 characters', async () => {
      process.env.JWT_SECRET = 'x'.repeat(31);
      const { getJwtSecret } = await loadFresh();
      expect(() => getJwtSecret()).toThrow();
    });
  });

  describe('getJwtSecret outside production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('returns JWT_SECRET when set and long enough', async () => {
      process.env.JWT_SECRET = LONG_SECRET;
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toBe(LONG_SECRET);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('returns a short JWT_SECRET as-is (allowed outside production)', async () => {
      process.env.JWT_SECRET = 'short';
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toBe('short');
    });

    it('generates a random per-process secret when JWT_SECRET is unset', async () => {
      delete process.env.JWT_SECRET;
      const { getJwtSecret } = await loadFresh();
      const secret = getJwtSecret();
      expect(secret).toMatch(/^[0-9a-f]{96}$/);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('returns the same random secret across calls', async () => {
      delete process.env.JWT_SECRET;
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toBe(getJwtSecret());
      // The warning is emitted only once, when the secret is generated.
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('generates a different secret in each fresh module instance', async () => {
      delete process.env.JWT_SECRET;
      const first = (await loadFresh()).getJwtSecret();
      const second = (await loadFresh()).getJwtSecret();
      expect(first).not.toBe(second);
    });

    it('treats an empty JWT_SECRET as unset and generates a random secret', async () => {
      process.env.JWT_SECRET = '';
      const { getJwtSecret } = await loadFresh();
      expect(getJwtSecret()).toMatch(/^[0-9a-f]{96}$/);
    });
  });
});

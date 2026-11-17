import { describe, it, expect } from 'vitest';
import {
  resolveThrottleConfig,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
} from '../common/throttle-config';

describe('resolveThrottleConfig', () => {
  it('returns the defaults when no env vars are set', () => {
    expect(resolveThrottleConfig({})).toEqual({
      limit: 100,
      ttl: 60_000,
    });
    expect(DEFAULT_THROTTLE_LIMIT).toBe(100);
    expect(DEFAULT_THROTTLE_TTL_MS).toBe(60_000);
  });

  it('uses valid overrides from the environment', () => {
    expect(
      resolveThrottleConfig({ THROTTLE_LIMIT: '250', THROTTLE_TTL_MS: '30000' }),
    ).toEqual({ limit: 250, ttl: 30_000 });
  });

  it('applies an override to only one of the two variables', () => {
    expect(resolveThrottleConfig({ THROTTLE_LIMIT: '5' })).toEqual({
      limit: 5,
      ttl: 60_000,
    });
    expect(resolveThrottleConfig({ THROTTLE_TTL_MS: '1000' })).toEqual({
      limit: 100,
      ttl: 1000,
    });
  });

  it.each(['NaN', 'abc', '0', '-5', '-1', '1.5', 'Infinity', '', '   '])(
    'falls back to defaults for invalid value %j',
    (raw) => {
      expect(
        resolveThrottleConfig({ THROTTLE_LIMIT: raw, THROTTLE_TTL_MS: raw }),
      ).toEqual({ limit: 100, ttl: 60_000 });
    },
  );
});

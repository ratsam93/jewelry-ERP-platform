import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccessTokenDenylistService } from '../access-token-denylist.service';

const NOW_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
const nowSec = () => Math.floor(Date.now() / 1000);

describe('AccessTokenDenylistService', () => {
  let svc: AccessTokenDenylistService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    svc = new AccessTokenDenylistService();
  });

  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
  });

  it('reports a revoked jti as revoked until its expiry', () => {
    svc.revoke('jti-1', nowSec() + 600);
    expect(svc.isRevoked('jti-1')).toBe(true);
  });

  it('does not report unknown jtis as revoked', () => {
    expect(svc.isRevoked('never-seen')).toBe(false);
  });

  it('returns false for an undefined jti', () => {
    svc.revoke(undefined, nowSec() + 600);
    expect(svc.isRevoked(undefined)).toBe(false);
  });

  it('ignores revoke calls without a jti', () => {
    svc.revoke(undefined, nowSec() + 600);
    expect((svc as unknown as { revoked: Map<string, number> }).revoked.size).toBe(0);
  });

  it('ignores revoke calls without an expiry', () => {
    svc.revoke('jti-noexp', undefined);
    expect(svc.isRevoked('jti-noexp')).toBe(false);
  });

  it('ignores revoke calls for tokens that have already expired', () => {
    svc.revoke('jti-past', nowSec() - 1);
    expect(svc.isRevoked('jti-past')).toBe(false);
    expect((svc as unknown as { revoked: Map<string, number> }).revoked.size).toBe(0);
  });

  it('stops reporting a jti as revoked once its expiry has passed', () => {
    svc.revoke('jti-2', nowSec() + 60);
    expect(svc.isRevoked('jti-2')).toBe(true);
    vi.setSystemTime(NOW_MS + 61_000);
    expect(svc.isRevoked('jti-2')).toBe(false);
    // The stale entry is removed lazily on read.
    expect((svc as unknown as { revoked: Map<string, number> }).revoked.has('jti-2')).toBe(false);
  });

  it('keeps a revocation at the exact moment before expiry', () => {
    svc.revoke('jti-3', nowSec() + 60);
    vi.setSystemTime(NOW_MS + 59_000);
    expect(svc.isRevoked('jti-3')).toBe(true);
  });

  it('sweeps expired entries every five minutes', () => {
    svc.revoke('jti-short', nowSec() + 60);
    svc.revoke('jti-long', nowSec() + 3600);
    const map = (svc as unknown as { revoked: Map<string, number> }).revoked;
    expect(map.size).toBe(2);

    vi.setSystemTime(NOW_MS + 2 * 60_000);
    vi.advanceTimersByTime(5 * 60_000);

    expect(map.has('jti-short')).toBe(false);
    expect(map.has('jti-long')).toBe(true);
  });

  it('clears its sweep timer on module destroy', () => {
    const before = vi.getTimerCount();
    svc.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(before - 1);
  });
});

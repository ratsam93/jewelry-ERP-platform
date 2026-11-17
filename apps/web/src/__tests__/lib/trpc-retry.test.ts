import { describe, it, expect } from 'vitest';
import { shouldRetryQuery } from '@/lib/query-retry';

describe('shouldRetryQuery', () => {
  it('does not retry NOT_FOUND', () => {
    expect(shouldRetryQuery(0, { data: { code: 'NOT_FOUND' } })).toBe(false);
  });

  it('does not retry FORBIDDEN', () => {
    expect(shouldRetryQuery(0, { data: { code: 'FORBIDDEN' } })).toBe(false);
  });

  it('does not retry UNAUTHORIZED or BAD_REQUEST', () => {
    expect(shouldRetryQuery(0, { data: { code: 'UNAUTHORIZED' } })).toBe(false);
    expect(shouldRetryQuery(0, { data: { code: 'BAD_REQUEST' } })).toBe(false);
  });

  it('retries network errors on attempts 0 and 1 but not at 2', () => {
    const networkError = new TypeError('Failed to fetch');
    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(1, networkError)).toBe(true);
    expect(shouldRetryQuery(2, networkError)).toBe(false);
  });

  it('retries server errors with no tRPC code', () => {
    expect(shouldRetryQuery(0, { data: { code: 'INTERNAL_SERVER_ERROR' } })).toBe(true);
    expect(shouldRetryQuery(0, null)).toBe(true);
  });
});

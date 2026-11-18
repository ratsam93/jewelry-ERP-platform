import { describe, it, expect } from 'vitest';
import { ApiError, extractErrorCode, extractErrorMessage, loginErrorMessage } from '@/lib/api-error';

describe('extractErrorMessage', () => {
  it('handles a plain string', () => expect(extractErrorMessage('Boom')).toBe('Boom'));
  it('handles {error: string}', () => expect(extractErrorMessage({ error: 'Nope' })).toBe('Nope'));
  it('handles {error:{message,code}}', () => {
    expect(
      extractErrorMessage({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid tenant' } }),
    ).toBe('Invalid tenant');
  });
  it('falls back to error.details', () => {
    expect(extractErrorMessage({ error: { code: 'X', details: ['a is required', { message: 'b is bad' }] } })).toBe(
      'a is required, b is bad',
    );
  });
  it('handles {message: string}', () => expect(extractErrorMessage({ message: 'Bad' })).toBe('Bad'));
  it('joins class-validator arrays', () => {
    expect(extractErrorMessage({ message: ['email must be an email', 'password too short'] })).toBe(
      'email must be an email, password too short',
    );
  });
  it('handles tRPC shapes', () => {
    expect(extractErrorMessage({ error: { json: { message: 'TRPC fail', data: { code: 'FORBIDDEN' } } } })).toBe('TRPC fail');
    expect(extractErrorMessage({ message: 'Direct', data: { code: 'UNAUTHORIZED' } })).toBe('Direct');
    expect(extractErrorMessage([{ error: { json: { message: 'Batch fail' } } }])).toBe('Batch fail');
  });
  it('handles Error and network errors', () => {
    expect(extractErrorMessage(new Error('Oops'))).toBe('Oops');
    expect(extractErrorMessage(new TypeError('Failed to fetch'))).toMatch(/could not reach the server/i);
  });
  it('uses the fallback and never returns [object Object]', () => {
    expect(extractErrorMessage(null, 'fb')).toBe('fb');
    expect(extractErrorMessage({ error: {} }, 'fb')).toBe('fb');
    expect(extractErrorMessage({ error: { code: 7 } })).not.toContain('[object Object]');
  });
});

describe('extractErrorCode', () => {
  it('reads error.code, code and tRPC data.code', () => {
    expect(extractErrorCode({ error: { code: 'UNAUTHORIZED' } })).toBe('UNAUTHORIZED');
    expect(extractErrorCode({ code: 'C' })).toBe('C');
    expect(extractErrorCode({ data: { code: 'D' } })).toBe('D');
    expect(extractErrorCode('x')).toBeUndefined();
  });
});

describe('loginErrorMessage', () => {
  const err = (message: string, status: number, code?: string) => new ApiError(message, status, code);
  it('maps Invalid tenant', () => {
    expect(loginErrorMessage(err('Invalid tenant', 401, 'UNAUTHORIZED'))).toBe(
      'We could not find that business. Check the business name (slug).',
    );
  });
  it('maps invalid credentials', () => {
    expect(loginErrorMessage(err('Invalid credentials', 401, 'UNAUTHORIZED'))).toBe('Incorrect email or password.');
    expect(loginErrorMessage(err('Invalid email or password', 401))).toBe('Incorrect email or password.');
  });
  it('maps 429 / rate limit', () => {
    const msg = 'Too many attempts. Please wait a minute and try again.';
    expect(loginErrorMessage(err('ThrottlerException: Too Many Requests', 429))).toBe(msg);
    expect(loginErrorMessage(err('slow down', 400, 'RATE_LIMITED'))).toBe(msg);
  });
  it('shows the API message for a locked account', () => {
    expect(loginErrorMessage(err('Account locked until 10:30', 403, 'ACCOUNT_LOCKED'))).toBe('Account locked until 10:30');
  });
  it('shows network errors readably and falls back otherwise', () => {
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toMatch(/could not reach the server/i);
    expect(loginErrorMessage(err('Something odd', 500))).toBe('Something odd');
    expect(loginErrorMessage(null)).toBe('Login failed. Please try again.');
  });
});

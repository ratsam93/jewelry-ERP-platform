import { describe, it, expect } from 'vitest';
import { formatServerError } from '../form-errors';

describe('formatServerError', () => {
  it('renders zod issue JSON as readable lines', () => {
    const raw = JSON.stringify([
      { code: 'invalid_format', path: ['locationId'], message: 'Invalid UUID' },
      { code: 'invalid_format', path: ['items', 0, 'productId'], message: 'Invalid UUID' },
    ]);
    expect(formatServerError(raw)).toBe('Location ID: Invalid UUID\nItems › item 1 › Product ID: Invalid UUID');
  });
  it('passes plain messages through and handles empty', () => {
    expect(formatServerError('Center not found')).toBe('Center not found');
    expect(formatServerError(undefined)).toMatch(/went wrong/);
  });
});

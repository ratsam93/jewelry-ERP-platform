import { describe, it, expect } from 'vitest';
import { maskAadhaar, maskBankAccount, maskPan } from '@/lib/pii';

describe('pii masks (same formats as the API)', () => {
  it('masks PAN, Aadhaar and bank account', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABXXXXXXXF');
    expect(maskAadhaar('234567890124')).toBe('XXXX-XXXX-0124');
    expect(maskBankAccount('123456789012')).toBe('XXXXXXXX9012');
  });
  it('is idempotent on already-masked values and null-safe', () => {
    expect(maskPan('ABXXXXXXXF')).toBe('ABXXXXXXXF');
    expect(maskAadhaar('XXXX-XXXX-0124')).toBe('XXXX-XXXX-0124');
    expect(maskBankAccount('XXXXXXXX9012')).toBe('XXXXXXXX9012');
    expect(maskPan(null)).toBeNull();
    expect(maskAadhaar(undefined)).toBeNull();
    expect(maskBankAccount('')).toBeNull();
  });
});

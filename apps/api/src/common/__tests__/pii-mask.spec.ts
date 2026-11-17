import { describe, it, expect } from 'vitest';
import {
  maskPan,
  maskAadhaar,
  maskBankAccount,
  maskCustomerIdentifiers,
  maskSensitiveDeep,
} from '../pii-mask';

describe('pii-mask', () => {
  it('maskPan keeps first 2 and last 1', () => {
    expect(maskPan('ABCPS1234F')).toBe('ABXXXXXXXF');
    expect(maskPan(null)).toBeNull();
    expect(maskPan('AB')).toBe('XX');
  });

  it('maskAadhaar keeps last 4', () => {
    expect(maskAadhaar('234567890124')).toBe('XXXX-XXXX-0124');
    expect(maskAadhaar('')).toBeNull();
  });

  it('maskBankAccount keeps last 4', () => {
    expect(maskBankAccount('123456789012')).toBe('XXXXXXXX9012');
    expect(maskBankAccount('123')).toBe('XXX');
    expect(maskBankAccount(undefined)).toBeNull();
  });

  it('maskCustomerIdentifiers does not mutate input', () => {
    const row = { id: '1', panNumber: 'ABCPS1234F', aadhaarNumber: '234567890124' };
    const out = maskCustomerIdentifiers(row);
    expect(out).toEqual({ id: '1', panNumber: 'ABXXXXXXXF', aadhaarNumber: 'XXXX-XXXX-0124' });
    expect(row.panNumber).toBe('ABCPS1234F');
  });

  it('maskSensitiveDeep masks nested identifiers and strips secrets', () => {
    const when = new Date('2026-01-01');
    const input = {
      id: 'loan-1',
      amount: 5n,
      createdAt: when,
      customer: { firstName: 'A', panNumber: 'ABCPS1234F', aadhaarNumber: '234567890124' },
      members: [{ customer: { aadhaarNumber: '111122223333' }, bankAccountNumber: '123456789012' }],
      gateway: { apiKey: 'k', apiSecret: 's', webhookSecret: 'w', passwordHash: 'h', name: 'razorpay' },
      accountNumber: '9876543210',
    };
    const out = maskSensitiveDeep(input);
    expect(out.customer.panNumber).toBe('ABXXXXXXXF');
    expect(out.customer.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(out.members[0]!.customer.aadhaarNumber).toBe('XXXX-XXXX-3333');
    expect(out.members[0]!.bankAccountNumber).toBe('XXXXXXXX9012');
    expect(out.accountNumber).toBe('XXXXXX3210');
    expect(out.gateway).toEqual({ name: 'razorpay' });
    expect(out.amount).toBe(5n);
    expect(out.createdAt).toBe(when);
    expect(input.customer.panNumber).toBe('ABCPS1234F');
  });

  it('maskSensitiveDeep keeps null identifiers as null', () => {
    const out = maskSensitiveDeep({ panNumber: null, aadhaarNumber: null });
    expect(out).toEqual({ panNumber: null, aadhaarNumber: null });
  });
});

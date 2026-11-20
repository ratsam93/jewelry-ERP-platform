import { describe, it, expect } from 'vitest';
import {
  generateStrongPassword,
  passwordIssues,
  passwordStrength,
  validateCreateUser,
  validateNewPassword,
} from '../password-tools';

describe('generateStrongPassword', () => {
  it('is 16 characters long and always contains all four character classes', () => {
    for (let i = 0; i < 300; i++) {
      const p = generateStrongPassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
      expect(passwordIssues(p)).toEqual([]);
    }
  });

  it('does not repeat (uses crypto randomness)', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateStrongPassword()));
    expect(set.size).toBe(200);
  });
});

describe('passwordIssues / passwordStrength', () => {
  it('flags every missing requirement', () => {
    expect(passwordIssues('abc')).toEqual([
      'Use at least 10 characters.',
      'Add an uppercase letter.',
      'Add a number.',
      'Add a symbol.',
    ]);
    expect(passwordIssues('Str0ng!Passw0rd')).toEqual([]);
  });

  it('rates strength', () => {
    expect(passwordStrength('')).toBe('empty');
    expect(passwordStrength('abc')).toBe('weak');
    expect(passwordStrength('abcdefghijkl')).toBe('fair');
    expect(passwordStrength('Str0ng!Passw0rd')).toBe('strong');
  });
});

describe('form validation', () => {
  const ok = {
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.co',
    roleId: 'r1',
    password: 'Str0ng!Passw0rd',
    confirmPassword: 'Str0ng!Passw0rd',
  };

  it('accepts a complete form', () => {
    expect(validateCreateUser(ok)).toEqual({});
  });

  it('reports readable errors per field', () => {
    const e = validateCreateUser({ ...ok, firstName: ' ', email: 'nope', roleId: '', password: 'short', confirmPassword: 'x' });
    expect(Object.keys(e).sort()).toEqual(['confirmPassword', 'email', 'firstName', 'password', 'roleId']);
    expect(e.password).toContain('at least 10 characters');
  });

  it('validates a new password and its confirmation', () => {
    expect(validateNewPassword('Str0ng!Passw0rd', 'Str0ng!Passw0rd')).toEqual({});
    expect(validateNewPassword('Str0ng!Passw0rd', 'different').confirmPassword).toBe('Passwords do not match.');
    expect(validateNewPassword('weak', 'weak').password).toBeTruthy();
  });
});

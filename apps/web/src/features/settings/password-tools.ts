/**
 * Staff password helpers. The policy mirrors the API (packages/shared-types
 * getStaffPasswordIssues): 10-128 characters with an uppercase letter, a
 * lowercase letter, a digit and a symbol.
 */

export const PASSWORD_HINT = 'At least 10 characters with an uppercase letter, a lowercase letter, a number and a symbol.';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Unbiased random integer in [0, max) using crypto.getRandomValues (rejection sampling). */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0]! >= limit);
  return buf[0]! % max;
}

/** 16-character password that always contains all four character classes. */
export function generateStrongPassword(length = 16): string {
  const len = Math.max(length, 10);
  const chars = [
    UPPER[randomInt(UPPER.length)]!,
    LOWER[randomInt(LOWER.length)]!,
    DIGITS[randomInt(DIGITS.length)]!,
    SYMBOLS[randomInt(SYMBOLS.length)]!,
  ];
  while (chars.length < len) chars.push(ALL[randomInt(ALL.length)]!);
  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/** Human-readable policy problems; empty array when the password is acceptable. */
export function passwordIssues(p: string): string[] {
  const issues: string[] = [];
  if (p.length < 10) issues.push('Use at least 10 characters.');
  if (p.length > 128) issues.push('Use at most 128 characters.');
  if (!/[A-Z]/.test(p)) issues.push('Add an uppercase letter.');
  if (!/[a-z]/.test(p)) issues.push('Add a lowercase letter.');
  if (!/\d/.test(p)) issues.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(p)) issues.push('Add a symbol.');
  return issues;
}

export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'strong';

export function passwordStrength(p: string): PasswordStrength {
  if (!p) return 'empty';
  if (passwordIssues(p).length > 0) return p.length >= 10 ? 'fair' : 'weak';
  return 'strong';
}

export interface CreateUserFormValues {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  password: string;
  confirmPassword: string;
}

export type CreateUserErrors = Partial<Record<keyof CreateUserFormValues, string>>;

export function validateCreateUser(v: CreateUserFormValues): CreateUserErrors {
  const e: CreateUserErrors = {};
  if (!v.firstName.trim()) e.firstName = 'Enter a first name.';
  if (!v.lastName.trim()) e.lastName = 'Enter a last name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
  if (!v.roleId) e.roleId = 'Select a role.';
  const issues = passwordIssues(v.password);
  if (issues.length) e.password = issues.join(' ');
  if (v.confirmPassword !== v.password) e.confirmPassword = 'Passwords do not match.';
  return e;
}

export function validateNewPassword(password: string, confirm: string): { password?: string; confirmPassword?: string } {
  const e: { password?: string; confirmPassword?: string } = {};
  const issues = passwordIssues(password);
  if (issues.length) e.password = issues.join(' ');
  if (confirm !== password) e.confirmPassword = 'Passwords do not match.';
  return e;
}

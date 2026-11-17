export interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type PasswordErrors = Partial<Record<keyof PasswordFormValues, string>>;

/**
 * Mirrors the API policy (platform.user.service enforcePasswordPolicy:
 * upper, lower, number, special) with a longer minimum of 10 characters.
 */
export function validatePasswordChange(v: PasswordFormValues): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!v.currentPassword) errors.currentPassword = 'Enter your current password.';
  const p = v.newPassword;
  if (p.length < 10) {
    errors.newPassword = 'Use at least 10 characters.';
  } else if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    errors.newPassword = 'Mix upper and lower case letters, a number and a symbol.';
  } else if (v.currentPassword && p === v.currentPassword) {
    errors.newPassword = 'New password must differ from the current one.';
  }
  if (v.confirmPassword !== p) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

// Client-side validation for the account profile form.

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileFormValues, string>>;

/** Accepts 10-15 digits, optionally with a leading + and spaces/dashes/brackets. */
export function isValidPhone(raw: string): boolean {
  const v = raw.trim();
  if (!/^\+?[\d\s\-()]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function validateProfile(form: ProfileFormValues): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  else if (form.firstName.trim().length > 100) errors.firstName = "First name must be at most 100 characters.";
  if (form.lastName.trim().length > 100) errors.lastName = "Last name must be at most 100 characters.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (form.phone.trim() && !isValidPhone(form.phone)) {
    errors.phone = "Enter a valid phone number (10-15 digits, e.g. +91 98765 43210).";
  }
  return errors;
}

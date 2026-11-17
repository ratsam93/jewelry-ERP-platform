export interface SupplierFormValues {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  gstinNumber: string;
  panNumber: string;
  supplierType: string;
}

const MAX: Partial<Record<keyof SupplierFormValues, number>> = {
  name: 255, contactPerson: 200, email: 255, phone: 20, address: 500, city: 100,
  state: 100, postalCode: 20, gstinNumber: 15, panNumber: 10, supplierType: 50,
};

/** Mirrors SupplierInputSchema (shared-types/wholesale.ts): trims, drops blanks, validates. */
export function buildSupplierInput(form: SupplierFormValues): {
  input: Record<string, unknown> | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const input: Record<string, unknown> = { isActive: true };
  for (const key of Object.keys(form) as Array<keyof SupplierFormValues>) {
    const v = form[key].trim();
    if (v) input[key] = v;
    const max = MAX[key];
    if (max && v.length > max) errors[key] = `Must be at most ${max} characters`;
  }
  if (!input.name) errors.name = 'Supplier name is required';
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email as string)) {
    errors.email = 'Enter a valid email address';
  }
  if (input.country && !/^[A-Za-z]{2}$/.test(input.country as string)) {
    errors.country = 'Use a 2-letter country code (e.g. IN)';
  } else if (input.country) {
    input.country = (input.country as string).toUpperCase();
  }
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

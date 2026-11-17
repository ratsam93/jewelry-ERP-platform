// Country options for address forms. `code` is the ISO 3166-1 alpha-2 value the
// API stores (customer_addresses.country is VARCHAR(2)). India first.
export const COUNTRY_OPTIONS = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "NP", name: "Nepal" },
] as const;

export function countryName(code?: string | null): string {
  if (!code) return "India";
  const c = code.toUpperCase();
  return COUNTRY_OPTIONS.find((o) => o.code === c)?.name ?? code;
}

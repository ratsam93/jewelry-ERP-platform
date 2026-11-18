/**
 * Single source of the public contact details. Each value can be overridden at
 * build time via the matching NEXT_PUBLIC_* variable. Phone and address have
 * no default: they are shown only when configured.
 */
const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export interface ContactInfo {
  /** General enquiries (NEXT_PUBLIC_CONTACT_EMAIL). */
  email: string;
  /** Sales / demo requests (NEXT_PUBLIC_SALES_EMAIL). */
  salesEmail: string;
  /** Technical support (NEXT_PUBLIC_SUPPORT_EMAIL). */
  supportEmail: string;
  /** Careers (NEXT_PUBLIC_CAREERS_EMAIL). */
  careersEmail: string;
  /** Privacy / data requests (NEXT_PUBLIC_PRIVACY_EMAIL). */
  privacyEmail: string;
  /** Optional phone (NEXT_PUBLIC_CONTACT_PHONE). */
  phone?: string;
  /** Optional postal address (NEXT_PUBLIC_CONTACT_ADDRESS). */
  address?: string;
}

export const CONTACT: ContactInfo = {
  email: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ?? "ratsam93@gmail.com",
  salesEmail: clean(process.env.NEXT_PUBLIC_SALES_EMAIL) ?? "sales@techbeyondsolution.com",
  supportEmail: clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) ?? "support@techbeyondsolution.com",
  careersEmail: clean(process.env.NEXT_PUBLIC_CAREERS_EMAIL) ?? "careers@techbeyondsolution.com",
  privacyEmail: clean(process.env.NEXT_PUBLIC_PRIVACY_EMAIL) ?? "privacy@techbeyondsolution.com",
  phone: clean(process.env.NEXT_PUBLIC_CONTACT_PHONE),
  address: clean(process.env.NEXT_PUBLIC_CONTACT_ADDRESS),
};

/**
 * Single source of the product brand used in anything sent to or shown to
 * users (emails, SMS/WhatsApp text, PDFs, OTP messages, Swagger title).
 * Override with the BRAND_NAME environment variable. Internal identifiers
 * (queue names, bucket names, JWT claims) are NOT derived from this.
 */
export const BRAND_NAME: string = process.env.BRAND_NAME?.trim() || 'TechBeyond';

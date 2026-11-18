/**
 * Single source of the product brand shown to users in the admin app.
 * Override at build time with NEXT_PUBLIC_BRAND_NAME. Internal identifiers
 * (package scopes, storage keys, store names) intentionally keep the legacy
 * `caratflow` spelling and must not be derived from this constant.
 */
export const BRAND_NAME: string = process.env.NEXT_PUBLIC_BRAND_NAME || 'TechBeyond';

/** Browser <title> default for the admin app. */
export const BRAND_TITLE_DEFAULT = `${BRAND_NAME} - Jewelry ERP`;

/** Next.js metadata title template ("<Page> | TechBeyond"). */
export const BRAND_TITLE_TEMPLATE = `%s | ${BRAND_NAME}`;

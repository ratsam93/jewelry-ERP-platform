/**
 * Demo customer seed.
 * ------------------------------------------------------------
 * Creates ONE well-formed demo customer (Priya Sharma) per target tenant who
 * can sign in on the storefront (B2C email login) and be picked in the admin
 * Girvi form (which requires a VERIFIED Aadhaar or PAN kyc_verifications row).
 *
 * INSERT-only and idempotent: nothing is created when a customer with the demo
 * email/phone already exists for the tenant, and no row is ever updated/deleted.
 * Mirrors AuthB2CService.registerWithEmail (bcrypt cost 12, loginProvider EMAIL).
 *
 * The password below is a throwaway LOCAL demo credential.
 *
 * Usage:  pnpm --filter @caratflow/db seed:demo-customer
 *         (optional env: DEMO_TENANT_SLUG=sharma-jewellers, default: that slug)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const DEMO_EMAIL = 'demo.customer@example.com';
export const DEMO_PHONE = '+919820000001';
export const DEMO_PASSWORD = 'Demo@Customer123';
export const DEMO_PAN = 'ABCPS1234F'; // matches /^[A-Z]{3}[ABCFGHLJPTK][A-Z][0-9]{4}[A-Z]$/

// Verhoeff tables (Aadhaar checksum), used to derive a checksum-valid fake number.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** Append the Verhoeff check digit to a numeric payload. */
export function withVerhoeffDigit(payload: string): string {
  let c = 0;
  const digits = payload.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c]![P[(i + 1) % 8]![digits[i]!]!]!;
  return payload + INV[c]!;
}

export const DEMO_AADHAAR = withVerhoeffDigit('23456789012'); // fake, checksum-valid

export interface DemoSeedCounts { customers: number; customerAuth: number; kyc: number; skipped: number }

export async function seedDemoCustomer(prisma: PrismaClient, tenantId: string): Promise<DemoSeedCounts> {
  const counts: DemoSeedCounts = { customers: 0, customerAuth: 0, kyc: 0, skipped: 0 };

  let customer = await prisma.customer.findFirst({
    where: { tenantId, OR: [{ email: DEMO_EMAIL }, { phone: DEMO_PHONE }] },
  });
  const authTaken = await prisma.customerAuth.findFirst({
    where: { OR: [{ email: DEMO_EMAIL }, { phone: DEMO_PHONE }] },
    include: { customer: { select: { tenantId: true } } },
  });
  if (authTaken && authTaken.customer.tenantId !== tenantId) {
    counts.skipped++; // email/phone are globally unique in customer_auth; owned by another tenant
    return counts;
  }

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(), tenantId, firstName: 'Priya', lastName: 'Sharma',
        email: DEMO_EMAIL, phone: DEMO_PHONE, address: '12, Linking Road, Bandra West',
        city: 'Mumbai', state: 'Maharashtra', country: 'IN', postalCode: '400050',
        customerType: 'RETAIL', panNumber: DEMO_PAN, aadhaarNumber: DEMO_AADHAAR,
      },
    });
    counts.customers++;
  } else counts.skipped++;

  if (!authTaken) {
    await prisma.customerAuth.create({
      data: {
        id: crypto.randomUUID(), customerId: customer.id, email: DEMO_EMAIL, phone: DEMO_PHONE,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
        isEmailVerified: true, isPhoneVerified: true, loginProvider: 'EMAIL',
      },
    });
    counts.customerAuth++;
  } else counts.skipped++;

  const now = new Date();
  for (const [type, doc] of [['AADHAAR', DEMO_AADHAAR], ['PAN', DEMO_PAN]] as const) {
    const exists = await prisma.kycVerification.findFirst({
      where: { tenantId, customerId: customer.id, verificationType: type, verificationStatus: 'VERIFIED' },
    });
    if (exists) { counts.skipped++; continue; }
    await prisma.kycVerification.create({
      data: {
        id: crypto.randomUUID(), tenantId, customerId: customer.id, verificationType: type,
        documentNumber: doc, verificationStatus: 'VERIFIED', verifiedAt: now,
        notes: 'Demo seed: fake identifier, not a real document',
      },
    });
    counts.kyc++;
  }
  return counts;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    for (const p of [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$/);
        if (m) process.env.DATABASE_URL = m[1];
      }
      if (process.env.DATABASE_URL) break;
    }
  }
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const slug = process.env.DEMO_TENANT_SLUG ?? 'sharma-jewellers';
    const tenant = await prisma.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } });
    if (!tenant) throw new Error(`Tenant not found: ${slug}`);
    const c = await seedDemoCustomer(prisma, tenant.id);
    console.warn(`demo customer seed [${tenant.slug}]: +${c.customers} customers, +${c.customerAuth} customer_auth, +${c.kyc} kyc_verifications, ${c.skipped} skipped (already present)`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('Demo customer seed failed:', e); process.exit(1); });
}

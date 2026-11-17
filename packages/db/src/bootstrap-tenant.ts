/**
 * Production bootstrap: creates (idempotently) the reference data, the permission
 * catalog, ONE tenant, its Admin role and the first admin user. No demo data.
 *
 * Input (environment):
 *   TENANT_NAME       required  e.g. "Sharma Jewellers Pvt. Ltd."
 *   TENANT_SLUG       required  lowercase letters/digits/hyphens, used at login
 *   ADMIN_EMAIL       required
 *   ADMIN_PASSWORD    required  >= 12 characters (never printed)
 *   ADMIN_FIRST_NAME  optional  default "Admin"
 *   ADMIN_LAST_NAME   optional  default "User"
 *   TENANT_ID         optional  UUID to use for a NEW tenant (so it can match the
 *                               NEXT_PUBLIC_TENANT_ID the storefront was built with)
 *   TENANT_COUNTRY    optional  default IN
 *   TENANT_CURRENCY   optional  default INR
 *   TENANT_TIMEZONE   optional  default Asia/Kolkata
 *   RESET_PASSWORD    optional  "true" to overwrite the password of an existing admin
 *   DRY_RUN           optional  "true" validates the input and prints the plan only
 *
 * Re-running is safe: existing rows are reused, nothing is duplicated, and an existing
 * user's password is only changed when RESET_PASSWORD=true.
 * Password hashing is bcrypt (12 rounds), identical to AuthService.register/login.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { seedPermissions } from './seed-permissions';

export interface BootstrapInput {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  tenantId?: string;
  country: string;
  currency: string;
  timezone: string;
  resetPassword: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the environment; returns the parsed input or the list of problems. */
export function parseBootstrapEnv(
  env: Record<string, string | undefined>,
): { ok: true; input: BootstrapInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const get = (k: string) => (env[k] ?? '').trim();

  const tenantName = get('TENANT_NAME');
  const tenantSlug = get('TENANT_SLUG');
  const adminEmail = get('ADMIN_EMAIL').toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD ?? '';
  const tenantId = get('TENANT_ID');

  if (!tenantName) errors.push('TENANT_NAME is required');
  if (!tenantSlug) errors.push('TENANT_SLUG is required');
  else if (!SLUG_RE.test(tenantSlug) || tenantSlug.length > 100) {
    errors.push('TENANT_SLUG must be lowercase letters, digits and single hyphens (max 100)');
  }
  if (!adminEmail) errors.push('ADMIN_EMAIL is required');
  else if (!EMAIL_RE.test(adminEmail)) errors.push('ADMIN_EMAIL is not a valid email address');
  if (!adminPassword) errors.push('ADMIN_PASSWORD is required');
  else if (adminPassword.length < 12) errors.push('ADMIN_PASSWORD must be at least 12 characters');
  if (tenantId && !UUID_RE.test(tenantId)) errors.push('TENANT_ID must be a UUID');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      tenantName,
      tenantSlug,
      adminEmail,
      adminPassword,
      adminFirstName: get('ADMIN_FIRST_NAME') || 'Admin',
      adminLastName: get('ADMIN_LAST_NAME') || 'User',
      tenantId: tenantId ? tenantId.toLowerCase() : undefined,
      country: get('TENANT_COUNTRY') || 'IN',
      currency: get('TENANT_CURRENCY') || 'INR',
      timezone: get('TENANT_TIMEZONE') || 'Asia/Kolkata',
      resetPassword: get('RESET_PASSWORD').toLowerCase() === 'true',
    },
  };
}

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
];
const COUNTRIES = [
  { code: 'IN', name: 'India', currencyCode: 'INR', callingCode: '+91' },
  { code: 'US', name: 'United States', currencyCode: 'USD', callingCode: '+1' },
  { code: 'AE', name: 'United Arab Emirates', currencyCode: 'AED', callingCode: '+971' },
  { code: 'GB', name: 'United Kingdom', currencyCode: 'GBP', callingCode: '+44' },
  { code: 'SG', name: 'Singapore', currencyCode: 'SGD', callingCode: '+65' },
];

export async function bootstrapTenant(prisma: PrismaClient, input: BootstrapInput) {
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  for (const c of COUNTRIES) {
    await prisma.country.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  const perms = await seedPermissions(prisma as never);

  let tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });
  const tenantCreated = !tenant;
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: input.tenantId ?? crypto.randomUUID(),
        name: input.tenantName,
        slug: input.tenantSlug,
        plan: 'professional',
        country: input.country,
        defaultCurrency: input.currency,
        defaultTimezone: input.timezone,
        settings: { financialYearStart: 4, weightUnit: 'g' },
      },
    });
  } else if (input.tenantId && tenant.id !== input.tenantId) {
    console.warn(
      `  note: tenant "${input.tenantSlug}" already exists with id ${tenant.id}; TENANT_ID ignored`,
    );
  }

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Admin' } },
    update: {},
    create: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      name: 'Admin',
      description: 'Full system access',
      isSystem: true,
      permissions: { '*': ['create', 'read', 'update', 'delete'] },
    },
  });

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.adminEmail } },
  });
  let userAction: 'created' | 'password-reset' | 'unchanged';
  if (!existing) {
    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        email: input.adminEmail,
        passwordHash: await bcrypt.hash(input.adminPassword, 12),
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        roleId: role.id,
        preferences: { language: 'en', timezone: input.timezone, theme: 'light' },
      },
    });
    userAction = 'created';
  } else if (input.resetPassword) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await bcrypt.hash(input.adminPassword, 12),
        roleId: role.id,
        isActive: true,
      },
    });
    userAction = 'password-reset';
  } else {
    userAction = 'unchanged';
  }

  return { tenantId: tenant.id, tenantCreated, userAction, permissionsCreated: perms.created };
}

async function main() {
  const parsed = parseBootstrapEnv(process.env);
  if (!parsed.ok) {
    for (const e of parsed.errors) console.error(`bootstrap-tenant: ${e}`);
    process.exit(2);
  }
  const { input } = parsed;

  if ((process.env.DRY_RUN ?? '').toLowerCase() === 'true') {
    console.warn('bootstrap-tenant DRY RUN - input is valid, nothing written:');
    console.warn(`  tenant   : ${input.tenantName} (slug ${input.tenantSlug})`);
    console.warn(`  tenant id: ${input.tenantId ?? '(generated)'}`);
    console.warn(`  admin    : ${input.adminEmail} (${input.adminFirstName} ${input.adminLastName})`);
    console.warn('  password : (hidden)');
    return;
  }

  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const r = await bootstrapTenant(prisma, input);
    console.warn('bootstrap-tenant done:');
    console.warn(`  tenant id : ${r.tenantId} (${r.tenantCreated ? 'created' : 'already existed'})`);
    console.warn(`  tenant slug (login "Tenant" field): ${input.tenantSlug}`);
    console.warn(`  admin user: ${input.adminEmail} (${r.userAction})`);
    console.warn(`  permissions added: ${r.permissionsCreated}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('bootstrap-tenant failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

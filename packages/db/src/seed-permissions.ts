/**
 * Permission catalog seed.
 * ------------------------------------------------------------
 * The `permissions` table is a GLOBAL (non-tenant) catalog that the admin
 * Roles page reads (platform.roles.permissions). A fresh/demo database has no
 * rows, so the Permissions panel was empty ("Run permission seed first").
 *
 * INSERT-only and idempotent: rows that already exist (unique on
 * module+resource+action) are left untouched; nothing is updated or deleted.
 * Source of truth is DEFAULT_PERMISSIONS in ./permission-catalog.
 *
 * Usage:  pnpm --filter @caratflow/db seed:permissions
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PERMISSIONS } from './permission-catalog';

interface PermissionDelegate {
  findMany(args: { select: { module: true; resource: true; action: true } }): Promise<
    Array<{ module: string; resource: string; action: string }>
  >;
  create(args: {
    data: { id: string; module: string; resource: string; action: string; description: string };
  }): Promise<unknown>;
}

export async function seedPermissions(
  prisma: { permission: PermissionDelegate },
): Promise<{ created: number; existing: number; total: number }> {
  const present = await prisma.permission.findMany({
    select: { module: true, resource: true, action: true },
  });
  const have = new Set(present.map((p) => `${p.module}.${p.resource}.${p.action}`));
  let created = 0;
  let existing = 0;
  for (const perm of DEFAULT_PERMISSIONS) {
    if (have.has(`${perm.module}.${perm.resource}.${perm.action}`)) {
      existing++;
      continue;
    }
    await prisma.permission.create({
      data: {
        id: crypto.randomUUID(),
        module: perm.module,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
      },
    });
    created++;
  }
  return { created, existing, total: DEFAULT_PERMISSIONS.length };
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
    const r = await seedPermissions(prisma as unknown as { permission: PermissionDelegate });
    console.warn(`permission seed: +${r.created} created, ${r.existing} already present (catalog size ${r.total})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Permission seed failed:', e);
    process.exit(1);
  });
}

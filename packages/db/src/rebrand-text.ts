/**
 * Rebrand visible text of an EXISTING tenant: 'CaratFlow' -> 'TechBeyond'.
 * ------------------------------------------------------------------------
 * Updates ONLY human-visible text / JSON columns of the content tables below
 * (FAQ, CMS pages, blog, banners, announcements, SEO, homepage sections,
 * chatbot FAQ/templates, notification templates, campaigns, reviews, in-app
 * notifications, settings and tenant.settings) for ONE tenant. Identifiers,
 * keys, slugs, emails and URLs are never touched (the replacement is
 * case-sensitive, so lowercase `caratflow` in a domain or key is left alone).
 *
 * Idempotent: only rows that still contain the old text are updated, so a second
 * run changes 0 rows. Parameterised statements, one transaction.
 *
 * Environment:
 *   TENANT_SLUG   default techbeyond-jewellers (or TENANT_ID)
 *   DRY_RUN=true  print per-table counts of rows that would change, write nothing
 *   FROM_TEXT     default CaratFlow
 *   TO_TEXT       default TechBeyond (or BRAND_NAME when set)
 *
 * Usage:  pnpm --filter @caratflow/db rebrand:text
 */
import { PrismaClient } from '@prisma/client';

export interface RebrandTarget {
  table: string;
  /** Column holding the tenant id (`tenant_id`, or `id` for the tenants table). */
  tenantColumn: string;
  text: string[];
  json: string[];
}

/** Table/column identifiers are constants (never user input). */
export const REBRAND_TARGETS: RebrandTarget[] = [
  { table: 'cms_faq_items', tenantColumn: 'tenant_id', text: ['question', 'answer', 'category'], json: [] },
  { table: 'cms_pages', tenantColumn: 'tenant_id', text: ['title', 'content', 'meta_title', 'meta_description'], json: [] },
  { table: 'cms_blog_posts', tenantColumn: 'tenant_id', text: ['title', 'excerpt', 'content', 'author', 'category_tag'], json: ['tags'] },
  { table: 'cms_banners', tenantColumn: 'tenant_id', text: ['title', 'subtitle'], json: [] },
  { table: 'cms_announcements', tenantColumn: 'tenant_id', text: ['message', 'link_text'], json: [] },
  { table: 'cms_seo_metadata', tenantColumn: 'tenant_id', text: ['meta_title', 'meta_description'], json: ['structured_data'] },
  { table: 'cms_homepage_sections', tenantColumn: 'tenant_id', text: [], json: ['config'] },
  { table: 'chat_faqs', tenantColumn: 'tenant_id', text: ['question', 'answer'], json: ['keywords'] },
  { table: 'chat_templates', tenantColumn: 'tenant_id', text: ['response_template'], json: ['trigger_keywords'] },
  { table: 'notification_templates', tenantColumn: 'tenant_id', text: ['name', 'subject', 'body'], json: [] },
  { table: 'campaigns', tenantColumn: 'tenant_id', text: ['name', 'description'], json: [] },
  { table: 'product_reviews', tenantColumn: 'tenant_id', text: ['title', 'body'], json: [] },
  { table: 'notifications', tenantColumn: 'tenant_id', text: ['title', 'message'], json: ['metadata'] },
  { table: 'settings', tenantColumn: 'tenant_id', text: ['description'], json: ['setting_value'] },
  { table: 'tenants', tenantColumn: 'id', text: [], json: ['settings'] },
];

const quote = (id: string): string => '`' + id + '`';

/** A column expression as text (JSON columns are cast to CHAR for matching). */
function asText(col: string, isJson: boolean): string {
  return isJson ? `CAST(${quote(col)} AS CHAR)` : quote(col);
}

export interface BuiltSql {
  count: { sql: string; params: unknown[] };
  update: { sql: string; params: unknown[] };
}

export function buildSql(t: RebrandTarget, tenantId: string, from: string, to: string): BuiltSql {
  const cols = [
    ...t.text.map((c) => ({ c, json: false })),
    ...t.json.map((c) => ({ c, json: true })),
  ];
  const like = `%${from.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const matchSql = cols.map(({ c, json }) => `${asText(c, json)} LIKE BINARY ?`).join(' OR ');
  const where = `${quote(t.tenantColumn)} = ? AND (${matchSql})`;
  const whereParams = [tenantId, ...cols.map(() => like)];

  const setSql = cols
    .map(({ c, json }) => {
      const replaced = `REPLACE(${asText(c, json)}, ?, ?)`;
      const expr = json ? `CAST(${replaced} AS JSON)` : replaced;
      return `${quote(c)} = IF(${asText(c, json)} LIKE BINARY ?, ${expr}, ${quote(c)})`;
    })
    .join(', ');
  const setParams = cols.flatMap(() => [like, from, to]);

  return {
    count: { sql: `SELECT COUNT(*) AS n FROM ${quote(t.table)} WHERE ${where}`, params: whereParams },
    update: {
      sql: `UPDATE ${quote(t.table)} SET ${setSql} WHERE ${where}`,
      params: [...setParams, ...whereParams],
    },
  };
}

export interface RebrandResult {
  tenantSlug: string;
  dry: boolean;
  counts: Record<string, number>;
}

export async function rebrandText(
  prisma: PrismaClient,
  tenantId: string,
  opts: { dry: boolean; from?: string; to?: string },
): Promise<Record<string, number>> {
  const from = opts.from ?? 'CaratFlow';
  const to = opts.to ?? 'TechBeyond';
  const counts: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      for (const t of REBRAND_TARGETS) {
        const sql = buildSql(t, tenantId, from, to);
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint | number }>>(sql.count.sql, ...sql.count.params);
        const n = Number(rows[0]?.n ?? 0);
        counts[t.table] = n;
        if (!opts.dry && n > 0) {
          await tx.$executeRawUnsafe(sql.update.sql, ...sql.update.params);
        }
      }
    },
    { timeout: 120_000 },
  );
  return counts;
}

async function main() {
  const slug = (process.env.TENANT_SLUG ?? '').trim() || 'techbeyond-jewellers';
  const id = (process.env.TENANT_ID ?? '').trim();
  const dry = (process.env.DRY_RUN ?? '').toLowerCase() === 'true';
  const from = (process.env.FROM_TEXT ?? '').trim() || 'CaratFlow';
  const to = (process.env.TO_TEXT ?? '').trim() || (process.env.BRAND_NAME ?? '').trim() || 'TechBeyond';
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const tenant = await prisma.tenant.findFirst({
      where: id ? { id } : { slug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error(`Tenant not found: ${id || slug}`);
    const counts = await rebrandText(prisma, tenant.id, { dry, from, to });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.warn(
      `rebrand text [${tenant.slug}] "${from}" -> "${to}"${dry ? ' (DRY RUN, nothing written)' : ''}: ${total} row(s) ${dry ? 'would change' : 'changed'}`,
    );
    for (const [table, n] of Object.entries(counts)) console.warn(`  ${table}: ${n}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Rebrand text failed:', e);
    process.exit(1);
  });
}

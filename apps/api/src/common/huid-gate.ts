// ─── HUID pre-commit sale gate ────────────────────────────────
// Shared (domain-agnostic) check so synchronous sale paths can refuse gold
// items lacking a HUID BEFORE the sale transaction opens. Mirrors the rules of
// compliance.huid.service.checkSaleEligibility (gold needs a HUID) without
// importing the compliance module.

import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('HuidGate');

interface HuidGatePrisma {
  product: {
    findMany: (args: unknown) => Promise<
      Array<{ id: string; sku?: string | null; productType: string; huidNumber?: string | null }>
    >;
  };
  huidRecord?: {
    findMany: (args: unknown) => Promise<Array<{ productId: string }>>;
  };
}

export function isHuidBlockMode(): boolean {
  return process.env.HUID_ENFORCEMENT?.trim().toLowerCase() === 'block';
}

export async function assertHuidForSale(
  prisma: unknown,
  tenantId: string,
  productIds: Array<string | null | undefined>,
): Promise<void> {
  const ids = [...new Set(productIds.filter((p): p is string => !!p))];
  if (ids.length === 0) return;
  const block = isHuidBlockMode();
  const db = prisma as HuidGatePrisma;

  let missing: string[];
  try {
    const products = await db.product.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, sku: true, productType: true, huidNumber: true },
    });
    const found = new Set(products.map((p) => p.id));
    const goldLacking = products.filter((p) => p.productType === 'GOLD' && !p.huidNumber);

    let withRecord = new Set<string>();
    if (goldLacking.length > 0 && db.huidRecord) {
      const recs = await db.huidRecord.findMany({
        where: { tenantId, status: 'ACTIVE', productId: { in: goldLacking.map((p) => p.id) } },
        select: { productId: true },
      });
      withRecord = new Set(recs.map((r) => r.productId));
    }
    missing = goldLacking.filter((p) => !withRecord.has(p.id)).map((p) => p.sku || p.id);
    // Unknown products are not a HUID matter; the sale path validates them.
    void found;
  } catch (err) {
    if (block) throw err;
    logger.warn(`HUID check skipped: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (missing.length === 0) return;
  const msg = `Gold item(s) without a HUID number: ${missing.join(', ')}`;
  if (block) {
    throw new BadRequestException(`Sale blocked. ${msg}`);
  }
  logger.warn(`${msg} (HUID_ENFORCEMENT=warn, sale allowed)`);
}

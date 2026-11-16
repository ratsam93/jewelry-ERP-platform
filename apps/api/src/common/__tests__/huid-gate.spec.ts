import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertHuidForSale } from '../huid-gate';

function makePrisma(products: any[], records: any[] = []) {
  return {
    product: { findMany: vi.fn().mockResolvedValue(products) },
    huidRecord: { findMany: vi.fn().mockResolvedValue(records) },
  };
}

describe('assertHuidForSale', () => {
  const orig = process.env.HUID_ENFORCEMENT;
  beforeEach(() => {
    delete process.env.HUID_ENFORCEMENT;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.HUID_ENFORCEMENT;
    else process.env.HUID_ENFORCEMENT = orig;
  });

  const gold = { id: 'p1', sku: 'G1', productType: 'GOLD', huidNumber: null };

  it('blocks gold without HUID in block mode', async () => {
    process.env.HUID_ENFORCEMENT = 'block';
    await expect(assertHuidForSale(makePrisma([gold]), 't1', ['p1'])).rejects.toThrow(BadRequestException);
  });

  it('lists the offending item', async () => {
    process.env.HUID_ENFORCEMENT = 'block';
    await expect(assertHuidForSale(makePrisma([gold]), 't1', ['p1'])).rejects.toThrow(/G1/);
  });

  it('allows gold with huidNumber or active record', async () => {
    process.env.HUID_ENFORCEMENT = 'block';
    await expect(
      assertHuidForSale(makePrisma([{ ...gold, huidNumber: 'AB12CD' }]), 't1', ['p1']),
    ).resolves.toBeUndefined();
    await expect(
      assertHuidForSale(makePrisma([gold], [{ productId: 'p1' }]), 't1', ['p1']),
    ).resolves.toBeUndefined();
  });

  it('only warns in warn mode', async () => {
    await expect(assertHuidForSale(makePrisma([gold]), 't1', ['p1'])).resolves.toBeUndefined();
  });

  it('ignores non-gold products', async () => {
    process.env.HUID_ENFORCEMENT = 'block';
    const p = { id: 'p2', sku: 'S1', productType: 'SILVER', huidNumber: null };
    await expect(assertHuidForSale(makePrisma([p]), 't1', ['p2'])).resolves.toBeUndefined();
  });

  it('ignores missing products and empty input', async () => {
    process.env.HUID_ENFORCEMENT = 'block';
    const prisma = makePrisma([]);
    await expect(assertHuidForSale(prisma, 't1', ['nope'])).resolves.toBeUndefined();
    await expect(assertHuidForSale(prisma, 't1', [undefined])).resolves.toBeUndefined();
  });

  it('scopes the lookup by tenant', async () => {
    const prisma = makePrisma([]);
    await assertHuidForSale(prisma, 't9', ['p1']);
    expect(prisma.product.findMany.mock.calls[0][0].where.tenantId).toBe('t9');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { planBomItems, seedBomItems } from '../../../../../../packages/db/src/seed-demo-bom-items';

describe('demo BOM component seeding (HK-MFG-01)', () => {
  it.each([5_000_000, 7_650_000, 12_345_679, 5_001, 1])('plan sums exactly to %i paise', (total) => {
    const items = planBomItems(total);
    expect(items.reduce((s, i) => s + i.estimatedCostPaise, 0)).toBe(total);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items.every((i) => i.estimatedCostPaise >= 0)).toBe(true);
  });

  it('metal line cost equals weight x rate', () => {
    const [metal] = planBomItems(7_650_000);
    expect(metal!.itemType).toBe('METAL');
    expect(metal!.estimatedCostPaise).toBe(Math.round((metal!.weightMg! * 650_000) / 1000));
  });

  it('returns nothing for a zero estimate', () => {
    expect(planBomItems(0)).toEqual([]);
  });

  it('inserts only for BOMs with zero items; second run inserts 0', async () => {
    const createMany = vi.fn().mockImplementation(async ({ data }) => ({ count: data.length }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'b1', estimatedCostPaise: 7_650_000n, _count: { items: 0 } },
        { id: 'b2', estimatedCostPaise: 5_000_000n, _count: { items: 3 } },
      ])
      .mockResolvedValueOnce([
        { id: 'b1', estimatedCostPaise: 7_650_000n, _count: { items: 4 } },
        { id: 'b2', estimatedCostPaise: 5_000_000n, _count: { items: 3 } },
      ]);
    const prisma = { billOfMaterials: { findMany }, bomItem: { createMany } } as any;
    const first = await seedBomItems(prisma, 't1');
    expect(first).toMatchObject({ boms: 2, withoutItems: 1, inserted: 4 });
    const rows = createMany.mock.calls[0]![0].data as Array<{ estimatedCostPaise: bigint }>;
    expect(rows.reduce((s, r) => s + r.estimatedCostPaise, 0n)).toBe(7_650_000n);
    const second = await seedBomItems(prisma, 't1');
    expect(second.inserted).toBe(0);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
});

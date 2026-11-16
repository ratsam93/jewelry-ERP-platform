import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrismaService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
import { CustomerPortalSchemesService } from '../customer-portal.schemes.service';

const MODEL_NAMES = [
  'kittyMember',
  'goldSavingsMember',
  'kittyScheme',
  'goldSavingsScheme',
  'kittyInstallment',
  'goldSavingsInstallment',
] as const;

function makeDelegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
}

function kittySchemeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ks-1',
    tenantId: mockTenantContext.tenantId,
    schemeName: 'Diwali Kitty',
    terms: 'Pay monthly for 12 months',
    monthlyAmountPaise: BigInt(500000),
    durationMonths: 12,
    bonusPercent: 5,
    totalValuePaise: BigInt(6000000),
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-12-31T00:00:00Z'),
    currentMembers: 3,
    maxMembers: 10,
    status: 'OPEN',
    ...overrides,
  };
}

function goldSavingsSchemeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gss-1',
    tenantId: mockTenantContext.tenantId,
    schemeName: 'Gold Savings Plus',
    terms: 'Gold savings terms',
    monthlyAmountPaise: BigInt(100000),
    durationMonths: 12,
    bonusMonths: 1,
    maturityBonusPercent: 200,
    status: 'OPEN',
    ...overrides,
  };
}

function kittyMemberFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'km-1',
    tenantId: mockTenantContext.tenantId,
    customerId: 'cust-1',
    kittySchemeId: 'ks-1',
    memberNumber: 'DIW-0001',
    status: 'ACTIVE',
    joinedDate: new Date('2026-01-05T00:00:00Z'),
    totalPaidPaise: BigInt(1000000),
    paidInstallments: 2,
    kittyScheme: kittySchemeFixture(),
    installments: [],
    ...overrides,
  };
}

function goldMemberFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gm-1',
    tenantId: mockTenantContext.tenantId,
    customerId: 'cust-1',
    goldSavingsSchemeId: 'gss-1',
    memberNumber: 'GS-0001',
    status: 'ACTIVE',
    joinedDate: new Date('2026-01-05T00:00:00Z'),
    maturityDate: new Date('2027-01-05T00:00:00Z'),
    totalPaidPaise: BigInt(300000),
    maturityValuePaise: BigInt(4000000),
    goldSavingsScheme: goldSavingsSchemeFixture(),
    installments: [],
    ...overrides,
  };
}

function installmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inst-1',
    installmentNumber: 1,
    dueDate: new Date('2026-02-01T00:00:00Z'),
    paidDate: null,
    amountPaise: BigInt(500000),
    lateFeePaise: BigInt(0),
    status: 'PENDING',
    ...overrides,
  };
}

describe('CustomerPortalSchemesService (coverage)', () => {
  let service: CustomerPortalSchemesService;
  let prisma: ReturnType<typeof createMockPrismaService> & Record<string, any>;
  let tx: Record<string, any>;
  const { tenantId } = mockTenantContext;
  const customerId = 'cust-1';

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    prisma = createMockPrismaService() as typeof prisma;
    resetMocks(prisma);
    for (const m of MODEL_NAMES) {
      (prisma as Record<string, any>)[m] = makeDelegate();
    }

    // Transaction client shares the same delegates so assertions can be made on them.
    tx = {
      kittyInstallment: { update: vi.fn(), createMany: vi.fn() },
      kittyMember: { update: vi.fn(), create: vi.fn() },
      kittyScheme: { update: vi.fn() },
      goldSavingsInstallment: { update: vi.fn(), createMany: vi.fn() },
      goldSavingsMember: { update: vi.fn(), create: vi.fn() },
    };
    (prisma as Record<string, any>).$transaction = vi.fn(async (fn: unknown) => {
      if (typeof fn === 'function') {
        return (fn as (c: unknown) => Promise<unknown>)(tx);
      }
      return fn;
    });

    service = new CustomerPortalSchemesService(prisma as never);
  });

  // ─── getMySchemes ─────────────────────────────────────────────

  describe('getMySchemes', () => {
    it('returns empty dashboard when no memberships exist', async () => {
      prisma.kittyMember.findMany.mockResolvedValue([]);
      prisma.goldSavingsMember.findMany.mockResolvedValue([]);

      const result = await service.getMySchemes(tenantId, customerId);

      expect(result).toEqual({
        activeSchemes: [],
        totalInvestedPaise: 0,
        upcomingInstallments: [],
      });
      expect(prisma.kittyMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, customerId, status: 'ACTIVE' } }),
      );
      expect(prisma.goldSavingsMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, customerId, status: 'ACTIVE' } }),
      );
    });

    it('maps kitty and gold savings memberships, totals and sorts upcoming installments', async () => {
      const kittyDue = new Date('2026-03-01T00:00:00Z');
      const goldDue = new Date('2026-02-01T00:00:00Z');
      prisma.kittyMember.findMany.mockResolvedValue([
        kittyMemberFixture({
          installments: [installmentFixture({ id: 'k-inst', installmentNumber: 3, dueDate: kittyDue, amountPaise: BigInt(500000) })],
        }),
      ]);
      prisma.goldSavingsMember.findMany.mockResolvedValue([
        goldMemberFixture({
          installments: [installmentFixture({ id: 'g-inst', installmentNumber: 2, dueDate: goldDue, amountPaise: BigInt(100000) })],
        }),
      ]);
      prisma.goldSavingsInstallment.count.mockResolvedValue(4);

      const result = await service.getMySchemes(tenantId, customerId);

      expect(result.totalInvestedPaise).toBe(1300000);
      expect(result.activeSchemes).toHaveLength(2);

      const kitty = result.activeSchemes[0];
      expect(kitty).toEqual({
        id: 'km-1',
        memberNumber: 'DIW-0001',
        schemeType: 'KITTY',
        schemeName: 'Diwali Kitty',
        status: 'ACTIVE',
        totalPaidPaise: 1000000,
        monthlyAmountPaise: 500000,
        durationMonths: 12,
        paidInstallments: 2,
        totalInstallments: 12,
        nextDueDate: kittyDue,
        maturityDate: new Date('2026-12-31T00:00:00Z'),
      });

      const gold = result.activeSchemes[1];
      expect(gold.schemeType).toBe('GOLD_SAVINGS');
      expect(gold.paidInstallments).toBe(4);
      expect(gold.totalInstallments).toBe(11); // durationMonths - bonusMonths
      expect(gold.monthlyAmountPaise).toBe(100000);
      expect(prisma.goldSavingsInstallment.count).toHaveBeenCalledWith({
        where: { goldSavingsMemberId: 'gm-1', status: 'PAID' },
      });

      // Sorted by due date ascending: gold (Feb) before kitty (Mar)
      expect(result.upcomingInstallments).toEqual([
        {
          membershipId: 'gm-1',
          schemeName: 'Gold Savings Plus',
          installmentNumber: 2,
          dueDate: goldDue,
          amountPaise: 100000,
        },
        {
          membershipId: 'km-1',
          schemeName: 'Diwali Kitty',
          installmentNumber: 3,
          dueDate: kittyDue,
          amountPaise: 500000,
        },
      ]);
    });

    it('omits upcoming installments and null due dates when no pending installment exists', async () => {
      prisma.kittyMember.findMany.mockResolvedValue([kittyMemberFixture({ installments: [] })]);
      prisma.goldSavingsMember.findMany.mockResolvedValue([goldMemberFixture({ installments: [] })]);
      prisma.goldSavingsInstallment.count.mockResolvedValue(0);

      const result = await service.getMySchemes(tenantId, customerId);

      expect(result.upcomingInstallments).toEqual([]);
      expect(result.activeSchemes[0].nextDueDate).toBeNull();
      expect(result.activeSchemes[1].nextDueDate).toBeNull();
      expect(result.activeSchemes[1].paidInstallments).toBe(0);
    });
  });

  // ─── getSchemeDetail ──────────────────────────────────────────

  describe('getSchemeDetail', () => {
    it('returns kitty membership detail with mapped installments', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(
        kittyMemberFixture({
          installments: [
            installmentFixture({
              id: 'ki-1',
              installmentNumber: 1,
              paidDate: new Date('2026-01-10T00:00:00Z'),
              status: 'PAID',
              lateFeePaise: BigInt(2500),
            }),
          ],
        }),
      );

      const result = await service.getSchemeDetail(tenantId, customerId, 'km-1');

      expect(prisma.kittyMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'km-1', tenantId, customerId } }),
      );
      expect(result).toMatchObject({
        id: 'km-1',
        schemeType: 'KITTY',
        schemeName: 'Diwali Kitty',
        schemeDescription: 'Pay monthly for 12 months',
        monthlyAmountPaise: 500000,
        durationMonths: 12,
        bonusPercent: 5,
        bonusMonths: null,
        totalPaidPaise: 1000000,
        maturityValuePaise: 6000000,
      });
      expect(result.installments).toEqual([
        {
          id: 'ki-1',
          installmentNumber: 1,
          dueDate: new Date('2026-02-01T00:00:00Z'),
          paidDate: new Date('2026-01-10T00:00:00Z'),
          amountPaise: 500000,
          lateFeePaise: 2500,
          status: 'PAID',
        },
      ]);
      expect(prisma.goldSavingsMember.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to gold savings membership and maps null late fee', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(
        goldMemberFixture({
          installments: [installmentFixture({ id: 'gi-1', installmentNumber: 1 })],
        }),
      );

      const result = await service.getSchemeDetail(tenantId, customerId, 'gm-1');

      expect(result).toMatchObject({
        id: 'gm-1',
        schemeType: 'GOLD_SAVINGS',
        schemeName: 'Gold Savings Plus',
        schemeDescription: 'Gold savings terms',
        bonusPercent: 200,
        bonusMonths: 1,
        totalPaidPaise: 300000,
        maturityValuePaise: 4000000,
      });
      expect(result.installments[0].lateFeePaise).toBeNull();
      expect(result.installments[0].amountPaise).toBe(500000);
    });

    it('throws NotFoundException when membership belongs to neither scheme type', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(null);

      await expect(service.getSchemeDetail(tenantId, customerId, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── payInstallment ───────────────────────────────────────────

  describe('payInstallment', () => {
    it('pays next kitty installment inside a transaction and updates member totals', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(kittyMemberFixture());
      prisma.kittyInstallment.findFirst.mockResolvedValue(
        installmentFixture({ id: 'ki-2', installmentNumber: 3, amountPaise: BigInt(500000) }),
      );
      const paidAt = installmentFixture({
        id: 'ki-2',
        installmentNumber: 3,
        status: 'PAID',
        paidDate: new Date(),
        amountPaise: BigInt(500000),
        lateFeePaise: BigInt(0),
      });
      tx.kittyInstallment.update.mockResolvedValue(paidAt);
      tx.kittyMember.update.mockResolvedValue({});

      const result = await service.payInstallment(tenantId, customerId, 'km-1', 'upi');

      expect(prisma.kittyInstallment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, kittyMemberId: 'km-1', status: { in: ['PENDING', 'OVERDUE'] } },
        }),
      );
      expect(tx.kittyInstallment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ki-2' },
          data: expect.objectContaining({ status: 'PAID', method: 'UPI', updatedBy: customerId }),
        }),
      );
      expect(tx.kittyMember.update).toHaveBeenCalledWith({
        where: { id: 'km-1' },
        data: {
          paidInstallments: { increment: 1 },
          totalPaidPaise: { increment: BigInt(500000) },
        },
      });
      expect(result).toMatchObject({ id: 'ki-2', status: 'PAID', amountPaise: 500000, lateFeePaise: 0 });
    });

    it('throws BadRequestException when kitty membership has no pending installments', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(kittyMemberFixture());
      prisma.kittyInstallment.findFirst.mockResolvedValue(null);

      await expect(service.payInstallment(tenantId, customerId, 'km-1', 'UPI')).rejects.toThrow(
        BadRequestException,
      );
      expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });

    it('pays next gold savings installment when no kitty membership matches', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(goldMemberFixture());
      prisma.goldSavingsInstallment.findFirst.mockResolvedValue(
        installmentFixture({ id: 'gi-2', installmentNumber: 2, amountPaise: BigInt(100000) }),
      );
      tx.goldSavingsInstallment.update.mockResolvedValue(
        installmentFixture({
          id: 'gi-2',
          installmentNumber: 2,
          status: 'PAID',
          amountPaise: BigInt(100000),
          paidDate: new Date(),
        }),
      );
      tx.goldSavingsMember.update.mockResolvedValue({});

      const result = await service.payInstallment(tenantId, customerId, 'gm-1', 'CHEQUE');

      expect(tx.goldSavingsInstallment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'gi-2' },
          data: expect.objectContaining({ method: 'CHEQUE', status: 'PAID' }),
        }),
      );
      expect(tx.goldSavingsMember.update).toHaveBeenCalledWith({
        where: { id: 'gm-1' },
        data: { totalPaidPaise: { increment: BigInt(100000) } },
      });
      expect(result).toMatchObject({ id: 'gi-2', status: 'PAID', amountPaise: 100000, lateFeePaise: null });
    });

    it('throws BadRequestException when gold savings membership has no pending installments', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(goldMemberFixture());
      prisma.goldSavingsInstallment.findFirst.mockResolvedValue(null);

      await expect(service.payInstallment(tenantId, customerId, 'gm-1', 'CARD')).rejects.toThrow(
        'No pending installments found',
      );
    });

    it('throws NotFoundException when no active membership matches', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(null);

      await expect(service.payInstallment(tenantId, customerId, 'nope', 'UPI')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['upi', 'UPI'],
      ['UPI', 'UPI'],
      ['bank_transfer', 'BANK_TRANSFER'],
      ['card', 'BANK_TRANSFER'],
      ['cheque', 'CHEQUE'],
      ['cash', 'BANK_TRANSFER'],
    ])('maps payment method %s to %s', async (input, expected) => {
      prisma.kittyMember.findFirst.mockResolvedValue(kittyMemberFixture());
      prisma.kittyInstallment.findFirst.mockResolvedValue(installmentFixture());
      tx.kittyInstallment.update.mockResolvedValue(installmentFixture({ status: 'PAID' }));
      tx.kittyMember.update.mockResolvedValue({});

      await service.payInstallment(tenantId, customerId, 'km-1', input);

      expect(tx.kittyInstallment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ method: expected }) }),
      );
    });
  });

  // ─── getSchemeStatement ───────────────────────────────────────

  describe('getSchemeStatement', () => {
    it('returns statement URL after verifying ownership', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(kittyMemberFixture());

      const result = await service.getSchemeStatement(tenantId, customerId, 'km-1');

      expect(result).toEqual({ statementUrl: '/api/v1/store/account/schemes/km-1/statement/pdf' });
    });

    it('propagates NotFoundException when membership is not owned by the customer', async () => {
      prisma.kittyMember.findFirst.mockResolvedValue(null);
      prisma.goldSavingsMember.findFirst.mockResolvedValue(null);

      await expect(service.getSchemeStatement(tenantId, customerId, 'other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── enrollInScheme ───────────────────────────────────────────

  describe('enrollInScheme', () => {
    it('enrolls in a kitty scheme, generates installments and increments member count', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue(kittySchemeFixture({ currentMembers: 3, maxMembers: 10 }));
      prisma.kittyMember.findFirst.mockResolvedValueOnce(null); // existing check
      tx.kittyMember.create.mockResolvedValue({
        id: 'new-km',
        memberNumber: 'DIW-0004',
        status: 'ACTIVE',
      });
      tx.kittyInstallment.createMany.mockResolvedValue({ count: 12 });
      tx.kittyScheme.update.mockResolvedValue({});
      prisma.kittyInstallment.findFirst.mockResolvedValue({ dueDate: new Date('2026-02-01T00:00:00Z') });

      const result = await service.enrollInScheme(tenantId, customerId, {
        schemeType: 'KITTY',
        schemeId: 'ks-1',
      } as never);

      expect(prisma.kittyScheme.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ks-1', tenantId, status: { in: ['OPEN', 'ACTIVE'] } },
        }),
      );
      expect(tx.kittyMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          kittySchemeId: 'ks-1',
          customerId,
          memberNumber: 'DIW-0004',
          status: 'ACTIVE',
        }),
      });

      const createManyArg = tx.kittyInstallment.createMany.mock.calls[0][0];
      expect(createManyArg.data).toHaveLength(12);
      expect(createManyArg.data[0]).toMatchObject({
        installmentNumber: 1,
        kittyMemberId: 'new-km',
        amountPaise: BigInt(500000),
        status: 'PENDING',
      });
      expect(createManyArg.data[11].installmentNumber).toBe(12);

      expect(tx.kittyScheme.update).toHaveBeenCalledWith({
        where: { id: 'ks-1' },
        data: { currentMembers: { increment: 1 }, status: 'OPEN' },
      });

      expect(result).toEqual({
        id: 'new-km',
        memberNumber: 'DIW-0004',
        schemeType: 'KITTY',
        schemeName: 'Diwali Kitty',
        status: 'ACTIVE',
        totalPaidPaise: 0,
        monthlyAmountPaise: 500000,
        durationMonths: 12,
        paidInstallments: 0,
        totalInstallments: 12,
        nextDueDate: new Date('2026-02-01T00:00:00Z'),
        maturityDate: new Date('2026-12-31T00:00:00Z'),
      });
    });

    it('marks kitty scheme ACTIVE once the new member fills the last seat', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue(
        kittySchemeFixture({ currentMembers: 9, maxMembers: 10, durationMonths: 2 }),
      );
      prisma.kittyMember.findFirst.mockResolvedValueOnce(null);
      tx.kittyMember.create.mockResolvedValue({ id: 'km-last', memberNumber: 'DIW-0010', status: 'ACTIVE' });
      tx.kittyInstallment.createMany.mockResolvedValue({ count: 2 });
      tx.kittyScheme.update.mockResolvedValue({});
      prisma.kittyInstallment.findFirst.mockResolvedValue(null);

      const result = await service.enrollInScheme(tenantId, customerId, {
        schemeType: 'KITTY',
        schemeId: 'ks-1',
      } as never);

      expect(tx.kittyScheme.update).toHaveBeenCalledWith({
        where: { id: 'ks-1' },
        data: { currentMembers: { increment: 1 }, status: 'ACTIVE' },
      });
      expect(result.nextDueDate).toBeNull();
      expect(result.totalInstallments).toBe(2);
    });

    it('throws NotFoundException when kitty scheme is missing or closed', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue(null);

      await expect(
        service.enrollInScheme(tenantId, customerId, { schemeType: 'KITTY', schemeId: 'x' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when kitty scheme is full', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue(kittySchemeFixture({ currentMembers: 10, maxMembers: 10 }));

      await expect(
        service.enrollInScheme(tenantId, customerId, { schemeType: 'KITTY', schemeId: 'ks-1' } as never),
      ).rejects.toThrow('Scheme has reached maximum members');
      expect(prisma.kittyMember.findFirst).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when customer is already enrolled in the kitty scheme', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue(kittySchemeFixture());
      prisma.kittyMember.findFirst.mockResolvedValue(kittyMemberFixture());

      await expect(
        service.enrollInScheme(tenantId, customerId, { schemeType: 'KITTY', schemeId: 'ks-1' } as never),
      ).rejects.toThrow('You are already enrolled in this scheme');
      expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });

    it('enrolls in a gold savings scheme with computed maturity value and installments', async () => {
      prisma.goldSavingsScheme.findFirst.mockResolvedValue(goldSavingsSchemeFixture());
      prisma.goldSavingsMember.findFirst.mockResolvedValueOnce(null);
      prisma.goldSavingsMember.count.mockResolvedValue(7);
      tx.goldSavingsMember.create.mockResolvedValue({ id: 'new-gm', memberNumber: 'GS-0008', status: 'ACTIVE' });
      tx.goldSavingsInstallment.createMany.mockResolvedValue({ count: 11 });
      prisma.goldSavingsInstallment.findFirst.mockResolvedValue({ dueDate: new Date('2026-02-05T00:00:00Z') });

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-05T00:00:00Z'));
      const joined = new Date('2026-01-05T00:00:00Z');
      const result = await service.enrollInScheme(tenantId, customerId, {
        schemeType: 'GOLD_SAVINGS',
        schemeId: 'gss-1',
      } as never);

      // totalPaidMonths = 11; base = 100000*11 = 1100000; bonus = 100000*1 = 100000;
      // maturityBonus = 1100000 * 200 / 10000 = 22000; total = 1222000
      const createArg = tx.goldSavingsMember.create.mock.calls[0][0];
      expect(createArg.data).toMatchObject({
        goldSavingsSchemeId: 'gss-1',
        memberNumber: 'GS-0008',
        maturityValuePaise: BigInt(1222000),
        status: 'ACTIVE',
      });
      expect(createArg.data.maturityDate).toEqual(new Date('2027-01-05T00:00:00Z'));

      const instArg = tx.goldSavingsInstallment.createMany.mock.calls[0][0];
      expect(instArg.data).toHaveLength(11);
      expect(instArg.data[0].installmentNumber).toBe(1);
      expect(instArg.data[0].dueDate.getTime()).toBeGreaterThan(joined.getTime());

      expect(result).toEqual({
        id: 'new-gm',
        memberNumber: 'GS-0008',
        schemeType: 'GOLD_SAVINGS',
        schemeName: 'Gold Savings Plus',
        status: 'ACTIVE',
        totalPaidPaise: 0,
        monthlyAmountPaise: 100000,
        durationMonths: 12,
        paidInstallments: 0,
        totalInstallments: 11,
        nextDueDate: new Date('2026-02-05T00:00:00Z'),
        maturityDate: new Date('2027-01-05T00:00:00Z'),
      });
    });

    it('throws NotFoundException when gold savings scheme is missing', async () => {
      prisma.goldSavingsScheme.findFirst.mockResolvedValue(null);

      await expect(
        service.enrollInScheme(tenantId, customerId, { schemeType: 'GOLD_SAVINGS', schemeId: 'x' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when already enrolled in gold savings scheme', async () => {
      prisma.goldSavingsScheme.findFirst.mockResolvedValue(goldSavingsSchemeFixture());
      prisma.goldSavingsMember.findFirst.mockResolvedValue(goldMemberFixture());

      await expect(
        service.enrollInScheme(tenantId, customerId, { schemeType: 'GOLD_SAVINGS', schemeId: 'gss-1' } as never),
      ).rejects.toThrow('You are already enrolled in this scheme');
    });
  });
});

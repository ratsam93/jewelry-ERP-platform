import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { CrmTrpcRouter } from '../crm.trpc';

describe('CrmTrpcRouter procedure coverage', () => {
  const trpc = new TrpcService();

  // Valid RFC 9562 v4 UUIDs (Zod 4 validates version and variant nibbles)
  const TENANT = 'tenant-1';
  const USER = 'user-1';
  const CUSTOMER_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const ID_A = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const ID_B = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const ID_C = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const AGENT_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';

  const prisma = {
    customer: { findFirst: vi.fn(), findMany: vi.fn() },
    customerOccasion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      delete: vi.fn(),
    },
    customerInteraction: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };

  const crmService = {
    prisma,
    getDashboard: vi.fn(),
    getCustomer360: vi.fn(),
    searchCustomers: vi.fn(),
    listCustomers: vi.fn(),
    importCustomers: vi.fn(),
    createSegment: vi.fn(),
    listSegments: vi.fn(),
    evaluateSegment: vi.fn(),
    refreshSegment: vi.fn(),
  };
  const loyaltyService = {
    createProgram: vi.fn(),
    updateProgram: vi.fn(),
    listPrograms: vi.fn(),
    getActiveProgram: vi.fn(),
    earnPoints: vi.fn(),
    redeemPoints: vi.fn(),
    adjustPoints: vi.fn(),
    getBalance: vi.fn(),
    getTransactionHistory: vi.fn(),
  };
  const notificationService = {
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    sendNotification: vi.fn(),
    listNotificationLogs: vi.fn(),
  };
  const campaignService = {
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    getCampaign: vi.fn(),
    listCampaigns: vi.fn(),
    previewAudience: vi.fn(),
    executeCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
  };
  const leadService = {
    createLead: vi.fn(),
    updateLead: vi.fn(),
    getLead: vi.fn(),
    listLeads: vi.fn(),
    getLeadPipeline: vi.fn(),
    updateLeadStatus: vi.fn(),
    assignLead: vi.fn(),
    convertToCustomer: vi.fn(),
    addActivity: vi.fn(),
    listActivities: vi.fn(),
    getOverdueFollowUps: vi.fn(),
  };
  const feedbackService = {
    createFeedback: vi.fn(),
    getFeedback: vi.fn(),
    listFeedback: vi.fn(),
    reviewFeedback: vi.fn(),
    actionFeedback: vi.fn(),
    getAverageRating: vi.fn(),
    getRatingDistribution: vi.fn(),
  };
  const videoConsultationService = {
    request: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    schedule: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    markNoShow: vi.fn(),
  };
  const emailService = { sendEmail: vi.fn() };
  const smsService = { sendSms: vi.fn() };
  const whatsappService = {
    sendTextMessage: vi.fn(),
    sendTemplateMessage: vi.fn(),
    getMessageStatus: vi.fn(),
  };

  const ctx = {
    tenantId: TENANT,
    userId: USER,
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new CrmTrpcRouter(
    trpc,
    crmService as never,
    loyaltyService as never,
    notificationService as never,
    campaignService as never,
    leadService as never,
    feedbackService as never,
    videoConsultationService as never,
    emailService as never,
    smsService as never,
    whatsappService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Dashboard & customers ───────────────────────────────
  describe('dashboard', () => {
    it('delegates to crmService.getDashboard', async () => {
      crmService.getDashboard.mockResolvedValue({ totalCustomers: 3 });
      const result = await caller.dashboard();
      expect(crmService.getDashboard).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ totalCustomers: 3 });
    });
  });

  describe('customer360', () => {
    it('delegates to crmService.getCustomer360', async () => {
      crmService.getCustomer360.mockResolvedValue({ id: CUSTOMER_ID });
      const result = await caller.customer360({ customerId: CUSTOMER_ID });
      expect(crmService.getCustomer360).toHaveBeenCalledWith(TENANT, CUSTOMER_ID);
      expect(result).toEqual({ id: CUSTOMER_ID });
    });

    it('rejects a non-uuid customerId with BAD_REQUEST', async () => {
      await expect(caller.customer360({ customerId: 'bogus' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('customerSearch', () => {
    it('delegates with parsed defaults (limit 10)', async () => {
      crmService.searchCustomers.mockResolvedValue([]);
      await caller.customerSearch({ query: 'ring' });
      expect(crmService.searchCustomers).toHaveBeenCalledWith(TENANT, { query: 'ring', limit: 10 });
    });

    it('rejects an empty query', async () => {
      await expect(caller.customerSearch({ query: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('customerList', () => {
    it('delegates with pagination defaults', async () => {
      crmService.listCustomers.mockResolvedValue({ items: [] });
      await caller.customerList({});
      expect(crmService.listCustomers).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ page: 1, limit: 20, sortOrder: 'desc' }),
      );
    });
  });

  describe('customerImport', () => {
    it('delegates rows to crmService.importCustomers with userId', async () => {
      crmService.importCustomers.mockResolvedValue({ imported: 1 });
      const rows = [{ firstName: 'Asha', lastName: 'Rao', city: 'Pune' }];
      const result = await caller.customerImport({ rows });
      expect(crmService.importCustomers).toHaveBeenCalledWith(TENANT, USER, rows);
      expect(result).toEqual({ imported: 1 });
    });

    it('rejects rows missing lastName', async () => {
      await expect(
        caller.customerImport({ rows: [{ firstName: 'Asha' } as never] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── Occasions ──────────────────────────────────────────
  describe('occasionCreate', () => {
    it('creates an occasion with defaults and audit fields', async () => {
      prisma.customerOccasion.create.mockResolvedValue({ id: ID_A });
      const result = await caller.occasionCreate({
        customerId: CUSTOMER_ID,
        occasionType: 'BIRTHDAY',
        date: '2026-05-01',
      });
      expect(prisma.customerOccasion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT,
          customerId: CUSTOMER_ID,
          occasionType: 'BIRTHDAY',
          date: new Date('2026-05-01'),
          reminderDaysBefore: 7,
          createdBy: USER,
          updatedBy: USER,
        }),
      });
      expect(result).toEqual({ id: ID_A });
    });

    it('rejects an unknown occasion type', async () => {
      await expect(
        caller.occasionCreate({ customerId: CUSTOMER_ID, occasionType: 'PARTY', date: '2026-05-01' } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('occasionList', () => {
    it('lists occasions for the customer ordered by date', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([{ id: ID_A }]);
      const result = await caller.occasionList({ customerId: CUSTOMER_ID });
      expect(prisma.customerOccasion.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, customerId: CUSTOMER_ID },
        orderBy: { date: 'asc' },
      });
      expect(result).toEqual([{ id: ID_A }]);
    });
  });

  describe('occasionDelete', () => {
    it('verifies tenant ownership then deletes', async () => {
      prisma.customerOccasion.findFirstOrThrow.mockResolvedValue({ id: ID_A });
      prisma.customerOccasion.delete.mockResolvedValue({ id: ID_A });
      const result = await caller.occasionDelete({ id: ID_A });
      expect(prisma.customerOccasion.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: ID_A, tenantId: TENANT },
      });
      expect(prisma.customerOccasion.delete).toHaveBeenCalledWith({ where: { id: ID_A } });
      expect(result).toEqual({ id: ID_A });
    });
  });

  // ─── Interactions ───────────────────────────────────────
  describe('interactionCreate', () => {
    it('records an interaction attributed to the caller when userId is omitted', async () => {
      prisma.customerInteraction.create.mockResolvedValue({ id: ID_B });
      const result = await caller.interactionCreate({
        customerId: CUSTOMER_ID,
        interactionType: 'CALL',
        direction: 'OUTBOUND',
        subject: 'Follow up',
      });
      expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT,
          customerId: CUSTOMER_ID,
          interactionType: 'CALL',
          direction: 'OUTBOUND',
          subject: 'Follow up',
          userId: USER,
          createdBy: USER,
          updatedBy: USER,
        }),
      });
      expect(result).toEqual({ id: ID_B });
    });

    it('uses the explicit userId and attachments when supplied', async () => {
      prisma.customerInteraction.create.mockResolvedValue({ id: ID_B });
      const attachments = [{ name: 'quote.pdf', url: 'https://files.example.com/quote.pdf' }];
      await caller.interactionCreate({
        customerId: CUSTOMER_ID,
        interactionType: 'NOTE',
        direction: 'INBOUND',
        userId: AGENT_ID,
        attachments,
      });
      expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: AGENT_ID, attachments }),
      });
    });
  });

  describe('interactionList', () => {
    it('paginates interactions and computes page metadata', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([{ id: ID_B }]);
      prisma.customerInteraction.count.mockResolvedValue(11);
      const result = await caller.interactionList({ customerId: CUSTOMER_ID, page: 2, limit: 5 });
      expect(prisma.customerInteraction.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, customerId: CUSTOMER_ID },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
      expect(result).toEqual({
        items: [{ id: ID_B }],
        total: 11,
        page: 2,
        limit: 5,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      });
    });
  });

  describe('interactions.list', () => {
    it('maps AGENT_VISIT to VISIT plus agentId and enriches with customer details', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([
        {
          id: ID_B,
          customerId: CUSTOMER_ID,
          interactionType: 'VISIT',
          direction: 'INBOUND',
          subject: 'Visit',
          content: 'Looked at rings',
          userId: AGENT_ID,
          attachments: { agentId: AGENT_ID, outcome: 'SOLD', visitDate: '2026-04-01' },
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
        },
      ]);
      prisma.customerInteraction.count.mockResolvedValue(1);
      prisma.customer.findMany.mockResolvedValue([
        { id: CUSTOMER_ID, firstName: 'Asha', lastName: 'Rao', phone: '+919876543210' },
      ]);

      const result = await caller.interactions.list({ type: 'AGENT_VISIT', agentId: AGENT_ID });

      expect(prisma.customerInteraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, interactionType: 'VISIT', userId: AGENT_ID },
        }),
      );
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, id: { in: [CUSTOMER_ID] } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      expect(result.items[0]).toEqual({
        id: ID_B,
        customerId: CUSTOMER_ID,
        customerName: 'Asha Rao',
        customerPhone: '+919876543210',
        interactionType: 'VISIT',
        direction: 'INBOUND',
        subject: 'Visit',
        content: 'Looked at rings',
        userId: AGENT_ID,
        agentId: AGENT_ID,
        outcome: 'SOLD',
        visitDate: '2026-04-01',
        createdAt: '2026-04-01T10:00:00.000Z',
      });
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrevious: false });
    });

    it('labels unknown customers and nulls missing attachment fields', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([
        {
          id: ID_B,
          customerId: ID_C,
          interactionType: 'CALL',
          direction: 'OUTBOUND',
          subject: null,
          content: null,
          userId: USER,
          attachments: null,
          createdAt: new Date('2026-04-02T09:00:00.000Z'),
        },
      ]);
      prisma.customerInteraction.count.mockResolvedValue(21);
      prisma.customer.findMany.mockResolvedValue([]);

      const result = await caller.interactions.list({
        type: 'CALL',
        agentId: AGENT_ID,
        customerId: ID_C,
        page: 2,
        limit: 10,
      });

      expect(prisma.customerInteraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, customerId: ID_C, interactionType: 'CALL', userId: AGENT_ID },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.items[0]).toMatchObject({
        customerName: 'Unknown',
        customerPhone: null,
        agentId: null,
        outcome: null,
        visitDate: null,
      });
      expect(result).toMatchObject({ totalPages: 3, hasNext: true, hasPrevious: true });
    });

    it('filters by agentId alone, and skips customer lookup when there are no items', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([]);
      prisma.customerInteraction.count.mockResolvedValue(0);

      const result = await caller.interactions.list({ agentId: AGENT_ID });

      expect(prisma.customerInteraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, userId: AGENT_ID } }),
      );
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it('omits userId for AGENT_VISIT and typed filters when no agentId is given', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([]);
      prisma.customerInteraction.count.mockResolvedValue(0);

      await caller.interactions.list({ type: 'AGENT_VISIT' });
      expect(prisma.customerInteraction.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, interactionType: 'VISIT' } }),
      );

      await caller.interactions.list({ type: 'WHATSAPP' });
      expect(prisma.customerInteraction.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, interactionType: 'WHATSAPP' } }),
      );
    });

    it('applies no type or agent filter when none are given', async () => {
      prisma.customerInteraction.findMany.mockResolvedValue([]);
      prisma.customerInteraction.count.mockResolvedValue(0);

      await caller.interactions.list({});

      expect(prisma.customerInteraction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT } }),
      );
    });
  });

  // ─── Loyalty ────────────────────────────────────────────
  const tier = { name: 'Gold', minPoints: 500, multiplier: 1.5, benefits: ['free engraving'] };

  describe('loyaltyProgramCreate', () => {
    it('creates a program with isActive defaulted to true', async () => {
      loyaltyService.createProgram.mockResolvedValue({ id: ID_A });
      await caller.loyaltyProgramCreate({
        name: 'CaratClub',
        pointsPerCurrencyUnit: 1,
        redemptionRate: 100,
        tiers: [tier],
      });
      expect(loyaltyService.createProgram).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ name: 'CaratClub', tiers: [tier], isActive: true }),
      );
    });

    it('rejects a non-positive pointsPerCurrencyUnit', async () => {
      await expect(
        caller.loyaltyProgramCreate({
          name: 'CaratClub',
          pointsPerCurrencyUnit: 0,
          redemptionRate: 100,
          tiers: [],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('loyaltyProgramUpdate', () => {
    it('updates only the supplied fields and strips id from the payload', async () => {
      loyaltyService.updateProgram.mockResolvedValue({ id: ID_A });
      await caller.loyaltyProgramUpdate({ id: ID_A, name: 'Renamed' });
      const args = loyaltyService.updateProgram.mock.calls[0]!;
      expect(args[0]).toBe(TENANT);
      expect(args[1]).toBe(USER);
      expect(args[2]).toBe(ID_A);
      expect(args[3]).toEqual(expect.objectContaining({ name: 'Renamed' }));
      expect(args[3]).not.toHaveProperty('id');
    });
  });

  describe('loyaltyProgramList / loyaltyProgramActive', () => {
    it('lists programs', async () => {
      loyaltyService.listPrograms.mockResolvedValue([]);
      await caller.loyaltyProgramList();
      expect(loyaltyService.listPrograms).toHaveBeenCalledWith(TENANT);
    });

    it('fetches the active program', async () => {
      loyaltyService.getActiveProgram.mockResolvedValue({ id: ID_A });
      const result = await caller.loyaltyProgramActive();
      expect(loyaltyService.getActiveProgram).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ id: ID_A });
    });
  });

  describe('loyaltyEarnPoints', () => {
    it('earns points with reference and description', async () => {
      loyaltyService.earnPoints.mockResolvedValue({ balance: 50 });
      await caller.loyaltyEarnPoints({
        customerId: CUSTOMER_ID,
        points: 50,
        referenceType: 'SALE',
        referenceId: ID_A,
        description: 'Diamond purchase',
      });
      expect(loyaltyService.earnPoints).toHaveBeenCalledWith(
        TENANT, USER, CUSTOMER_ID, 50, 'SALE', ID_A, 'Diamond purchase',
      );
    });

    it('rejects non-positive points', async () => {
      await expect(
        caller.loyaltyEarnPoints({
          customerId: CUSTOMER_ID,
          points: 0,
          referenceType: 'SALE',
          referenceId: ID_A,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('loyaltyRedeemPoints', () => {
    it('redeems points against a reference', async () => {
      loyaltyService.redeemPoints.mockResolvedValue({ balance: 30 });
      await caller.loyaltyRedeemPoints({
        customerId: CUSTOMER_ID,
        points: 20,
        referenceType: 'INVOICE',
        referenceId: ID_A,
      });
      expect(loyaltyService.redeemPoints).toHaveBeenCalledWith(
        TENANT, USER, CUSTOMER_ID, 20, 'INVOICE', ID_A,
      );
    });
  });

  describe('loyaltyAdjustPoints', () => {
    it('passes the full transaction input to adjustPoints', async () => {
      loyaltyService.adjustPoints.mockResolvedValue({ id: ID_A });
      await caller.loyaltyAdjustPoints({
        customerId: CUSTOMER_ID,
        transactionType: 'ADJUSTED',
        points: -5,
        description: 'Correction',
      });
      expect(loyaltyService.adjustPoints).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ customerId: CUSTOMER_ID, transactionType: 'ADJUSTED', points: -5 }),
      );
    });
  });

  describe('loyaltyBalance / loyaltyTransactions', () => {
    it('returns the balance for a customer', async () => {
      loyaltyService.getBalance.mockResolvedValue({ currentPoints: 120 });
      const result = await caller.loyaltyBalance({ customerId: CUSTOMER_ID });
      expect(loyaltyService.getBalance).toHaveBeenCalledWith(TENANT, CUSTOMER_ID);
      expect(result).toEqual({ currentPoints: 120 });
    });

    it('returns paginated transaction history with defaults', async () => {
      loyaltyService.getTransactionHistory.mockResolvedValue({ items: [] });
      await caller.loyaltyTransactions({ customerId: CUSTOMER_ID });
      expect(loyaltyService.getTransactionHistory).toHaveBeenCalledWith(TENANT, CUSTOMER_ID, 1, 20);
    });
  });

  // ─── Notifications ──────────────────────────────────────
  describe('notificationTemplateCreate', () => {
    it('creates a template with isActive defaulted', async () => {
      notificationService.createTemplate.mockResolvedValue({ id: ID_A });
      await caller.notificationTemplateCreate({
        name: 'Welcome',
        channel: 'EMAIL',
        body: 'Hello {{name}}',
        category: 'TRANSACTIONAL',
      });
      expect(notificationService.createTemplate).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ name: 'Welcome', channel: 'EMAIL', isActive: true }),
      );
    });
  });

  describe('notificationTemplateUpdate', () => {
    it('updates template fields without the id', async () => {
      notificationService.updateTemplate.mockResolvedValue({ id: ID_A });
      await caller.notificationTemplateUpdate({ id: ID_A, body: 'Hi {{name}}' });
      const args = notificationService.updateTemplate.mock.calls[0]!;
      expect(args.slice(0, 3)).toEqual([TENANT, USER, ID_A]);
      expect(args[3]).toEqual(expect.objectContaining({ body: 'Hi {{name}}' }));
      expect(args[3]).not.toHaveProperty('id');
    });
  });

  describe('notificationTemplateList', () => {
    it('lists all templates when no channel is given', async () => {
      notificationService.listTemplates.mockResolvedValue([]);
      await caller.notificationTemplateList();
      expect(notificationService.listTemplates).toHaveBeenCalledWith(TENANT, undefined);
    });

    it('filters templates by channel', async () => {
      notificationService.listTemplates.mockResolvedValue([]);
      await caller.notificationTemplateList({ channel: 'SMS' });
      expect(notificationService.listTemplates).toHaveBeenCalledWith(TENANT, 'SMS');
    });
  });

  describe('notificationTemplateGet / notificationTemplateDelete', () => {
    it('gets a template by id', async () => {
      notificationService.getTemplate.mockResolvedValue({ id: ID_A });
      const result = await caller.notificationTemplateGet({ id: ID_A });
      expect(notificationService.getTemplate).toHaveBeenCalledWith(TENANT, ID_A);
      expect(result).toEqual({ id: ID_A });
    });

    it('deletes a template by id', async () => {
      notificationService.deleteTemplate.mockResolvedValue({ deleted: true });
      await caller.notificationTemplateDelete({ id: ID_A });
      expect(notificationService.deleteTemplate).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('notificationSend', () => {
    it('sends a notification on behalf of the caller', async () => {
      notificationService.sendNotification.mockResolvedValue({ status: 'QUEUED' });
      await caller.notificationSend({ customerId: CUSTOMER_ID, channel: 'SMS', body: 'Your order is ready' });
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ customerId: CUSTOMER_ID, channel: 'SMS', body: 'Your order is ready' }),
      );
    });
  });

  describe('notificationLogs', () => {
    it('lists logs with default paging and optional status', async () => {
      notificationService.listNotificationLogs.mockResolvedValue({ items: [] });
      await caller.notificationLogs({ status: 'FAILED' });
      expect(notificationService.listNotificationLogs).toHaveBeenCalledWith(TENANT, 1, 20, 'FAILED');
    });
  });

  // ─── Campaigns ──────────────────────────────────────────
  describe('campaignCreate', () => {
    it('creates a campaign with the audience filter', async () => {
      campaignService.createCampaign.mockResolvedValue({ id: ID_A });
      await caller.campaignCreate({
        name: 'Diwali',
        channel: 'WHATSAPP',
        audienceFilter: { city: ['Mumbai'] },
      });
      expect(campaignService.createCampaign).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ name: 'Diwali', channel: 'WHATSAPP', audienceFilter: { city: ['Mumbai'] } }),
      );
    });
  });

  describe('campaignUpdate', () => {
    it('updates campaign fields without the id', async () => {
      campaignService.updateCampaign.mockResolvedValue({ id: ID_A });
      await caller.campaignUpdate({ id: ID_A, name: 'Diwali 2' });
      const args = campaignService.updateCampaign.mock.calls[0]!;
      expect(args.slice(0, 3)).toEqual([TENANT, USER, ID_A]);
      expect(args[3]).toEqual(expect.objectContaining({ name: 'Diwali 2' }));
      expect(args[3]).not.toHaveProperty('id');
    });
  });

  describe('campaignGet / campaignList', () => {
    it('gets a campaign by id', async () => {
      campaignService.getCampaign.mockResolvedValue({ id: ID_A });
      await caller.campaignGet({ id: ID_A });
      expect(campaignService.getCampaign).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('lists campaigns with status filter', async () => {
      campaignService.listCampaigns.mockResolvedValue({ items: [] });
      await caller.campaignList({ status: 'ACTIVE' });
      expect(campaignService.listCampaigns).toHaveBeenCalledWith(TENANT, 1, 20, 'ACTIVE');
    });
  });

  describe('campaignPreviewAudience', () => {
    it('previews the audience for the given criteria', async () => {
      campaignService.previewAudience.mockResolvedValue({ count: 12 });
      const result = await caller.campaignPreviewAudience({ city: ['Mumbai'], tags: ['vip'] });
      expect(campaignService.previewAudience).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ city: ['Mumbai'], tags: ['vip'] }),
      );
      expect(result).toEqual({ count: 12 });
    });
  });

  describe('campaignExecute / campaignPause / campaignCancel', () => {
    it('executes a campaign', async () => {
      campaignService.executeCampaign.mockResolvedValue({ status: 'ACTIVE' });
      await caller.campaignExecute({ id: ID_A });
      expect(campaignService.executeCampaign).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });

    it('pauses a campaign', async () => {
      campaignService.pauseCampaign.mockResolvedValue({ status: 'PAUSED' });
      await caller.campaignPause({ id: ID_A });
      expect(campaignService.pauseCampaign).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });

    it('cancels a campaign', async () => {
      campaignService.cancelCampaign.mockResolvedValue({ status: 'CANCELLED' });
      await caller.campaignCancel({ id: ID_A });
      expect(campaignService.cancelCampaign).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });
  });

  // ─── Leads ──────────────────────────────────────────────
  describe('leadCreate', () => {
    it('creates a lead', async () => {
      leadService.createLead.mockResolvedValue({ id: ID_A });
      await caller.leadCreate({ firstName: 'Ravi', lastName: 'Shah', source: 'WALK_IN' });
      expect(leadService.createLead).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ firstName: 'Ravi', source: 'WALK_IN' }),
      );
    });

    it('rejects an unknown lead source', async () => {
      await expect(
        caller.leadCreate({ firstName: 'Ravi', lastName: 'Shah', source: 'RADIO' } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('leadUpdate', () => {
    it('updates lead fields without the id', async () => {
      leadService.updateLead.mockResolvedValue({ id: ID_A });
      await caller.leadUpdate({ id: ID_A, notes: 'Wants a quote' });
      const args = leadService.updateLead.mock.calls[0]!;
      expect(args.slice(0, 3)).toEqual([TENANT, USER, ID_A]);
      expect(args[3]).toEqual(expect.objectContaining({ notes: 'Wants a quote' }));
      expect(args[3]).not.toHaveProperty('id');
    });
  });

  describe('leadGet / leadList / leadPipeline', () => {
    it('gets a lead by id', async () => {
      leadService.getLead.mockResolvedValue({ id: ID_A });
      await caller.leadGet({ id: ID_A });
      expect(leadService.getLead).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('lists leads with status and assignee filters', async () => {
      leadService.listLeads.mockResolvedValue({ items: [] });
      await caller.leadList({ status: 'NEW', assignedTo: USER });
      expect(leadService.listLeads).toHaveBeenCalledWith(TENANT, 1, 20, 'NEW', USER);
    });

    it('returns the pipeline', async () => {
      leadService.getLeadPipeline.mockResolvedValue({ NEW: 2 });
      const result = await caller.leadPipeline();
      expect(leadService.getLeadPipeline).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ NEW: 2 });
    });
  });

  describe('leadUpdateStatus', () => {
    it('passes the full status update including lost reason', async () => {
      leadService.updateLeadStatus.mockResolvedValue({ id: ID_A, status: 'LOST' });
      await caller.leadUpdateStatus({ leadId: ID_A, status: 'LOST', lostReason: 'Price' });
      expect(leadService.updateLeadStatus).toHaveBeenCalledWith(TENANT, USER, {
        leadId: ID_A,
        status: 'LOST',
        lostReason: 'Price',
      });
    });
  });

  describe('leadAssign', () => {
    it('assigns the lead to the target user', async () => {
      leadService.assignLead.mockResolvedValue({ id: ID_A });
      await caller.leadAssign({ leadId: ID_A, assignToUserId: ID_B });
      expect(leadService.assignLead).toHaveBeenCalledWith(TENANT, USER, ID_A, ID_B);
    });

    it('rejects a non-uuid assignee', async () => {
      await expect(
        caller.leadAssign({ leadId: ID_A, assignToUserId: 'nobody' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('leadConvert', () => {
    it('converts a lead to a customer', async () => {
      leadService.convertToCustomer.mockResolvedValue({ customerId: CUSTOMER_ID });
      const result = await caller.leadConvert({ leadId: ID_A });
      expect(leadService.convertToCustomer).toHaveBeenCalledWith(TENANT, USER, ID_A);
      expect(result).toEqual({ customerId: CUSTOMER_ID });
    });
  });

  describe('leadActivityCreate / leadActivities', () => {
    it('adds an activity to a lead', async () => {
      leadService.addActivity.mockResolvedValue({ id: ID_B });
      await caller.leadActivityCreate({ leadId: ID_A, activityType: 'CALL', description: 'Intro call' });
      expect(leadService.addActivity).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ leadId: ID_A, activityType: 'CALL' }),
      );
    });

    it('lists activities for a lead', async () => {
      leadService.listActivities.mockResolvedValue([]);
      await caller.leadActivities({ leadId: ID_A });
      expect(leadService.listActivities).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('leadOverdueFollowUps', () => {
    it('returns overdue follow-ups', async () => {
      leadService.getOverdueFollowUps.mockResolvedValue([{ id: ID_A }]);
      const result = await caller.leadOverdueFollowUps();
      expect(leadService.getOverdueFollowUps).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual([{ id: ID_A }]);
    });
  });

  // ─── Feedback ───────────────────────────────────────────
  describe('feedbackCreate', () => {
    it('creates feedback with the caller as actor', async () => {
      feedbackService.createFeedback.mockResolvedValue({ id: ID_A });
      await caller.feedbackCreate({ customerId: CUSTOMER_ID, feedbackType: 'PURCHASE', rating: 4 });
      expect(feedbackService.createFeedback).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ customerId: CUSTOMER_ID, rating: 4 }),
      );
    });

    it('rejects a rating above 5', async () => {
      await expect(
        caller.feedbackCreate({ customerId: CUSTOMER_ID, feedbackType: 'PURCHASE', rating: 6 }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('feedbackGet / feedbackList', () => {
    it('gets feedback by id', async () => {
      feedbackService.getFeedback.mockResolvedValue({ id: ID_A });
      await caller.feedbackGet({ id: ID_A });
      expect(feedbackService.getFeedback).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('lists feedback filtered by type', async () => {
      feedbackService.listFeedback.mockResolvedValue({ items: [] });
      await caller.feedbackList({ feedbackType: 'GENERAL' });
      expect(feedbackService.listFeedback).toHaveBeenCalledWith(TENANT, 1, 20, undefined, 'GENERAL');
    });
  });

  describe('feedbackReview / feedbackAction', () => {
    it('marks feedback reviewed', async () => {
      feedbackService.reviewFeedback.mockResolvedValue({ status: 'REVIEWED' });
      await caller.feedbackReview({ id: ID_A });
      expect(feedbackService.reviewFeedback).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });

    it('actions feedback', async () => {
      feedbackService.actionFeedback.mockResolvedValue({ status: 'ACTIONED' });
      await caller.feedbackAction({ id: ID_A });
      expect(feedbackService.actionFeedback).toHaveBeenCalledWith(TENANT, USER, ID_A);
    });
  });

  describe('feedbackAverageRating', () => {
    it('parses date bounds and delegates', async () => {
      feedbackService.getAverageRating.mockResolvedValue(4.2);
      const result = await caller.feedbackAverageRating({ from: '2026-01-01', to: '2026-03-31' });
      expect(feedbackService.getAverageRating).toHaveBeenCalledWith(
        TENANT,
        new Date('2026-01-01'),
        new Date('2026-03-31'),
      );
      expect(result).toBe(4.2);
    });

    it('accepts an open-ended range', async () => {
      feedbackService.getAverageRating.mockResolvedValue(0);
      await caller.feedbackAverageRating({});
      expect(feedbackService.getAverageRating).toHaveBeenCalledWith(TENANT, undefined, undefined);
    });
  });

  describe('feedbackRatingDistribution', () => {
    it('returns the rating distribution', async () => {
      feedbackService.getRatingDistribution.mockResolvedValue({ 5: 3 });
      const result = await caller.feedbackRatingDistribution();
      expect(feedbackService.getRatingDistribution).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ 5: 3 });
    });
  });

  // ─── Segments ───────────────────────────────────────────
  describe('segmentCreate', () => {
    it('creates a segment from criteria', async () => {
      crmService.createSegment.mockResolvedValue({ id: ID_A });
      await caller.segmentCreate({ name: 'VIP', criteria: { loyaltyTier: ['GOLD'] } });
      expect(crmService.createSegment).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({ name: 'VIP', criteria: { loyaltyTier: ['GOLD'] } }),
      );
    });
  });

  describe('segmentList', () => {
    it('lists segments', async () => {
      crmService.listSegments.mockResolvedValue([]);
      await caller.segmentList();
      expect(crmService.listSegments).toHaveBeenCalledWith(TENANT);
    });
  });

  describe('segmentEvaluate', () => {
    it('evaluates criteria without persisting', async () => {
      crmService.evaluateSegment.mockResolvedValue({ count: 7 });
      const result = await caller.segmentEvaluate({ minTotalSpendPaise: 100000 });
      expect(crmService.evaluateSegment).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ minTotalSpendPaise: 100000 }),
      );
      expect(result).toEqual({ count: 7 });
    });
  });

  describe('segmentRefresh', () => {
    it('refreshes a segment', async () => {
      crmService.refreshSegment.mockResolvedValue({ id: ID_A });
      await caller.segmentRefresh({ id: ID_A });
      expect(crmService.refreshSegment).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  // ─── Email gateway ──────────────────────────────────────
  describe('email.test', () => {
    it('sends a fixed test email to the given address', async () => {
      emailService.sendEmail.mockResolvedValue({ messageId: 'm-1' });
      const result = await caller.email.test({ to: 'ops@example.com' });
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          to: 'ops@example.com',
          subject: 'CaratFlow email gateway test',
        }),
      );
      expect(result).toEqual({ messageId: 'm-1' });
    });

    it('rejects an invalid email address', async () => {
      await expect(caller.email.test({ to: 'not-an-email' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('email.send', () => {
    it('resolves the customer email within the tenant and sends', async () => {
      prisma.customer.findFirst.mockResolvedValue({ email: 'asha@example.com' });
      emailService.sendEmail.mockResolvedValue({ messageId: 'm-2' });
      await caller.email.send({
        customerId: CUSTOMER_ID,
        subject: 'Your order',
        html: '<p>Ready</p>',
        cc: ['cc@example.com'],
        replyTo: 'shop@example.com',
      });
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID, tenantId: TENANT },
        select: { email: true },
      });
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({
          to: 'asha@example.com',
          subject: 'Your order',
          html: '<p>Ready</p>',
          cc: ['cc@example.com'],
          replyTo: 'shop@example.com',
        }),
      );
    });

    it('fails with BAD_REQUEST when the customer has no email on file', async () => {
      prisma.customer.findFirst.mockResolvedValue({ email: null });
      await expect(
        caller.email.send({ customerId: CUSTOMER_ID, subject: 'Hi', html: '<p>x</p>' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: `Customer ${CUSTOMER_ID} has no email` });
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('fails with BAD_REQUEST when the customer is not found in the tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        caller.email.send({ customerId: CUSTOMER_ID, subject: 'Hi', html: '<p>x</p>' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── SMS gateway ────────────────────────────────────────
  describe('sms.test', () => {
    it('sends a fixed test SMS to the E.164 number', async () => {
      smsService.sendSms.mockResolvedValue({ messageId: 's-1' });
      await caller.sms.test({ to: '+919876543210' });
      expect(smsService.sendSms).toHaveBeenCalledWith(TENANT, {
        to: '+919876543210',
        body: 'CaratFlow SMS gateway test',
      });
    });

    it('rejects a number that is not E.164', async () => {
      await expect(caller.sms.test({ to: '9876543210' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('sms.send', () => {
    it('sends to the customer phone on file', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: '+919876543210' });
      smsService.sendSms.mockResolvedValue({ messageId: 's-2' });
      await caller.sms.send({ customerId: CUSTOMER_ID, body: 'Order ready' });
      expect(smsService.sendSms).toHaveBeenCalledWith(TENANT, {
        to: '+919876543210',
        body: 'Order ready',
      });
    });

    it('fails with BAD_REQUEST when the customer has no phone', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: null });
      await expect(
        caller.sms.send({ customerId: CUSTOMER_ID, body: 'Order ready' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: `Customer ${CUSTOMER_ID} has no phone` });
      expect(smsService.sendSms).not.toHaveBeenCalled();
    });
  });

  // ─── Video consultation ─────────────────────────────────
  describe('videoConsultation.request', () => {
    it('requests a consultation for the customer', async () => {
      videoConsultationService.request.mockResolvedValue({ id: ID_A, status: 'REQUESTED' });
      const result = await caller.videoConsultation.request({ customerId: CUSTOMER_ID });
      expect(videoConsultationService.request).toHaveBeenCalledWith(
        TENANT,
        CUSTOMER_ID,
        expect.objectContaining({ customerId: CUSTOMER_ID, preferredLang: 'en' }),
      );
      expect(result).toEqual({ id: ID_A, status: 'REQUESTED' });
    });
  });

  describe('videoConsultation.list', () => {
    it('lists with status filter and paging defaults', async () => {
      videoConsultationService.list.mockResolvedValue({ items: [] });
      await caller.videoConsultation.list({ status: 'REQUESTED' });
      expect(videoConsultationService.list).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ status: 'REQUESTED' }),
        { page: 1, limit: 20 },
      );
    });
  });

  describe('videoConsultation.get', () => {
    it('gets a consultation by id', async () => {
      videoConsultationService.get.mockResolvedValue({ id: ID_A });
      await caller.videoConsultation.get({ id: ID_A });
      expect(videoConsultationService.get).toHaveBeenCalledWith(TENANT, ID_A);
    });
  });

  describe('videoConsultation.schedule', () => {
    it('coerces scheduledAt to a Date and passes the consultant', async () => {
      videoConsultationService.schedule.mockResolvedValue({ id: ID_A, status: 'SCHEDULED' });
      await caller.videoConsultation.schedule({
        id: ID_A,
        consultantId: ID_B,
        scheduledAt: '2026-06-01T10:00:00.000Z',
      });
      expect(videoConsultationService.schedule).toHaveBeenCalledWith(
        TENANT,
        ID_A,
        ID_B,
        new Date('2026-06-01T10:00:00.000Z'),
      );
    });
  });

  describe('videoConsultation.start / complete / cancel / markNoShow', () => {
    it('starts a consultation', async () => {
      videoConsultationService.start.mockResolvedValue({ id: ID_A });
      await caller.videoConsultation.start({ id: ID_A });
      expect(videoConsultationService.start).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('completes a consultation with notes', async () => {
      videoConsultationService.complete.mockResolvedValue({ id: ID_A });
      await caller.videoConsultation.complete({ id: ID_A, notes: 'Bought earrings' });
      expect(videoConsultationService.complete).toHaveBeenCalledWith(TENANT, ID_A, 'Bought earrings');
    });

    it('cancels a consultation without a reason', async () => {
      videoConsultationService.cancel.mockResolvedValue({ id: ID_A });
      await caller.videoConsultation.cancel({ id: ID_A });
      expect(videoConsultationService.cancel).toHaveBeenCalledWith(TENANT, ID_A, undefined);
    });

    it('marks a consultation as no-show', async () => {
      videoConsultationService.markNoShow.mockResolvedValue({ id: ID_A });
      await caller.videoConsultation.markNoShow({ id: ID_A });
      expect(videoConsultationService.markNoShow).toHaveBeenCalledWith(TENANT, ID_A);
    });

    it('rejects notes longer than 2000 characters', async () => {
      await expect(
        caller.videoConsultation.complete({ id: ID_A, notes: 'x'.repeat(2001) }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  // ─── WhatsApp ───────────────────────────────────────────
  describe('whatsapp.testConnection', () => {
    it('sends a test text message and returns the ids', async () => {
      whatsappService.sendTextMessage.mockResolvedValue({ messageId: 'wamid.1', waId: '919876543210' });
      const result = await caller.whatsapp.testConnection({ to: '+919876543210' });
      expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
        TENANT,
        '+919876543210',
        'CaratFlow test message - WhatsApp integration is working.',
      );
      expect(result).toEqual({ success: true, messageId: 'wamid.1', waId: '919876543210' });
    });

    it('rejects a non E.164 number', async () => {
      await expect(caller.whatsapp.testConnection({ to: 'abc' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('whatsapp.sendTemplate', () => {
    it('maps params into a body component', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: '+919876543210' });
      whatsappService.sendTemplateMessage.mockResolvedValue({ messageId: 'wamid.2' });
      const result = await caller.whatsapp.sendTemplate({
        customerId: CUSTOMER_ID,
        templateName: 'order_update',
        languageCode: 'en',
        params: ['Asha', 'ORD-1'],
      });
      expect(whatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        TENANT,
        '+919876543210',
        'order_update',
        'en',
        [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Asha' },
              { type: 'text', text: 'ORD-1' },
            ],
          },
        ],
      );
      expect(result).toEqual({ success: true, messageId: 'wamid.2' });
    });

    it('sends with no components when params are omitted', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: '+919876543210' });
      whatsappService.sendTemplateMessage.mockResolvedValue({ messageId: 'wamid.3' });
      await caller.whatsapp.sendTemplate({
        customerId: CUSTOMER_ID,
        templateName: 'greeting',
        languageCode: 'en_US',
      });
      expect(whatsappService.sendTemplateMessage).toHaveBeenCalledWith(
        TENANT,
        '+919876543210',
        'greeting',
        'en_US',
        [],
      );
    });

    it('fails with BAD_REQUEST when the customer has no phone', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: null });
      await expect(
        caller.whatsapp.sendTemplate({
          customerId: CUSTOMER_ID,
          templateName: 'greeting',
          languageCode: 'en',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Customer has no phone number' });
      expect(whatsappService.sendTemplateMessage).not.toHaveBeenCalled();
    });
  });

  describe('whatsapp.getMessageStatus', () => {
    it('returns the status for an external message id', async () => {
      whatsappService.getMessageStatus.mockResolvedValue({ status: 'delivered' });
      const result = await caller.whatsapp.getMessageStatus({ externalId: 'wamid.1' });
      expect(whatsappService.getMessageStatus).toHaveBeenCalledWith(TENANT, 'wamid.1');
      expect(result).toEqual({ status: 'delivered' });
    });

    it('rejects an empty external id', async () => {
      await expect(caller.whatsapp.getMessageStatus({ externalId: '' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  // ─── Authentication and RBAC ────────────────────────────
  describe('authorisation', () => {
    it('rejects unauthenticated callers', async () => {
      const anonymous = routerInstance.router.createCaller({});
      await expect(anonymous.dashboard()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects callers without any CRM permission', async () => {
      const noPerms = routerInstance.router.createCaller({
        tenantId: TENANT,
        userId: USER,
        userPermissions: [],
      });
      await expect(noPerms.customer360({ customerId: CUSTOMER_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(crmService.getCustomer360).not.toHaveBeenCalled();
    });
  });
});

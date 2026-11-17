import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPrismaService, createMockEventBusService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
import { CrmNotificationService } from '../crm.notification.service';

describe('CrmNotificationService', () => {
  let service: CrmNotificationService; let prisma: ReturnType<typeof createMockPrismaService>;
  let eventBus: ReturnType<typeof createMockEventBusService>;
  const { tenantId, userId } = mockTenantContext;
  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    eventBus = createMockEventBusService();
    ['notificationTemplate','notificationLog','customerOccasion'].forEach(m => { (prisma as any)[m] = { findFirst: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() }; });
    const whatsapp = { sendTextMessage: vi.fn() } as any;
    const emailService = { sendEmail: vi.fn().mockResolvedValue({ success: true, externalId: 'em-1', statusCode: 202 }) } as any;
    const smsService = { sendSms: vi.fn().mockResolvedValue({ success: true, provider: 'MSG91', externalId: 'sm-1', statusCode: 200 }) } as any;
    service = new CrmNotificationService(prisma as never, eventBus as never, whatsapp, emailService, smsService);
  });

  describe('createTemplate', () => {
    it('should create notification template', async () => {
      (prisma as any).notificationTemplate.create.mockResolvedValue({ id: 't-1', name: 'Welcome', body: 'Hello {{firstName}}' });
      const r = await service.createTemplate(tenantId, userId, { name: 'Welcome', channel: 'EMAIL', body: 'Hello {{firstName}}', isActive: true } as any);
      expect(r.name).toBe('Welcome');
    });
  });

  describe('sendNotification', () => {
    it('should create log and dispatch', async () => {
      (prisma as any).notificationLog.create.mockResolvedValue({ id: 'nl-1', status: 'QUEUED' });
      (prisma as any).notificationLog.update.mockResolvedValue({ id: 'nl-1', status: 'SENT' });
      await service.sendNotification(tenantId, userId, { customerId: 'c1', channel: 'EMAIL', body: 'Test', subject: 'Hi' } as any);
      expect((prisma as any).notificationLog.create).toHaveBeenCalled();
    });
    it('should interpolate template variables', async () => {
      (prisma as any).notificationTemplate.findFirst.mockResolvedValue({ id: 't-1', body: 'Hello {{firstName}}!', subject: 'Hi {{firstName}}' });
      (prisma as any).notificationLog.create.mockResolvedValue({ id: 'nl-1' });
      (prisma as any).notificationLog.update.mockResolvedValue({ id: 'nl-1' });
      await service.sendNotification(tenantId, userId, { customerId: 'c1', channel: 'EMAIL', templateId: 't-1', variables: { firstName: 'Rajesh' } } as any);
      expect((prisma as any).notificationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: 'Hello Rajesh!' }) }));
    });
    it('should throw if body is empty and no template', async () => {
      await expect(service.sendNotification(tenantId, userId, { customerId: 'c1', channel: 'SMS' } as any)).rejects.toThrow('body is required');
    });
  });

  describe('bulkSend', () => {
    it('should send to multiple customers', async () => {
      (prisma as any).notificationTemplate.findFirst.mockResolvedValue({ id: 't-1', body: 'Hi', subject: 'Hello' });
      (prisma as any).notificationLog.create.mockResolvedValue({ id: 'nl-1' });
      (prisma as any).notificationLog.update.mockResolvedValue({ id: 'nl-1' });
      const r = await service.bulkSend(tenantId, userId, ['c1', 'c2'], 'EMAIL', 't-1', { firstName: 'Test' });
      expect(r.queued).toBe(2);
      expect(r.failed).toBe(0);
    });
  });

  describe('getCustomerNotifications', () => {
    it('should return paginated logs', async () => {
      (prisma as any).notificationLog.findMany.mockResolvedValue([{ id: 'nl-1' }]);
      (prisma as any).notificationLog.count.mockResolvedValue(1);
      const r = await service.getCustomerNotifications(tenantId, 'c1');
      expect(r.total).toBe(1);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template', async () => {
      (prisma as any).notificationTemplate.findFirst.mockResolvedValue({ id: 't-1' });
      (prisma as any).notificationTemplate.delete.mockResolvedValue({});
      await service.deleteTemplate(tenantId, 't-1');
      expect((prisma as any).notificationTemplate.delete).toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    it('should list templates', async () => {
      (prisma as any).notificationTemplate.findMany.mockResolvedValue([{ id: 't-1' }]);
      const r = await service.listTemplates(tenantId);
      expect(r).toHaveLength(1);
    });
    it('should filter by channel', async () => {
      (prisma as any).notificationTemplate.findMany.mockResolvedValue([]);
      await service.listTemplates(tenantId, 'SMS');
      expect((prisma as any).notificationTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ channel: 'SMS' }) }));
    });
  });
  describe('sendOccasionReminders idempotency', () => {
    let logStore: Array<{ id: string; tenantId: string; customerId: string; status: string; createdAt: Date; metadata: Record<string, unknown> }>;
    let idSeq: number;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      logStore = [];
      idSeq = 0;
      const n = prisma as any;
      // Customer with a phone and email so the EMAIL dispatch path runs.
      n.customer = {
        findFirst: vi.fn().mockResolvedValue({ id: 'c1', phone: '9999999999', email: 'c1@example.com' }),
      };
      n.customerOccasion.findMany.mockResolvedValue([
        {
          id: 'occ-1',
          occasionType: 'BIRTHDAY',
          date: new Date(2026, 10, 20),
          reminderDaysBefore: 4,
          customer: { id: 'c1', firstName: 'Asha', lastName: 'Rao', phone: '9999999999', email: 'c1@example.com' },
        },
      ]);
      n.notificationTemplate.findFirst.mockResolvedValue({ id: 't-1', channel: 'EMAIL', category: 'REMINDER' });
      n.notificationTemplate.findFirst.mockResolvedValue({ id: 't-1', body: 'Hi {{firstName}}', subject: 'Reminder' });
      n.notificationLog.create.mockImplementation(async ({ data }: any) => {
        const row = {
          id: `nl-${++idSeq}`,
          tenantId: data.tenantId,
          customerId: data.customerId,
          status: 'QUEUED',
          createdAt: new Date(),
          metadata: (data.metadata ?? {}) as Record<string, unknown>,
        };
        logStore.push(row);
        return row;
      });
      n.notificationLog.findMany.mockImplementation(async ({ where }: any) =>
        logStore.filter(
          (l) =>
            l.tenantId === where.tenantId &&
            l.customerId === where.customerId &&
            l.createdAt >= where.createdAt.gte &&
            where.status.in.includes(l.status),
        ),
      );
      n.notificationLog.findUnique = vi.fn().mockResolvedValue({ status: 'SENT' });
      n.notificationLog.update.mockResolvedValue({});
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends the occasion reminder once on the reminder day', async () => {
      vi.setSystemTime(new Date(2026, 10, 16, 9, 0, 0));
      const sent = await service.sendOccasionReminders(tenantId);
      expect(sent).toBe(1);
      expect((prisma as any).notificationLog.create).toHaveBeenCalledTimes(1);
      expect(logStore[0].metadata).toMatchObject({ occasionId: 'occ-1', reminderDate: '2026-11-16' });
    });

    it('skips a second run the same day (retry or manual rerun)', async () => {
      vi.setSystemTime(new Date(2026, 10, 16, 9, 0, 0));
      await service.sendOccasionReminders(tenantId);
      const second = await service.sendOccasionReminders(tenantId);
      expect(second).toBe(0);
      expect((prisma as any).notificationLog.create).toHaveBeenCalledTimes(1);
    });

    it('does not skip a reminder that previously failed', async () => {
      vi.setSystemTime(new Date(2026, 10, 16, 9, 0, 0));
      await service.sendOccasionReminders(tenantId);
      logStore[0].status = 'FAILED';
      const retry = await service.sendOccasionReminders(tenantId);
      expect(retry).toBe(1);
      expect((prisma as any).notificationLog.create).toHaveBeenCalledTimes(2);
    });

    it('sends again on the next day when the reminder falls on that day', async () => {
      vi.setSystemTime(new Date(2026, 10, 16, 9, 0, 0));
      await service.sendOccasionReminders(tenantId);

      // Same occasion, but the reminder date now matches the next calendar day.
      (prisma as any).customerOccasion.findMany.mockResolvedValue([
        {
          id: 'occ-1',
          occasionType: 'BIRTHDAY',
          date: new Date(2026, 10, 21),
          reminderDaysBefore: 4,
          customer: { id: 'c1', firstName: 'Asha', lastName: 'Rao', phone: '9999999999', email: 'c1@example.com' },
        },
      ]);
      vi.setSystemTime(new Date(2026, 10, 17, 9, 0, 0));
      const sent = await service.sendOccasionReminders(tenantId);
      expect(sent).toBe(1);
      expect((prisma as any).notificationLog.create).toHaveBeenCalledTimes(2);
      expect(logStore[1].metadata).toMatchObject({ occasionId: 'occ-1', reminderDate: '2026-11-17' });
    });
  });
});

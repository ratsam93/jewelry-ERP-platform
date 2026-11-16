import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { createMockPrismaService, createMockEventBusService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
import { CrmNotificationService } from '../crm.notification.service';
import { WhatsAppNotConfiguredError } from '../whatsapp.service';

const { tenantId, userId } = mockTenantContext;
const CUSTOMER_ID = 'cust-1';

function model() {
  return {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
}

function fcmResponse(status: number, body: unknown) {
  return { status, json: vi.fn().mockResolvedValue(body) } as any;
}

describe('CrmNotificationService (coverage)', () => {
  let service: CrmNotificationService;
  let prisma: any;
  let eventBus: ReturnType<typeof createMockEventBusService>;
  let whatsapp: { sendTextMessage: ReturnType<typeof vi.fn> };
  let emailService: { sendEmail: ReturnType<typeof vi.fn> };
  let smsService: { sendSms: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;
  let loggerError: ReturnType<typeof vi.spyOn>;
  let loggerWarn: ReturnType<typeof vi.spyOn>;
  const originalFcmKey = process.env.FCM_SERVER_KEY;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    prisma.notificationTemplate = model();
    prisma.notificationLog = model();
    prisma.customerOccasion = { findMany: vi.fn() };
    prisma.customer = { findFirst: vi.fn(), update: vi.fn() };
    prisma.setting = { findFirst: vi.fn() };

    prisma.notificationLog.create.mockResolvedValue({ id: 'nl-1', status: 'QUEUED' });
    prisma.notificationLog.update.mockResolvedValue({});
    prisma.notificationLog.findUnique.mockResolvedValue(null);
    prisma.notificationLog.findMany.mockResolvedValue([]);
    prisma.notificationLog.count.mockResolvedValue(0);
    prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-1', body: 'Hello {{firstName}}', subject: 'Subj {{firstName}}', channel: 'EMAIL' });
    prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, phone: '+919999999999', email: 'a@b.com' });

    eventBus = createMockEventBusService();
    whatsapp = { sendTextMessage: vi.fn().mockResolvedValue({ success: true }) };
    emailService = { sendEmail: vi.fn().mockResolvedValue({ success: true, externalId: 'em-1', statusCode: 202 }) };
    smsService = { sendSms: vi.fn().mockResolvedValue({ success: true, provider: 'MSG91', externalId: 'sm-1', statusCode: 200 }) };

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.FCM_SERVER_KEY;

    loggerError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    loggerWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    service = new CrmNotificationService(
      prisma as never,
      eventBus as never,
      whatsapp as never,
      emailService as never,
      smsService as never,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalFcmKey === undefined) delete process.env.FCM_SERVER_KEY;
    else process.env.FCM_SERVER_KEY = originalFcmKey;
  });

  // ─── Template CRUD ───────────────────────────────────────────

  describe('template CRUD', () => {
    it('createTemplate applies defaults and records the creator', async () => {
      prisma.notificationTemplate.create.mockResolvedValue({ id: 't-1' });
      await service.createTemplate(tenantId, userId, {
        name: 'Welcome',
        channel: 'SMS',
        body: 'Hi',
        isActive: true,
        category: 'GREETING',
      } as any);
      expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          name: 'Welcome',
          channel: 'SMS',
          variables: [],
          createdBy: userId,
          updatedBy: userId,
        }),
      });
    });

    it('createTemplate keeps provided variables', async () => {
      prisma.notificationTemplate.create.mockResolvedValue({ id: 't-1' });
      await service.createTemplate(tenantId, userId, {
        name: 'X',
        channel: 'EMAIL',
        body: 'b',
        variables: ['firstName'],
        isActive: true,
      } as any);
      expect(prisma.notificationTemplate.create.mock.calls[0][0].data.variables).toEqual(['firstName']);
    });

    it('updateTemplate verifies tenant ownership before updating', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-1' });
      prisma.notificationTemplate.update.mockResolvedValue({ id: 't-1', name: 'New' });
      const r = await service.updateTemplate(tenantId, userId, 't-1', { name: 'New' } as any);
      expect(prisma.notificationTemplate.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 't-1', tenantId },
      });
      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({ name: 'New', variables: undefined, updatedBy: userId }),
      });
      expect(r.name).toBe('New');
    });

    it('updateTemplate passes variables through when supplied', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-1' });
      prisma.notificationTemplate.update.mockResolvedValue({ id: 't-1' });
      await service.updateTemplate(tenantId, userId, 't-1', { variables: ['a', 'b'] } as any);
      expect(prisma.notificationTemplate.update.mock.calls[0][0].data.variables).toEqual(['a', 'b']);
    });

    it('updateTemplate rejects when the template is not in this tenant', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockRejectedValue(new Error('NotFound'));
      await expect(service.updateTemplate(tenantId, userId, 'other', {} as any)).rejects.toThrow('NotFound');
      expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
    });

    it('getTemplate scopes lookup by tenant', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-9' });
      const r = await service.getTemplate(tenantId, 't-9');
      expect(r).toEqual({ id: 't-9' });
      expect(prisma.notificationTemplate.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 't-9', tenantId },
      });
    });

    it('listTemplates without channel does not filter by channel', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([{ id: 't-1' }, { id: 't-2' }]);
      const r = await service.listTemplates(tenantId);
      expect(r).toHaveLength(2);
      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('deleteTemplate verifies tenant ownership then deletes', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-1' });
      prisma.notificationTemplate.delete.mockResolvedValue({ id: 't-1' });
      const r = await service.deleteTemplate(tenantId, 't-1');
      expect(r).toEqual({ id: 't-1' });
      expect(prisma.notificationTemplate.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 't-1', tenantId },
      });
      expect(prisma.notificationTemplate.delete).toHaveBeenCalledWith({ where: { id: 't-1' } });
    });

    it('deleteTemplate does not delete when the template is missing', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockRejectedValue(new Error('NotFound'));
      await expect(service.deleteTemplate(tenantId, 'missing')).rejects.toThrow('NotFound');
      expect(prisma.notificationTemplate.delete).not.toHaveBeenCalled();
    });
  });

  // ─── sendNotification: templating and validation ─────────────

  describe('sendNotification templating', () => {
    it('uses raw body and subject when no template is given', async () => {
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'EMAIL',
        body: '<p>Raw</p>',
        subject: 'Raw subject',
      } as any);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          customerId: CUSTOMER_ID,
          channel: 'EMAIL',
          subject: 'Raw subject',
          body: '<p>Raw</p>',
          status: 'QUEUED',
          metadata: undefined,
          createdBy: userId,
          updatedBy: userId,
        }),
      });
    });

    it('resolves template body and subject with variables and stores variables as metadata', async () => {
      const variables = { firstName: 'Rajesh' };
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'EMAIL',
        templateId: 't-1',
        variables,
      } as any);
      expect(prisma.notificationTemplate.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 't-1', tenantId },
      });
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: 'Hello Rajesh',
          subject: 'Subj Rajesh',
          templateId: 't-1',
          metadata: variables,
        }),
      });
    });

    it('leaves unknown placeholders intact and falls back to input subject when template has none', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({
        id: 't-2',
        body: 'Hi {{firstName}} from {{store}}',
        subject: null,
      });
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'EMAIL',
        templateId: 't-2',
        subject: 'Input subject',
        variables: { firstName: 'Asha' },
      } as any);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: 'Hi Asha from {{store}}',
          subject: 'Input subject',
        }),
      });
    });

    it('treats missing variables as an empty map when resolving a template', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-3', body: 'Plain {{x}}', subject: null });
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'EMAIL',
        templateId: 't-3',
      } as any);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: 'Plain {{x}}', metadata: undefined }),
      });
    });

    it('throws when the resolved body is empty', async () => {
      await expect(
        service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: '' } as any),
      ).rejects.toThrow('Notification body is required');
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('throws when the template body resolves to empty', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-4', body: '', subject: null });
      await expect(
        service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', templateId: 't-4' } as any),
      ).rejects.toThrow('Notification body is required');
    });

    it('propagates template lookup failure (tenant mismatch)', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockRejectedValue(new Error('NotFound'));
      await expect(
        service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', templateId: 'x' } as any),
      ).rejects.toThrow('NotFound');
    });
  });

  // ─── sendNotification: status transitions and events ─────────

  describe('sendNotification status and events', () => {
    it('marks a still-QUEUED log as SENT after the dispatcher returns', async () => {
      prisma.notificationLog.findUnique
        .mockResolvedValueOnce({ id: 'nl-1', status: 'QUEUED' })
        .mockResolvedValueOnce({ id: 'nl-1', status: 'SENT' });
      const log = await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'WHATSAPP',
        body: 'Hi',
      } as any);
      expect(log).toEqual({ id: 'nl-1', status: 'QUEUED' });
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'SENT', sentAt: expect.any(Date) },
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'crm.notification.sent',
          tenantId,
          userId,
          payload: { customerId: CUSTOMER_ID, channel: 'WHATSAPP', templateId: '', status: 'SENT' },
        }),
      );
    });

    it('respects a provider-set FAILED status without throwing', async () => {
      prisma.notificationLog.findUnique.mockResolvedValueOnce({ id: 'nl-1', status: 'FAILED' });
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'WHATSAPP',
        body: 'Hi',
        templateId: 't-1',
      } as any);
      expect(prisma.notificationLog.update).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ templateId: 't-1', status: 'FAILED' }),
        }),
      );
    });

    it('reports SENT in the event when the log cannot be re-read', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue(null);
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: 'x' } as any);
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ status: 'SENT' }) }),
      );
    });

    it('marks the log FAILED with the error message when dispatch throws', async () => {
      whatsapp.sendTextMessage.mockRejectedValue(new Error('provider down'));
      const log = await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'WHATSAPP',
        body: 'Hi',
      } as any);
      expect(log.id).toBe('nl-1');
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'provider down' },
      });
      expect(loggerError).toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('uses "Unknown error" when a non-Error value is thrown', async () => {
      whatsapp.sendTextMessage.mockRejectedValue('weird');
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'WHATSAPP', body: 'Hi' } as any);
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'Unknown error' },
      });
    });

    it('marks FAILED when publishing the event fails after a successful dispatch', async () => {
      eventBus.publish.mockRejectedValueOnce(new Error('bus down'));
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: 'Hi' } as any);
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'bus down' },
      });
    });

    it('marks FAILED for an unsupported channel', async () => {
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'FAX', body: 'Hi' } as any);
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'Unsupported notification channel: FAX' },
      });
    });
  });

  // ─── Channel dispatch: WhatsApp / SMS / Email ─────────────────

  describe('WhatsApp dispatch', () => {
    it('sends text to the customer phone scoped to tenant', async () => {
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'WHATSAPP', body: 'Hello' } as any);
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID, tenantId },
        select: { phone: true },
      });
      expect(whatsapp.sendTextMessage).toHaveBeenCalledWith(tenantId, '+919999999999', 'Hello', 'nl-1');
    });

    it('fails when customer has no phone', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: null });
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'WHATSAPP', body: 'Hi' } as any);
      expect(whatsapp.sendTextMessage).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: `Customer ${CUSTOMER_ID} has no phone for WhatsApp` },
      });
    });

    it('fails when customer is not found in this tenant', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'WHATSAPP', body: 'Hi' } as any);
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
    });

    it('logs and rethrows WhatsAppNotConfiguredError', async () => {
      whatsapp.sendTextMessage.mockRejectedValue(new WhatsAppNotConfiguredError(tenantId));
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'WHATSAPP', body: 'Hi' } as any);
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining(`WhatsApp not configured for tenant ${tenantId}`));
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({ status: 'FAILED' }),
      });
    });
  });

  describe('SMS dispatch', () => {
    it('sends via SMS provider and records externalId and provider', async () => {
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: 'Hi sms' } as any);
      expect(smsService.sendSms).toHaveBeenCalledWith(tenantId, { to: '+919999999999', body: 'Hi sms' });
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID, tenantId },
        select: { phone: true },
      });
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
          metadata: { externalId: 'sm-1', provider: 'MSG91' },
        },
      });
    });

    it('fails when customer has no phone', async () => {
      prisma.customer.findFirst.mockResolvedValue({ phone: '' });
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: 'Hi' } as any);
      expect(smsService.sendSms).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: `Customer ${CUSTOMER_ID} has no phone for SMS` },
      });
    });

    it('marks FAILED when the SMS provider rejects', async () => {
      smsService.sendSms.mockRejectedValue(new Error('gateway 503'));
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'SMS', body: 'Hi' } as any);
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'gateway 503' },
      });
    });
  });

  describe('Email dispatch', () => {
    it('sends HTML email and records SENDGRID provider metadata', async () => {
      await service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'EMAIL',
        subject: 'Hello there',
        body: '<b>Hi</b>',
      } as any);
      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID, tenantId },
        select: { email: true },
      });
      expect(emailService.sendEmail).toHaveBeenCalledWith(tenantId, {
        to: 'a@b.com',
        subject: 'Hello there',
        html: '<b>Hi</b>',
      });
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
          metadata: { externalId: 'em-1', provider: 'SENDGRID' },
        },
      });
    });

    it('uses "(no subject)" when no subject is available', async () => {
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'EMAIL', body: 'Body' } as any);
      expect(emailService.sendEmail).toHaveBeenCalledWith(tenantId, expect.objectContaining({ subject: '(no subject)' }));
    });

    it('fails when customer has no email', async () => {
      prisma.customer.findFirst.mockResolvedValue({ email: null });
      await service.sendNotification(tenantId, userId, { customerId: CUSTOMER_ID, channel: 'EMAIL', body: 'Hi' } as any);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: `Customer ${CUSTOMER_ID} has no email` },
      });
    });
  });

  // ─── bulkSend ────────────────────────────────────────────────

  describe('bulkSend', () => {
    it('counts a failed send when the template cannot be resolved', async () => {
      prisma.notificationTemplate.findFirstOrThrow
        .mockRejectedValueOnce(new Error('NotFound'))
        .mockResolvedValueOnce({ id: 't-1', body: 'Hi', subject: 'S' });
      const r = await service.bulkSend(tenantId, userId, ['c1', 'c2'], 'EMAIL', 't-1', { firstName: 'T' });
      expect(r).toEqual({ queued: 1, failed: 1 });
    });

    it('counts a failed send when resolved body is empty', async () => {
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-1', body: '', subject: null });
      const r = await service.bulkSend(tenantId, userId, ['c1'], 'SMS', 't-1', {});
      expect(r).toEqual({ queued: 0, failed: 1 });
    });

    it('returns zeros for an empty recipient list', async () => {
      const r = await service.bulkSend(tenantId, userId, [], 'SMS', 't-1', {});
      expect(r).toEqual({ queued: 0, failed: 0 });
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── Occasion reminders ─────────────────────────────────────

  describe('sendOccasionReminders', () => {
    const today = new Date(2026, 5, 15, 10, 0, 0);
    const occasion = (overrides: Record<string, unknown> = {}) => ({
      id: 'occ-1',
      occasionType: 'BIRTHDAY',
      date: new Date(2026, 5, 20, 12, 0, 0),
      reminderDaysBefore: 5,
      customer: { id: CUSTOMER_ID, firstName: 'Asha', lastName: 'Rao', phone: '+919999999999', email: null },
      ...overrides,
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(today);
    });

    it('sends a reminder when today is the reminder date', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([occasion()]);
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 't-r', channel: 'WHATSAPP' });
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({
        id: 't-r',
        body: 'Happy {{occasionType}} {{firstName}}',
        subject: null,
      });

      const count = await service.sendOccasionReminders(tenantId);

      expect(count).toBe(1);
      expect(prisma.customerOccasion.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } } },
      });
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: { tenantId, category: 'REMINDER', isActive: true },
      });
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: 'Happy BIRTHDAY Asha',
          channel: 'WHATSAPP',
          createdBy: 'SYSTEM',
          metadata: expect.objectContaining({
            firstName: 'Asha',
            lastName: 'Rao',
            occasionType: 'BIRTHDAY',
            date: new Date(2026, 5, 20, 12, 0, 0).toLocaleDateString('en-IN'),
          }),
        }),
      });
    });

    it('skips occasions whose reminder date is not today', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([occasion({ reminderDaysBefore: 2 })]);
      const count = await service.sendOccasionReminders(tenantId);
      expect(count).toBe(0);
      expect(prisma.notificationTemplate.findFirst).not.toHaveBeenCalled();
    });

    it('skips when no active reminder template exists', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([occasion()]);
      prisma.notificationTemplate.findFirst.mockResolvedValue(null);
      const count = await service.sendOccasionReminders(tenantId);
      expect(count).toBe(0);
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('skips when the customer has no phone number', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([
        occasion({ customer: { id: CUSTOMER_ID, firstName: 'A', lastName: 'B', phone: null, email: 'x@y.z' } }),
      ]);
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 't-r', channel: 'EMAIL' });
      const count = await service.sendOccasionReminders(tenantId);
      expect(count).toBe(0);
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('logs and continues when sending a reminder throws', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([occasion()]);
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 't-r', channel: 'SMS' });
      prisma.notificationTemplate.findFirstOrThrow.mockRejectedValue(new Error('template gone'));
      const count = await service.sendOccasionReminders(tenantId);
      expect(count).toBe(0);
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('Failed to send occasion reminder for occ-1'));
    });

    it('counts only the occasions that fall on today', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([
        occasion({ id: 'occ-hit' }),
        occasion({ id: 'occ-miss', reminderDaysBefore: 1 }),
      ]);
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 't-r', channel: 'SMS' });
      prisma.notificationTemplate.findFirstOrThrow.mockResolvedValue({ id: 't-r', body: 'Hi', subject: null });
      const count = await service.sendOccasionReminders(tenantId);
      expect(count).toBe(1);
    });

    it('returns 0 when there are no occasions', async () => {
      prisma.customerOccasion.findMany.mockResolvedValue([]);
      expect(await service.sendOccasionReminders(tenantId)).toBe(0);
    });
  });

  // ─── Log listing ────────────────────────────────────────────

  describe('getCustomerNotifications', () => {
    it('returns defaults with pagination flags for the first page', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([{ id: 'nl-1' }]);
      prisma.notificationLog.count.mockResolvedValue(45);
      const r = await service.getCustomerNotifications(tenantId, CUSTOMER_ID);
      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith({
        where: { tenantId, customerId: CUSTOMER_ID },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.notificationLog.count).toHaveBeenCalledWith({ where: { tenantId, customerId: CUSTOMER_ID } });
      expect(r).toEqual({
        items: [{ id: 'nl-1' }],
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3,
        hasNext: true,
        hasPrevious: false,
      });
    });

    it('computes skip and previous flags for a middle page', async () => {
      prisma.notificationLog.count.mockResolvedValue(45);
      const r = await service.getCustomerNotifications(tenantId, CUSTOMER_ID, 2, 20);
      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
      expect(r.hasNext).toBe(true);
      expect(r.hasPrevious).toBe(true);
    });

    it('reports no next page on the last page', async () => {
      prisma.notificationLog.count.mockResolvedValue(10);
      const r = await service.getCustomerNotifications(tenantId, CUSTOMER_ID, 1, 10);
      expect(r.totalPages).toBe(1);
      expect(r.hasNext).toBe(false);
    });
  });

  describe('listNotificationLogs', () => {
    it('lists all logs for the tenant with customer names', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([{ id: 'nl-1' }]);
      prisma.notificationLog.count.mockResolvedValue(1);
      const r = await service.listNotificationLogs(tenantId);
      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: { customer: { select: { firstName: true, lastName: true } } },
      });
      expect(r).toEqual({ items: [{ id: 'nl-1' }], total: 1, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrevious: false });
    });

    it('filters by status when provided', async () => {
      await service.listNotificationLogs(tenantId, 3, 5, 'FAILED');
      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, status: 'FAILED' }, skip: 10, take: 5 }),
      );
      expect(prisma.notificationLog.count).toHaveBeenCalledWith({ where: { tenantId, status: 'FAILED' } });
    });
  });

  // ─── PUSH (FCM) ─────────────────────────────────────────────

  describe('PUSH dispatch (FCM)', () => {
    function configurePush({
      tokens = ['tok-a', 'tok-b'] as unknown,
      preferences,
      dbKey = 'db-key' as unknown,
    }: { tokens?: unknown; preferences?: unknown; dbKey?: unknown } = {}) {
      prisma.setting.findFirst.mockResolvedValue(dbKey === null ? null : { settingValue: dbKey });
      prisma.customer.findFirst.mockResolvedValue({
        id: CUSTOMER_ID,
        preferences: preferences !== undefined ? preferences : { fcm_tokens: tokens },
      });
    }

    async function sendPush(subject?: string) {
      return service.sendNotification(tenantId, userId, {
        customerId: CUSTOMER_ID,
        channel: 'PUSH',
        subject,
        body: 'Push body',
      } as any);
    }

    it('fails with FCM_NOT_CONFIGURED when no key exists in settings or env', async () => {
      configurePush({ dbKey: null });
      await sendPush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'FAILED',
          failureReason: 'FCM server key not configured',
          metadata: { errorCode: 'FCM_NOT_CONFIGURED' },
        },
      });
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('FCM server key not configured'));
    });

    it('uses the FCM key from the environment when settings have none', async () => {
      process.env.FCM_SERVER_KEY = 'env-key';
      configurePush({ dbKey: null });
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, failure: 0, results: [{ message_id: 'm1' }, { message_id: 'm2' }] }));
      await sendPush();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'key=env-key' }),
        }),
      );
    });

    it('reads the key from an object-valued setting', async () => {
      configurePush({ dbKey: { value: 'obj-key' } });
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 2, failure: 0, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      await sendPush();
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('key=obj-key');
    });

    it('falls back when the object-valued setting has no value field', async () => {
      process.env.FCM_SERVER_KEY = 'env-fallback';
      configurePush({ dbKey: { other: 1 } });
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ message_id: 'a' }] }));
      await sendPush();
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('key=env-fallback');
    });

    it('falls back to env when the empty-string setting is ignored', async () => {
      configurePush({ dbKey: '' });
      await sendPush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({ status: 'FAILED', metadata: { errorCode: 'FCM_NOT_CONFIGURED' } }),
      });
    });

    it('falls back to env when the settings lookup throws', async () => {
      process.env.FCM_SERVER_KEY = 'env-after-error';
      configurePush();
      prisma.setting.findFirst.mockRejectedValue(new Error('db down'));
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ message_id: 'a' }] }));
      await sendPush();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Setting lookup failed for fcm_server_key: db down'));
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('key=env-after-error');
    });

    it('logs non-Error setting lookup failures as strings', async () => {
      configurePush();
      prisma.setting.findFirst.mockRejectedValue('plain failure');
      await sendPush();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('plain failure'));
    });

    it('fails when the customer does not exist', async () => {
      configurePush();
      prisma.customer.findFirst.mockResolvedValue(null);
      await sendPush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: `Customer ${CUSTOMER_ID} not found` },
      });
    });

    it.each([
      ['empty preferences object', {}],
      ['null preferences', null],
      ['array preferences', ['tok-a']],
      ['non-array fcm_tokens', { fcm_tokens: 'tok-a' }],
      ['only empty tokens', { fcm_tokens: ['', 42] }],
    ])('fails with NO_DEVICE_TOKENS for %s', async (_label, preferences) => {
      configurePush({ preferences });
      await sendPush();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'FAILED',
          failureReason: 'No FCM tokens registered for customer',
          metadata: { errorCode: 'NO_DEVICE_TOKENS' },
        },
      });
    });

    it('sends to all tokens, removes dead tokens, and persists the reduced set', async () => {
      configurePush({ preferences: { fcm_tokens: ['tok-a', 'tok-b'], locale: 'en-IN' } });
      fetchMock.mockResolvedValue(
        fcmResponse(200, {
          success: 1,
          failure: 1,
          multicast_id: 12345,
          results: [{ message_id: 'm1' }, { error: 'NotRegistered' }],
        }),
      );
      await sendPush('Title here');

      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent).toEqual({
        registration_ids: ['tok-a', 'tok-b'],
        notification: { title: 'Title here', body: 'Push body' },
        data: { logId: 'nl-1', customerId: CUSTOMER_ID, tenantId },
      });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { preferences: { fcm_tokens: ['tok-a'], locale: 'en-IN' } },
      });
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
          metadata: {
            provider: 'FCM',
            externalId: '12345',
            successCount: 1,
            failureCount: 1,
            targetedTokens: 2,
          },
        },
      });
    });

    it('defaults the title to CaratFlow and keeps externalId null when multicast_id is absent', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 2, failure: 0, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      await sendPush();
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.notification.title).toBe('CaratFlow');
      expect(prisma.notificationLog.update.mock.calls[0][0].data.metadata.externalId).toBeNull();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('accepts a string multicast_id as externalId', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, multicast_id: 'mc-9', results: [{ message_id: 'a' }] }));
      await sendPush();
      expect(prisma.notificationLog.update.mock.calls[0][0].data.metadata.externalId).toBe('mc-9');
    });

    it('remaps canonical registration ids back to the customer', async () => {
      configurePush();
      fetchMock.mockResolvedValue(
        fcmResponse(200, {
          success: 2,
          failure: 0,
          results: [{ message_id: 'a', registration_id: 'tok-new' }, { message_id: 'b' }],
        }),
      );
      await sendPush();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { preferences: { fcm_tokens: ['tok-new', 'tok-b'] } },
      });
    });

    it('dedupes tokens when a canonical id collides with an existing token', async () => {
      configurePush();
      fetchMock.mockResolvedValue(
        fcmResponse(200, {
          success: 2,
          failure: 0,
          results: [{ message_id: 'a', registration_id: 'tok-b' }, { message_id: 'b' }],
        }),
      );
      await sendPush();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { preferences: { fcm_tokens: ['tok-b'] } },
      });
    });

    it('does not persist when every token is unchanged', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 2, failure: 0, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      await sendPush();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('keeps tokens without a matching result entry', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ message_id: 'a' }] }));
      await sendPush();
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update.mock.calls[0][0].data.status).toBe('SENT');
    });

    it('ignores non-string error and registration_id fields', async () => {
      configurePush({ tokens: ['tok-a'] });
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ error: 42, registration_id: 7 }] }));
      await sendPush();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('logs but still reports SENT when persisting token changes fails', async () => {
      configurePush();
      prisma.customer.update.mockRejectedValue(new Error('write failed'));
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ message_id: 'a' }, { error: 'InvalidRegistration' }] }));
      await sendPush();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to persist fcm_tokens update'));
      expect(prisma.notificationLog.update.mock.calls[0][0].data.status).toBe('SENT');
    });

    it('logs non-Error token persistence failures as strings', async () => {
      configurePush();
      prisma.customer.update.mockRejectedValue('nope');
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 1, results: [{ message_id: 'a' }, { error: 'NotRegistered' }] }));
      await sendPush();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('nope'));
    });

    it('marks FAILED with the first per-token error when no token is accepted', async () => {
      configurePush();
      fetchMock.mockResolvedValue(
        fcmResponse(200, {
          success: 0,
          failure: 2,
          results: [{ error: 'InvalidRegistration' }, { error: 'NotRegistered' }],
        }),
      );
      await sendPush();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: CUSTOMER_ID },
        data: { preferences: { fcm_tokens: [] } },
      });
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: {
          status: 'FAILED',
          failureReason: 'FCM: InvalidRegistration',
          metadata: {
            provider: 'FCM',
            errorCode: 'InvalidRegistration',
            successCount: 0,
            failureCount: 2,
            httpStatus: 200,
          },
        },
      });
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('FCM dispatch FAILED'));
    });

    it('uses the HTTP status and token count when there are no per-token results', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 0 }));
      await sendPush();
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'FCM: HTTP 200',
          metadata: expect.objectContaining({ errorCode: 'HTTP 200', failureCount: 2, httpStatus: 200 }),
        }),
      });
    });

    it('treats a non-array results payload as empty', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 0, failure: 1, results: 'not-an-array' }));
      await sendPush();
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({ failureReason: 'FCM: HTTP 200' }),
      });
    });

    it('truncates very long FCM failure reasons to 500 characters', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(200, { success: 0, failure: 1, results: [{ error: 'x'.repeat(600) }] }));
      await sendPush();
      const reason = prisma.notificationLog.update.mock.calls.at(-1)[0].data.failureReason as string;
      expect(reason.length).toBe(500);
      expect(reason.startsWith('FCM: xxx')).toBe(true);
    });

    it('treats an unparseable response body as an empty payload', async () => {
      configurePush();
      fetchMock.mockResolvedValue({ status: 200, json: vi.fn().mockRejectedValue(new Error('bad json')) });
      await sendPush();
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'FCM: HTTP 200' }),
      });
    });

    it('retries on 5xx and 429 responses before succeeding', async () => {
      configurePush();
      fetchMock
        .mockResolvedValueOnce(fcmResponse(500, {}))
        .mockResolvedValueOnce(fcmResponse(429, {}))
        .mockResolvedValueOnce(fcmResponse(200, { success: 2, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((fn: () => void) => {
          fn();
          return 0;
        }) as any);
      await sendPush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
      expect(prisma.notificationLog.update.mock.calls[0][0].data.status).toBe('SENT');
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('FCM transient failure (attempt 1/3): HTTP 500'));
    });

    it('fails after three transient failures and records the error', async () => {
      configurePush();
      fetchMock.mockResolvedValue(fcmResponse(503, {}));
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as any);
      await sendPush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'FCM HTTP 503' },
      });
    });

    it('retries after a network error and succeeds', async () => {
      configurePush();
      fetchMock
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(fcmResponse(200, { success: 2, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as any);
      await sendPush();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('FCM network error (attempt 1/3): ECONNRESET'));
      expect(prisma.notificationLog.update.mock.calls[0][0].data.status).toBe('SENT');
    });

    it('surfaces the last network error after exhausting retries', async () => {
      configurePush();
      fetchMock.mockRejectedValue(new Error('socket hang up'));
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as any);
      await sendPush();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'socket hang up' },
      });
    });

    it('uses a generic message when a non-Error value is the last failure', async () => {
      configurePush();
      fetchMock.mockRejectedValue('network-weird');
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as any);
      await sendPush();
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({
        where: { id: 'nl-1' },
        data: { status: 'FAILED', failureReason: 'FCM send failed after 3 retries' },
      });
    });

    it('logs non-Error network failures as strings', async () => {
      configurePush();
      fetchMock
        .mockRejectedValueOnce('flaky')
        .mockResolvedValueOnce(fcmResponse(200, { success: 2, results: [{ message_id: 'a' }, { message_id: 'b' }] }));
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as any);
      await sendPush();
      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('flaky'));
    });
  });
});

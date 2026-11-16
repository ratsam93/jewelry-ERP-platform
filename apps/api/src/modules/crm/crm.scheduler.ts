// --- CRM Scheduler ---------------------------------------------------
// BullMQ repeat jobs. Iterates active tenants and calls the service per
// tenant (tenant-safe). Skipped when DISABLE_SCHEDULERS=true or NODE_ENV=test.
// Redis failures are non-fatal. Repeat jobs are keyed by name+pattern so
// re-registration on restart does not duplicate them.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { CrmNotificationService } from './crm.notification.service';
import { CrmLoyaltyService } from './crm.loyalty.service';

export const CRM_QUEUE_NAME = 'caratflow-crm-scheduler';
export const CRM_JOBS = {
  OccasionReminders: 'crm-occasion-reminders',
  ExpirePoints: 'crm-expire-loyalty-points',
} as const;

@Injectable()
export class CrmScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmScheduler.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  private readonly redisConnection: { host: string; port: number; password?: string } = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: CrmNotificationService,
    private readonly loyalty: CrmLoyaltyService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_SCHEDULERS === 'true' || process.env.NODE_ENV === 'test') {
      this.logger.log('CrmScheduler disabled (DISABLE_SCHEDULERS/test)');
      return;
    }
    try {
      this.queue = new Queue(CRM_QUEUE_NAME, { connection: this.redisConnection });
      this.queue.on('error', (err) => this.logger.warn(`Queue error: ${err.message}`));

      this.worker = new Worker(
        CRM_QUEUE_NAME,
        async (job: Job) => {
          if (job.name === CRM_JOBS.OccasionReminders) await this.runOccasionReminders();
          else if (job.name === CRM_JOBS.ExpirePoints) await this.runExpirePoints();
        },
        { connection: this.redisConnection, concurrency: 1 },
      );
      this.worker.on('error', (err) => this.logger.warn(`Worker error: ${err.message}`));
      this.worker.on('failed', (job, err) =>
        this.logger.error(`Job ${job?.name} (${job?.id}) failed: ${err.message}`),
      );

      await this.queue.add(
        CRM_JOBS.OccasionReminders,
        {},
        { repeat: { pattern: '0 9 * * *' }, removeOnComplete: 24, removeOnFail: 24 },
      );
      await this.queue.add(
        CRM_JOBS.ExpirePoints,
        {},
        { repeat: { pattern: '0 2 * * *' }, removeOnComplete: 24, removeOnFail: 24 },
      );
      this.logger.log('CrmScheduler scheduled: crm-occasion-reminders (0 9 * * *), crm-expire-loyalty-points (0 2 * * *)');
    } catch (err) {
      this.logger.warn(`CrmScheduler init failed (non-fatal): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      /* ignore */
    }
  }

  /** Exposed for tests / manual trigger. */
  async runOccasionReminders(): Promise<void> {
    await this.forEachTenant('crm-occasion-reminders', (tenantId) => this.notifications.sendOccasionReminders(tenantId));
  }

  /** Exposed for tests / manual trigger. */
  async runExpirePoints(): Promise<void> {
    await this.forEachTenant('crm-expire-loyalty-points', (tenantId) => this.loyalty.expirePoints(tenantId));
  }

  /** Run a service method for every active tenant; one tenant failing does not stop the rest. */
  private async forEachTenant(
    label: string,
    fn: (tenantId: string) => Promise<unknown>,
  ): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const t of tenants) {
      try {
        const result = await fn(t.id);
        this.logger.log(`${label} tenant=${t.id} result=${JSON.stringify(result)}`);
      } catch (err) {
        this.logger.error(`${label} failed for tenant ${t.id}: ${(err as Error).message}`);
      }
    }
  }
}

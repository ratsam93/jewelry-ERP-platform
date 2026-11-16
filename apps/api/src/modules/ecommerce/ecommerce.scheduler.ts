// --- Ecommerce Scheduler ---------------------------------------------------
// BullMQ repeat jobs. Iterates active tenants and calls the service per
// tenant (tenant-safe). Skipped when DISABLE_SCHEDULERS=true or NODE_ENV=test.
// Redis failures are non-fatal. Repeat jobs are keyed by name+pattern so
// re-registration on restart does not duplicate them.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { EcommerceClickCollectService } from './ecommerce.click-collect.service';

export const ECOMMERCE_QUEUE_NAME = 'caratflow-ecommerce-scheduler';
export const ECOMMERCE_JOBS = {
  ClickCollectExpiry: 'ecommerce-click-collect-expiry',
} as const;

@Injectable()
export class EcommerceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EcommerceScheduler.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  private readonly redisConnection: { host: string; port: number; password?: string } = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickCollect: EcommerceClickCollectService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_SCHEDULERS === 'true' || process.env.NODE_ENV === 'test') {
      this.logger.log('EcommerceScheduler disabled (DISABLE_SCHEDULERS/test)');
      return;
    }
    try {
      this.queue = new Queue(ECOMMERCE_QUEUE_NAME, { connection: this.redisConnection });
      this.queue.on('error', (err) => this.logger.warn(`Queue error: ${err.message}`));

      this.worker = new Worker(
        ECOMMERCE_QUEUE_NAME,
        async (job: Job) => {
          if (job.name === ECOMMERCE_JOBS.ClickCollectExpiry) await this.runClickCollectExpiry();
        },
        { connection: this.redisConnection, concurrency: 1 },
      );
      this.worker.on('error', (err) => this.logger.warn(`Worker error: ${err.message}`));
      this.worker.on('failed', (job, err) =>
        this.logger.error(`Job ${job?.name} (${job?.id}) failed: ${err.message}`),
      );

      await this.queue.add(
        ECOMMERCE_JOBS.ClickCollectExpiry,
        {},
        { repeat: { pattern: '0 * * * *' }, removeOnComplete: 24, removeOnFail: 24 },
      );
      this.logger.log('EcommerceScheduler scheduled: ecommerce-click-collect-expiry (0 * * * *)');
    } catch (err) {
      this.logger.warn(`EcommerceScheduler init failed (non-fatal): ${(err as Error).message}`);
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
  async runClickCollectExpiry(): Promise<void> {
    await this.forEachTenant('ecommerce-click-collect-expiry', (tenantId) => this.clickCollect.handleExpired(tenantId));
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

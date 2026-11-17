import { Injectable, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import type { PaginatedResult, AuditMeta } from '@caratflow/shared-types';
import { Prisma } from '@caratflow/db';
import { setMutationAuditSink, type MutationAuditEvent } from '../../trpc/mutation-audit';

interface AuditLogEntry {
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

interface ActivityLogEntry {
  action: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogFilters {
  page: number;
  limit: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ActivityLogFilters {
  page: number;
  limit: number;
  userId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class PlatformAuditService extends TenantAwareService implements OnModuleInit {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  onModuleInit(): void {
    setMutationAuditSink((event) => this.recordMutation(event));
  }

  /** Persist one generic mutation audit entry (called fire-and-forget by tRPC). */
  recordMutation(event: MutationAuditEvent) {
    return this.logDataChange(
      event.tenantId,
      {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        newValues: event.newValues,
      },
      { userId: event.userId ?? '' },
    );
  }

  // ─── AuditLog (data changes) ─────────────────────────────────

  /** Log a data change to the AuditLog table. */
  async logDataChange(tenantId: string, entry: AuditLogEntry, audit: AuditMeta) {
    return this.prisma.auditLog.create({
      data: {
        id: uuid(),
        tenantId,
        userId: audit.userId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: (entry.oldValues ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        newValues: (entry.newValues ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      },
    });
  }

  /** Query audit logs with filters and pagination. */
  async queryAuditLogs(
    tenantId: string,
    filters: AuditLogFilters,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { page, limit, entityType, entityId, userId, action, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (entityType) {
      // A comma-separated list matches several raw types (the UI merges types that share one label).
      const types = entityType.split(',').map((t) => t.trim()).filter(Boolean);
      if (types.length > 1) where.entityType = { in: types };
      else if (types.length === 1) where.entityType = types[0];
    }
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.createdAt = dateFilter;
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items: items as unknown as Record<string, unknown>[],
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  /** Get distinct entity types present in audit logs for filter dropdown. */
  async getAuditEntityTypes(tenantId: string): Promise<string[]> {
    const results = await this.prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ['entityType'],
      select: { entityType: true },
    });
    return results.map((r) => r.entityType);
  }

  // ─── ActivityLog (user actions) ──────────────────────────────

  /** Log a user activity (login, viewed report, etc.). */
  async logActivity(tenantId: string, entry: ActivityLogEntry, audit: AuditMeta) {
    return this.prisma.activityLog.create({
      data: {
        id: uuid(),
        tenantId,
        userId: audit.userId,
        action: entry.action,
        description: entry.description ?? null,
        metadata: (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      },
    });
  }

  /** Query activity logs with filters and pagination. */
  async queryActivityLogs(
    tenantId: string,
    filters: ActivityLogFilters,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { page, limit, userId, action, dateFrom, dateTo } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.createdAt = dateFilter;
    }

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items: items as unknown as Record<string, unknown>[],
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }
}

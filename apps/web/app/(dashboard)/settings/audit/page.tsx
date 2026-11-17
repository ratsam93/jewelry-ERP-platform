'use client';

import { useState } from 'react';
import { PageHeader, EmptyState } from '@caratflow/ui';
import { FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { formatDateTime } from '@/components/format';
import {
  actionLabel,
  auditUserLabel,
  dayEndIso,
  dayStartIso,
  entityLabel,
  entityFilterOptions,
} from '@/features/audit/audit-format';
import { formatServerError } from '@/lib/manufacturing-forms';

type Row = Record<string, unknown>;

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'audit' | 'activity'>('audit');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = {
    userId: userId || undefined,
    dateFrom: dayStartIso(dateFrom),
    dateTo: dayEndIso(dateTo),
  };

  const audit = trpc.platform.audit.logs.useQuery(
    {
      page,
      limit: 25,
      sortOrder: 'desc',
      entityType: entityType || undefined,
      action: action || undefined,
      ...filters,
    },
    { enabled: activeTab === 'audit' },
  );
  const activity = trpc.platform.audit.activities.useQuery(
    { page, limit: 25, sortOrder: 'desc', action: action || undefined, ...filters },
    { enabled: activeTab === 'activity' },
  );
  const { data: entityTypes } = trpc.platform.audit.entityTypes.useQuery(undefined, {
    enabled: activeTab === 'audit',
  });
  const usersQuery = trpc.platform.users.list.useQuery({ page: 1, limit: 100, sortOrder: 'asc' } as never);
  const users = ((usersQuery.data as { items?: Row[] } | undefined)?.items ?? []) as Row[];
  const userNames = new Map<string, string>(
    users.map((u) => [
      u.id as string,
      auditUserLabel({ user: u as never }),
    ]),
  );

  const current = activeTab === 'audit' ? audit : activity;
  const d = current.data as
    | { items?: Row[]; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean }
    | undefined;
  const items = d?.items ?? [];
  const reset = () => setPage(1);

  const userCell = (l: Row) => {
    const label = auditUserLabel({
      user: l.user as never,
      userName: l.userName as string | undefined,
      userId: l.userId as string | undefined,
    });
    if (label === 'Unknown user' && typeof l.userId === 'string') {
      return userNames.get(l.userId) ?? label;
    }
    return label;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Audit Log' },
        ]}
      />

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => {
            setActiveTab('audit');
            reset();
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm ${activeTab === 'audit' ? 'bg-background shadow-sm' : ''}`}
        >
          Data Changes
        </button>
        <button
          onClick={() => {
            setActiveTab('activity');
            reset();
          }}
          className={`flex-1 rounded-md px-4 py-2 text-sm ${activeTab === 'activity' ? 'bg-background shadow-sm' : ''}`}
        >
          User Activity
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {activeTab === 'audit' && (
          <label className="text-xs text-muted-foreground">
            Entity
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                reset();
              }}
              className="mt-1 block h-9 rounded-md border px-2 text-sm text-foreground"
            >
              <option value="">All entities</option>
              {entityFilterOptions((entityTypes as string[] | undefined) ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-muted-foreground">
          User
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              reset();
            }}
            aria-label="Filter by user"
            className="mt-1 block h-9 rounded-md border px-2 text-sm text-foreground"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id as string} value={u.id as string}>
                {userNames.get(u.id as string)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              reset();
            }}
            className="mt-1 block h-9 rounded-md border px-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              reset();
            }}
            className="mt-1 block h-9 rounded-md border px-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Action
          <input
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              reset();
            }}
            placeholder="created, updated..."
            className="mt-1 block h-9 rounded-md border px-3 text-sm text-foreground"
          />
        </label>
        {(userId || dateFrom || dateTo || action || entityType) && (
          <button
            onClick={() => {
              setUserId('');
              setDateFrom('');
              setDateTo('');
              setAction('');
              setEntityType('');
              reset();
            }}
            className="h-9 rounded-md border px-3 text-sm hover:bg-muted"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_1fr_1.4fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>User</span>
          <span>Action</span>
          <span>{activeTab === 'audit' ? 'Entity' : 'Resource'}</span>
          <span>Status</span>
          <span>When</span>
        </div>
        {current.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : current.isError ? (
          <div role="alert" className="py-12 text-center text-sm text-red-700">
            Could not load the audit log: {formatServerError(current.error)}{' '}
            <button onClick={() => void current.refetch()} className="underline">
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No logs" />
        ) : (
          <div className="divide-y">
            {items.map((l) => (
              <div
                key={l.id as string}
                className="grid grid-cols-[1.4fr_1fr_1.4fr_1fr_1fr] gap-4 px-4 py-3 text-sm"
              >
                <span className="truncate" title={userCell(l)}>
                  {userCell(l)}
                </span>
                <span>{actionLabel((l.action as string) ?? null)}</span>
                <span>
                  {activeTab === 'audit'
                    ? entityLabel((l.entityType as string) ?? null)
                    : ((l.description as string) || (l.resource as string) || '-')}
                </span>
                <span>{(l.status as string) ?? 'Success'}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(l.createdAt ?? l.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {d && d.totalPages && d.totalPages > 0 && (
        <PaginationControls
          page={d.page ?? 1}
          totalPages={d.totalPages}
          hasPrevious={d.hasPrevious ?? false}
          hasNext={d.hasNext ?? false}
          onChange={setPage}
        />
      )}
    </div>
  );
}

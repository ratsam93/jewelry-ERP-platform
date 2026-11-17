'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Clock, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatServerError } from '@/lib/manufacturing-forms';
import { describeSchedule } from '@/lib/custom-report';

export default function ScheduledReportsPage() {
  const { data, isLoading, refetch } = trpc.reporting.listScheduledReports.useQuery();
  const toggle = trpc.reporting.toggleScheduledReport.useMutation({ onSuccess: () => refetch() });
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const del = trpc.reporting.deleteScheduledReport.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      void refetch();
    },
    onError: () => setConfirmId(null),
  });
  const items = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const confirmItem = items.find((s) => s.id === confirmId);
  const confirmName = (confirmItem?.savedReport as { name?: string } | undefined)?.name;
  const error = toggle.error ?? del.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Reports"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Scheduled' },
        ]}
        actions={
          <Link
            href="/reports/scheduled/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Schedule
          </Link>
        }
      />
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {formatServerError(error)}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <div className="grid min-w-[44rem] grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Report</span>
          <span>Frequency</span>
          <span>Time</span>
          <span>Format</span>
          <span>Status</span>
          <span className="w-24">Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-8 w-8" />}
            title="No scheduled reports"
            description="Schedule a saved report to be emailed daily, weekly or monthly."
            action={
              <Link href="/reports/scheduled/new" className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline">
                Create a schedule
              </Link>
            }
          />
        ) : (
          <div className="min-w-[44rem] divide-y">
            {items.map((s) => {
              const sr = s.savedReport as { name?: string } | undefined;
              const active = Boolean(s.isActive);
              return (
                <div key={s.id as string} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] items-center gap-4 px-4 py-2 text-sm">
                  <span className="font-medium">{sr?.name ?? '-'}</span>
                  <span>{describeSchedule(s as { frequency?: string; dayOfWeek?: number | null; dayOfMonth?: number | null })}</span>
                  <span>{(s.timeOfDay as string) ?? '-'}</span>
                  <span>{(s.format as string) ?? '-'}</span>
                  <span>
                    <StatusBadge label={active ? 'Active' : 'Paused'} variant={active ? 'success' : 'default'} />
                  </span>
                  <span className="flex w-24 gap-1">
                    <button
                      type="button"
                      aria-label={active ? `Pause ${sr?.name ?? 'schedule'}` : `Resume ${sr?.name ?? 'schedule'}`}
                      title={active ? 'Pause' : 'Resume'}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: s.id as string, isActive: !active })}
                      className="inline-flex h-10 w-10 items-center justify-center rounded hover:bg-accent"
                    >
                      {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete schedule for ${sr?.name ?? 'report'}`}
                      title="Delete"
                      onClick={() => setConfirmId(s.id as string)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmId && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="del-sched-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
            <h2 id="del-sched-title" className="text-lg font-semibold">Delete schedule?</h2>
            <p className="text-sm text-muted-foreground">
              The schedule for &quot;{confirmName ?? 'this report'}&quot; and its run history will be permanently deleted. The saved report itself is kept. Use Pause to stop it temporarily instead.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmId(null)} className="min-h-10 rounded-md border px-4 py-2 text-sm hover:bg-accent">
                Cancel
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => del.mutate({ id: confirmId })}
                className="min-h-10 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {del.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState } from '@caratflow/ui';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/components/format';
import { formatServerError } from '@/lib/manufacturing-forms';

export default function CustomReportsPage() {
  const { data, isLoading, refetch } = trpc.reporting.listSavedReports.useQuery({});
  const items = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const del = trpc.reporting.deleteSavedReport.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      void refetch();
    },
    onError: () => setConfirmId(null),
  });
  const confirmItem = items.find((r) => r.id === confirmId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Reports"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Custom' },
        ]}
        actions={
          <Link
            href="/reports/custom/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Report
          </Link>
        }
      />
      {del.error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not delete the report: {formatServerError(del.error)}
        </div>
      )}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Type</span>
          <span>Default</span>
          <span>Updated</span>
          <span className="w-10" />
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No saved reports"
            description="Build a report from any data source and save it to reuse or schedule it."
            action={
              <Link href="/reports/custom/new" className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline">
                Create your first report
              </Link>
            }
          />
        ) : (
          <div className="divide-y">
            {items.map((r) => (
              <div key={r.id as string} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 px-4 py-1 text-sm hover:bg-accent">
                <Link href={`/reports/custom/${r.id}`} className="contents">
                  <span className="py-2 font-medium">{(r.name as string) ?? '-'}</span>
                  <span>{(r.reportType as string) ?? '-'}</span>
                  <span>{r.isDefault ? 'Yes' : ''}</span>
                  <span className="text-muted-foreground">{formatDate(r.updatedAt)}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${(r.name as string) ?? 'report'}`}
                  onClick={() => setConfirmId(r.id as string)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmId && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg">
            <h2 id="del-title" className="text-lg font-semibold">Delete report?</h2>
            <p className="text-sm text-muted-foreground">
              &quot;{(confirmItem?.name as string) ?? 'This report'}&quot; will be permanently deleted. This cannot be undone. A report that still has a schedule must have its schedule deleted first.
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

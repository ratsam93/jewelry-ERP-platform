'use client';

import * as React from 'react';
import { PageHeader, StatusBadge, getStatusVariant, DataTable, type ColumnDef } from '@caratflow/ui';
import { Plus, BookOpen, Check, Ban } from 'lucide-react';
import { JournalEntryForm } from '@/features/finance/journal-entry-form';
import { trpc } from '@/lib/trpc';

// ─── Types ────────────────────────────────────────────────────────

interface JournalLineRow {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debitPaise: unknown;
  creditPaise: unknown;
}

interface JournalEntryRow {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  reference: string | null;
  status: string;
  voidReason: string | null;
  lines: JournalLineRow[];
}

interface FormLine {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function entryTotals(lines: JournalLineRow[]) {
  return lines.reduce(
    (acc, l) => ({
      debit: acc.debit + toNumber(l.debitPaise),
      credit: acc.credit + toNumber(l.creditPaise),
    }),
    { debit: 0, credit: 0 },
  );
}

/** Client-side guard before calling financial.journal.create. Returns an error message or null. */
function validateJournalLines(lines: FormLine[]): string | null {
  if (lines.length < 2) return 'A journal entry needs at least two lines.';
  for (const [i, line] of lines.entries()) {
    if (!line.accountId) return `Line ${i + 1}: select an account.`;
    const hasDebit = line.debitPaise > 0;
    const hasCredit = line.creditPaise > 0;
    if (hasDebit === hasCredit) return `Line ${i + 1}: enter an amount in either debit or credit.`;
    if (line.debitPaise < 0 || line.creditPaise < 0) return `Line ${i + 1}: amounts cannot be negative.`;
  }
  const debit = lines.reduce((s, l) => s + l.debitPaise, 0);
  const credit = lines.reduce((s, l) => s + l.creditPaise, 0);
  if (debit === 0) return 'Enter at least one amount.';
  if (debit !== credit) {
    return `Debits (${formatPaise(debit)}) must equal credits (${formatPaise(credit)}).`;
  }
  return null;
}

const STATUS_FILTER_LABEL: Record<string, string> = { DRAFT: 'Draft', POSTED: 'Posted', VOIDED: 'Voided' };

// ─── Page ─────────────────────────────────────────────────────────

export default function JournalEntriesPage() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<JournalEntryRow | null>(null);
  const [voidReason, setVoidReason] = React.useState('');

  const listQ = trpc.financial.journal.list.useQuery({
    page: 1,
    limit: 100,
    sortOrder: 'desc',
  });

  const accountsQ = trpc.financial.accounts.list.useQuery({});
  const accounts = (accountsQ.data ?? []).map((a) => ({
    id: a.id,
    accountCode: a.code,
    name: a.name,
  }));

  const invalidate = () => {
    void utils.financial.journal.list.invalidate();
  };

  const createMut = trpc.financial.journal.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError(err.message),
  });
  const postMut = trpc.financial.journal.post.useMutation({
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err.message),
  });
  const voidMut = trpc.financial.journal.void.useMutation({
    onSuccess: () => {
      setVoidTarget(null);
      setVoidReason('');
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err.message),
  });

  const handleSubmit = (data: {
    date: string;
    description: string;
    reference: string;
    lines: FormLine[];
  }) => {
    const problem = validateJournalLines(data.lines);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    createMut.mutate({
      date: new Date(data.date),
      description: data.description,
      reference: data.reference || undefined,
      lines: data.lines.map((l) => ({
        accountId: l.accountId,
        debitPaise: l.debitPaise,
        creditPaise: l.creditPaise,
        description: l.description || undefined,
        currencyCode: 'INR',
        exchangeRate: 10000,
      })),
    });
  };

  const rows: JournalEntryRow[] = ((listQ.data?.items ?? []) as unknown as JournalEntryRow[]).map((e) => ({
    ...e,
    reference: e.reference ?? null,
  }));

  const columns: ColumnDef<JournalEntryRow, unknown>[] = [
    {
      accessorKey: 'entryNumber',
      header: 'Entry #',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.entryNumber}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.date).toLocaleDateString('en-IN'),
    },
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.reference || '-'}</span>,
    },
    {
      id: 'debit',
      header: 'Debit',
      cell: ({ row }) => (
        <span className="font-mono">{formatPaise(entryTotals(row.original.lines).debit)}</span>
      ),
    },
    {
      id: 'credit',
      header: 'Credit',
      cell: ({ row }) => (
        <span className="font-mono">{formatPaise(entryTotals(row.original.lines).credit)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge
          label={STATUS_FILTER_LABEL[row.original.status] ?? row.original.status}
          variant={getStatusVariant(row.original.status)}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const entry = row.original;
        if (entry.status === 'DRAFT') {
          return (
            <button
              type="button"
              onClick={() => postMut.mutate({ id: entry.id })}
              disabled={postMut.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Post
            </button>
          );
        }
        if (entry.status === 'POSTED') {
          return (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setVoidReason('');
                setVoidTarget(entry);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
            >
              <Ban className="h-3.5 w-3.5" /> Void
            </button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        description="Double-entry journal for all financial transactions."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Journal Entries' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowForm((v) => !v);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Entry
          </button>
        }
      />

      {actionError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5" /> New Journal Entry
          </h3>
          {accountsQ.isError && (
            <p className="mb-3 text-sm text-red-600">Could not load accounts: {accountsQ.error.message}</p>
          )}
          {!accountsQ.isError && !accountsQ.isLoading && accounts.length === 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              No accounts in the chart of accounts yet. Create accounts before posting journal entries.
            </p>
          )}
          {formError && (
            <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {formError}
            </div>
          )}
          <JournalEntryForm accounts={accounts} onSubmit={handleSubmit} isLoading={createMut.isPending} />
        </div>
      )}

      {voidTarget && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
          <p className="text-sm font-medium text-red-800">
            Void {voidTarget.entryNumber}? Voided entries stay on record but no longer count in reports.
          </p>
          <input
            type="text"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason for voiding (required)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!voidReason.trim() || voidMut.isPending}
              onClick={() => voidMut.mutate({ id: voidTarget.id, reason: voidReason.trim() })}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {voidMut.isPending ? 'Voiding...' : 'Confirm void'}
            </button>
            <button
              type="button"
              onClick={() => setVoidTarget(null)}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {listQ.isError ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Could not load journal entries: {listQ.error.message}</span>
          <button type="button" onClick={() => void listQ.refetch()} className="text-xs font-medium underline">
            Retry
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchKey="description"
          searchPlaceholder="Search journal entries..."
          isLoading={listQ.isLoading}
        />
      )}
    </div>
  );
}

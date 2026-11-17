'use client';

import * as React from 'react';
import { jobStatusActionLabel, nextJobStatuses } from '@/lib/manufacturing-forms';

interface JobStatusActionsProps {
  status: string;
  isPending?: boolean;
  error?: string | null;
  onTransition: (status: string, notes?: string) => void;
}

/** Buttons for the status changes the API allows, each behind an inline confirmation. */
export function JobStatusActions({ status, isPending, error, onTransition }: JobStatusActionsProps) {
  const [target, setTarget] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState('');
  const next = nextJobStatuses(status);

  if (next.length === 0 && !error) {
    return <p className="text-sm text-muted-foreground">No further status changes are possible.</p>;
  }

  const confirm = () => {
    if (!target) return;
    onTransition(target, notes.trim() || undefined);
    setTarget(null);
    setNotes('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isPending}
            onClick={() => setTarget(s)}
            className={
              s === 'CANCELLED' || s === 'QC_FAILED'
                ? 'h-9 rounded-md border border-destructive px-4 text-sm text-destructive disabled:opacity-50'
                : 'h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50'
            }
          >
            {jobStatusActionLabel(s)}
          </button>
        ))}
      </div>
      {target && (
        <div role="alertdialog" aria-label="Confirm status change" className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p>
            Change status from <strong>{status}</strong> to <strong>{target}</strong>?
            {target === 'CANCELLED' && ' This cannot be undone.'}
          </p>
          <input
            aria-label="Note (optional)"
            placeholder="Note (optional)"
            className="w-full rounded-md border bg-background px-3 py-1.5"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" onClick={confirm} disabled={isPending} className="h-8 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50">Confirm</button>
            <button type="button" onClick={() => setTarget(null)} className="h-8 rounded-md border px-3">Keep current status</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

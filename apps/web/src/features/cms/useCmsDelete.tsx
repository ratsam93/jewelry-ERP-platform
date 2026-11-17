'use client';

import * as React from 'react';
import { ConfirmDialog } from '@/features/settings/ConfirmDialog';
import { formatServerError } from '@/lib/cms-forms';

/**
 * In-app delete confirmation for CMS list rows (replaces window.confirm).
 * `ask(row)` opens the dialog; confirming runs `remove(id)` then `onDone()`.
 */
export function useCmsDelete(opts: {
  noun: string;
  remove: (id: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [target, setTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ask = (id: unknown, name: unknown) => {
    setError(null);
    setTarget({ id: String(id), name: String(name ?? '') });
  };
  const cancel = () => {
    if (!busy) setTarget(null);
  };
  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await opts.remove(target.id);
      setTarget(null);
      opts.onDone();
    } catch (e) {
      setError(formatServerError(e));
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={target !== null}
      title={`Delete ${opts.noun}?`}
      description={
        <>
          <span className="font-medium text-foreground">{target?.name}</span> will be permanently deleted. This cannot be undone.
          {error && <span role="alert" className="mt-2 block text-red-600">{error}</span>}
        </>
      }
      confirmLabel="Delete"
      destructive
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={cancel}
    />
  );
  return { ask, dialog };
}

/** Edit / Delete buttons used in the last column of CMS list rows. */
export function CmsRowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex gap-3">
      <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} className="text-xs text-primary">Edit</button>
      <button type="button" onClick={onDelete} aria-label={`Delete ${name}`} className="text-xs text-red-600">Delete</button>
    </span>
  );
}

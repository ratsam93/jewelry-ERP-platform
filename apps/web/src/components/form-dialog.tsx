'use client';

import * as React from 'react';

interface FormDialogProps {
  title: string;
  description?: string;
  submitLabel?: string;
  submitting?: boolean;
  /** Server error to show at the top of the form. */
  error?: string | null;
  onSubmit: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

/** Lightweight modal form: Escape / Cancel close it, Enter submits. */
export function FormDialog({
  title, description, submitLabel = 'Save', submitting = false, error, onSubmit, onClose, children,
}: FormDialogProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="my-8 w-full max-w-xl rounded-lg border bg-background p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <form
          noValidate
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {error && (
            <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT = 'h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1 text-sm">
      <label className="block space-y-1">
        <span className="font-medium">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={INPUT} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={INPUT} />;
}

export function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

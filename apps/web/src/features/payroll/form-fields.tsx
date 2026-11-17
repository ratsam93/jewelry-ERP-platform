'use client';

import type { ReactNode } from 'react';

const INPUT = 'h-9 w-full rounded-md border px-3 text-sm';

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: 'numeric' | 'decimal' | 'text';
}

export function TextField({ label, value, onChange, error, hint, type = 'text', placeholder, disabled, inputMode }: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint}>
      <input
        type={type}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={INPUT}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function SelectField({ label, value, onChange, options, error, placeholder, disabled }: SelectFieldProps) {
  return (
    <Field label={label} error={error}>
      <select
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={INPUT}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Submit button that always explains itself: pending text, or why it is disabled. */
export function SubmitBar({
  pending,
  idleLabel,
  pendingLabel = 'Saving...',
  blockedReason,
  summary,
  children,
}: {
  pending: boolean;
  idleLabel: string;
  pendingLabel?: string;
  blockedReason?: string | null;
  summary?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || Boolean(blockedReason)}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? pendingLabel : idleLabel}
        </button>
        {children}
      </div>
      {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      {summary && <p role="status" className="text-xs text-red-600">{summary}</p>}
    </div>
  );
}

'use client';

import type { ChangeEvent, ReactNode } from 'react';

interface Option {
  value: string;
  label: string;
}

export interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  options?: Option[];
  multiline?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  className?: string;
}

/** Labelled input/select/textarea with an inline validation message (CRM create forms). */
export function FormField({
  label, value, onChange, error, type = 'text', options, multiline, placeholder, hint, className,
}: FormFieldProps) {
  const common = {
    'aria-label': label,
    'aria-invalid': error ? true : undefined,
    value,
    className: 'w-full rounded-md border bg-transparent px-3 text-sm ' + (multiline ? 'py-2' : 'h-9'),
  };
  const handle = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange(e.target.value);
  return (
    <label className={`space-y-1 text-sm ${className ?? ''}`}>
      <span className="font-medium">{label}</span>
      {options ? (
        <select {...common} onChange={handle}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : multiline ? (
        <textarea {...common} rows={3} placeholder={placeholder} onChange={handle} />
      ) : (
        <input {...common} type={type} placeholder={placeholder} onChange={handle} />
      )}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

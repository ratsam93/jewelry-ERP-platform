'use client';

import * as React from 'react';
import {
  SKILL_LEVELS,
  buildKarigarInput,
  emptyKarigarForm,
  type FormErrors,
  type KarigarFormValues,
} from '@/lib/manufacturing-forms';

interface KarigarFormProps {
  locations: Array<{ id: string; label: string }>;
  initial?: KarigarFormValues;
  submitLabel?: string;
  isSubmitting?: boolean;
  serverError?: string | null;
  onSubmit: (input: Record<string, unknown>) => void;
}

const field = 'w-full rounded-md border bg-background px-3 py-2 text-sm';

export function KarigarForm({ locations, initial, submitLabel = 'Create karigar', isSubmitting, serverError, onSubmit }: KarigarFormProps) {
  const [form, setForm] = React.useState<KarigarFormValues>(initial ?? emptyKarigarForm());
  const [errors, setErrors] = React.useState<FormErrors>({});
  const set = <K extends keyof KarigarFormValues>(key: K, value: KarigarFormValues[K]) => setForm((f) => ({ ...f, [key]: value }));

  const text = (key: keyof KarigarFormValues, label: string, opts: { required?: boolean; type?: string } = {}) => (
    <div className="space-y-1">
      <label htmlFor={`k-${key}`} className="text-sm font-medium">{label}{opts.required ? ' *' : ''}</label>
      <input id={`k-${key}`} type={opts.type ?? 'text'} className={field} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} />
      {errors[key] && <p role="alert" className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildKarigarInput(form);
    setErrors(result.errors);
    if (result.input) onSubmit(result.input);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('employeeCode', 'Employee code', { required: true })}
        <div className="space-y-1">
          <label htmlFor="k-locationId" className="text-sm font-medium">Location *</label>
          <select id="k-locationId" className={field} value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">Select a location...</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {errors.locationId && <p role="alert" className="text-xs text-destructive">{errors.locationId}</p>}
        </div>
        {text('firstName', 'First name', { required: true })}
        {text('lastName', 'Last name', { required: true })}
        {text('phone', 'Phone')}
        {text('email', 'Email')}
        {text('specialization', 'Specialization')}
        <div className="space-y-1">
          <label htmlFor="k-skillLevel" className="text-sm font-medium">Skill level</label>
          <select id="k-skillLevel" className={field} value={form.skillLevel} onChange={(e) => set('skillLevel', e.target.value)}>
            {SKILL_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {text('dailyWage', 'Daily wage (Rs)')}
        {text('joiningDate', 'Joining date', { type: 'date' })}
      </div>
      {text('address', 'Address')}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active
      </label>
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
      <button type="submit" disabled={isSubmitting} className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {isSubmitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}

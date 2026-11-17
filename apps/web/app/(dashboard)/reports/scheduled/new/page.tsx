'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { Save } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatServerError } from '@/lib/manufacturing-forms';
import {
  WEEKDAYS,
  parseRecipients,
  toScheduledReportInput,
  validateSchedule,
  type Frequency,
  type ReportFormat,
  type ScheduleForm,
} from '@/lib/custom-report';

export default function NewScheduledReportPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const reportsQ = trpc.reporting.listSavedReports.useQuery({});
  const reports = (Array.isArray(reportsQ.data) ? reportsQ.data : []) as Array<{ id: string; name: string }>;

  const [form, setForm] = React.useState<ScheduleForm>({
    savedReportId: '',
    frequency: 'DAILY',
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: '08:00',
    format: 'PDF',
    recipients: '',
  });
  const [errors, setErrors] = React.useState<string[]>([]);
  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const create = trpc.reporting.createScheduledReport.useMutation({
    onSuccess: () => {
      void utils.reporting.listScheduledReports.invalidate();
      router.push('/reports/scheduled');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problems = validateSchedule(form);
    setErrors(problems);
    if (problems.length > 0) return;
    create.mutate(toScheduledReportInput(form) as never);
  };

  const { invalid } = parseRecipients(form.recipients);
  const field = 'w-full rounded-md border bg-background px-3 py-2 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Scheduled Report"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Scheduled', href: '/reports/scheduled' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
        <div className="space-y-1">
          <label htmlFor="sr-report" className="text-sm font-medium">Saved report</label>
          <select id="sr-report" value={form.savedReportId} onChange={(e) => set('savedReportId', e.target.value)} className={field}>
            <option value="">Select a report...</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {!reportsQ.isLoading && reports.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No saved reports yet. <Link href="/reports/custom/new" className="underline">Build one first</Link>.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="sr-freq" className="text-sm font-medium">Frequency</label>
            <select id="sr-freq" value={form.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)} className={field}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="sr-time" className="text-sm font-medium">Time of day</label>
            <input id="sr-time" type="time" value={form.timeOfDay} onChange={(e) => set('timeOfDay', e.target.value)} className={field} />
          </div>
          {form.frequency === 'WEEKLY' && (
            <div className="space-y-1">
              <label htmlFor="sr-dow" className="text-sm font-medium">Day of week</label>
              <select id="sr-dow" value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', Number(e.target.value))} className={field}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}
          {form.frequency === 'MONTHLY' && (
            <div className="space-y-1">
              <label htmlFor="sr-dom" className="text-sm font-medium">Day of month</label>
              <input
                id="sr-dom"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(e) => set('dayOfMonth', Number(e.target.value))}
                className={field}
              />
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="sr-format" className="text-sm font-medium">Format</label>
            <select id="sr-format" value={form.format} onChange={(e) => set('format', e.target.value as ReportFormat)} className={field}>
              <option value="PDF">PDF</option>
              <option value="XLSX">Excel (XLSX)</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="sr-recipients" className="text-sm font-medium">Recipients</label>
          <textarea
            id="sr-recipients"
            rows={3}
            value={form.recipients}
            onChange={(e) => set('recipients', e.target.value)}
            placeholder="owner@example.com, accounts@example.com"
            aria-invalid={invalid.length > 0 || undefined}
            className={field}
          />
          <p className="text-xs text-muted-foreground">Separate addresses with commas or new lines.</p>
          {invalid.length > 0 && (
            <p className="text-xs text-destructive">Invalid email address: {invalid.join(', ')}</p>
          )}
        </div>

        {errors.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 rounded-md border border-red-200 bg-red-50 p-3 pl-7 text-sm text-red-800">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {create.error && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {formatServerError(create.error)}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {create.isPending ? 'Saving...' : 'Save schedule'}
          </button>
          <Link href="/reports/scheduled" className="inline-flex min-h-10 items-center rounded-md border px-4 py-2 text-sm hover:bg-accent">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { PageHeader, EmptyState } from '@caratflow/ui';
import { Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatDateOnly } from '@/lib/date-only';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  buildAttendanceInput,
  emptyAttendance,
  errorSummary,
  monthRange,
  readableError,
  type AttendanceFormValues,
  type FieldErrors,
} from '@/lib/finance-form';
import { FormError, SelectField, SubmitBar, TextField } from '@/features/payroll/form-fields';

const LABELS: Record<string, string> = {
  employeeId: 'Employee',
  date: 'Date',
  status: 'Status',
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  checkInTime: 'Check-in',
  checkOutTime: 'Check-out',
  hoursWorked: 'Hours worked',
  overtimeHours: 'Overtime',
};

export default function AttendancePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const range = monthRange(month);

  const { data: rows, isLoading, refetch } = trpc.payroll.attendance.list.useQuery(
    { startDate: range?.start, endDate: range?.end } as never,
    { enabled: Boolean(range) },
  );
  const items = ((rows as Array<Record<string, unknown>> | undefined) ?? []);

  const { data: empData, isLoading: empLoading } = trpc.payroll.employees.list.useQuery({ page: 1, limit: 100, status: 'ACTIVE' } as never);
  const employees = ((empData as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []);
  const nameOf = new Map(
    employees.map((e) => [
      e.id as string,
      `${(e.firstName as string) ?? ''} ${(e.lastName as string) ?? ''}`.trim() || ((e.employeeCode as string) ?? ''),
    ]),
  );

  const [form, setForm] = useState<AttendanceFormValues>(() => emptyAttendance());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<string | null>(null);
  const markMut = trpc.payroll.attendance.markDay.useMutation();
  const set = (k: keyof AttendanceFormValues) => (v: string) => {
    setSaved(null);
    setForm((p) => ({ ...p, [k]: v }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildAttendanceInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      await markMut.mutateAsync(input as never);
      setSaved(`Attendance recorded for ${nameOf.get(form.employeeId) ?? 'employee'} on ${form.date}.`);
      await refetch();
    } catch {
      // shown via markMut.error
    }
  };

  const noEmployees = !empLoading && employees.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Monthly employee attendance."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Attendance' },
        ]}
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border p-5">
        <h3 className="text-sm font-semibold">Record attendance</h3>
        <FormError message={markMut.error ? readableError(markMut.error, 'Could not record attendance.') : null} />
        {saved && <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{saved}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Employee *"
            value={form.employeeId}
            onChange={set('employeeId')}
            placeholder={empLoading ? 'Loading employees...' : 'Select employee'}
            error={errors.employeeId}
            disabled={noEmployees}
            options={employees.map((e) => ({
              value: e.id as string,
              label: `${(e.employeeCode as string) ?? ''} - ${nameOf.get(e.id as string) ?? ''}`,
            }))}
          />
          <TextField label="Date *" type="date" value={form.date} onChange={set('date')} error={errors.date} />
          <SelectField
            label="Status *"
            value={form.status}
            onChange={set('status')}
            error={errors.status}
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] ?? s }))}
          />
          <TextField label="Check-in" type="time" value={form.checkIn} onChange={set('checkIn')} error={errors.checkIn} />
          <TextField label="Check-out" type="time" value={form.checkOut} onChange={set('checkOut')} error={errors.checkOut} />
          <TextField label="Hours worked" value={form.hoursWorked} onChange={set('hoursWorked')} error={errors.hoursWorked} inputMode="decimal" hint="Left blank: calculated from check-in/out" />
          <TextField label="Overtime hours" value={form.overtimeHours} onChange={set('overtimeHours')} error={errors.overtimeHours} inputMode="decimal" />
        </div>
        <SubmitBar
          pending={markMut.isPending}
          idleLabel="Record attendance"
          blockedReason={noEmployees ? 'No active employees yet. Add an employee first to record attendance.' : null}
          summary={errorSummary(errors, LABELS)}
        >
          {noEmployees && (
            <Link href="/finance/payroll/employees/new" className="text-sm text-primary hover:underline">Add employee</Link>
          )}
        </SubmitBar>
      </form>

      <div className="flex items-center gap-3">
        <label className="text-sm" htmlFor="att-month">Month:</label>
        <input
          id="att-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_1.4fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Date</span>
          <span>Employee</span>
          <span>Status</span>
          <span>Hours</span>
          <span>Overtime</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Calendar className="h-8 w-8" />} title="No attendance records" />
        ) : (
          <div className="divide-y">
            {items.map((r) => (
              <div key={r.id as string} className="grid grid-cols-[1fr_1.4fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                <span>{formatDateOnly(r.date)}</span>
                <span>{nameOf.get(r.employeeId as string) ?? (r.employeeId as string).slice(0, 8)}</span>
                <span>{ATTENDANCE_STATUS_LABELS[r.status as string] ?? (r.status as string)}</span>
                <span>{r.hoursWorked as number}</span>
                <span>{r.overtimeHours as number}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { EMPTY_EMPLOYEE, buildEmployeeInput, readableError, todayInput } from '@/lib/finance-form';
import { EmployeeForm } from '@/features/payroll/employee-form';
import { FormError } from '@/features/payroll/form-fields';

export default function NewEmployeePage() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const createMut = trpc.payroll.employees.create.useMutation();
  const bulkMut = trpc.payroll.employees.bulkImport.useMutation();

  const handleCreate = async (input: Record<string, unknown>) => {
    try {
      await createMut.mutateAsync(input as never);
      router.push('/finance/payroll/employees');
    } catch {
      // shown via createMut.error
    }
  };

  const handleBulk = async () => {
    try {
      const r = (await bulkMut.mutateAsync({ csv } as never)) as { created: number; errors: string[] };
      setResult(`Created ${r.created}, errors: ${r.errors.length}${r.errors.length ? ` (${r.errors.slice(0, 3).join('; ')})` : ''}`);
    } catch {
      setResult(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Employee"
        description="Add a single employee or bulk import via CSV."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Employees', href: '/finance/payroll/employees' },
          { label: 'New' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <EmployeeForm
          mode="create"
          initial={{ ...EMPTY_EMPLOYEE, joinedAt: todayInput() }}
          build={buildEmployeeInput}
          onSubmit={handleCreate}
          pending={createMut.isPending}
          serverError={createMut.error ? readableError(createMut.error, 'Could not create the employee.') : null}
          submitLabel="Create Employee"
        />

        <div className="space-y-3 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Bulk Import (CSV)</h3>
          <p className="text-xs text-muted-foreground">
            Header: employeeCode,firstName,lastName,joinedAt,designation,department,basicSalaryPaise,hraPaise (CSV amounts are in paise)
          </p>
          <textarea className="h-48 w-full rounded border px-3 py-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
          <FormError message={bulkMut.error ? readableError(bulkMut.error, 'Import failed.') : null} />
          <button
            onClick={handleBulk}
            disabled={bulkMut.isPending || !csv.trim()}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkMut.isPending ? 'Importing...' : 'Import CSV'}
          </button>
          {!csv.trim() && <p className="text-xs text-muted-foreground">Paste CSV rows above to enable import.</p>}
          {result && <div className="text-sm text-muted-foreground">{result}</div>}
        </div>
      </div>
    </div>
  );
}

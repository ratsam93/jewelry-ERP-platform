'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { buildEmployeeUpdate, employeeToFormValues, readableError } from '@/lib/finance-form';
import { EmployeeForm } from '@/features/payroll/employee-form';

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const utils = trpc.useUtils();
  // Raw PAN / Aadhaar / bank values are fetched only here (the detail page gets masked ones).
  // Always refetch on mount so the form never prefills from a stale cache entry (HK-PAY-09).
  const { data, isLoading, error, refetch } = trpc.payroll.employees.getForEdit.useQuery(
    { id },
    { enabled: Boolean(id), refetchOnMount: 'always', staleTime: 0, gcTime: 0 },
  );
  const updateMut = trpc.payroll.employees.update.useMutation();

  const state = renderDetailState({
    isLoading, error, data, entity: 'Employee', backHref: '/finance/payroll/employees', onRetry: () => refetch(),
  });
  if (state) return state;
  const e = data as Record<string, unknown>;

  const handleSave = async (input: Record<string, unknown>) => {
    try {
      await updateMut.mutateAsync({ id, data: input } as never);
      await Promise.all([
        utils.payroll.employees.get.invalidate({ id }),
        utils.payroll.employees.getForEdit.invalidate({ id }),
        utils.payroll.employees.list.invalidate(),
      ]);
      router.push(`/finance/payroll/employees/${id}`);
    } catch {
      // shown via updateMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${(e.firstName as string) ?? ''} ${(e.lastName as string) ?? ''}`.trim()}
        description="Salary amounts are entered in rupees."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Employees', href: '/finance/payroll/employees' },
          { label: (e.employeeCode as string) ?? 'Employee', href: `/finance/payroll/employees/${id}` },
          { label: 'Edit' },
        ]}
      />
      <div className="max-w-3xl">
        <EmployeeForm
          mode="edit"
          initial={employeeToFormValues(e)}
          build={buildEmployeeUpdate}
          onSubmit={handleSave}
          pending={updateMut.isPending}
          serverError={updateMut.error ? readableError(updateMut.error, 'Could not save the employee.') : null}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}

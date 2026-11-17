'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise } from '@/components/format';

export default function PayrollPeriodDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: period, isLoading, error, refetch } = trpc.payroll.payrollPeriods.get.useQuery(
    { id: params.id! },
    { enabled: !!params.id },
  );
  const { data: slips } = trpc.payroll.payslips.list.useQuery(
    { payrollPeriodId: params.id! },
    { enabled: !!params.id },
  );
  const p = period as Record<string, unknown>;
  const items = ((slips as Array<Record<string, unknown>> | undefined) ?? []);

  const state = renderDetailState({
    isLoading, error, data: period, entity: 'Payroll period', backHref: '/finance/payroll/periods', onRetry: () => refetch(),
  });
  if (state) return state;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Period ${p.periodLabel as string}`}
        description="Payslips for this payroll period."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Periods', href: '/finance/payroll/periods' },
          { label: p.periodLabel as string },
        ]}
      />

      <div className="rounded-lg border p-4 text-sm">
        Status: <StatusBadge label={(p.status as string) ?? '-'} variant={getStatusVariant(p.status as string)} dot={false} />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Employee</span>
          <span>Gross</span>
          <span>Deductions</span>
          <span>Net</span>
          <span>Status</span>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No payslips yet" />
        ) : (
          <div className="divide-y">
            {items.map((s) => {
              const emp = s.employee as Record<string, unknown> | undefined;
              return (
                <div key={s.id as string} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <Link href={`/finance/payroll/payslips/${s.id as string}`} className="font-medium text-primary hover:underline">
                    {`${(emp?.firstName as string) ?? ''} ${(emp?.lastName as string) ?? ''}`.trim() || 'Payslip'}
                  </Link>
                  <span className="font-semibold">{formatPaise(s.grossSalary)}</span>
                  <span>{formatPaise(s.totalDeductions)}</span>
                  <span className="font-semibold">{formatPaise(s.netSalary)}</span>
                  <StatusBadge label={(s.status as string) ?? '-'} variant={getStatusVariant(s.status as string)} dot={false} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

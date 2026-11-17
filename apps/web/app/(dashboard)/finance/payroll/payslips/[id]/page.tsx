'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise } from '@/components/format';
import { payslipView, readableError } from '@/lib/finance-form';
import { FormError } from '@/features/payroll/form-fields';

export default function PayslipDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.payroll.payslips.get.useQuery({ id }, { enabled: Boolean(id) });
  const utils = trpc.useUtils();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const state = renderDetailState({
    isLoading, error, data, entity: 'Payslip', backHref: '/finance/payroll/periods', onRetry: () => refetch(),
  });
  if (state) return state;
  const v = payslipView(data as Record<string, unknown>);

  const downloadPdf = async () => {
    setPdfError(null);
    setDownloading(true);
    try {
      const r = (await utils.payroll.payslips.downloadPdfBinary.fetch({ payslipId: id } as never)) as {
        filename: string;
        mimeType: string;
        base64: string;
      };
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(readableError(e, 'Could not generate the payslip PDF.'));
    } finally {
      setDownloading(false);
    }
  };

  const row = (label: string, value: unknown) => (
    <div key={label} className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{formatPaise(value)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payslip - ${v.employeeName}`}
        description={`${v.employeeCode} / ${v.periodLabel}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Periods', href: '/finance/payroll/periods' },
          ...(v.periodId ? [{ label: v.periodLabel, href: `/finance/payroll/periods/${v.periodId}` }] : []),
          { label: 'Payslip' },
        ]}
        actions={
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {downloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        }
      />
      <FormError message={pdfError} />

      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4 text-sm">
        <span>Status: <StatusBadge label={v.status} variant={getStatusVariant(v.status)} dot={false} /></span>
        <span>Work days: {String(v.workDays ?? '-')}</span>
        <span>Present: {String(v.presentDays ?? '-')}</span>
        <span>Leave: {String(v.leaveDays ?? '-')}</span>
        <span>Overtime hours: {String(v.overtimeHours ?? '-')}</span>
        {v.employeeId && (
          <Link href={`/finance/payroll/employees/${v.employeeId}`} className="text-primary hover:underline">View employee</Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Earnings</h3>
          {v.earnings.map(([l, val]) => row(l, val))}
          <div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Gross</span><span>{formatPaise(v.gross)}</span></div>
        </div>
        <div className="space-y-2 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Deductions</h3>
          {v.deductions.map(([l, val]) => row(l, val))}
          <div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Total deductions</span><span>{formatPaise(v.totalDeductions)}</span></div>
        </div>
      </div>
      <div className="rounded-lg border bg-muted/30 p-5 text-lg font-semibold">Net pay: {formatPaise(v.net)}</div>
    </div>
  );
}

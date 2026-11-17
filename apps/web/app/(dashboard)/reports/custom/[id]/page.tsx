'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatServerError } from '@/lib/manufacturing-forms';
import { requestFromSavedReport } from '@/lib/custom-report';
import { CustomReportResultTable, type CustomReportRunResult } from '@/features/reporting/CustomReportResultTable';
import { ReportExportMenu } from '@/features/reporting/ReportExportMenu';
import { money, type ExportCell, type ExportTable } from '@/lib/report-export';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CustomReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  // Anything that is not a UUID (a stray route like /reports/custom/foo) is "not found",
  // not a server validation error.
  const validId = GUID_RE.test(id);
  const { data, isLoading, error } = trpc.reporting.getSavedReport.useQuery({ id }, { enabled: validId });

  const r = (data ?? null) as Record<string, unknown> | null;
  const request = React.useMemo(() => (r ? requestFromSavedReport(r) : null), [r]);
  const runQ = trpc.reporting.executeCustomReport.useQuery((request ?? undefined) as never, { enabled: Boolean(request) });
  const result = (runQ.data ?? null) as unknown as CustomReportRunResult | null;

  const state = renderDetailState({
    isLoading: validId ? isLoading : false,
    error: validId ? error : null,
    data: validId ? data : null,
    entity: 'Custom report',
    backHref: '/reports/custom',
  });
  if (state) return state;
  if (!r) return null;

  const getTable = (): ExportTable | null =>
    result
      ? {
          headers: result.headers.map((h) => h.label.replace('(Paise)', '(INR)')),
          rows: result.rows.map((row) => result.headers.map((h) => formatCell(row[h.key], h))),
        }
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={(r.name as string) ?? 'Custom Report'}
        description={(r.description as string) || undefined}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Custom', href: '/reports/custom' },
          { label: (r.name as string) ?? '' },
        ]}
        actions={<ReportExportMenu fileBase={(r.name as string) ?? 'custom-report'} getTable={getTable} disabled={!result} />}
      />
      {!request ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          This saved report has no query definition (data source and columns), so there is nothing to run.
          Create reports with the builder to get a runnable definition.
        </div>
      ) : runQ.isLoading ? (
        <div role="status" className="py-12 text-center text-sm text-muted-foreground">Running report...</div>
      ) : runQ.isError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not run this report: {formatServerError(runQ.error)}
        </div>
      ) : result ? (
        <CustomReportResultTable result={result} />
      ) : null}
    </div>
  );
}

/** Raw values for export: paise columns become plain rupee decimals, dates stay ISO text. */
function formatCell(value: unknown, h: { key: string; type: string }): ExportCell {
  if (value === null || value === undefined) return '';
  if (h.type === 'number') {
    return /Paise$/.test(h.key) ? money(value) : Number.isFinite(Number(value)) ? Number(value) : String(value);
  }
  if (h.type === 'boolean') return value === true || value === 1 || value === '1';
  return String(value);
}

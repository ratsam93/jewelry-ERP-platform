'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import type { DetailStateErrorLike } from '@/components/detail-states';
import { formatPaise, formatDate, formatMg } from '@/components/format';
import { girviLoanView } from '@/lib/girvi-form';

export default function GirviDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  // Cast through `unknown` to avoid TS2589 (excessively deep instantiation from tRPC + Zod schema recursion).
  const query = (trpc.india.girvi.getById as unknown as {
    useQuery: (
      input: { id: string },
      opts: { enabled: boolean },
    ) => { data: unknown; isLoading: boolean; error: DetailStateErrorLike | null; refetch: () => unknown };
  }).useQuery({ id }, { enabled: Boolean(id) });
  const { data, isLoading, error, refetch } = query;

  const state = renderDetailState({
    isLoading, error, data, entity: 'Girvi loan', backHref: '/finance/girvi', onRetry: () => refetch(),
  });
  if (state) return state;
  const g = data as Record<string, unknown>;
  const v = girviLoanView(g);
  const customer = g.customer as { firstName?: string; lastName?: string } | undefined;
  const location = g.location as { name?: string } | undefined;
  const dash = (x: unknown) => (x === null || x === undefined || x === '' ? '-' : String(x));

  return (
    <div className="space-y-6">
      <PageHeader
        title={(g.loanNumber as string) ?? 'Girvi'}
        description={customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : ''}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Girvi', href: '/finance/girvi' },
          { label: (g.loanNumber as string) ?? '' },
        ]}
        actions={<StatusBadge label={(g.status as string) ?? '-'} variant="default" />}
      />
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span>{formatPaise(v.principalPaise)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Interest Rate</span><span>{String(v.interestRatePercent ?? '-')}%</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Outstanding</span><span className="font-semibold">{formatPaise(v.outstandingPaise)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Issued</span><span>{formatDate(v.issuedDate)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{formatDate(g.dueDate)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{v.durationMonths === null ? '-' : `${v.durationMonths} months`}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{dash(location?.name)}</span></div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Collateral</h2>
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span className="max-w-[60%] text-right">{dash(v.collateralDescription)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Metal</span><span>{dash(v.metalType)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gross weight</span><span>{formatMg(v.grossWeightMg)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Net weight</span><span>{formatMg(v.netWeightMg)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Purity</span><span>{v.purityFineness ? v.purityFineness : '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Rate per 10g (24K, derived)</span><span>{formatPaise(v.ratePer10gPaise)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Appraised value</span><span>{formatPaise(v.appraisedValuePaise)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Loan % of appraised</span><span>{v.loanPercent === null ? '-' : `${v.loanPercent}%`}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Interest type</span><span>{dash(v.interestType)}{v.interestType === 'COMPOUND' && v.compoundingPeriod ? ` (${v.compoundingPeriod})` : ''}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">KYC</span><span>{`Aadhaar ${v.aadhaarVerified ? 'verified' : 'not verified'}, PAN ${v.panVerified ? 'verified' : 'not verified'}`}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="max-w-[60%] text-right">{dash(v.notes)}</span></div>
        </div>
      </div>
    </div>
  );
}

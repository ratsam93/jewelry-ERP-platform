'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise } from '@/components/format';
import { formatDateOnly } from '@/lib/date-only';
import { schemeRow } from '@/lib/finance-form';
import { EnrollForm } from './enroll-form';

export function SchemeDetail({ kind }: { kind: 'kitty' | 'gold' }) {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const base = kind === 'kitty' ? '/finance/schemes/kitty' : '/finance/schemes/gold-savings';
  const title = kind === 'kitty' ? 'Kitty' : 'Gold Savings';
  const schemes = trpc.india.schemes;
  const kittyQuery = schemes.kitty.getById.useQuery({ id }, { enabled: Boolean(id) && kind === 'kitty' });
  const goldQuery = schemes.goldSavings.getById.useQuery({ id }, { enabled: Boolean(id) && kind === 'gold' });
  const query = kind === 'kitty' ? kittyQuery : goldQuery;
  const kittyEnroll = schemes.kitty.enrollMember.useMutation();
  const goldEnroll = schemes.goldSavings.enrollMember.useMutation();
  const enrollMut = kind === 'kitty' ? kittyEnroll : goldEnroll;

  const state = renderDetailState({
    isLoading: query.isLoading,
    error: query.error,
    data: query.data,
    entity: `${title} scheme`,
    backHref: base,
    onRetry: () => query.refetch(),
  });
  if (state) return state;
  const s = query.data as unknown as Record<string, unknown>;
  const row = schemeRow(s);
  const members = (Array.isArray(s.members) ? s.members : []) as Array<Record<string, unknown>>;
  const open = row.status === 'OPEN' || row.status === 'ACTIVE';

  const facts: Array<[string, string]> = [
    ['Monthly installment', formatPaise(s.monthlyAmountPaise)],
    ['Duration', row.durationMonths === null ? '-' : `${row.durationMonths} months`],
    ['Start date', formatDateOnly(s.startDate)],
    ...(kind === 'kitty'
      ? ([
          ['Total value', formatPaise(s.totalValuePaise)],
          ['Members', `${members.length} of ${String(s.maxMembers ?? '-')}`],
        ] as Array<[string, string]>)
      : ([
          ['Bonus months', String(s.bonusMonths ?? 0)],
          ['Maturity bonus', `${(Number(s.maturityBonusPercent ?? 0) / 100).toFixed(2)}%`],
          ['Members', String(members.length)],
        ] as Array<[string, string]>)),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.name === '-' ? `${title} Scheme` : row.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Schemes', href: '/finance/schemes' },
          { label: title, href: base },
          { label: row.name },
        ]}
      />

      <div className="grid gap-3 rounded-lg border p-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="text-sm">
          <span className="block text-xs text-muted-foreground">Status</span>
          <StatusBadge label={row.status} variant={getStatusVariant(row.status)} dot={false} />
        </div>
        {facts.map(([k, v]) => (
          <div key={k} className="text-sm">
            <span className="block text-xs text-muted-foreground">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
        {typeof s.terms === 'string' && s.terms && (
          <div className="text-sm sm:col-span-2 lg:col-span-3">
            <span className="block text-xs text-muted-foreground">Terms</span>
            <span className="whitespace-pre-wrap">{s.terms}</span>
          </div>
        )}
      </div>

      {open ? (
        <EnrollForm
          idKey={kind === 'kitty' ? 'kittySchemeId' : 'goldSavingsSchemeId'}
          schemeId={id}
          enroll={(input) => enrollMut.mutateAsync(input as never)}
          pending={enrollMut.isPending}
          error={enrollMut.error}
          onDone={() => query.refetch()}
        />
      ) : (
        <p className="text-sm text-muted-foreground">This scheme is {row.status.toLowerCase()} and is not accepting new members.</p>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Member #</span>
          <span>Customer</span>
          <span>Joined</span>
          <span>Status</span>
        </div>
        {members.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No members enrolled yet" />
        ) : (
          <div className="divide-y">
            {members.map((m) => {
              const c = (m.customer as Record<string, unknown> | undefined) ?? {};
              return (
                <div key={m.id as string} className="grid grid-cols-[1fr_2fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span className="font-mono">{(m.memberNumber as string) ?? '-'}</span>
                  <span>{`${(c.firstName as string) ?? ''} ${(c.lastName as string) ?? ''}`.trim() || '-'}</span>
                  <span>{formatDateOnly(m.joinedDate)}</span>
                  <StatusBadge label={(m.status as string) ?? '-'} variant={getStatusVariant(m.status as string)} dot={false} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

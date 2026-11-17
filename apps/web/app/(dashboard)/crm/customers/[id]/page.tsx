'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatCard } from '@caratflow/ui';
import { User, IndianRupee, Gift, Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { renderDetailState } from '@/components/detail-states';
import { customer360View, isUuid, orDash } from '@/lib/crm-form';

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  // A non-UUID segment (e.g. a mistyped URL) is a not-found, not a failed request.
  const validId = isUuid(id);
  const { data, isLoading, error, refetch } = trpc.crm.customer360.useQuery(
    { customerId: id },
    { enabled: validId },
  );

  const state = renderDetailState({
    isLoading: validId && isLoading,
    error: validId ? error : null,
    data: validId ? data : null,
    entity: 'Customer',
    backHref: '/crm/customers',
    onRetry: () => void refetch(),
  });
  if (state) return state;
  const v = customer360View(data as unknown as Record<string, unknown>);
  const p = v.profile;

  return (
    <div className="space-y-6">
      <PageHeader
        title={v.name || 'Customer'}
        description={orDash(p.phone ?? p.email) === '-' ? '' : String(p.phone ?? p.email)}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Customers', href: '/crm/customers' },
          { label: v.name || 'Customer' },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard title="Total Spent" value={formatPaise(v.totalSpentPaise)} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard title="Orders" value={String(v.totalOrders)} icon={<User className="h-4 w-4" />} />
        <StatCard title="Loyalty Points" value={String(v.loyaltyPoints)} icon={<Gift className="h-4 w-4" />} />
        <StatCard title="Avg Ticket" value={formatPaise(v.averageTicketPaise)} icon={<Calendar className="h-4 w-4" />} />
      </div>

      <div className="space-y-2 rounded-lg border p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{orDash(p.email)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{orDash(p.phone)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">City</span><span>{orDash(p.city)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">State</span><span>{orDash(p.state)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{orDash(p.customerType)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Loyalty tier</span><span>{orDash(v.loyaltyTier)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">PAN</span><span className="font-mono">{orDash(p.panNumber)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Aadhaar</span><span className="font-mono">{orDash(p.aadhaarNumber)}</span></div>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, StatCard } from '@caratflow/ui';
import { BarChart, Package, Factory, Users, TrendingUp, FileText, Clock, Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { AnalyticsDashboardResponse } from '@caratflow/shared-types';

export default function ReportsDashboardPage() {
  // Memoised once per mount: a fresh `new Date()` each render changed the query key
  // every render and caused an endless refetch loop.
  const input = useMemo(() => {
    const today = new Date();
    return { dateRange: { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today } };
  }, []);
  const { data } = trpc.reporting.getAnalyticsDashboard.useQuery(input);
  const dash = data as Partial<AnalyticsDashboardResponse> | undefined;
  const kpis = Array.isArray(dash?.kpis) ? dash.kpis : [];
  const kpi = (label: string): string => kpis.find((k) => k?.label === label)?.formattedValue ?? '-';

  const links = [
    { label: 'Sales Reports', href: '/reports/sales', icon: BarChart },
    { label: 'Inventory Reports', href: '/reports/inventory', icon: Package },
    { label: 'Manufacturing Reports', href: '/reports/manufacturing', icon: Factory },
    { label: 'CRM Reports', href: '/reports/crm', icon: Users },
    { label: 'Forecasting', href: '/reports/forecast', icon: TrendingUp },
    { label: 'Custom Reports', href: '/reports/custom', icon: FileText },
    { label: 'Scheduled Reports', href: '/reports/scheduled', icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Analytics" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Revenue" value={kpi('Total Revenue')} icon={<Calendar className="h-4 w-4" />} />
        <StatCard title="Sales Count" value={kpi('Sales Count')} icon={<BarChart className="h-4 w-4" />} />
        <StatCard title="Average Ticket" value={kpi('Average Ticket')} icon={<Package className="h-4 w-4" />} />
        <StatCard title="New Customers" value={kpi('New Customers')} icon={<Users className="h-4 w-4" />} />
      </div>
      <div className="space-y-2">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent">
            <div className="flex items-center gap-3"><l.icon className="h-4 w-4" /><span className="text-sm font-medium">{l.label}</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}

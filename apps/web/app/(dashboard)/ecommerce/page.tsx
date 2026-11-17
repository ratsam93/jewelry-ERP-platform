'use client';

import Link from 'next/link';
import { PageHeader, StatCard } from '@caratflow/ui';
import { Globe, ShoppingCart, Truck, CreditCard, Star, Package, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { dashboardKpis } from '@/lib/ecommerce-forms';

export default function EcommerceDashboardPage() {
  const { data } = trpc.ecommerce.getDashboard.useQuery();
  const d = (data as Record<string, unknown> | undefined) ?? {};

  const k = dashboardKpis(d);

  const links = [
    { label: 'Channels', href: '/ecommerce/channels', icon: Globe },
    { label: 'Catalog', href: '/ecommerce/catalog', icon: Package },
    { label: 'Orders', href: '/ecommerce/orders', icon: ShoppingCart },
    { label: 'Shipments', href: '/ecommerce/shipments', icon: Truck },
    { label: 'Payments', href: '/ecommerce/payments', icon: CreditCard },
    { label: 'Reviews', href: '/ecommerce/reviews', icon: Star },
    { label: 'Click & Collect', href: '/ecommerce/click-collect', icon: Package },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="E-Commerce" breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'E-Commerce' }]} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Channels" value={String(k.activeChannels)} icon={<Globe className="h-4 w-4" />} />
        <StatCard title="MTD Orders" value={String(k.mtdOrders)} icon={<ShoppingCart className="h-4 w-4" />} />
        <StatCard title="MTD Revenue" value={formatPaise(k.mtdRevenuePaise)} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard title="Pending Shipments" value={String(k.pendingShipments)} icon={<Truck className="h-4 w-4" />} />
      </div>
      <p className="text-xs text-muted-foreground">Pending Shipments counts confirmed or processing orders that have no shipment yet.</p>
      <div className="space-y-2">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent">
            <div className="flex items-center gap-3"><l.icon className="h-4 w-4" /><span className="text-sm font-medium">{l.label}</span></div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}

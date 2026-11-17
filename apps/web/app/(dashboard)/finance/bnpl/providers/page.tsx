'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Users, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { providerRow, readableError } from '@/lib/finance-form';
import { ProviderForm } from '@/features/bnpl/bnpl-forms';

export default function BnplProvidersPage() {
  const { data, isLoading, refetch } = trpc.bnpl.listProviders.useQuery();
  const items = ((data as Array<Record<string, unknown>> | undefined) ?? []).map(providerRow);
  const [open, setOpen] = useState(false);
  const createMut = trpc.bnpl.createProvider.useMutation();
  const toggleMut = trpc.bnpl.toggleProvider.useMutation({ onSuccess: () => refetch() });

  const handleCreate = async (input: Record<string, unknown>): Promise<boolean> => {
    try {
      await createMut.mutateAsync(input as never);
      await refetch();
      setOpen(false);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="BNPL Providers"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'BNPL', href: '/finance/bnpl' },
          { label: 'Providers' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {open ? 'Close form' : 'New Provider'}
          </button>
        }
      />
      {open && (
        <ProviderForm
          onSubmit={handleCreate}
          pending={createMut.isPending}
          serverError={createMut.error ? readableError(createMut.error, 'Could not create the provider.') : null}
        />
      )}
      {toggleMut.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {readableError(toggleMut.error, 'Could not update the provider.')}
        </p>
      )}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr_1fr_0.8fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Provider</span>
          <span>Type</span>
          <span>Order range</span>
          <span>Tenures</span>
          <span>Fee</span>
          <span>Status</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No providers" description="Use New Provider to add one." />
        ) : (
          <div className="divide-y">
            {items.map((p) => (
              <div key={p.id} className="grid grid-cols-[1.6fr_1fr_1.2fr_1fr_1fr_0.8fr] items-center gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{p.name}</span>
                <span>{p.type}</span>
                <span>{formatPaise(p.minOrderPaise)} - {formatPaise(p.maxOrderPaise)}</span>
                <span>{p.tenures}</span>
                <span>{p.processingFeePct}</span>
                <button
                  type="button"
                  disabled={toggleMut.isPending}
                  onClick={() => toggleMut.mutate({ providerId: p.id, isActive: !p.isActive } as never)}
                  title={p.isActive ? 'Click to deactivate' : 'Click to activate'}
                  className="justify-self-start"
                >
                  <StatusBadge label={p.isActive ? 'Active' : 'Inactive'} variant={p.isActive ? 'success' : 'default'} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

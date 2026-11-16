'use client';

import * as React from 'react';
import { PageHeader, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState, StatusBadge } from '@caratflow/ui';
import { Percent, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise, formatDate } from '@/components/format';
import { DiscountForm, type DiscountFormValues } from '../../../../src/features/retail/DiscountForm';

const TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: 'Percentage',
  FIXED: 'Fixed',
  BUY_X_GET_Y: 'Buy X get Y',
};

interface DiscountRow extends DiscountFormValues {
  usedCount: number;
}

function describeValue(d: DiscountRow): string {
  if (d.discountType === 'PERCENTAGE') return `${d.value / 100}%`;
  if (d.discountType === 'FIXED') return formatPaise(d.value);
  return `Buy ${d.buyQuantity ?? '-'} get ${d.getQuantity ?? '-'} free`;
}

export default function DiscountsPage() {
  const [editing, setEditing] = React.useState<DiscountRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const listQuery = trpc.retail.listDiscounts.useQuery({
    filters: {},
    pagination: { page: 1, limit: 50, sortOrder: 'desc' as const },
  });
  const items = React.useMemo(() => {
    const data = listQuery.data as unknown as { items?: DiscountRow[] } | undefined;
    return data?.items ?? [];
  }, [listQuery.data]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (d: DiscountRow) => {
    setEditing(d);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discounts"
        description="Percentage, fixed and buy-X-get-Y discounts for retail sales."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Discounts' },
        ]}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New discount
          </button>
        }
      />

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1.2fr_1.5fr_1.5fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Type</span>
          <span>Value</span>
          <span>Validity</span>
          <span>Used</span>
          <span>Status</span>
        </div>
        {listQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : listQuery.isError ? (
          <div role="alert" className="p-4 text-sm text-destructive">
            Failed to load discounts: {listQuery.error.message}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Percent className="h-8 w-8" />} title="No discounts yet" />
        ) : (
          <div className="divide-y">
            {items.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openEdit(d)}
                className="grid w-full grid-cols-[2fr_1.2fr_1.5fr_1.5fr_1fr_1fr] gap-4 px-4 py-3 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{d.name}</span>
                <span>{TYPE_LABELS[d.discountType] ?? d.discountType}</span>
                <span>{describeValue(d)}</span>
                <span className="text-muted-foreground">
                  {formatDate(d.startDate)} to {formatDate(d.endDate)}
                </span>
                <span>
                  {d.usedCount}
                  {d.usageLimit ? ` / ${d.usageLimit}` : ''}
                </span>
                <span>
                  <StatusBadge label={d.isActive ? 'ACTIVE' : 'INACTIVE'} variant={d.isActive ? 'success' : 'default'} dot={false} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit discount' : 'New discount'}</DialogTitle>
          </DialogHeader>
          <DiscountForm
            key={editing?.id ?? 'new'}
            discount={editing}
            onSaved={() => setFormOpen(false)}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { JobPriority } from '@caratflow/shared-types';
import { branchOptionLabels } from '@/lib/pos-location';
import {
  bomProductMismatch,
  bomsForProduct,
  buildJobInput,
  dedupeLocationsByName,
  formatServerError,
  type FormErrors,
} from '@/lib/manufacturing-forms';

type Priority = JobPriority;

export default function NewJobOrderPage() {
  const router = useRouter();

  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [assignedKarigarId, setAssignedKarigarId] = useState('');
  const [bomId, setBomId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [priority, setPriority] = useState<Priority>(JobPriority.MEDIUM);
  const [quantity, setQuantity] = useState('1');
  const [errors, setErrors] = useState<FormErrors>({});
  const [estimatedStartDate, setEstimatedStartDate] = useState('');
  const [estimatedEndDate, setEstimatedEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Products via storefront catalog list
  const productsQuery = trpc.storefront.catalog.list.useQuery({
    page: 1,
    limit: 50,
    sortOrder: 'desc',
    search: productSearch || undefined,
  });

  // Karigars via manufacturing.karigar.list
  const karigarsQuery = trpc.manufacturing.karigar.list.useQuery({
    pagination: { page: 1, limit: 100, sortOrder: 'desc' },
  });

  // Active BOMs for the picker
  const bomsQuery = trpc.manufacturing.bom.list.useQuery({
    pagination: { page: 1, limit: 100, sortOrder: 'desc' },
    filter: { status: 'ACTIVE' as never },
  });

  // Locations via platform.branches.list
  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: false });

  const createMutation = trpc.manufacturing.job.create.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      if (id) {
        router.push(`/manufacturing/jobs/${id}`);
      } else {
        router.push('/manufacturing/jobs');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildJobInput({
      productId, locationId, assignedKarigarId, bomId, customerId, priority,
      quantity, estimatedStartDate, estimatedEndDate, notes, specialInstructions,
    });
    setErrors(result.errors);
    if (result.input) createMutation.mutate(result.input as never);
  };

  const products = ((productsQuery.data as { items?: Array<{ id: string; name?: string; sku?: string }> } | undefined)?.items) ?? [];
  const karigars = ((karigarsQuery.data as { items?: Array<{ id: string; firstName?: string; lastName?: string; fullName?: string; name?: string; employeeCode?: string }> } | undefined)?.items) ?? [];
  const boms = ((bomsQuery.data as { items?: Array<{ id: string; name?: string; version?: number; productId?: string; product?: { name?: string } | null }> } | undefined)?.items) ?? [];
  const branches = dedupeLocationsByName(
    (branchesQuery.data as Array<{ id: string; name: string; locationType?: string }> | undefined) ?? [],
  );
  const branchLabels = branchOptionLabels(branches.map((b) => ({ ...b, locationType: b.locationType ?? '' })));
  const karigarLabel = (k: (typeof karigars)[number]) =>
    k.fullName ?? (`${k.firstName ?? ''} ${k.lastName ?? ''}`.trim() || k.name || k.id);
  const productBoms = bomsForProduct(boms, productId);
  const bomWarning = bomProductMismatch(boms.find((b) => b.id === bomId), productId);
  const fieldError = (key: string) => (errors[key] ? <p role="alert" className="text-xs text-destructive">{errors[key]}</p> : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Job Order"
        description="Create a new manufacturing job order."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Jobs', href: '/manufacturing/jobs' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} noValidate className="max-w-3xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-2">
            <label className="text-sm font-medium">Product *</label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                // A BOM belongs to one product: drop the previous product's BOM.
                setBomId('');
              }}
              aria-label="Product"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.sku ?? p.id}
                </option>
              ))}
            </select>
            {fieldError('productId')}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Location *</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              aria-label="Location"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a location...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchLabels.get(b.id) ?? b.name}
                </option>
              ))}
            </select>
            {fieldError('locationId')}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Assigned Karigar</label>
            <select
              value={assignedKarigarId}
              onChange={(e) => setAssignedKarigarId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {karigars.map((k) => (
                <option key={k.id} value={k.id}>
                  {karigarLabel(k)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value={JobPriority.LOW}>Low</option>
              <option value={JobPriority.MEDIUM}>Medium</option>
              <option value={JobPriority.HIGH}>High</option>
              <option value={JobPriority.URGENT}>Urgent</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity *</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-label="Quantity"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {fieldError('quantity')}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Estimated Start</label>
            <input
              type="date"
              value={estimatedStartDate}
              onChange={(e) => setEstimatedStartDate(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Estimated End</label>
            <input
              type="date"
              value={estimatedEndDate}
              onChange={(e) => setEstimatedEndDate(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {fieldError('estimatedEndDate')}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">BOM (optional)</label>
            <select
              value={bomId}
              onChange={(e) => setBomId(e.target.value)}
              aria-label="BOM"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">No BOM</option>
              {productBoms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name ?? b.id}{b.product?.name ? ` - ${b.product.name}` : ''}{b.version ? ` (v${b.version})` : ''}
                </option>
              ))}
            </select>
            {productId && productBoms.length === 0 && (
              <p className="text-xs text-muted-foreground">No active BOM exists for the selected product.</p>
            )}
            {!productId && <p className="text-xs text-muted-foreground">Select a product to see its BOMs.</p>}
            {bomWarning && <p role="status" className="text-xs text-amber-600">{bomWarning}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Customer ID (optional)</label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="UUID"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            {fieldError('customerId')}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Special Instructions</label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Job Order'}
          </button>
          {createMutation.isSuccess && (
            <p className="text-sm text-green-600">Created successfully.</p>
          )}
        </div>

        {createMutation.isError && (
          <p role="alert" className="text-sm text-destructive">{formatServerError(createMutation.error)}</p>
        )}
      </form>
    </div>
  );
}

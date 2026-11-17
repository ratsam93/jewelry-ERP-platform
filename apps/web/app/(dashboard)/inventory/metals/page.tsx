'use client';

import { useState } from 'react';
import { PageHeader, FormField } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { MetalStockCard } from '@/features/inventory/metal-stock-card';
import { InventoryMetalType } from '@caratflow/shared-types';
import { LocationSelect } from '@/features/inventory/location-select';
import { buildMetalAdjustInput, type MetalAdjustForm } from '@/lib/inventory-forms';
import { formatServerError } from '@/lib/manufacturing-forms';

export default function MetalsPage() {
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjustData, setAdjustData] = useState({
    metalType: InventoryMetalType.GOLD as string,
    purityFineness: '916',
    weightGrams: '',
    valueRupees: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof MetalAdjustForm, string>>>({});
  const [success, setSuccess] = useState('');

  const {
    data: metalStocks,
    isLoading,
    error: stockError,
    refetch,
  } = trpc.inventory.metalStock.getByLocation.useQuery(
    { locationId: selectedLocationId },
    { enabled: !!selectedLocationId },
  );

  const adjustMutation = trpc.inventory.metalStock.adjust.useMutation({
    onSuccess: () => {
      setShowAdjustForm(false);
      setErrors({});
      setSuccess('Metal stock adjusted.');
      setAdjustData((d) => ({ ...d, weightGrams: '', valueRupees: '', notes: '' }));
      refetch();
    },
  });

  const handleAdjust = () => {
    setSuccess('');
    const result = buildMetalAdjustInput({ ...adjustData, locationId: selectedLocationId });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    // Weights (mg) and money (paise) go over the wire as decimal strings: JSON cannot carry a BigInt.
    adjustMutation.mutate(result.input as never);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metal Stock"
        description="Raw metal inventory by location and purity."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Inventory', href: '/inventory' },
          { label: 'Metals' },
        ]}
        actions={
          selectedLocationId ? (
            <button
              onClick={() => setShowAdjustForm(!showAdjustForm)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Adjust Metal Stock
            </button>
          ) : null
        }
      />

      {/* Location Selector */}
      <div className="flex items-center gap-3">
        <FormField label="Location" htmlFor="location-select">
          <LocationSelect
            id="location-select"
            value={selectedLocationId}
            onChange={(id) => { setSelectedLocationId(id); setSuccess(''); }}
            placeholder="Select a location to view metal stock"
            className="h-9 w-96 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </FormField>
      </div>

      {success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      {selectedLocationId && stockError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load metal stock: {formatServerError(stockError)}
        </p>
      )}

      {/* Metal Stock Cards */}
      {selectedLocationId && !stockError && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted" />
            ))
          ) : metalStocks && metalStocks.length > 0 ? (
            metalStocks.map((stock: {
              id: string;
              metalType: string;
              purityFineness: number;
              weightMg: bigint;
              valuePaise: bigint;
            }) => (
              <MetalStockCard
                key={stock.id}
                metalType={stock.metalType}
                purityFineness={stock.purityFineness}
                weightMg={Number(stock.weightMg)}
                valuePaise={Number(stock.valuePaise)}
              />
            ))
          ) : (
            <div className="col-span-full text-center text-muted-foreground py-8">
              No metal stock found at this location.
            </div>
          )}
        </div>
      )}

      {/* Adjust Form */}
      {showAdjustForm && (
        <div className="rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold">Adjust Metal Stock</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Metal Type" required error={errors.metalType}>
              <select
                value={adjustData.metalType}
                onChange={(e) => setAdjustData({ ...adjustData, metalType: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="PLATINUM">Platinum</option>
              </select>
            </FormField>
            <FormField label="Purity Fineness" required error={errors.purityFineness}>
              <input
                type="number"
                value={adjustData.purityFineness}
                onChange={(e) => setAdjustData({ ...adjustData, purityFineness: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={1}
                max={999}
              />
            </FormField>
            <FormField label="Weight Change (g)" description="Positive to add, negative to deduct (up to 3 decimals)" required error={errors.weightGrams}>
              <input
                type="text"
                value={adjustData.weightGrams}
                onChange={(e) => setAdjustData({ ...adjustData, weightGrams: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. 10.5"
              />
            </FormField>
            <FormField label="Value Change (Rs.)" description="Optional; use a minus sign to reduce" error={errors.valueRupees}>
              <input
                type="text"
                value={adjustData.valueRupees}
                onChange={(e) => setAdjustData({ ...adjustData, valueRupees: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. 5000"
              />
            </FormField>
            <FormField label="Reason / Notes" className="md:col-span-2">
              <textarea
                value={adjustData.notes}
                onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                rows={2}
              />
            </FormField>
          </div>
          {adjustMutation.error && (
            <p role="alert" className="text-sm text-destructive">{formatServerError(adjustMutation.error)}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdjust}
              disabled={adjustMutation.isPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {adjustMutation.isPending ? 'Adjusting...' : 'Apply Adjustment'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdjustForm(false)}
              className="h-9 rounded-md border px-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

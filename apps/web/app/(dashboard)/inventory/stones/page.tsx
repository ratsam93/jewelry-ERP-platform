'use client';

import { useState } from 'react';
import { PageHeader, FormField } from '@caratflow/ui';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { StoneStockCard } from '@/features/inventory/stone-stock-card';
import { LocationSelect } from '@/features/inventory/location-select';
import { formatServerError } from '@/lib/manufacturing-forms';
import { caratsToMg } from '@caratflow/shared-types';
import type { StoneOrigin } from '@caratflow/shared-types';

export default function StonesPage() {
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState('');
  const [originFilter, setOriginFilter] = useState<'' | 'NATURAL' | 'LAB_GROWN'>('');
  const [formData, setFormData] = useState({
    stoneType: '',
    shape: '',
    sizeRange: '',
    color: '',
    clarity: '',
    cutGrade: '',
    polish: '',
    symmetry: '',
    fluorescence: '',
    origin: 'NATURAL' as 'NATURAL' | 'LAB_GROWN',
    growthMethod: 'NONE' as 'NONE' | 'HPHT' | 'CVD',
    treatment: 'NONE',
    reportLab: '',
    weightCarats: '',
    totalPieces: 0,
    valuePaise: '',
    certificationNumber: '',
  });

  const { data: stoneStocks, isLoading, refetch } = trpc.inventory.stoneStock.getByLocation.useQuery(
    { locationId: selectedLocationId, origin: (originFilter || undefined) as StoneOrigin | undefined },
    { enabled: !!selectedLocationId },
  );

  const createMutation = trpc.inventory.stoneStock.create.useMutation({
    onSuccess: () => { setShowCreateForm(false); refetch(); },
  });

  const handleCreate = () => {
    if (!selectedLocationId) return setCreateError('Select a location first.');
    if (!formData.stoneType) return setCreateError('Enter the stone type.');
    if (!/^\d*$/.test(formData.valuePaise.trim())) return setCreateError('Value must be a whole number of paise.');
    setCreateError('');
    createMutation.mutate({
      locationId: selectedLocationId,
      stoneType: formData.stoneType,
      shape: formData.shape || undefined,
      sizeRange: formData.sizeRange || undefined,
      color: formData.color || undefined,
      clarity: formData.clarity || undefined,
      cutGrade: formData.cutGrade || undefined,
      polish: formData.polish || undefined,
      symmetry: formData.symmetry || undefined,
      fluorescence: formData.fluorescence || undefined,
      origin: formData.origin as never,
      growthMethod: (formData.origin === 'LAB_GROWN' ? formData.growthMethod : 'NONE') as never,
      treatment: formData.treatment as never,
      reportLab: formData.reportLab || undefined,
      totalWeightMg: caratsToMg(parseFloat(formData.weightCarats) || 0).toString(),
      totalPieces: formData.totalPieces,
      valuePaise: BigInt(formData.valuePaise || '0').toString(),
      certificationNumber: formData.certificationNumber || undefined,
    } as never);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stone Stock"
        description="Loose stone inventory with 4Cs grading."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Inventory', href: '/inventory' },
          { label: 'Stones' },
        ]}
        actions={
          selectedLocationId ? (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Stone Stock
            </button>
          ) : null
        }
      />

      {/* Location Selector */}
      <div className="flex items-center gap-3">
        <FormField label="Location" htmlFor="stone-location">
          <LocationSelect
            id="stone-location"
            value={selectedLocationId}
            onChange={setSelectedLocationId}
            placeholder="Select a location to view stone stock"
            className="h-9 w-96 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <FormField label="Origin" htmlFor="stone-origin-filter">
          <select
            id="stone-origin-filter"
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as '' | 'NATURAL' | 'LAB_GROWN')}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All</option>
            <option value="NATURAL">Natural</option>
            <option value="LAB_GROWN">Lab-grown</option>
          </select>
        </FormField>
      </div>

      {!selectedLocationId && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Select a location above to see its loose stone stock.
        </div>
      )}

      {/* Stone Stock Cards */}
      {selectedLocationId && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted" />
            ))
          ) : stoneStocks && stoneStocks.length > 0 ? (
            stoneStocks.map((stone: {
              id: string;
              stoneType: string;
              shape: string | null;
              color: string | null;
              clarity: string | null;
              cutGrade: string | null;
              polish: string | null;
              symmetry: string | null;
              fluorescence: string | null;
              origin: 'NATURAL' | 'LAB_GROWN';
              growthMethod: 'NONE' | 'HPHT' | 'CVD';
              treatment: string | null;
              reportLab: string | null;
              sizeRange: string | null;
              totalWeightMg: bigint;
              totalWeightCt: number;
              totalPieces: number;
              valuePaise: bigint;
              certificationNumber: string | null;
            }) => (
              <StoneStockCard
                key={stone.id}
                stoneType={stone.stoneType}
                shape={stone.shape}
                color={stone.color}
                clarity={stone.clarity}
                cutGrade={stone.cutGrade}
                sizeRange={stone.sizeRange}
                polish={stone.polish}
                symmetry={stone.symmetry}
                fluorescence={stone.fluorescence}
                origin={stone.origin}
                growthMethod={stone.growthMethod}
                treatment={stone.treatment}
                reportLab={stone.reportLab}
                totalWeightMg={stone.totalWeightMg}
                totalWeightCt={stone.totalWeightCt}
                totalPieces={stone.totalPieces}
                valuePaise={Number(stone.valuePaise)}
                certificationNumber={stone.certificationNumber}
              />
            ))
          ) : (
            <div className="col-span-full text-center text-muted-foreground py-8">
              No stone stock found at this location.
            </div>
          )}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold">Add Stone Stock</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Stone Type" required>
              <input
                type="text"
                value={formData.stoneType}
                onChange={(e) => setFormData({ ...formData, stoneType: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. Diamond, Ruby, Emerald"
              />
            </FormField>
            <FormField label="Shape">
              <input
                type="text"
                value={formData.shape}
                onChange={(e) => setFormData({ ...formData, shape: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. Round, Princess, Oval"
              />
            </FormField>
            <FormField label="Size Range">
              <input
                type="text"
                value={formData.sizeRange}
                onChange={(e) => setFormData({ ...formData, sizeRange: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. 0.5-1.0ct"
              />
            </FormField>
            <FormField label="Color">
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. D, E, F"
              />
            </FormField>
            <FormField label="Clarity">
              <input
                type="text"
                value={formData.clarity}
                onChange={(e) => setFormData({ ...formData, clarity: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. VVS1, VS2"
              />
            </FormField>
            <FormField label="Cut Grade">
              <input
                type="text"
                value={formData.cutGrade}
                onChange={(e) => setFormData({ ...formData, cutGrade: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                placeholder="e.g. Excellent, Very Good"
              />
            </FormField>
            <FormField label="Total Weight (carats, e.g. 0.37)" required>
              <input
                type="number"
                step="0.005"
                value={formData.weightCarats}
                onChange={(e) => setFormData({ ...formData, weightCarats: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={0}
              />
            </FormField>
            <FormField label="Origin">
              <select
                value={formData.origin}
                onChange={(e) => {
                  const origin = e.target.value as 'NATURAL' | 'LAB_GROWN';
                  const growthMethod = origin === 'NATURAL' ? 'NONE' : formData.growthMethod === 'NONE' ? 'CVD' : formData.growthMethod;
                  setFormData({ ...formData, origin, growthMethod });
                }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="NATURAL">Natural</option>
                <option value="LAB_GROWN">Lab-grown</option>
              </select>
            </FormField>
            <FormField label="Growth Method">
              <select
                value={formData.growthMethod}
                disabled={formData.origin !== 'LAB_GROWN'}
                onChange={(e) => setFormData({ ...formData, growthMethod: e.target.value as 'NONE' | 'HPHT' | 'CVD' })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-50"
              >
                <option value="NONE">None</option>
                <option value="HPHT">HPHT</option>
                <option value="CVD">CVD</option>
              </select>
            </FormField>
            <FormField label="Treatment">
              <select
                value={formData.treatment}
                onChange={(e) => setFormData({ ...formData, treatment: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {['NONE', 'HPHT_TREATED', 'IRRADIATED', 'LASER_DRILLED', 'FRACTURE_FILLED', 'HEATED', 'OILED', 'OTHER'].map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Polish">
              <input type="text" value={formData.polish}
                onChange={(e) => setFormData({ ...formData, polish: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" placeholder="e.g. Excellent" />
            </FormField>
            <FormField label="Symmetry">
              <input type="text" value={formData.symmetry}
                onChange={(e) => setFormData({ ...formData, symmetry: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" placeholder="e.g. Very Good" />
            </FormField>
            <FormField label="Fluorescence">
              <input type="text" value={formData.fluorescence}
                onChange={(e) => setFormData({ ...formData, fluorescence: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" placeholder="e.g. None, Faint" />
            </FormField>
            <FormField label="Report Lab">
              <input type="text" value={formData.reportLab}
                onChange={(e) => setFormData({ ...formData, reportLab: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" placeholder="e.g. IGI, GIA, SGL" />
            </FormField>
            <FormField label="Total Pieces" required>
              <input
                type="number"
                value={formData.totalPieces}
                onChange={(e) => setFormData({ ...formData, totalPieces: parseInt(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={0}
              />
            </FormField>
            <FormField label="Value (paise)" required>
              <input
                type="text"
                value={formData.valuePaise}
                onChange={(e) => setFormData({ ...formData, valuePaise: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </FormField>
            <FormField label="Certification Number">
              <input
                type="text"
                value={formData.certificationNumber}
                onChange={(e) => setFormData({ ...formData, certificationNumber: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              />
            </FormField>
          </div>
          {(createError || createMutation.error) && (
            <p role="alert" className="text-sm text-destructive">
              {createError || formatServerError(createMutation.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving...' : 'Add Stone Stock'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
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

'use client';

import { useState } from 'react';
import { PageHeader, FormField } from '@caratflow/ui';
import { Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';

type Source = 'SCRAP' | 'FILINGS' | 'POLISH_DUST' | 'OLD_GOLD';

interface RecoveryRow {
  id: string;
  recoveryNumber: string;
  sourceType: Source;
  grossWeightMg: bigint;
  purityFineness: number;
  expectedFineMg: bigint;
  recoveredFineMg: bigint | null;
  lossMg: bigint | null;
  refinerName: string | null;
  status: string;
}

const gramsFromMg = (mg: bigint | number | null) =>
  mg === null ? '-' : (Number(mg) / 1000).toFixed(3) + ' g';

export default function MetalRecoveryPage() {
  const [showForm, setShowForm] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [recoveredGrams, setRecoveredGrams] = useState('');
  const [valueRupees, setValueRupees] = useState('');
  const [form, setForm] = useState({
    locationId: '',
    sourceType: 'SCRAP' as Source,
    grossGrams: '',
    purityFineness: 916,
    refinerName: '',
    notes: '',
  });

  const { data, isLoading, refetch } = trpc.inventory.metalRecovery.list.useQuery({
    page: 1,
    limit: 50,
    sortOrder: 'desc',
  });

  const createMutation = trpc.inventory.metalRecovery.create.useMutation({
    onSuccess: () => { setShowForm(false); refetch(); },
  });
  const completeMutation = trpc.inventory.metalRecovery.complete.useMutation({
    onSuccess: () => { setCompletingId(null); setRecoveredGrams(''); setValueRupees(''); refetch(); },
  });

  const handleCreate = () => {
    if (!form.locationId || !form.grossGrams) return;
    createMutation.mutate({
      locationId: form.locationId,
      sourceType: form.sourceType,
      metalType: 'GOLD' as never,
      // Decimal string: JSON cannot carry a BigInt (the API converts it back).
      grossWeightMg: String(Math.round(parseFloat(form.grossGrams) * 1000)),
      purityFineness: form.purityFineness,
      refinerName: form.refinerName || undefined,
      notes: form.notes || undefined,
    } as never);
  };

  const handleComplete = (id: string) => {
    completeMutation.mutate({
      id,
      recoveredFineMg: String(Math.round((parseFloat(recoveredGrams) || 0) * 1000)),
      recoveredPurityFineness: 999,
      valuePaise: String(Math.round((parseFloat(valueRupees) || 0) * 100)),
    } as never);
  };

  const items = ((data as { items?: RecoveryRow[] } | undefined)?.items ?? []) as RecoveryRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metal Recovery"
        description="Track fine metal recovered from scrap, filings, polish dust and old gold."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Inventory', href: '/inventory' },
          { label: 'Recovery' },
        ]}
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Recovery
          </button>
        }
      />

      {showForm && (
        <div className="rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold">New Metal Recovery</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Location ID" required>
              <input type="text" value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </FormField>
            <FormField label="Source">
              <select value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value as Source })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="SCRAP">Scrap</option>
                <option value="FILINGS">Filings</option>
                <option value="POLISH_DUST">Polish dust</option>
                <option value="OLD_GOLD">Old gold</option>
              </select>
            </FormField>
            <FormField label="Gross Weight (g)" required>
              <input type="number" step="0.001" min={0} value={form.grossGrams}
                onChange={(e) => setForm({ ...form, grossGrams: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </FormField>
            <FormField label="Purity (fineness)">
              <input type="number" min={1} max={999} value={form.purityFineness}
                onChange={(e) => setForm({ ...form, purityFineness: parseInt(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </FormField>
            <FormField label="Refiner / Karigar">
              <input type="text" value={form.refinerName}
                onChange={(e) => setForm({ ...form, refinerName: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </FormField>
            <FormField label="Notes">
              <input type="text" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            </FormField>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? 'Saving...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="h-9 rounded-md border px-4 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">No.</th>
              <th className="p-3">Source</th>
              <th className="p-3">Gross</th>
              <th className="p-3">Purity</th>
              <th className="p-3">Expected fine</th>
              <th className="p-3">Recovered fine</th>
              <th className="p-3">Loss</th>
              <th className="p-3">Refiner</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No recoveries yet.</td></tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.recoveryNumber}</td>
                  <td className="p-3">{r.sourceType.replace(/_/g, ' ')}</td>
                  <td className="p-3">{gramsFromMg(r.grossWeightMg)}</td>
                  <td className="p-3">{r.purityFineness}</td>
                  <td className="p-3">{gramsFromMg(r.expectedFineMg)}</td>
                  <td className="p-3">{gramsFromMg(r.recoveredFineMg)}</td>
                  <td className="p-3">{gramsFromMg(r.lossMg)}</td>
                  <td className="p-3">{r.refinerName ?? '-'}</td>
                  <td className="p-3">{r.status.replace(/_/g, ' ')}</td>
                  <td className="p-3">
                    {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                      completingId === r.id ? (
                        <div className="flex items-center gap-2">
                          <input type="number" step="0.001" placeholder="Fine g" value={recoveredGrams}
                            onChange={(e) => setRecoveredGrams(e.target.value)}
                            className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm" />
                          <input type="number" step="0.01" placeholder="Value Rs" value={valueRupees}
                            onChange={(e) => setValueRupees(e.target.value)}
                            className="h-8 w-24 rounded-md border border-input bg-transparent px-2 text-sm" />
                          <button onClick={() => handleComplete(r.id)} disabled={completeMutation.isPending}
                            className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
                            Post
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setCompletingId(r.id)} className="h-8 rounded-md border px-3 text-xs">
                          Complete
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { branchOptionLabels, dedupeBranches, pickDefaultLocation, type PosBranch } from '@/lib/pos-location';

interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email?: string | null;
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export interface PickedCustomer {
  id: string;
  name: string;
}

/** Search-as-you-type customer picker. */
export function CustomerPicker({
  value,
  onChange,
  invalid,
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  invalid?: boolean;
}) {
  const [search, setSearch] = React.useState('');
  const debounced = useDebounced(search);
  const query = trpc.crm.customerList.useQuery(
    { search: debounced || undefined, page: 1, limit: 10, sortOrder: 'desc' as const },
    { enabled: !value },
  );
  const customers: CustomerRow[] = React.useMemo(() => {
    const data = query.data as unknown as { items?: CustomerRow[] } | undefined;
    return data?.items ?? [];
  }, [query.data]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span>{value.name}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear customer">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email..."
          aria-label="Search customers"
          aria-invalid={invalid ? true : undefined}
          className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="max-h-48 overflow-auto rounded-md border">
        {query.isLoading && <p className="p-2 text-xs text-muted-foreground">Searching...</p>}
        {query.isError && (
          <p role="alert" className="p-2 text-xs text-destructive">
            Could not load customers.
          </p>
        )}
        {!query.isLoading && !query.isError && customers.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">No customers found.</p>
        )}
        {customers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() })}
            className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <span className="font-medium">
              {c.firstName} {c.lastName}
            </span>
            <span className="text-xs text-muted-foreground">{c.phone ?? c.email ?? '—'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Store / location select that defaults to the primary showroom. */
export function LocationSelect({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const query = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const branches = React.useMemo(
    () => dedupeBranches((query.data as PosBranch[] | undefined) ?? []),
    [query.data],
  );
  const labels = React.useMemo(() => branchOptionLabels(branches), [branches]);
  React.useEffect(() => {
    if (!value && branches.length > 0) onChange(pickDefaultLocation(branches, null));
  }, [value, branches, onChange]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Store / location"
      aria-invalid={invalid ? true : undefined}
      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
    >
      {branches.length === 0 && <option value="">{query.isLoading ? 'Loading...' : 'No stores'}</option>}
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {labels.get(b.id) ?? b.name}
        </option>
      ))}
    </select>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && (
        <span role="alert" className="block text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}

export const inputClass = 'h-9 w-full rounded-md border bg-transparent px-3 text-sm';

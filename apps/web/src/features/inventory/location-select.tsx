'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { branchOptionLabels, dedupeBranches, type PosBranch } from '@/lib/pos-location';

interface LocationSelectProps {
  value: string;
  onChange: (id: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

/** Location dropdown fed by platform.branches.list (deduped by id, look-alikes disambiguated). */
export function LocationSelect({
  value,
  onChange,
  id,
  placeholder = 'Select a location',
  className,
  required,
}: LocationSelectProps) {
  const query = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const branches = useMemo(
    () =>
      dedupeBranches(
        ((query.data as PosBranch[] | undefined) ?? []).map((b) => ({
          ...b,
          locationType: b.locationType ?? '',
        })),
      ),
    [query.data],
  );
  const labels = useMemo(() => branchOptionLabels(branches), [branches]);

  return (
    <select
      id={id}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      disabled={query.isLoading}
      className={className ?? 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm'}
    >
      <option value="">{query.isLoading ? 'Loading locations...' : placeholder}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {labels.get(b.id) ?? b.name}
        </option>
      ))}
    </select>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

export interface PickedProduct {
  id: string;
  name?: string;
  sku?: string;
}

interface ProductPickerProps {
  value: string;
  onChange: (id: string, product?: PickedProduct) => void;
  id?: string;
  placeholder?: string;
}

/** Search products by name/SKU (storefront.catalog.list) and pick one from a dropdown. */
export function ProductPicker({
  value,
  onChange,
  id,
  placeholder = 'Search product by name or SKU...',
}: ProductPickerProps) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const query = trpc.storefront.catalog.list.useQuery(
    { page: 1, limit: 10, sortOrder: 'desc', search: debounced || undefined } as never,
    { enabled: open },
  );
  const results = (query.data as { items?: PickedProduct[] } | undefined)?.items ?? [];

  if (value && picked && picked.id === value) {
    return (
      <div className="flex h-9 w-full items-center justify-between rounded-md border border-input px-3 text-sm">
        <span className="truncate">
          {picked.name ?? 'Product'}
          {picked.sku ? ` (${picked.sku})` : ''}
        </span>
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            onChange('');
            setText('');
          }}
          className="ml-2 text-xs text-muted-foreground underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md">
          {query.isLoading && <li className="px-3 py-2 text-muted-foreground">Searching...</li>}
          {!query.isLoading && results.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">No products found.</li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  setPicked(p);
                  setOpen(false);
                  onChange(p.id, p);
                }}
              >
                {p.name ?? p.id}
                {p.sku ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

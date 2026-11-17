'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

interface SerialRow {
  id: string;
  serialNumber: string;
  rfidTag?: string | null;
  status?: string;
  product?: { name?: string; sku?: string } | null;
}

interface SerialPickerProps {
  value: string;
  onChange: (id: string, serial?: SerialRow) => void;
  id?: string;
}

/** Guidance shown when the serial-number search returns nothing. */
export function serialPickerEmptyMessage(search: string): string {
  return search
    ? `No serial number, RFID tag or barcode matches "${search}". The search matches serial numbers, not product names.`
    : 'No serialised items found. RFID tags attach to serial numbers: add serial numbers to a stock item under Inventory > Items first.';
}

/** Pick a stock item (serial number) by serial/RFID/barcode instead of typing a raw UUID. */
export function SerialPicker({ value, onChange, id }: SerialPickerProps) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SerialRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const query = trpc.inventory.serialNumbers.list.useQuery(
    { page: 1, limit: 10, sortOrder: 'desc', search: debounced || undefined } as never,
    { enabled: open },
  );
  const results = ((query.data as { items?: SerialRow[] } | undefined)?.items ?? []) as SerialRow[];

  if (value && picked && picked.id === value) {
    return (
      <div className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm">
        <span className="truncate">
          {picked.serialNumber}
          {picked.product?.name ? ` - ${picked.product.name}` : ''}
        </span>
        <button
          type="button"
          className="ml-2 text-xs text-muted-foreground hover:underline"
          onClick={() => {
            setPicked(null);
            onChange('');
          }}
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
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Search stock item by serial number, RFID or barcode..."
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-md">
          {query.isLoading ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching...</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground" data-testid="serial-picker-empty">
              {serialPickerEmptyMessage(debounced)}
            </li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setPicked(r);
                    setOpen(false);
                    setText('');
                    onChange(r.id, r);
                  }}
                >
                  <span className="font-medium">{r.serialNumber}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.product?.name ?? ''}
                    {r.product?.sku ? ` (${r.product.sku})` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

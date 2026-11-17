'use client';

import { useState } from 'react';
import { FormField } from '@caratflow/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { LocationSelect } from './location-select';
import { formatServerError } from '@/lib/manufacturing-forms';

interface StockTakeFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function StockTakeForm({ onClose, onSuccess }: StockTakeFormProps) {
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState('');

  const createMutation = trpc.inventory.stockTakes.create.useMutation({
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId) return setValidation('Select a location.');
    setValidation('');
    createMutation.mutate({
      locationId,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Stock Take</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Location"
            required
            description="All stock items at this location will be included in the stock take."
          >
            <LocationSelect value={locationId} onChange={setLocationId} />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              rows={3}
              placeholder="Optional notes about this stock take..."
            />
          </FormField>

          {(validation || createMutation.error) && (
            <p className="text-sm text-destructive" role="alert">
              {validation || formatServerError(createMutation.error)}
            </p>
          )}

          <DialogFooter>
            <button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Stock Take'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

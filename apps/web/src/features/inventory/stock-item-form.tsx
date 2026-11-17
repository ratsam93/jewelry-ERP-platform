'use client';

import { useState } from 'react';
import { FormField } from '@caratflow/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { LocationSelect } from './location-select';
import { ProductPicker } from './product-picker';
import { formatServerError } from '@/lib/manufacturing-forms';

interface StockItemFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function StockItemForm({ onClose, onSuccess }: StockItemFormProps) {
  const [formData, setFormData] = useState({
    productId: '',
    locationId: '',
    quantityOnHand: 0,
    reorderLevel: 0,
    reorderQuantity: 0,
    binLocation: '',
  });

  const createMutation = trpc.inventory.stockItems.create.useMutation({
    onSuccess,
  });

  const [validation, setValidation] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productId) return setValidation('Select a product.');
    if (!formData.locationId) return setValidation('Select a location.');
    setValidation('');
    createMutation.mutate({
      productId: formData.productId,
      locationId: formData.locationId,
      quantityOnHand: formData.quantityOnHand,
      reorderLevel: formData.reorderLevel,
      reorderQuantity: formData.reorderQuantity,
      binLocation: formData.binLocation || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Stock Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Product" required>
            <ProductPicker
              value={formData.productId}
              onChange={(id) => setFormData({ ...formData, productId: id })}
            />
          </FormField>
          <FormField label="Location" required>
            <LocationSelect
              value={formData.locationId}
              onChange={(id) => setFormData({ ...formData, locationId: id })}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Quantity">
              <input
                type="number"
                value={formData.quantityOnHand}
                onChange={(e) => setFormData({ ...formData, quantityOnHand: parseInt(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={0}
              />
            </FormField>
            <FormField label="Reorder Level">
              <input
                type="number"
                value={formData.reorderLevel}
                onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={0}
              />
            </FormField>
            <FormField label="Reorder Qty">
              <input
                type="number"
                value={formData.reorderQuantity}
                onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                min={0}
              />
            </FormField>
          </div>
          <FormField label="Bin Location">
            <input
              type="text"
              value={formData.binLocation}
              onChange={(e) => setFormData({ ...formData, binLocation: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              placeholder="e.g. A-1-3"
            />
          </FormField>

          {(validation || createMutation.error) && (
            <p className="text-sm text-destructive" role="alert">
              {validation || formatServerError(createMutation.error)}
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

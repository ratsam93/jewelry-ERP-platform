'use client';

import { useState, useCallback } from 'react';
import type { LabelField, CreateLabelTemplate } from '@caratflow/shared-types';
import { JEWELRY_LABEL_FIELDS } from '@caratflow/shared-types';

interface LabelTemplateEditorProps {
  onSave: (template: CreateLabelTemplate) => void;
  onCancel: () => void;
  initialTemplate?: Partial<CreateLabelTemplate>;
  isLoading?: boolean;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'qr', label: 'QR Code' },
  { value: 'image', label: 'Image' },
] as const;

/**
 * Simplified drag-and-drop label template editor.
 * Users can add fields, position them, and set their properties.
 */
export function LabelTemplateEditor({
  onSave,
  onCancel,
  initialTemplate,
  isLoading = false,
}: LabelTemplateEditorProps) {
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [width, setWidth] = useState(initialTemplate?.width ?? 50);
  const [height, setHeight] = useState(initialTemplate?.height ?? 25);
  const [fields, setFields] = useState<LabelField[]>(initialTemplate?.fields ?? []);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const addField = useCallback(
    (type: LabelField['type']) => {
      const newField: LabelField = {
        type,
        x: 2,
        y: 2 + fields.length * 6,
        width: type === 'barcode' ? 40 : type === 'qr' ? 15 : 30,
        height: type === 'barcode' ? 8 : type === 'qr' ? 15 : 5,
        value: type === 'text' ? '{{productName}}' : type === 'barcode' ? '{{barcode}}' : '{{qrCode}}',
        fontSize: type === 'text' ? 10 : undefined,
        barcodeType: type === 'barcode' ? 'CODE128' : undefined,
      };
      setFields([...fields, newField]);
      setSelectedFieldIdx(fields.length);
    },
    [fields],
  );

  const updateField = useCallback(
    (idx: number, updates: Partial<LabelField>) => {
      setFields((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, ...updates } : f)),
      );
    },
    [],
  );

  const removeField = useCallback(
    (idx: number) => {
      setFields((prev) => prev.filter((_, i) => i !== idx));
      setSelectedFieldIdx(null);
    },
    [],
  );

  const addJewelryDefaults = useCallback(() => {
    const defaultFields: LabelField[] = [
      { type: 'text', x: 2, y: 2, width: 30, height: 4, value: '{{productName}}', fontSize: 10 },
      { type: 'text', x: 2, y: 7, width: 20, height: 3, value: 'SKU: {{sku}}', fontSize: 8 },
      { type: 'text', x: 2, y: 11, width: 20, height: 3, value: 'Wt: {{grossWeight}} / {{netWeight}}', fontSize: 8 },
      { type: 'text', x: 2, y: 15, width: 15, height: 3, value: '{{purity}}', fontSize: 8 },
      { type: 'text', x: 20, y: 15, width: 15, height: 3, value: 'HUID: {{huid}}', fontSize: 8 },
      { type: 'text', x: 2, y: 19, width: 20, height: 4, value: '{{price}}', fontSize: 12 },
      { type: 'barcode', x: 2, y: 24, width: 40, height: 8, value: '{{barcode}}', barcodeType: 'CODE128' },
    ];
    const changes: string[] = [];
    if (fields.length > 0) {
      const ok =
        typeof window === 'undefined' ||
        window.confirm(`Replace the ${fields.length} existing field(s) with the default jewelry layout?`);
      if (!ok) return;
      changes.push(`replaced ${fields.length} existing field(s)`);
    }
    setFields(defaultFields);
    if (!name.trim()) {
      setName('Standard Jewelry Label');
      changes.push('set the name to "Standard Jewelry Label"');
    }
    if (width < 50) {
      changes.push(`width ${width}mm to 50mm`);
      setWidth(50);
    }
    if (height < 35) {
      changes.push(`height ${height}mm to 35mm (needed to fit the default layout)`);
      setHeight(35);
    }
    setNotice(changes.length ? `Defaults loaded: ${changes.join('; ')}.` : 'Defaults loaded. Your name and size were kept.');
    setSelectedFieldIdx(null);
  }, [name, fields.length, width, height]);

  const saveBlockReason = !name.trim()
    ? 'Enter a template name to enable Save.'
    : fields.length === 0
      ? 'Add at least one field (or load the jewelry defaults) to enable Save.'
      : null;

  const handleSave = () => {
    onSave({ name, width, height, fields });
  };

  const scale = 3;
  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  return (
    <div className="space-y-4">
      {/* Template Info */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="tmpl-name">Template Name <span className="text-red-600" aria-hidden="true">*</span></label>
          <input
            id="tmpl-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g., Standard Jewelry Label"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="tmpl-width">Width (mm)</label>
          <input
            id="tmpl-width"
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            min={10}
            max={200}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="tmpl-height">Height (mm)</label>
          <input
            id="tmpl-height"
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            min={10}
            max={200}
          />
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {notice}
        </p>
      )}

      <div className="flex gap-4">
        {/* Canvas */}
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium">Label Preview</span>
            <button
              onClick={addJewelryDefaults}
              className="rounded border px-2 py-1 text-xs hover:bg-muted"
            >
              Load Jewelry Defaults
            </button>
          </div>
          <div
            className="relative rounded border bg-white shadow-inner"
            style={{ width: `${width * scale}px`, height: `${height * scale}px` }}
          >
            {fields.map((field, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedFieldIdx(idx)}
                className={`absolute cursor-pointer border ${
                  selectedFieldIdx === idx
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{
                  left: `${field.x * scale}px`,
                  top: `${field.y * scale}px`,
                  width: `${field.width * scale}px`,
                  height: `${field.height * scale}px`,
                }}
              >
                <span
                  className="block truncate text-gray-600"
                  style={{ fontSize: `${Math.max(6, (field.fontSize ?? 8) * (scale / 3))}px` }}
                >
                  {field.type === 'barcode' ? '||||||||' : field.type === 'qr' ? '[QR]' : field.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Field Properties */}
        <div className="w-64 space-y-3">
          <div className="flex flex-wrap gap-1">
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => addField(opt.value)}
                className="rounded border px-2 py-1 text-xs hover:bg-muted"
              >
                + {opt.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">
            Placeholders: {JEWELRY_LABEL_FIELDS.map((f) => `{{${f}}}`).join(', ')}
          </div>

          {selectedField && selectedFieldIdx !== null && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Field {selectedFieldIdx + 1}: {selectedField.type}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs">X (mm)</label>
                  <input
                    type="number"
                    value={selectedField.x}
                    onChange={(e) => updateField(selectedFieldIdx, { x: Number(e.target.value) })}
                    className="w-full rounded border px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs">Y (mm)</label>
                  <input
                    type="number"
                    value={selectedField.y}
                    onChange={(e) => updateField(selectedFieldIdx, { y: Number(e.target.value) })}
                    className="w-full rounded border px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs">Width (mm)</label>
                  <input
                    type="number"
                    value={selectedField.width}
                    onChange={(e) => updateField(selectedFieldIdx, { width: Number(e.target.value) })}
                    className="w-full rounded border px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs">Height (mm)</label>
                  <input
                    type="number"
                    value={selectedField.height}
                    onChange={(e) => updateField(selectedFieldIdx, { height: Number(e.target.value) })}
                    className="w-full rounded border px-2 py-1 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs">Value / Placeholder</label>
                <input
                  type="text"
                  value={selectedField.value}
                  onChange={(e) => updateField(selectedFieldIdx, { value: e.target.value })}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
              </div>
              {selectedField.type === 'text' && (
                <div>
                  <label className="text-xs">Font Size</label>
                  <input
                    type="number"
                    value={selectedField.fontSize ?? 10}
                    onChange={(e) => updateField(selectedFieldIdx, { fontSize: Number(e.target.value) })}
                    className="w-full rounded border px-2 py-1 text-xs"
                    min={4}
                    max={72}
                  />
                </div>
              )}
              <button
                onClick={() => removeField(selectedFieldIdx)}
                className="w-full rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Remove Field
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {saveBlockReason && !isLoading && (
          <span role="status" className="mr-auto text-xs text-muted-foreground">
            {saveBlockReason}
          </span>
        )}
        <button
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading || !name.trim() || fields.length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

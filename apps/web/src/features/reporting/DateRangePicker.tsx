'use client';

import * as React from 'react';
import { Calendar } from 'lucide-react';
import {
  DATE_PRESETS,
  END_BEFORE_START_MESSAGE,
  computePreset,
  isRangeOrdered,
  rangeFromDateStrings,
  toLocalDateString,
  type DatePresetKey,
} from '@/lib/date-presets';

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  presets?: boolean;
  /** Called when the typed range becomes invalid (end before start) or valid again. */
  onValidityChange?: (valid: boolean) => void;
}

export function DateRangePicker({
  from,
  to,
  onChange,
  presets = true,
  onValidityChange,
}: DateRangePickerProps) {
  const [showPresets, setShowPresets] = React.useState(false);
  // What the inputs display. It can briefly differ from the committed range
  // (from/to) while the user has typed an invalid combination.
  const [draftFrom, setDraftFrom] = React.useState(() => toLocalDateString(from));
  const [draftTo, setDraftTo] = React.useState(() => toLocalDateString(to));
  const [error, setError] = React.useState<string | null>(null);

  // Re-sync the inputs whenever the committed range changes (preset click, parent reset).
  const fromKey = toLocalDateString(from);
  const toKey = toLocalDateString(to);
  React.useEffect(() => {
    setDraftFrom(fromKey);
    setDraftTo(toKey);
    setError(null);
  }, [fromKey, toKey]);

  const validityRef = React.useRef(onValidityChange);
  validityRef.current = onValidityChange;
  React.useEffect(() => {
    validityRef.current?.(error === null);
  }, [error]);

  const handleDraft = (nextFrom: string, nextTo: string) => {
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    const range = rangeFromDateStrings(nextFrom, nextTo);
    if (!range) {
      // Cleared or partially typed: wait for a complete date, keep the last valid range.
      setError(null);
      return;
    }
    if (!isRangeOrdered(range.from, range.to)) {
      // Do not query: the last valid range stays in effect.
      setError(END_BEFORE_START_MESSAGE);
      return;
    }
    setError(null);
    onChange(range.from, range.to);
  };

  const handlePreset = (key: DatePresetKey) => {
    const range = computePreset(key);
    setDraftFrom(toLocalDateString(range.from));
    setDraftTo(toLocalDateString(range.to));
    setError(null);
    onChange(range.from, range.to);
    setShowPresets(false);
  };

  const errorId = 'date-range-error';

  return (
    <div className="relative inline-flex max-w-full flex-wrap items-center gap-2">
      <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-2 rounded-md border px-3 py-1 text-sm">
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="date"
          aria-label="From date"
          value={draftFrom}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => handleDraft(e.target.value, draftTo)}
          className="w-32 min-w-0 rounded-sm border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-muted-foreground">to</span>
        <input
          type="date"
          aria-label="To date"
          value={draftTo}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => handleDraft(draftFrom, e.target.value)}
          className="w-32 min-w-0 rounded-sm border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {presets && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            aria-haspopup="menu"
            aria-expanded={showPresets}
            className="min-h-10 px-3 py-2 text-sm border rounded-md hover:bg-accent"
          >
            Presets
          </button>
          {showPresets && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[180px]">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset.key)}
                  className="block min-h-10 w-full text-left px-3 py-2 text-sm hover:bg-accent"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

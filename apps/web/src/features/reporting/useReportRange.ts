'use client';

import * as React from 'react';
import { defaultMonthToDate, type DateRangeValue } from '@/lib/date-presets';

/** Month-to-date (local calendar) range state shared by the report pages. */
export function useReportRange(initial?: () => DateRangeValue) {
  const [range, setRange] = React.useState<DateRangeValue>(() => (initial ? initial() : defaultMonthToDate()));
  const onChange = React.useCallback((from: Date, to: Date) => setRange({ from, to }), []);
  return { range, setRange, onChange };
}

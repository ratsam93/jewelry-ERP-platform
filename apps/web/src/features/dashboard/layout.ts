// Dashboard widget registry and layout helpers.
// The persisted layout (reporting.saveDashboardLayout) is a list of
// DashboardWidgetConfig entries. We store widget order in `y`, grid span in
// `w`, and visibility in `config.hidden`.

import type { DashboardWidgetConfig } from '@caratflow/shared-types';

export type WidgetId =
  | 'kpi-revenue'
  | 'kpi-sales-count'
  | 'kpi-avg-ticket'
  | 'kpi-new-customers'
  | 'revenue-chart'
  | 'alerts'
  | 'branch-performance'
  | 'recent-sales'
  | 'metal-rates';

export type WidgetSpan = 3 | 4 | 6 | 8;

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  span: WidgetSpan;
}

export const WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  { id: 'kpi-revenue', title: 'Revenue', span: 3 },
  { id: 'kpi-sales-count', title: 'Sales Count', span: 3 },
  { id: 'kpi-avg-ticket', title: 'Average Ticket', span: 3 },
  { id: 'kpi-new-customers', title: 'New Customers', span: 3 },
  { id: 'revenue-chart', title: 'Revenue Trend', span: 8 },
  { id: 'alerts', title: 'Alerts', span: 4 },
  { id: 'branch-performance', title: 'Branch Performance', span: 6 },
  { id: 'recent-sales', title: 'Recent Sales', span: 6 },
  { id: 'metal-rates', title: 'Metal Rates', span: 6 },
];

/** Literal class names so Tailwind picks them up at build time. */
export const SPAN_CLASSES: Record<WidgetSpan, string> = {
  3: 'col-span-12 sm:col-span-6 lg:col-span-3',
  4: 'col-span-12 lg:col-span-4',
  6: 'col-span-12 md:col-span-6',
  8: 'col-span-12 lg:col-span-8',
};

const DEFINITION_BY_ID = new Map(WIDGET_DEFINITIONS.map((d) => [d.id, d]));

export function getWidgetDefinition(id: WidgetId): WidgetDefinition {
  const def = DEFINITION_BY_ID.get(id);
  if (!def) throw new Error(`Unknown dashboard widget: ${id}`);
  return def;
}

export const DEFAULT_ORDER: WidgetId[] = WIDGET_DEFINITIONS.map((d) => d.id);

export interface WidgetLayoutState {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const DEFAULT_LAYOUT_STATE: WidgetLayoutState = {
  order: DEFAULT_ORDER,
  hidden: [],
};

function isWidgetId(value: string): value is WidgetId {
  return DEFINITION_BY_ID.has(value as WidgetId);
}

/**
 * Turn a saved layout (possibly empty, partial or containing unknown widget ids)
 * into a complete, valid state. Missing widgets are appended in default order.
 */
export function buildLayoutState(
  saved: readonly DashboardWidgetConfig[] | null | undefined,
): WidgetLayoutState {
  if (!saved || saved.length === 0) return DEFAULT_LAYOUT_STATE;

  const order: WidgetId[] = [];
  const hidden: WidgetId[] = [];
  const sorted = [...saved].sort((a, b) => a.y - b.y);

  for (const item of sorted) {
    if (!isWidgetId(item.widgetId) || order.includes(item.widgetId)) continue;
    order.push(item.widgetId);
    if (item.config?.hidden === true) hidden.push(item.widgetId);
  }

  for (const id of DEFAULT_ORDER) {
    if (!order.includes(id)) order.push(id);
  }

  return { order, hidden };
}

/** Convert the in-memory state into the payload saveDashboardLayout expects. */
export function toLayoutPayload(state: WidgetLayoutState): DashboardWidgetConfig[] {
  return state.order.map((id, index) => ({
    widgetId: id,
    x: 0,
    y: index,
    w: getWidgetDefinition(id).span,
    h: 1,
    config: { hidden: state.hidden.includes(id) },
  }));
}

/** Move `fromId` to the position currently occupied by `toId`. */
export function moveWidget(order: WidgetId[], fromId: WidgetId, toId: WidgetId): WidgetId[] {
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

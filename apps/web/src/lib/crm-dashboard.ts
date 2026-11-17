/**
 * Maps the `crm.dashboard` API payload (CrmDashboardResponse) onto the stat
 * cards shown on the CRM hub. The API exposes `activeCustomers` (all tenant
 * customers), `newLeads` (NEW leads in the last 30d) and a `leadPipeline`
 * status -> count record; it has no totalCustomers/activeLeads fields.
 */
const CLOSED_LEAD_STATUSES = new Set(['WON', 'LOST']);

export interface CrmHubStats {
  totalCustomers: number;
  activeLeads: number;
  newLeads30d: number;
}

export function mapCrmDashboard(raw: unknown): CrmHubStats {
  const d = (raw ?? {}) as Record<string, unknown>;
  const pipeline = (d.leadPipeline ?? {}) as Record<string, unknown>;
  let activeLeads = 0;
  for (const [status, count] of Object.entries(pipeline)) {
    if (!CLOSED_LEAD_STATUSES.has(status)) activeLeads += Number(count) || 0;
  }
  return {
    totalCustomers: Number(d.activeCustomers) || 0,
    activeLeads,
    newLeads30d: Number(d.newLeads) || 0,
  };
}

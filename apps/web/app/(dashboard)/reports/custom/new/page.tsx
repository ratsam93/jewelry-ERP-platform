'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { Play, Plus, Save, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatServerError } from '@/lib/manufacturing-forms';
import { CustomReportResultTable, type CustomReportRunResult as RunResult } from '@/features/reporting/CustomReportResultTable';
import {
  OPERATOR_LABELS,
  buildReportRequest,
  needsValue,
  operatorsForType,
  toSavedReportInput,
  validateBuilder,
  validateReportName,
  type BuilderFilter,
  type BuilderSort,
  type EntityDef,
  type FilterOperator,
} from '@/lib/custom-report';

export default function NewCustomReportPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const entitiesQ = trpc.reporting.getSupportedEntities.useQuery();
  const entities = (Array.isArray(entitiesQ.data) ? entitiesQ.data : []) as unknown as EntityDef[];

  const [entityType, setEntityType] = React.useState('');
  const [columns, setColumns] = React.useState<string[]>([]);
  const [filters, setFilters] = React.useState<BuilderFilter[]>([]);
  const [sort, setSort] = React.useState<BuilderSort | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [errors, setErrors] = React.useState<string[]>([]);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [running, setRunning] = React.useState(false);

  // Default to the first entity once they load.
  React.useEffect(() => {
    if (!entityType && entities.length > 0) setEntityType(entities[0]!.name);
  }, [entities, entityType]);

  const entity = entities.find((e) => e.name === entityType);
  const fields = entity?.fields ?? [];
  const filterable = fields.filter((f) => f.filterable);
  const sortable = fields.filter((f) => f.sortable);

  const save = trpc.reporting.createSavedReport.useMutation({
    onSuccess: (saved) => {
      void utils.reporting.listSavedReports.invalidate();
      router.push(`/reports/custom/${(saved as { id: string }).id}`);
    },
  });

  const changeEntity = (next: string) => {
    setEntityType(next);
    setColumns([]);
    setFilters([]);
    setSort(null);
    setResult(null);
    setErrors([]);
    setRunError(null);
  };

  const toggleColumn = (col: string) =>
    setColumns((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));

  const addFilter = () => {
    const first = filterable[0];
    if (!first) return;
    setFilters((prev) => [...prev, { field: first.name, operator: operatorsForType(first.type)[0]!, value: '' }]);
  };
  const updateFilter = (i: number, patch: Partial<BuilderFilter>) =>
    setFilters((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const state = { entityType, columns, filters, sort };

  const run = async () => {
    const problems = validateBuilder(state, entity);
    setErrors(problems);
    setRunError(null);
    if (problems.length > 0) return;
    setRunning(true);
    try {
      const data = await utils.reporting.executeCustomReport.fetch(buildReportRequest(state, entity) as never);
      setResult(data as unknown as RunResult);
    } catch (err) {
      setResult(null);
      setRunError(formatServerError(err));
    } finally {
      setRunning(false);
    }
  };

  const doSave = () => {
    const problems = validateBuilder(state, entity);
    const nameProblem = validateReportName(name);
    if (nameProblem) problems.push(nameProblem);
    setErrors(problems);
    if (problems.length > 0) return;
    save.mutate(toSavedReportInput(name, description, buildReportRequest(state, entity)) as never);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Custom Report"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Custom', href: '/reports/custom' },
          { label: 'New' },
        ]}
      />

      {entitiesQ.isError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load data sources: {formatServerError(entitiesQ.error)}
        </div>
      ) : (
        <div className="max-w-4xl space-y-6">
          <div className="space-y-2">
            <label htmlFor="cr-entity" className="text-sm font-medium">Data source</label>
            <select
              id="cr-entity"
              value={entityType}
              onChange={(e) => changeEntity(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {entities.map((e) => (
                <option key={e.name} value={e.name}>{e.label}</option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Columns</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <label key={f.name} className="flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  <input type="checkbox" checked={columns.includes(f.name)} onChange={() => toggleColumn(f.name)} />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Filters</span>
              <button type="button" onClick={addFilter} className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="h-4 w-4" /> Add filter
              </button>
            </div>
            {filters.map((f, i) => {
              const field = fields.find((x) => x.name === f.field);
              const ops = operatorsForType(field?.type ?? 'string');
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Filter ${i + 1} field`}
                    value={f.field}
                    onChange={(e) => {
                      const nextField = fields.find((x) => x.name === e.target.value);
                      updateFilter(i, { field: e.target.value, operator: operatorsForType(nextField?.type ?? 'string')[0]!, value: '' });
                    }}
                    className="rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {filterable.map((x) => (
                      <option key={x.name} value={x.name}>{x.label}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Filter ${i + 1} operator`}
                    value={f.operator}
                    onChange={(e) => updateFilter(i, { operator: e.target.value as FilterOperator })}
                    className="rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                  {needsValue(f.operator) && (
                    <input
                      aria-label={`Filter ${i + 1} value`}
                      type={field?.type === 'date' && f.operator !== 'between' && f.operator !== 'in' ? 'date' : 'text'}
                      value={f.value}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                      placeholder={f.operator === 'between' ? 'e.g. 100, 500' : 'Value'}
                      className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm"
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Remove filter ${i + 1}`}
                    onClick={() => setFilters((prev) => prev.filter((_, idx) => idx !== i))}
                    className="inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="cr-sort" className="text-sm font-medium">Sort by</label>
              <select
                id="cr-sort"
                value={sort?.field ?? ''}
                onChange={(e) => setSort(e.target.value ? { field: e.target.value, order: sort?.order ?? 'asc' } : null)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">(default order)</option>
                {sortable.map((f) => (
                  <option key={f.name} value={f.name}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="cr-order" className="text-sm font-medium">Direction</label>
              <select
                id="cr-order"
                disabled={!sort}
                value={sort?.order ?? 'asc'}
                onChange={(e) => sort && setSort({ ...sort, order: e.target.value as 'asc' | 'desc' })}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={() => void run()}
              disabled={running}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> {running ? 'Running...' : 'Run'}
            </button>
            <div className="min-w-[14rem] flex-1 space-y-1">
              <label htmlFor="cr-name" className="text-sm font-medium">Report name</label>
              <input
                id="cr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={255}
                placeholder="e.g. High value sales"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="min-w-[14rem] flex-1 space-y-1">
              <label htmlFor="cr-desc" className="text-sm font-medium">Description (optional)</label>
              <input
                id="cr-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={doSave}
              disabled={save.isPending}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {save.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="list-disc space-y-1 rounded-md border border-red-200 bg-red-50 p-3 pl-7 text-sm text-red-800">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {(runError || save.error) && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {runError ?? formatServerError(save.error)}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Preview ({result.rowCount} row{result.rowCount === 1 ? '' : 's'}, first 50 shown at most)
          </h2>
          <CustomReportResultTable result={result} />
        </div>
      )}
    </div>
  );
}

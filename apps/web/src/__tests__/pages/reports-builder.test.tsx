import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// The shared UI mock's PageHeader drops `actions`; render them here so header buttons are testable.
vi.mock('@caratflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <div>
        <h1>{title}</h1>
        {actions}
      </div>
    ),
  };
});

describe('Report builder entry points', () => {
  it('/reports/custom has a New Report link to the builder', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/reports/custom/page');
    render(<Page />);
    const link = screen.getByText('New Report').closest('a');
    expect(link).toHaveAttribute('href', '/reports/custom/new');
  });

  it('/reports/custom/new renders the builder (not the [id] error page)', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/reports/custom/new/page');
    render(<Page />);
    expect(screen.getByText('New Custom Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
  });

  it('/reports/scheduled has a New Schedule link', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/reports/scheduled/page');
    render(<Page />);
    expect(screen.getByText('New Schedule').closest('a')).toHaveAttribute('href', '/reports/scheduled/new');
  });

  it('/reports/scheduled/new renders the schedule form', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/reports/scheduled/new/page');
    render(<Page />);
    expect(screen.getByText('New Scheduled Report')).toBeInTheDocument();
    expect(screen.getByLabelText('Recipients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save schedule/ })).toBeInTheDocument();
  });

  it('a non-UUID custom report id does not crash', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/reports/custom/[id]/page');
    expect(() => render(<Page />)).not.toThrow();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// HK-RET-01: picking a customer must clear the stale "Select a customer." error.
vi.mock('@/features/retail/RetailFormParts', async () => {
  const actual = await vi.importActual<typeof import('@/features/retail/RetailFormParts')>('@/features/retail/RetailFormParts');
  return {
    ...actual,
    CustomerPicker: ({ value, onChange }: { value: { name: string } | null; onChange: (c: { id: string; name: string } | null) => void }) =>
      value ? (
        <span>{value.name}</span>
      ) : (
        <button type="button" onClick={() => onChange({ id: '6ecfac52-f967-41a6-a76c-1abd8712078e', name: 'Priya Sharma' })}>
          pick-priya
        </button>
      ),
  };
});

describe.each([
  ['custom order', '../../../app/(dashboard)/retail/custom-orders/new/page', /Create order/i],
  ['repair', '../../../app/(dashboard)/retail/repairs/new/page', /Create|Receive|Save/i],
])('%s form customer validation', (_name, path, submit) => {
  it('shows the error on empty submit and clears it after a customer is picked', async () => {
    const { default: Page } = await import(/* @vite-ignore */ path as string);
    render(<Page />);
    fireEvent.click(screen.getAllByRole('button', { name: submit }).find((b) => (b as HTMLButtonElement).type === 'submit')!);
    expect(await screen.findByText('Select a customer.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick-priya'));
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.queryByText('Select a customer.')).not.toBeInTheDocument();
  });
});

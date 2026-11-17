import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchaseOrderForm } from '@/features/wholesale/PurchaseOrderForm';
import { ConsignmentCreateForm } from '@/features/wholesale/ConsignmentCreateForm';

vi.mock('@caratflow/ui', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <div>
        <h1>{title}</h1>
        {actions}
      </div>
    ),
  };
});

const SUP = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const PROD = '33333333-3333-4333-8333-333333333333';

const suppliers = [{ id: SUP, label: 'Rajhans Gold Traders' }];
const locations = [{ id: LOC, label: 'Main Showroom (SHOWROOM)' }];
const products = [{ id: PROD, label: 'Gold Chain (SKU-1)' }];

describe('PurchaseOrderForm with real options', () => {
  const onSubmit = vi.fn();
  beforeEach(() => onSubmit.mockClear());

  it('submits real GUIDs and integer paise/mg, and shows live totals', () => {
    render(
      <PurchaseOrderForm suppliers={suppliers} locations={locations} products={products} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Supplier *'), { target: { value: SUP } });
    fireEvent.change(screen.getByLabelText('Delivery Location *'), { target: { value: LOC } });
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: PROD } });
    // picking a product fills the description
    expect((screen.getByLabelText('Description 1') as HTMLInputElement).value).toBe('Gold Chain (SKU-1)');
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Unit price 1'), { target: { value: '5924' } });
    expect(screen.getAllByText('₹88,860.00').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'QA-HK po verification' } });
    fireEvent.click(screen.getByText('Create Purchase Order'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      supplierId: SUP,
      locationId: LOC,
      notes: 'QA-HK po verification',
      items: [{ productId: PROD, quantity: 15, unitPricePaise: 592400 }],
    });
  });

  it('blocks submit with a field error for a bad unit price and shows server errors', () => {
    render(
      <PurchaseOrderForm suppliers={suppliers} locations={locations} products={[]} error="supplierId: Invalid GUID" onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Supplier *'), { target: { value: SUP } });
    fireEvent.change(screen.getByLabelText('Delivery Location *'), { target: { value: LOC } });
    fireEvent.change(screen.getByLabelText('Description 1'), { target: { value: 'Custom' } });
    fireEvent.change(screen.getByLabelText('Unit price 1'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('Create Purchase Order'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/unit price in rupees/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('supplierId: Invalid GUID');
  });

  it('does not offer the old hard-coded supplier ids', () => {
    render(<PurchaseOrderForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.queryByText('ABC Gold Refinery')).toBeNull();
  });
});

describe('ConsignmentCreateForm', () => {
  it('submits a ConsignmentOut payload with customerId', () => {
    const onSubmit = vi.fn();
    render(
      <ConsignmentCreateForm
        direction="out"
        parties={[{ id: SUP, label: 'Asha Rao' }]}
        locations={locations}
        products={products}
        cancelHref="/wholesale/consignments-out"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Customer'), { target: { value: SUP } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: LOC } });
    fireEvent.change(screen.getByLabelText('Product 1'), { target: { value: PROD } });
    fireEvent.change(screen.getByLabelText('Weight 1'), { target: { value: '10.25' } });
    fireEvent.change(screen.getByLabelText('Value 1'), { target: { value: '45000' } });
    fireEvent.click(screen.getByText('Create consignment'));
    expect(onSubmit).toHaveBeenCalledWith({
      customerId: SUP,
      locationId: LOC,
      items: [{ productId: PROD, quantity: 1, weightMg: 10250, valuePaise: 4500000 }],
    });
  });

  it('shows validation errors and server error', () => {
    const onSubmit = vi.fn();
    render(
      <ConsignmentCreateForm direction="in" parties={[]} locations={[]} products={[]} error="Supplier not found" cancelHref="/x" onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByText('Record consignment'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Select a supplier')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Supplier not found');
  });
});

describe('create / edit pages link up', () => {
  it('agents list Add Agent is a link to /wholesale/agents/new', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/wholesale/agents/page');
    render(<Page />);
    expect(screen.getByText('Add Agent').closest('a')).toHaveAttribute('href', '/wholesale/agents/new');
  });
  it('consignment list buttons are links to their create pages', async () => {
    const InPage = (await import('../../../app/(dashboard)/wholesale/consignments-in/page')).default;
    const { unmount } = render(<InPage />);
    expect(screen.getByText('Record Consignment').closest('a')).toHaveAttribute('href', '/wholesale/consignments-in/new');
    unmount();
    const OutPage = (await import('../../../app/(dashboard)/wholesale/consignments-out/page')).default;
    render(<OutPage />);
    expect(screen.getByText('New Consignment').closest('a')).toHaveAttribute('href', '/wholesale/consignments-out/new');
  });
  it('new agent page validates and shows form', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/wholesale/agents/new/page');
    render(<Page />);
    fireEvent.click(screen.getByText('Create agent'));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a percentage like 2.5')).toBeInTheDocument();
  });
});

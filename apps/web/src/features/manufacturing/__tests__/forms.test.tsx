import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BomForm } from '../bom-form';
import { JobStatusActions } from '../job-status-actions';
import { KarigarForm } from '../karigar-form';

const PRODUCT = '3f2b6c1e-8a44-4d0e-9a52-6a1d2f7c9b10';

describe('BomForm', () => {
  it('shows validation messages on empty submit and does not call onSubmit', () => {
    const onSubmit = vi.fn();
    render(<BomForm products={[]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create BOM' }));
    expect(screen.getByText('BOM name is required')).toBeInTheDocument();
    expect(screen.getByText('Select a product')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits integer paise / mg / bps and updates the estimate live', () => {
    const onSubmit = vi.fn();
    render(<BomForm products={[{ id: PRODUCT, name: '22K Gold Ring A1' }]} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/BOM name/), { target: { value: 'Ring BOM' } });
    fireEvent.change(document.getElementById('bom-product') as HTMLSelectElement, { target: { value: PRODUCT } });
    fireEvent.change(screen.getByLabelText('Metal 1 weight (g)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Metal 1 rate per gram'), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('Metal 1 wastage %'), { target: { value: '2' } });
    expect(screen.getByTestId('bom-estimate').textContent).toContain('61,200.00');
    fireEvent.click(screen.getByRole('button', { name: 'Create BOM' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.productId).toBe(PRODUCT);
    expect(payload.estimatedCostPaise).toBe(6120000);
    expect(payload.items[0]).toMatchObject({ weightMg: 10000, wastagePercent: 200 });
  });

  it('displays a server error', () => {
    render(<BomForm products={[]} onSubmit={vi.fn()} serverError="Product is not valid" />);
    expect(screen.getByRole('alert').textContent).toBe('Product is not valid');
  });
});

describe('JobStatusActions', () => {
  it('offers only the allowed transitions and confirms before calling', () => {
    const onTransition = vi.fn();
    render(<JobStatusActions status="DRAFT" onTransition={onTransition} />);
    expect(screen.getByRole('button', { name: 'Mark as planned' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete job' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as planned' }));
    expect(onTransition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onTransition).toHaveBeenCalledWith('PLANNED', undefined);
  });

  it('lets the user back out and shows server errors', () => {
    const onTransition = vi.fn();
    render(<JobStatusActions status="IN_PROGRESS" onTransition={onTransition} error="Cannot transition" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current status' }));
    expect(onTransition).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Cannot transition');
  });

  it('has no actions for a completed job', () => {
    render(<JobStatusActions status="COMPLETED" onTransition={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('KarigarForm', () => {
  it('validates then submits wage in paise', () => {
    const onSubmit = vi.fn();
    render(<KarigarForm locations={[{ id: PRODUCT, label: 'Workshop' }]} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create karigar' }));
    expect(screen.getByText('Employee code is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Employee code/), { target: { value: 'KAR-009' } });
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: 'Anil' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Verma' } });
    fireEvent.change(screen.getByLabelText(/Location/), { target: { value: PRODUCT } });
    fireEvent.change(screen.getByLabelText(/Daily wage/), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create karigar' }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ employeeCode: 'KAR-009', dailyWagePaise: 90000, locationId: PRODUCT });
  });
});

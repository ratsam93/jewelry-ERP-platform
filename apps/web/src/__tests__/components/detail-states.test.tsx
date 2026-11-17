import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  DetailLoading,
  DetailNotFound,
  DetailError,
  renderDetailState,
} from '@/components/detail-states';

describe('DetailLoading', () => {
  it('renders a status region with the default label', () => {
    render(<DetailLoading />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading...');
  });

  it('renders a custom label', () => {
    render(<DetailLoading label="Loading customer..." />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading customer...');
  });
});

describe('DetailNotFound', () => {
  it('renders the entity heading, helper text and back link', () => {
    render(<DetailNotFound entity="Customer" backHref="/crm/customers" />);
    expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted or the link is wrong.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Back to list' });
    expect(link).toHaveAttribute('href', '/crm/customers');
  });

  it('falls back to "Record not found" and uses a custom back label', () => {
    render(<DetailNotFound backHref="/admin/x" backLabel="Back to orders" />);
    expect(screen.getByRole('heading', { name: 'Record not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to orders' })).toHaveAttribute('href', '/admin/x');
  });
});

describe('DetailError', () => {
  it('renders an alert with the given message', () => {
    render(<DetailError message="Network down" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Network down');
  });

  it('renders a friendly default message when none is given', () => {
    render(<DetailError />);
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load this record. Please try again.');
  });

  it('calls onRetry when Retry is clicked', () => {
    const onRetry = vi.fn();
    render(<DetailError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides Retry and the back link when not provided', () => {
    render(<DetailError />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders a back link when backHref is given', () => {
    render(<DetailError backHref="/finance/invoices" />);
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/finance/invoices');
  });
});

describe('renderDetailState', () => {
  const base = { backHref: '/crm/customers', entity: 'Customer' };

  it('returns a loading state while loading', () => {
    render(<>{renderDetailState({ ...base, isLoading: true, error: null, data: undefined })}</>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  });

  it('returns a not-found state for a tRPC NOT_FOUND error', () => {
    render(
      <>
        {renderDetailState({
          ...base,
          isLoading: false,
          error: { message: 'anything', data: { code: 'NOT_FOUND' } },
          data: undefined,
        })}
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
  });

  it('returns a not-found state when the error message contains "not found" (case-insensitive)', () => {
    render(
      <>
        {renderDetailState({
          ...base,
          isLoading: false,
          error: new Error('Customer Not Found'),
          data: undefined,
        })}
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
  });

  it('returns a not-found state when loading finished with null or undefined data', () => {
    const { unmount } = render(
      <>{renderDetailState({ ...base, isLoading: false, error: null, data: null })}</>,
    );
    expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
    unmount();

    render(<>{renderDetailState({ ...base, isLoading: false, error: null, data: undefined })}</>);
    expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
  });

  it('returns an error state with the message and a working retry for other errors', () => {
    const onRetry = vi.fn();
    render(
      <>
        {renderDetailState({
          ...base,
          isLoading: false,
          error: { message: 'Database timeout', data: { code: 'INTERNAL_SERVER_ERROR' } },
          data: undefined,
          onRetry,
        })}
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Database timeout');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/crm/customers');
  });

  it('omits a multi-line error message (never shows raw stack text)', () => {
    render(
      <>
        {renderDetailState({
          ...base,
          isLoading: false,
          error: new Error('Boom\n    at foo (bar.ts:1:1)'),
          data: {},
        })}
      </>,
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('at foo');
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load this record. Please try again.');
  });

  it('returns null when data is present', () => {
    const { container } = render(
      <>{renderDetailState({ ...base, isLoading: false, error: null, data: { id: '1' } })}</>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

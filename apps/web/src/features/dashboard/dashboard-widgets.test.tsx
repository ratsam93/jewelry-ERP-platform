import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentSalesWidget, saleCustomerName } from './DashboardWidgets';

describe('saleCustomerName', () => {
  it('reads customerName, a nested customer object or string', () => {
    expect(saleCustomerName({ customerName: ' Asha Mehta ' })).toBe('Asha Mehta');
    expect(saleCustomerName({ customer: { firstName: 'Ravi', lastName: 'Shah' } })).toBe('Ravi Shah');
    expect(saleCustomerName({ customer: { name: 'Meera Jewels' } })).toBe('Meera Jewels');
    expect(saleCustomerName({ customer: 'Kiran Patel' })).toBe('Kiran Patel');
  });
  it('returns null when the response carries no name', () => {
    expect(saleCustomerName({})).toBeNull();
    expect(saleCustomerName({ customerName: '', customer: { firstName: '', lastName: '' } })).toBeNull();
  });
});

describe('RecentSalesWidget customer column', () => {
  const base = { totalPaise: 100000, createdAt: new Date().toISOString() };
  it('shows the real name, Walk-in for no customer', () => {
    render(
      <RecentSalesWidget
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        sales={[
          { id: '1', saleNumber: 'S-1', customerId: 'c1', customerName: 'Asha Mehta', ...base },
          { id: '2', saleNumber: 'S-2', customerId: null, ...base },
        ]}
      />,
    );
    expect(screen.getByText('Asha Mehta')).toBeInTheDocument();
    expect(screen.getByText('Walk-in')).toBeInTheDocument();
  });
  it('falls back to Customer only while the name lookup has no data', () => {
    render(
      <RecentSalesWidget
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        sales={[{ id: '1', saleNumber: 'S-1', customerId: 'c1', ...base }]}
      />,
    );
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });
});

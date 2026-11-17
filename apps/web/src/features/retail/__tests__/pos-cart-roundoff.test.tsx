import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PosCart } from '../PosCart';

const props = {
  items: [],
  onUpdateQuantity: () => undefined,
  onRemoveItem: () => undefined,
  subtotalPaise: 17947100,
  discountPaise: 0,
  taxPaise: 538414,
  totalPaise: 18485500,
};

describe('PosCart round off', () => {
  it('shows a signed Round off row when the total was rounded', () => {
    render(<PosCart {...props} roundOffPaise={-14} />);
    expect(screen.getByText('Round off')).toBeTruthy();
    expect(screen.getByText('-₹0.14')).toBeTruthy();
    expect(screen.getByText('₹1,84,855.00')).toBeTruthy();
  });
  it('hides the row when there is nothing to round', () => {
    render(<PosCart {...props} roundOffPaise={0} />);
    expect(screen.queryByText('Round off')).toBeNull();
  });
});

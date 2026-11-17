import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePicker } from '../DateRangePicker';

const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms);

afterEach(() => {
  vi.useRealTimers();
});

describe('DateRangePicker', () => {
  it('shows the local calendar day of from/to (no UTC shift)', () => {
    render(<DateRangePicker from={local(2026, 11, 1)} to={local(2026, 11, 17, 23, 59, 59, 999)} onChange={vi.fn()} />);
    expect((screen.getByLabelText('From date') as HTMLInputElement).value).toBe('2026-11-01');
    expect((screen.getByLabelText('To date') as HTMLInputElement).value).toBe('2026-11-17');
  });

  it('emits start of the from-day and end of the to-day for valid input', () => {
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 1)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-20' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [from, to] = onChange.mock.calls[0] as [Date, Date];
    expect(from.getTime()).toBe(local(2026, 11, 1).getTime());
    expect(to.getTime()).toBe(local(2026, 11, 20, 23, 59, 59, 999).getTime());
  });

  it('rejects end before start: shows the message and does not query', () => {
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 10)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-05' } });
    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after start date');
    expect(onChange).not.toHaveBeenCalled();
    // fixing the date clears the error and commits
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-12' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('allows the same day for both bounds', () => {
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 10)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-10' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a cleared input without querying or erroring', () => {
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 10)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Last 7 Days preset is 7 days inclusive in the local calendar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(local(2026, 11, 17, 15, 30));
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 1)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.click(screen.getByText('Presets'));
    fireEvent.click(screen.getByText('Last 7 Days'));
    const [from, to] = onChange.mock.calls[0] as [Date, Date];
    expect(from.getTime()).toBe(local(2026, 11, 11).getTime());
    expect(to.getTime()).toBe(local(2026, 11, 17, 23, 59, 59, 999).getTime());
  });

  it('Last Month preset covers the whole previous month', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(local(2026, 11, 17, 15, 30));
    const onChange = vi.fn();
    render(<DateRangePicker from={local(2026, 11, 1)} to={local(2026, 11, 17)} onChange={onChange} />);
    fireEvent.click(screen.getByText('Presets'));
    fireEvent.click(screen.getByText('Last Month'));
    const [from, to] = onChange.mock.calls[0] as [Date, Date];
    expect(from.getTime()).toBe(local(2026, 10, 1).getTime());
    expect(to.getTime()).toBe(local(2026, 10, 31, 23, 59, 59, 999).getTime());
  });
});

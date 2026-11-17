import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ConfirmModal,
} from '../modal';

describe('Dialog', () => {
  it('renders content when open', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Title</DialogTitle>
            <DialogDescription>Test description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(
      <Dialog open={false} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hidden Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByText('Hidden Title')).not.toBeInTheDocument();
  });

  it('renders close button with accessible text', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('calls onOpenChange when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={handleChange}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const closeButton = screen.getByText('Close').closest('button')!;
    await user.click(closeButton);
    expect(handleChange).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmModal', () => {
  it('renders title, description, confirm, and cancel buttons', () => {
    render(
      <ConfirmModal
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        description="This action cannot be undone."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('Delete Item?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm?"
        description="Are you sure?"
        onConfirm={handleConfirm}
      />,
    );

    await user.click(screen.getByText('Confirm'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Dialog accessibility', () => {
  it('links DialogDescription to the dialog via aria-describedby', () => {
    render(
      <ConfirmModal
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item?"
        description="This action cannot be undone."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete Item?');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('This action cannot be undone.');
  });

  it('uses the description prop as a visually hidden accessible description', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent description="Enter the stock movement details">
          <DialogTitle>Stock movement</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleDescription('Enter the stock movement details');
    expect(screen.getByText('Enter the stock movement details')).toHaveClass('sr-only');
  });

  it('links a DialogDescription placed inside DialogContent', () => {
    render(
      <Dialog open={true} onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer</DialogTitle>
            <DialogDescription>Move stock between locations</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Move stock between locations');
  });

  it('does not warn about a missing description when there is nothing to describe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <Dialog open={true} onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogTitle>Title only</DialogTitle>
          </DialogContent>
        </Dialog>,
      );
      const descriptionWarnings = warn.mock.calls.filter((args) =>
        String(args[0]).includes('Missing `Description`'),
      );
      expect(descriptionWarnings).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});

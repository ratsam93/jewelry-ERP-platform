import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { bannerUpdate, collectionUpdate, pageUpdate, bannerCreate } = vi.hoisted(() => ({
  bannerUpdate: vi.fn().mockResolvedValue({}),
  collectionUpdate: vi.fn().mockResolvedValue({}),
  pageUpdate: vi.fn().mockResolvedValue({}),
  bannerCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/trpc', () => {
  const mut = (fn: unknown) => ({ useMutation: () => ({ mutateAsync: fn, isPending: false }) });
  return {
    trpc: {
      cms: {
        banners: { create: mut(bannerCreate), update: mut(bannerUpdate) },
        pages: { create: mut(vi.fn()), update: mut(pageUpdate) },
        blog: { create: mut(vi.fn()), update: mut(vi.fn()) },
        collections: { create: mut(vi.fn()), update: mut(collectionUpdate) },
        faq: { create: mut(vi.fn()), update: mut(vi.fn()) },
      },
    },
  };
});

import { BannerFormDialog, PageFormDialog, CollectionFormDialog } from '../CmsFormDialogs';
import { useCmsDelete, CmsRowActions } from '../useCmsDelete';

const banner = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Diwali', subtitle: 'Sale', imageUrl: 'https://cdn.x.com/a.jpg',
  linkUrl: '/shop', linkType: 'EXTERNAL', position: 'HERO', targetAudience: 'ALL', displayOrder: 3,
  startDate: '2026-11-01T00:00:00.000Z', endDate: null, isActive: true,
};

beforeEach(() => { bannerUpdate.mockClear(); collectionUpdate.mockClear(); pageUpdate.mockClear(); bannerCreate.mockClear(); });

describe('edit dialogs send partial updates', () => {
  it('banner: prefilled; only the changed field is sent', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<BannerFormDialog banner={banner} onClose={vi.fn()} onSaved={onSaved} />);
    const title = screen.getByDisplayValue('Diwali');
    expect(screen.getByDisplayValue('/shop')).toBeInTheDocument();
    await user.clear(title);
    await user.type(title, 'Diwali 2026');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bannerUpdate).toHaveBeenCalled());
    expect(bannerUpdate).toHaveBeenCalledWith({ id: banner.id, data: { title: 'Diwali 2026' } });
    expect(bannerCreate).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it('collection: never resets the product list', async () => {
    const user = userEvent.setup();
    const c = { id: '22222222-2222-4222-8222-222222222222', name: 'Bridal', slug: 'bridal', description: 'x', products: ['a', 'b'], displayOrder: 0, isActive: true, isFeatured: false };
    render(<CollectionFormDialog collection={c} onClose={vi.fn()} onSaved={vi.fn()} />);
    const name = screen.getByDisplayValue('Bridal');
    await user.clear(name);
    await user.type(name, 'Bridal Rings');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(collectionUpdate).toHaveBeenCalled());
    expect(collectionUpdate.mock.calls[0][0]).toEqual({ id: c.id, data: { name: 'Bridal Rings' } });
  });

  it('page: clearing meta description sends an empty string, other fields untouched', async () => {
    const user = userEvent.setup();
    const p = { id: '33333333-3333-4333-8333-333333333333', title: 'About', slug: 'about', content: 'Hi', metaDescription: 'old', isPublished: true };
    render(<PageFormDialog page={p} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.clear(screen.getByDisplayValue('old'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(pageUpdate).toHaveBeenCalled());
    expect(pageUpdate.mock.calls[0][0]).toEqual({ id: p.id, data: { metaDescription: '' } });
  });
});

describe('useCmsDelete', () => {
  function Harness({ remove }: { remove: (id: string) => Promise<unknown> }) {
    const del = useCmsDelete({ noun: 'banner', remove, onDone: vi.fn() });
    return (
      <>
        <CmsRowActions name="Diwali" onEdit={vi.fn()} onDelete={() => del.ask('b1', 'Diwali')} />
        {del.dialog}
      </>
    );
  }

  it('asks in-app (no window.confirm) and deletes on confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const remove = vi.fn().mockResolvedValue(undefined);
    render(<Harness remove={remove} />);
    await user.click(screen.getByRole('button', { name: 'Delete Diwali' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete banner?');
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('b1'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

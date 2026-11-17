import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../page-header';
import { Sidebar } from '../sidebar';
import { LinkProvider, type RenderLink } from '../link-context';

const renderLink: RenderLink = ({ href, children, className }) => (
  <a href={`/admin${href}`} className={className} data-testid="custom-link">
    {children}
  </a>
);

describe('link context', () => {
  it('PageHeader breadcrumbs render plain anchors by default', () => {
    render(
      <PageHeader
        title="Stock Overview"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Stock Overview' }]}
      />,
    );
    const link = screen.getByText('Dashboard').closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByTestId('custom-link')).not.toBeInTheDocument();
  });

  it('PageHeader breadcrumbs use the LinkProvider renderLink', () => {
    render(
      <LinkProvider renderLink={renderLink}>
        <PageHeader
          title="Stock Overview"
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Stock Overview' }]}
        />
      </LinkProvider>,
    );
    const link = screen.getByTestId('custom-link');
    expect(link).toHaveAttribute('href', '/admin/dashboard');
    expect(link).toHaveTextContent('Dashboard');
  });

  it('explicit renderLink prop wins over LinkProvider', () => {
    const explicit = vi.fn<Parameters<RenderLink>, ReturnType<RenderLink>>(({ href, children }) => (
      <span data-testid="explicit" data-href={href}>{children}</span>
    ));
    render(
      <LinkProvider renderLink={renderLink}>
        <PageHeader
          title="T"
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }]}
          renderLink={explicit}
        />
      </LinkProvider>,
    );
    expect(screen.getByTestId('explicit')).toHaveAttribute('data-href', '/dashboard');
    expect(screen.queryByTestId('custom-link')).not.toBeInTheDocument();
  });

  it('Sidebar items use the LinkProvider renderLink', () => {
    render(
      <LinkProvider renderLink={renderLink}>
        <Sidebar collapsed={false} onToggle={vi.fn()} />
      </LinkProvider>,
    );
    const dashboard = screen.getByTestId('custom-link');
    expect(dashboard).toHaveAttribute('href', '/admin/dashboard');
    expect(dashboard).toHaveTextContent('Dashboard');
  });

  it('Sidebar without provider renders plain anchors', () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByTestId('custom-link')).not.toBeInTheDocument();
  });
});

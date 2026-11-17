import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The page you are looking for does not exist or has moved. Sign in to continue, or head back to your dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to login
        </Link>
      </div>
    </main>
  );
}

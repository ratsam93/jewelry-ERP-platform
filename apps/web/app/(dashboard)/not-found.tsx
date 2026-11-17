'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Compass } from 'lucide-react';
import { useDocumentTitle } from '@/lib/use-document-title';

export default function DashboardNotFound() {
  const pathname = usePathname();
  const router = useRouter();
  useDocumentTitle('Page not found');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <Compass className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We could not find the page you were looking for. It may have been moved, or the link may be incorrect.
      </p>
      {pathname && (
        <p className="mt-3 rounded-md bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
          {pathname}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Back
        </button>
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Root route: the auth token lives in localStorage, so the decision is made on
// the client. Nothing is rendered while the redirect is pending.
function readAccessToken(): string | null {
  try {
    return window.localStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(readAccessToken() ? '/dashboard' : '/login');
  }, [router]);

  return null;
}

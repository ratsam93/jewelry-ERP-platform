'use client';

import { useEffect } from 'react';
import { BRAND_NAME } from './brand';

/** Sets `document.title` to "<title> | ${BRAND_NAME}" for client-only pages. Restores the previous title on unmount. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${BRAND_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

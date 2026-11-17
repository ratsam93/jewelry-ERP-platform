'use client';

import { useEffect } from 'react';

/** Sets `document.title` to "<title> | CaratFlow" for client-only pages. Restores the previous title on unmount. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | CaratFlow`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

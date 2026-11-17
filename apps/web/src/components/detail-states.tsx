'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Search } from 'lucide-react';

/**
 * Shared loading / not-found / error states for admin detail pages
 * (/admin/<module>/<thing>/[id]). Use `renderDetailState` for the common case:
 *
 *   const state = renderDetailState({ isLoading, error, data, entity: 'Customer', backHref: '/crm/customers', onRetry: refetch });
 *   if (state) return state;
 */

/** Minimal tRPC/Error shape: any Error, or a TRPCClientError with `data.code`. */
export interface DetailStateErrorLike {
  message?: string;
  data?: { code?: string | null } | null;
}

export interface DetailLoadingProps {
  label?: string;
}

export function DetailLoading({ label = 'Loading...' }: DetailLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border bg-card p-6 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export interface DetailNotFoundProps {
  entity?: string;
  backHref: string;
  backLabel?: string;
}

export function DetailNotFound({ entity, backHref, backLabel = 'Back to list' }: DetailNotFoundProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border bg-card p-8 text-center">
      <Search className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{`${entity ?? 'Record'} not found`}</h2>
      <p className="text-sm text-muted-foreground">It may have been deleted or the link is wrong.</p>
      <Link
        href={backHref}
        className="mt-2 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>
    </div>
  );
}

export interface DetailErrorProps {
  message?: string;
  onRetry?: () => void;
  backHref?: string;
}

const DEFAULT_ERROR_MESSAGE = 'We could not load this record. Please try again.';

export function DetailError({ message, onRetry, backHref }: DetailErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-md border border-red-200 bg-red-50 p-8 text-center text-red-800"
    >
      <AlertTriangle className="h-10 w-10" aria-hidden="true" />
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm">{message || DEFAULT_ERROR_MESSAGE}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        )}
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm hover:bg-red-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to list
          </Link>
        )}
      </div>
    </div>
  );
}

/** True when the error is a NOT_FOUND from tRPC or its message says "not found". */
export function isNotFoundError(error: DetailStateErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.data?.code === 'NOT_FOUND') return true;
  return typeof error.message === 'string' && /not found/i.test(error.message);
}

export interface RenderDetailStateArgs {
  isLoading: boolean;
  error?: DetailStateErrorLike | null;
  data: unknown;
  entity?: string;
  backHref: string;
  onRetry?: () => void;
}

/**
 * Returns the loading, not-found or error UI for a detail page, or `null` when
 * `data` is present and the page should render its content.
 */
export function renderDetailState({
  isLoading,
  error,
  data,
  entity,
  backHref,
  onRetry,
}: RenderDetailStateArgs): React.ReactNode {
  if (isLoading) return <DetailLoading />;
  if (error) {
    if (isNotFoundError(error)) {
      return <DetailNotFound entity={entity} backHref={backHref} />;
    }
    const message =
      typeof error.message === 'string' && error.message.length > 0 && !error.message.includes('\n')
        ? error.message
        : undefined;
    return <DetailError message={message} onRetry={onRetry} backHref={backHref} />;
  }
  if (data === null || data === undefined) {
    return <DetailNotFound entity={entity} backHref={backHref} />;
  }
  return null;
}

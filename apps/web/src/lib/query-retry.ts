/**
 * Retry policy for react-query queries. Client-side tRPC errors that will not
 * change on retry (NOT_FOUND, UNAUTHORIZED, FORBIDDEN, BAD_REQUEST) fail
 * immediately so detail pages show their not-found state without a long
 * "Loading..." delay. Other failures retry up to twice.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null | undefined)?.data?.code;
  if (code === 'NOT_FOUND' || code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'BAD_REQUEST') {
    return false;
  }
  return failureCount < 2;
}

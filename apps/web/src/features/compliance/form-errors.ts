/**
 * Turn a tRPC/Zod error message into readable text. Zod validation failures
 * reach the client as a JSON array of issues: [{ path: ['items', 0, 'productId'], message: '...' }].
 */
export function formatServerError(message: string | undefined | null): string {
  if (!message) return 'Something went wrong. Please try again.';
  const trimmed = message.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const issues = Array.isArray(parsed) ? parsed : [parsed];
      const lines = issues
        .map((i) => {
          const issue = i as { path?: Array<string | number>; message?: string };
          if (!issue || typeof issue.message !== 'string') return null;
          const path = (issue.path ?? [])
            .map((p) => (typeof p === 'number' ? `item ${p + 1}` : humanize(String(p))))
            .join(' › ');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .filter((l): l is string => Boolean(l));
      if (lines.length > 0) return lines.join('\n');
    } catch {
      /* fall through */
    }
  }
  return trimmed;
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ Id$/, ' ID').replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

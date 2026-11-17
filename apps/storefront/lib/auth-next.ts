// Safe post-login return path handling (`?next=/some/path`).

/** Returns the path only if it is a same-origin relative path; otherwise null. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let v = raw.trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    return null;
  }
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  if (v.includes("\\") || [...v].some((c) => c.charCodeAt(0) < 32)) return null;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  // Do not bounce back into the auth screens.
  if (v === "/auth" || v.startsWith("/auth/")) return null;
  return v;
}

/** Reads and validates `next` from the current window location (client only). */
export function nextFromWindow(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  } catch {
    return null;
  }
}

/** Appends `next` to an auth URL when it is a safe path. */
export function withNext(url: string, next: string | null): string {
  if (!next) return url;
  return `${url}${url.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}

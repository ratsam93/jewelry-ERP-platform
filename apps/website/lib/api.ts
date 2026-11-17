// Browser-side API helper. The marketing site is a static export, so forms
// call the CaratFlow API directly from the browser.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
export const TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "69544f8e-fa3c-40b4-8975-643825600ce7";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002").replace(/\/+$/, "");

export const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";

interface ApiBody {
  success?: boolean;
  error?: { message?: string };
  message?: string | string[];
}

/**
 * POST JSON to the API. Resolves with null on success, or a user-facing error
 * message on any failure (network error, non-2xx, or `success: false` body).
 */
export async function postJson(path: string, payload: unknown): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
      body: JSON.stringify(payload),
    });
    let body: ApiBody | null = null;
    try {
      body = (await res.json()) as ApiBody;
    } catch {
      body = null;
    }
    if (res.status === 429) return "Too many attempts. Please wait a minute and try again.";
    if (!res.ok) {
      const m = body?.message;
      return (Array.isArray(m) ? m[0] : m) || body?.error?.message || GENERIC_ERROR;
    }
    if (body && body.success === false) return body.error?.message || GENERIC_ERROR;
    return null;
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }
}

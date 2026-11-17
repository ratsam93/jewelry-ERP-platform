// ─── Storefront REST API helper ─────────────────────────────────
// Thin fetch wrapper that injects the B2C access token from
// localStorage (when present) and the tenant headers required by
// the public storefront endpoints.

import { API_BASE_URL, TENANT_ID } from "./constants";

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  message?: string;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("accessToken");
}

/** Fired on `window` after the customer signs in or out, so the store can re-sync. */
export const AUTH_CHANGE_EVENT = "cf-auth-change";

function notifyAuthChange(): void {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  } catch {
    // non-browser environment
  }
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("accessToken", accessToken);
  if (refreshToken) window.localStorage.setItem("refreshToken", refreshToken);
  notifyAuthChange();
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  notifyAuthChange();
}

export const SESSION_ID_KEY = "cf_session_id";

function newSessionId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // fall through
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let memorySessionId: string | null = null;

/**
 * Guest session id sent as `x-session-id` (guest cart) and `sessionId` (compare list).
 * Generated once and persisted in localStorage; falls back to an in-memory id when
 * storage is unavailable. Returns null on the server.
 */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id = memorySessionId ?? newSessionId();
    window.localStorage.setItem(SESSION_ID_KEY, id);
    memorySessionId = id;
    return id;
  } catch {
    if (!memorySessionId) memorySessionId = newSessionId();
    return memorySessionId;
  }
}

/** Forget the guest session id (memory + storage); the next getSessionId() mints a fresh one. */
export function resetSessionId(): void {
  memorySessionId = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_ID_KEY);
  } catch {
    // storage unavailable
  }
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  auth?: boolean; // default: true -- attach bearer token if present
  tenantHeaders?: boolean; // default: false -- attach x-tenant-id/session headers (for /store/*)
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (options.tenantHeaders) {
    headers["x-tenant-id"] = TENANT_ID;
    const sessionId = getSessionId();
    if (sessionId) headers["x-session-id"] = sessionId;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body or not json
  }

  if (!res.ok) {
    const body = json as { error?: { message?: string }; message?: string } | null;
    const msg = body?.error?.message || body?.message || `Request failed: ${res.status}`;
    throw new ApiError(res.status, msg, json);
  }

  const envelope = json as ApiEnvelope<T> | null;
  if (envelope && typeof envelope === "object" && "success" in envelope) {
    if (!envelope.success) {
      const msg = envelope.error?.message || envelope.message || "Request failed";
      throw new ApiError(res.status, msg, json);
    }
    return (envelope.data ?? (envelope as unknown as T)) as T;
  }
  return json as T;
}

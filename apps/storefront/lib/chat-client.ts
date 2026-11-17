// ─── Storefront Chat Client ─────────────────────────────────────
// The API generates the chat session id server-side (POST /chat/start ignores
// any client-supplied id), so the id returned by /start is the only valid one
// for /chat/message. Sending a client-made id yields 404 "Chat session not found".

import { STORE_API, TENANT_ID } from "@/lib/constants";

export const CHAT_STORAGE_KEY = "caratflow_chat_session";

export interface ChatSession {
  sessionId: string;
  messages: Array<Record<string, unknown>>;
}

export class ChatHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function headers(sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": TENANT_ID,
  };
  if (sessionId) h["x-session-id"] = sessionId;
  return h;
}

async function parse(res: Response) {
  let json: { data?: unknown; message?: string; error?: { message?: string } } = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    throw new ChatHttpError(res.status, json.error?.message ?? json.message ?? `Chat request failed (${res.status})`);
  }
  return json.data;
}

export function readStoredSession(): string {
  try {
    return localStorage.getItem(CHAT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeSession(id: string) {
  try {
    if (id) localStorage.setItem(CHAT_STORAGE_KEY, id);
    else localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

export async function startChat(): Promise<ChatSession> {
  const res = await fetch(`${STORE_API}/chat/start`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  const data = (await parse(res)) as ChatSession;
  if (!data?.sessionId) throw new ChatHttpError(500, "Chat session could not be created");
  storeSession(data.sessionId);
  return data;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  try {
    const res = await fetch(`${STORE_API}/chat/session/${encodeURIComponent(sessionId)}`, {
      headers: headers(sessionId),
    });
    return ((await parse(res)) as ChatSession) ?? null;
  } catch {
    return null; // guests get 401; unknown ids 404: caller starts a new session
  }
}

/**
 * Send a message. If the stored session is unknown/closed (404), start a fresh
 * session transparently and retry once. Returns the (possibly new) session id.
 */
export async function sendChatMessage(
  sessionId: string,
  content: string,
): Promise<{ sessionId: string; messages: Array<Record<string, unknown>> }> {
  const post = async (id: string) => {
    const res = await fetch(`${STORE_API}/chat/message`, {
      method: "POST",
      headers: headers(id),
      body: JSON.stringify({ sessionId: id, content }),
    });
    return (await parse(res)) as { messages: Array<Record<string, unknown>> };
  };
  let id = sessionId;
  try {
    if (!id) throw new ChatHttpError(404, "no session");
    const data = await post(id);
    return { sessionId: id, messages: data?.messages ?? [] };
  } catch (err) {
    if (!(err instanceof ChatHttpError) || err.status !== 404) throw err;
    id = (await startChat()).sessionId;
    const data = await post(id);
    return { sessionId: id, messages: data?.messages ?? [] };
  }
}

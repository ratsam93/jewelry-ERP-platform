const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side validation mirroring the API limits. Returns an error message or null. */
export function validateContact(f: { name: string; email: string; message: string }): string | null {
  const name = f.name.trim();
  const message = f.message.trim();
  if (!name) return "Enter your name.";
  if (name.length > 100) return "Name must be 100 characters or fewer.";
  if (!EMAIL_RE.test(f.email.trim())) return "Enter a valid email.";
  if (!message) return "Tell us how we can help.";
  if (message.length > 2000) return "Message must be 2000 characters or fewer.";
  return null;
}

export function contactErrorText(status: number, data: { error?: { message?: unknown }; message?: unknown } | null): string {
  if (status === 429) return "Please try again in a minute.";
  const raw = data?.error?.message ?? data?.message;
  const text = Array.isArray(raw) ? raw.join(", ") : typeof raw === "string" ? raw : "";
  if (status === 400 && text) return text;
  return text || "Could not send your message. Please try again.";
}


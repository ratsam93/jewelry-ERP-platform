// Preserves the consultation request form across the sign-in detour.

export const CONSULTATION_DRAFT_KEY = "cf_consultation_draft";
export const CONSULTATION_PATH = "/consultation/request";

export interface ConsultationDraft {
  selectedProducts: string[];
  lang: string;
  phone: string;
  preferredSlot: string;
  notes: string;
}

export function saveConsultationDraft(d: ConsultationDraft): void {
  try {
    window.sessionStorage.setItem(CONSULTATION_DRAFT_KEY, JSON.stringify(d));
  } catch {
    // storage unavailable
  }
}

export function loadConsultationDraft(): ConsultationDraft | null {
  try {
    const raw = window.sessionStorage.getItem(CONSULTATION_DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ConsultationDraft> | null;
    if (!p || typeof p !== "object") return null;
    return {
      selectedProducts: Array.isArray(p.selectedProducts)
        ? p.selectedProducts.filter((x): x is string => typeof x === "string")
        : [],
      lang: typeof p.lang === "string" ? p.lang : "en",
      phone: typeof p.phone === "string" ? p.phone : "",
      preferredSlot: typeof p.preferredSlot === "string" ? p.preferredSlot : "",
      notes: typeof p.notes === "string" ? p.notes : "",
    };
  } catch {
    return null;
  }
}

export function clearConsultationDraft(): void {
  try {
    window.sessionStorage.removeItem(CONSULTATION_DRAFT_KEY);
  } catch {
    // ignore
  }
}

export const consultationLoginHref = `/auth/login?next=${encodeURIComponent(CONSULTATION_PATH)}`;
export const consultationRegisterHref = `/auth/register?next=${encodeURIComponent(CONSULTATION_PATH)}`;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatPrice, formatRupees } from "@/lib/utils";
import { normalizeShippingAddress, summarizePayment } from "@/lib/order-view";
import { validateProfile } from "@/lib/profile-validation";
import { dedupeSpecLabels, mergeValues, normalizeLabel, specValue } from "@/lib/compare-rows";
import { sendChatMessage, startChat, ChatHttpError, readStoredSession } from "@/lib/chat-client";
import { COUNTRY_OPTIONS } from "@/lib/countries";

describe("HK-SF-05 price display: one integer-paise rule", () => {
  const UNIT = 27164973; // seeded 18K Gold Necklace C9
  it("shows paise when present so line total = unit x qty exactly", () => {
    expect(formatPrice(UNIT)).toBe("₹2,71,649.73");
    expect(formatPrice(UNIT * 2)).toBe("₹5,43,299.46");
    expect(formatPrice(UNIT * 3)).toBe("₹8,14,949.19");
    expect(formatRupees(UNIT / 100)).toBe("₹2,71,649.73");
    expect(formatRupees((UNIT * 2) / 100)).toBe("₹5,43,299.46");
  });
  it("keeps whole-rupee amounts without decimals", () => {
    expect(formatPrice(1000000)).toBe("₹10,000");
    expect(formatRupees(50000)).toBe("₹50,000");
  });
});

describe("HK-SF-02/10 order view", () => {
  it("reads the API's line1/line2/postalCode shape", () => {
    const v = normalizeShippingAddress({ firstName: "QA", lastName: "HK", phone: "9876543210", line1: "QA-HK 12 MG Road", line2: null, city: "Mumbai", state: "Maharashtra", country: "IN", postalCode: "400002" });
    expect(v).toMatchObject({ name: "QA HK", line1: "QA-HK 12 MG Road", line2: "", city: "Mumbai", pincode: "400002", country: "India", phone: "9876543210" });
  });
  it("still reads legacy addressLine1/pincode", () => {
    const v = normalizeShippingAddress({ fullName: "A B", addressLine1: "5 St", addressLine2: "Apt 2", pincode: "110001" });
    expect(v.line1).toBe("5 St");
    expect(v.line2).toBe("Apt 2");
    expect(v.pincode).toBe("110001");
  });
  it("summarises payment method and status", () => {
    expect(summarizePayment([{ method: "COD", status: "PENDING" }])).toEqual({ method: "Cash on Delivery", status: "Pending" });
    expect(summarizePayment([{ method: "razorpay", status: "CAPTURED" }])?.method).toBe("Online (Razorpay)");
    expect(summarizePayment([])).toBeNull();
  });
});

describe("HK-SF-04 profile validation", () => {
  const ok = { firstName: "Priya", lastName: "Sharma", email: "p@example.com", phone: "+91 98765 43210" };
  it("accepts a valid profile", () => expect(validateProfile(ok)).toEqual({}));
  it("requires first name", () => expect(validateProfile({ ...ok, firstName: "  " }).firstName).toMatch(/required/));
  it("rejects bad phone and email", () => {
    expect(validateProfile({ ...ok, phone: "abc" }).phone).toBeTruthy();
    expect(validateProfile({ ...ok, phone: "12345" }).phone).toBeTruthy();
    expect(validateProfile({ ...ok, email: "nope" }).email).toBeTruthy();
  });
  it("allows empty phone", () => expect(validateProfile({ ...ok, phone: "" })).toEqual({}));
});

describe("HK-SF-09 compare rows", () => {
  it("fixes label spacing", () => expect(normalizeLabel("Making Charges(Flat)")).toBe("Making Charges (Flat)"));
  it("drops spec rows duplicating built-ins", () => {
    expect(dedupeSpecLabels(["Occasion", "Finish", "occasion", "Making Charges(Flat)"], ["Occasion", "Making Charges"])).toEqual(["Finish", "Making Charges(Flat)"]);
  });
  it("merges values case-insensitively", () => {
    expect(mergeValues(["wedding", "daily"], "Daily Wear, Wedding")).toBe("wedding, daily, Daily Wear");
  });
  it("finds spec values regardless of spacing", () => {
    expect(specValue({ "Making Charges(Flat)": "5000" }, "Making Charges (Flat)")).toBe("5000");
  });
});

describe("countries", () => {
  it("lists India first with ISO codes", () => {
    expect(COUNTRY_OPTIONS[0]).toEqual({ code: "IN", name: "India" });
    expect(COUNTRY_OPTIONS.every((c) => /^[A-Z]{2}$/.test(c.code))).toBe(true);
  });
});

describe("HK-SF-03 chat client", () => {
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("startChat stores the server-issued session id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { success: true, data: { sessionId: "chat_abc", messages: [] } })));
    const s = await startChat();
    expect(s.sessionId).toBe("chat_abc");
    expect(readStoredSession()).toBe("chat_abc");
  });

  it("sends the message to /chat/message with tenant header and returns bot reply", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { success: true, data: { messages: [{ role: "ASSISTANT", content: "Hi" }] } }));
    vi.stubGlobal("fetch", f);
    const r = await sendChatMessage("chat_abc", "hello");
    expect(r.messages[0].content).toBe("Hi");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/store\/chat\/message$/);
    expect((init as RequestInit).headers).toMatchObject({ "x-tenant-id": expect.any(String) });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ sessionId: "chat_abc", content: "hello" });
  });

  it("recovers from an unknown session (404) by starting a new one and retrying", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(404, { message: "Chat session not found or already closed" }))
      .mockResolvedValueOnce(json(200, { data: { sessionId: "chat_new", messages: [] } }))
      .mockResolvedValueOnce(json(200, { data: { messages: [{ role: "ASSISTANT", content: "Namaste" }] } }));
    vi.stubGlobal("fetch", f);
    const r = await sendChatMessage("chat-client-made", "hello");
    expect(r.sessionId).toBe("chat_new");
    expect(r.messages[0].content).toBe("Namaste");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("surfaces non-404 errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(500, { message: "boom" })));
    await expect(sendChatMessage("chat_abc", "x")).rejects.toBeInstanceOf(ChatHttpError);
  });
});

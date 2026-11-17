import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/components/__tests__/test-utils";
import ContactPage from "../page";

function mockFetch(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  vi.stubGlobal("fetch", f);
  return f;
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
  await user.type(screen.getByLabelText(/^Email/), "asha@example.com");
  await user.type(screen.getByLabelText(/How can we help/), "Need help with sizing");
}

describe("ContactPage", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("posts to /crm/contact (not the newsletter) and shows thanks only after 2xx", async () => {
    const f = mockFetch(201, { success: true });
    const user = userEvent.setup();
    render(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByText(/Thanks!/)).toBeInTheDocument());
    const [url, init] = f.mock.calls[0]!;
    expect(url).toContain("/api/v1/crm/contact");
    expect(url).not.toContain("newsletter");
    expect(init.headers["x-tenant-id"]).toBeTruthy();
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      message: "Need help with sizing",
      website: "",
      source: "storefront",
    });
    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
  });

  it("has a hidden honeypot input named website", () => {
    mockFetch(201, { success: true });
    const { container } = render(<ContactPage />);
    const hp = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    expect(hp.closest("[aria-hidden='true']")).toBeTruthy();
  });

  it("validates before sending", async () => {
    const f = mockFetch(201, { success: true });
    const user = userEvent.setup();
    render(<ContactPage />);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/name/i);
    expect(f).not.toHaveBeenCalled();
  });

  it("shows a readable message on 429 and does not claim success", async () => {
    mockFetch(429, { success: false });
    const user = userEvent.setup();
    render(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/try again in a minute/i));
    expect(screen.queryByText(/Thanks!/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Asha Rao");
  });

  it("shows the API message on 400 and a network error on failure", async () => {
    mockFetch(400, { success: false, error: { message: "message too long" } });
    const user = userEvent.setup();
    render(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("message too long"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/network error/i));
  });
});

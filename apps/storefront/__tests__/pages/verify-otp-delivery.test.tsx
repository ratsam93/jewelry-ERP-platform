import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyOtpPage from "@/app/auth/verify-otp/page";

const { search } = vi.hoisted(() => ({ search: { value: "phone=%2B919876543210&purpose=REGISTRATION" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/auth/verify-otp",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(search.value),
}));

afterEach(() => vi.unstubAllGlobals());

describe("verify-otp delivery honesty", () => {
  it("always offers neutral wording and a continue link", () => {
    search.value = "phone=%2B919876543210&purpose=REGISTRATION";
    render(<VerifyOtpPage />);
    expect(screen.getByText(/if you do not receive a code, you can continue and verify later/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue to my account/i })).toHaveAttribute("href", "/account");
    expect(screen.queryByText(/could not send an sms/i)).toBeNull();
  });

  it("shows an honest warning when send was reported undelivered", () => {
    search.value = "phone=%2B919876543210&purpose=REGISTRATION&delivered=0";
    render(<VerifyOtpPage />);
    expect(screen.getByText(/we could not send an sms right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /skip for now/i })).toHaveAttribute("href", "/account");
  });

  it("does not offer Skip for now while delivery has not failed", () => {
    search.value = "phone=%2B919876543210&purpose=REGISTRATION";
    render(<VerifyOtpPage />);
    expect(screen.queryByRole("link", { name: /skip for now/i })).toBeNull();
  });

  it("skip goes back to the page the customer came from", () => {
    search.value = "phone=%2B919876543210&purpose=REGISTRATION&delivered=0&next=%2Fcheckout";
    render(<VerifyOtpPage />);
    expect(screen.getByRole("link", { name: /skip for now/i })).toHaveAttribute("href", "/checkout");
  });

  it("does not claim 'sent' when a resend returns delivered:false", async () => {
    search.value = "phone=%2B919876543210&purpose=REGISTRATION";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { delivered: false } }) }),
    );
    render(<VerifyOtpPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: /resend otp/i }));
    await waitFor(() => expect(screen.getByText(/we could not send an sms right now/i)).toBeInTheDocument());
    expect(screen.queryByText(/new otp has been sent/i)).toBeNull();
  });
});

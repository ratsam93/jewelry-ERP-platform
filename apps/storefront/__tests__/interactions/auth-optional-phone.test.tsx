/**
 * Sign-up must not depend on SMS: phone is optional, verification never blocks,
 * and the OTP login tab is hidden when the server cannot deliver SMS.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/auth/login/page";
import RegisterPage from "@/app/auth/register/page";
import FlashNotice from "@/components/FlashNotice";
import { resetAuthCapabilitiesCache, ACCOUNT_CREATED_NOTICE } from "@/lib/auth-config";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/auth/register",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

type Handler = (url: string) => unknown;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const body = handler(String(url));
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const registerOk = { success: true, data: { accessToken: "tok", refreshToken: "r" } };
const calledWith = (fm: ReturnType<typeof vi.fn>, part: string) => fm.mock.calls.some((c) => String(c[0]).includes(part));

async function fillRegister(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByPlaceholderText("Priya Sharma"), "Test User");
  await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
  if (phone) await user.type(screen.getByPlaceholderText("98765 43210 (optional)"), phone);
  await user.type(screen.getByPlaceholderText("Min 10 characters"), "Password#1234");
  await user.type(screen.getByPlaceholderText("Confirm your password"), "Password#1234");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

beforeEach(() => {
  resetAuthCapabilitiesCache();
  pushMock.mockClear();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/auth/register");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("register: phone is optional and never blocks sign-up", () => {
  it("goes straight to /account with the notice and never calls otp/send", async () => {
    const fm = stubApi((url) => (url.includes("/register/email") ? registerOk : { success: true, data: {} }));
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "9876543210");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/account"));
    expect(calledWith(fm, "/otp/send")).toBe(false);
    expect(window.sessionStorage.getItem("cf_flash_notice")).toBe(ACCOUNT_CREATED_NOTICE);
  });

  it("works with no phone at all", async () => {
    const fm = stubApi((url) => (url.includes("/register/email") ? registerOk : { success: true, data: {} }));
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/account"));
    expect(calledWith(fm, "/store/account/profile")).toBe(false);
    expect(calledWith(fm, "/otp/send")).toBe(false);
  });

  it("returns to the page the customer came from (next)", async () => {
    window.history.pushState({}, "", "/auth/register?next=%2Fcheckout");
    stubApi((url) => (url.includes("/register/email") ? registerOk : { success: true, data: {} }));
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/checkout"));
  });

  it("rejects a phone that is present but not 10 digits, before calling the API", async () => {
    const fm = stubApi(() => registerOk);
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "98765");
    expect(await screen.findByText(/10-digit phone number or leave it empty/i)).toBeInTheDocument();
    expect(calledWith(fm, "/register/email")).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("register with NEXT_PUBLIC_REQUIRE_PHONE_OTP=true", () => {
  it("shows an honest message and a Continue button when delivered=false", async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_PHONE_OTP", "true");
    stubApi((url) =>
      url.includes("/otp/send")
        ? { success: true, data: { message: "We could not send an SMS right now.", delivered: false, channel: "SMS" } }
        : registerOk,
    );
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "9876543210");
    expect(await screen.findByText(/could not send an sms right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/sent successfully/i)).toBeNull();
    expect(screen.getByRole("link", { name: /continue to my account/i })).toHaveAttribute("href", "/account");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("goes to the verify page when the code was delivered", async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_PHONE_OTP", "true");
    stubApi((url) =>
      url.includes("/otp/send")
        ? { success: true, data: { message: "OTP sent successfully", delivered: true, channel: "SMS" } }
        : registerOk,
    );
    render(<RegisterPage />);
    await fillRegister(userEvent.setup(), "9876543210");
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(String(pushMock.mock.calls.at(-1)![0])).toContain("/auth/verify-otp?phone=%2B919876543210");
  });
});

describe("login: phone OTP tab follows server capabilities", () => {
  it("hides the OTP tab and explains when the server has no SMS provider", async () => {
    stubApi((url) => (url.includes("/capabilities") ? { success: true, data: { phoneOtp: false, emailVerification: false } } : {}));
    render(<LoginPage />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /phone/i })).toBeNull());
    expect(screen.getByText(/sms login is not available yet, use your email and password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
  });

  it("keeps the OTP tab when the server can send SMS", async () => {
    const fm = stubApi((url) => (url.includes("/capabilities") ? { success: true, data: { phoneOtp: true, emailVerification: true } } : {}));
    render(<LoginPage />);
    await waitFor(() => expect(calledWith(fm, "/capabilities")).toBe(true));
    expect(screen.getByRole("button", { name: /phone/i })).toBeInTheDocument();
  });

  it("explains instead of navigating when an OTP login send reports delivered=false", async () => {
    stubApi((url) =>
      url.includes("/capabilities")
        ? { success: true, data: { phoneOtp: true, emailVerification: false } }
        : { success: true, data: { delivered: false, channel: "SMS", message: "We could not send an SMS right now." } },
    );
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: /phone/i }));
    await user.type(screen.getByPlaceholderText("98765 43210"), "9876543210");
    await user.click(screen.getByRole("button", { name: /send otp/i }));
    expect(await screen.findByText(/sms login is not available yet, use your email and password/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("FlashNotice", () => {
  it("shows the stored notice once and can be dismissed", async () => {
    window.sessionStorage.setItem("cf_flash_notice", ACCOUNT_CREATED_NOTICE);
    const user = userEvent.setup();
    render(<FlashNotice />);
    expect(await screen.findByText(ACCOUNT_CREATED_NOTICE)).toBeInTheDocument();
    expect(window.sessionStorage.getItem("cf_flash_notice")).toBeNull();
    await user.click(screen.getByRole("button", { name: /dismiss notice/i }));
    expect(screen.queryByText(ACCOUNT_CREATED_NOTICE)).toBeNull();
  });
});

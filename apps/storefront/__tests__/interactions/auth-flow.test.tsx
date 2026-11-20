/**
 * Auth flow interaction tests.
 * Covers login form, registration form, social login, and OTP.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/auth/login/page";
import RegisterPage from "@/app/auth/register/page";
import { AUTH_API, TENANT_SLUG } from "@/lib/constants";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      replace: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    }),
    usePathname: () => "/auth/login",
    useParams: () => ({}),
    useSearchParams: () => new URLSearchParams(),
  };
});

describe("Auth Flow - Login", () => {
  it("renders email and password fields in email login mode", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
  });

  it("renders social login buttons for Google, Facebook, and Apple", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with facebook/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with apple/i })).toBeInTheDocument();
  });

  it("has a Forgot Password link", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: /forgot/i })).toHaveAttribute("href", "/auth/forgot-password");
  });

  it("has a Create Account link to registration page", () => {
    render(<LoginPage />);
    const link = screen.getByRole("link", { name: /create account/i });
    expect(link).toHaveAttribute("href", "/auth/register");
  });

  // Removed: "submits email login form when fields are filled" — LoginPage no longer triggers window.alert on submit.

it("switching to phone tab shows phone input instead of email/password", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const phoneTab = screen.getByRole("button", { name: /phone/i });
    await user.click(phoneTab);
    expect(screen.getByPlaceholderText("98765 43210")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send otp/i })).toBeInTheDocument();
  });

  it("phone input only accepts digits and limits to 10 chars", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole("button", { name: /phone/i }));
    const phoneInput = screen.getByPlaceholderText("98765 43210");
    await user.type(phoneInput, "abc1234567890");
    // Should only contain digits, max 10
    expect(phoneInput).toHaveValue("1234567890");
  });

  it("displays the Welcome Back heading", () => {
    render(<LoginPage />);
    expect(screen.getByText("Welcome Back")).toBeInTheDocument();
  });
});

describe("Auth Flow - Register", () => {
  it("renders name, email, phone, password, and confirm password fields", () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("98765 43210 (optional)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min 10 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm your password")).toBeInTheDocument();
  });

  it("has terms of service and privacy policy links", () => {
    render(<RegisterPage />);
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument();
    expect(screen.getByText(/privacy policy/i)).toBeInTheDocument();
  });

  it("has a Sign In link for existing users", () => {
    render(<RegisterPage />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/auth/login");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    pushMock.mockClear();
  });

  it("submits registration form successfully", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { accessToken: "test-access-token", refreshToken: "test-refresh-token" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RegisterPage />);
    await user.type(screen.getByPlaceholderText("Priya Sharma"), "Test User");
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
    await user.type(screen.getByPlaceholderText("98765 43210 (optional)"), "9876543210");
    await user.type(screen.getByPlaceholderText("Min 10 characters"), "Password#1234");
    await user.type(screen.getByPlaceholderText("Confirm your password"), "Password#1234");
    // Check the terms checkbox
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${AUTH_API}/register/email`,
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(fetchMock.mock.calls.find((c) => String(c[0]).includes("/register/email"))![1].body as string);
    expect(body).toMatchObject({
      email: "test@example.com",
      password: "Password#1234",
      firstName: "Test",
      lastName: "User",
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("accessToken")).toBe("test-access-token");
    });
  });
});

describe("Auth Flow - API contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.localStorage.clear();
    window.sessionStorage.clear();
    pushMock.mockClear();
  });

  it("login sends tenantSlug with email and password", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { accessToken: "a", refreshToken: "r" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.co");
    await user.type(screen.getByPlaceholderText("Enter your password"), "Password#1234");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/login/email"))).toBe(true));
    const loginCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/login/email"))!;
    expect(loginCall[0]).toBe(`${AUTH_API}/login/email`);
    expect(JSON.parse(loginCall[1].body as string)).toEqual({
      email: "a@b.co",
      password: "Password#1234",
      tenantSlug: TENANT_SLUG,
    });
  });

  it("login shows joined validation messages from the API", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: ["tenantSlug should not be empty", "email must be an email"] }),
      }),
    );
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.co");
    await user.type(screen.getByPlaceholderText("Enter your password"), "x");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/tenantSlug should not be empty, email must be an email/)).toBeInTheDocument();
  });

  async function fillRegister(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText("Priya Sharma"), "Test User");
    await user.type(screen.getByPlaceholderText("you@example.com"), "test@example.com");
    await user.type(screen.getByPlaceholderText("98765 43210 (optional)"), "9876543210");
    await user.type(screen.getByPlaceholderText("Min 10 characters"), "Password#1234");
    await user.type(screen.getByPlaceholderText("Confirm your password"), "Password#1234");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create account/i }));
  }

  it("register sends the REGISTRATION otp purpose and saves the phone on the profile (REQUIRE_PHONE_OTP=true)", async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_PHONE_OTP", "true");
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/register/email")
          ? { success: true, data: { accessToken: "tok", refreshToken: "r" } }
          : { success: true, data: {} },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterPage />);
    await fillRegister(user);
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/otp/send"))).toBe(true),
    );
    const otpCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/otp/send"))!;
    expect(JSON.parse(otpCall[1].body as string)).toEqual({ identifier: "+919876543210", purpose: "REGISTRATION" });
    const profileCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/store/account/profile"))!;
    expect(profileCall[1].method).toBe("PUT");
    expect(JSON.parse(profileCall[1].body as string)).toEqual({ phone: "+919876543210" });
  });

  it("register surfaces an OTP send failure instead of swallowing it (REQUIRE_PHONE_OTP=true)", async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_PHONE_OTP", "true");
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("/otp/send")) {
          return { ok: false, status: 400, json: async () => ({ message: ["purpose must be one of the following values"] }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: { accessToken: "tok" } }) };
      }),
    );
    render(<RegisterPage />);
    await fillRegister(user);
    expect(await screen.findByText(/could not send the verification code: purpose must be one of/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue to my account/i })).toHaveAttribute("href", "/account");
  });

  it("register accepts a pasted +91 number and keeps 10 digits", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/register/email")
          ? { success: true, data: { accessToken: "tok" } }
          : { success: true, data: {} },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterPage />);
    const phone = screen.getByPlaceholderText("98765 43210 (optional)") as HTMLInputElement;
    await user.click(phone);
    await user.paste("+91 98765-43210");
    expect(phone.value).toBe("9876543210");
    await user.clear(phone);
    await user.paste("919876543210");
    expect(phone.value).toBe("9876543210");
    await user.clear(phone);
    await user.paste("+919876543210");
    expect(phone.value).toBe("9876543210");
  });
});

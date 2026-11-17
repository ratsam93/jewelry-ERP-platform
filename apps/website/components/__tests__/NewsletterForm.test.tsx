import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import NewsletterForm from "../NewsletterForm";

const submit = (email: string) => {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.submit(screen.getByRole("button", { name: /Subscribe/ }).closest("form")!);
};

describe("NewsletterForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("validates the email without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<NewsletterForm />);
    submit("not-an-email");
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("subscribes via the newsletter endpoint and shows success after 2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, data: { subscribed: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<NewsletterForm />);
    submit("a@b.com");
    expect(screen.getByRole("button", { name: "Subscribing..." })).toBeDisabled();
    expect(await screen.findByText(/Thanks for subscribing/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/crm\/newsletter\/subscribe$/);
    expect(JSON.parse(init.body)).toMatchObject({ email: "a@b.com" });
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  it("treats a 2xx success:false body as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ success: false, error: { message: "Valid email is required" } }),
      }),
    );
    render(<NewsletterForm />);
    submit("a@b.com");
    expect(await screen.findByText("Valid email is required")).toBeInTheDocument();
    expect(screen.queryByText(/Thanks for subscribing/)).not.toBeInTheDocument();
  });

  it("shows an error on network failure and on 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
    const { unmount } = render(<NewsletterForm />);
    submit("a@b.com");
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    unmount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    render(<NewsletterForm />);
    submit("a@b.com");
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
  });
});

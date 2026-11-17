import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ContactForm from "../ContactForm";

function fill() {
  fireEvent.change(screen.getByLabelText("Full Name *"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByLabelText("Email Address *"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Test message" } });
}
const submit = () => fireEvent.submit(screen.getByText("Send Message").closest("form")!);

describe("ContactForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders all form fields", () => {
    render(<ContactForm />);
    expect(screen.getByText("Full Name *")).toBeInTheDocument();
    expect(screen.getByText("Email Address *")).toBeInTheDocument();
    expect(screen.getByText("Phone Number")).toBeInTheDocument();
    expect(screen.getByText("Company Name")).toBeInTheDocument();
    expect(screen.getByText("Number of Locations")).toBeInTheDocument();
    expect(screen.getByText("Message *")).toBeInTheDocument();
  });

  it("renders the submit button", () => {
    render(<ContactForm />);
    expect(screen.getByText("Send Message")).toBeInTheDocument();
  });

  it("validates required fields via HTML validation attributes", () => {
    render(<ContactForm />);
    expect(screen.getByPlaceholderText("Rajesh Kumar")).toBeRequired();
    expect(screen.getByPlaceholderText("rajesh@example.com")).toBeRequired();
    expect(screen.getByPlaceholderText(/Tell us about your business/)).toBeRequired();
  });

  it("links labels to inputs with names and autocomplete", () => {
    render(<ContactForm />);
    expect(screen.getByLabelText("Full Name *")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email Address *")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("Phone Number")).toHaveAttribute("autocomplete", "tel");
  });

  it("includes a hidden honeypot input", () => {
    const { container } = render(<ContactForm />);
    const hp = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(hp).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    expect(hp.closest("[aria-hidden='true']")).toBeTruthy();
  });

  it("posts to the API, disables the button while sending, and shows success only after 2xx", async () => {
    let resolve!: (r: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<ContactForm />);
    fill();
    submit();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/crm\/contact$/);
    expect(init.headers["x-tenant-id"]).toBe("69544f8e-fa3c-40b4-8975-643825600ce7");
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Test User",
      email: "test@example.com",
      message: "Test message",
      website: "",
      source: "marketing-site",
    });
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();

    resolve({ ok: true, status: 201, json: async () => ({ success: true }) });
    expect(await screen.findByText("Thank You!")).toBeInTheDocument();
  });

  it("shows an error and keeps the form on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: ["email must be an email"] }) }),
    );
    render(<ContactForm />);
    fill();
    submit();
    expect(await screen.findByText("email must be an email")).toBeInTheDocument();
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Message" })).toBeEnabled();
    expect(screen.getByLabelText("Full Name *")).toHaveValue("Test User");
  });

  it("shows an error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<ContactForm />);
    fill();
    submit();
    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
    expect(screen.queryByText("Thank You!")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

async function renderContact() {
  vi.resetModules();
  const { default: ContactPage } = await import("../../app/contact/page");
  return render(<ContactPage />);
}

describe("Contact Page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the contact form", async () => {
    await renderContact();
    expect(screen.getByText("Send Us a Message")).toBeInTheDocument();
    expect(screen.getByText("Full Name *")).toBeInTheDocument();
    expect(screen.getByText("Email Address *")).toBeInTheDocument();
    expect(screen.getByText("Send Message")).toBeInTheDocument();
  });

  it("shows the main and role emails", async () => {
    const { container } = await renderContact();
    expect(screen.getByText("ratsam93@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("sales@techbeyondsolution.com")).toBeInTheDocument();
    expect(screen.getByText("support@techbeyondsolution.com")).toBeInTheDocument();
    expect(container.querySelector('a[href^="mailto:sales@techbeyondsolution.com"]')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/globussoft|caratflow\.com/i);
  });

  it("shows no phone or address by default", async () => {
    const { container } = await renderContact();
    expect(screen.queryByText("Phone")).toBeNull();
    expect(screen.queryByText("Office")).toBeNull();
    expect(screen.queryByText(/Mumbai/)).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it("shows phone and address when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_PHONE", "+1 555 0100");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_ADDRESS", "1 Example Street");
    await renderContact();
    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(screen.getByText("1 Example Street")).toBeInTheDocument();
  });

  it("honours email overrides", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "hi@example.org");
    await renderContact();
    expect(screen.getByText("hi@example.org")).toBeInTheDocument();
  });
});

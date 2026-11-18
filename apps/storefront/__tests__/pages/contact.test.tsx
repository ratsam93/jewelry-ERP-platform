import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

async function renderContact() {
  vi.resetModules();
  const { default: ContactPage } = await import("../../app/contact/page");
  return render(<ContactPage />);
}

describe("Storefront contact page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the main and role emails and no old vendor addresses", async () => {
    const { container } = await renderContact();
    expect(screen.getByText("ratsam93@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("support@techbeyondsolution.com")).toBeInTheDocument();
    expect(screen.getByText("privacy@techbeyondsolution.com")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/caratflow\.com|globussoft|wa\.me/i);
  });

  it("shows no phone or address by default", async () => {
    const { container } = await renderContact();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(screen.queryByText("Address")).toBeNull();
    expect(screen.queryByText("Phone", { selector: "p" })).toBeNull();
  });

  it("shows phone and address when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_PHONE", "+1 555 0100");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_ADDRESS", "1 Example Street");
    const { container } = await renderContact();
    expect(screen.getByText("+1 555 0100")).toBeInTheDocument();
    expect(container.querySelector('a[href="tel:+15550100"]')).toBeTruthy();
    expect(screen.getByText("1 Example Street")).toBeInTheDocument();
  });

  it("careers and privacy pages use the role emails", async () => {
    vi.resetModules();
    const careers = (await import("../../app/careers/page")).default;
    const r1 = render(careers());
    expect(r1.container.querySelector('a[href="mailto:careers@techbeyondsolution.com"]')).toBeTruthy();
    r1.unmount();
    const privacy = (await import("../../app/privacy/page")).default;
    const r2 = render(privacy());
    expect(r2.container.querySelector('a[href="mailto:privacy@techbeyondsolution.com"]')).toBeTruthy();
  });
});

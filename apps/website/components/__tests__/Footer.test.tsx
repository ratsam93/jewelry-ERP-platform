import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import Footer from "../Footer";

describe("Footer", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renders all footer sections (Product, Solutions, Resources, Company)", () => {
    render(<Footer />);
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Solutions")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("renders copyright text", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(
      screen.getByText(`© ${year} CaratFlow by Globussoft Technologies. All rights reserved.`)
    ).toBeInTheDocument();
  });

  it("hides social links when no URLs are configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_X", "");
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_LINKEDIN", "");
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_FACEBOOK", "");
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_YOUTUBE", "");
    render(<Footer />);
    expect(screen.queryByText("X")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LinkedIn")).not.toBeInTheDocument();
  });

  it("renders configured social links with real URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_LINKEDIN", "https://www.linkedin.com/company/caratflow");
    render(<Footer />);
    expect(screen.getByLabelText("LinkedIn")).toHaveAttribute("href", "https://www.linkedin.com/company/caratflow");
  });

  it("has no placeholder or misleading links", () => {
    const { container } = render(<Footer />);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("#");
    screen.getAllByText("Privacy Policy").forEach((el) => expect(el).toHaveAttribute("href", "/privacy"));
    expect(screen.getByText("Terms of Service")).toHaveAttribute("href", "/terms");
    expect(screen.getByText("Careers")).toHaveAttribute("href", "/careers");
    expect(screen.getByText("HUID Compliance Guide")).toHaveAttribute("href", "/blog/huid-compliance-guide");
    expect(screen.queryByText("Webinars")).not.toBeInTheDocument();
  });
});

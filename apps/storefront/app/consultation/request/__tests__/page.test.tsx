import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/components/__tests__/test-utils";
import RequestConsultationPage from "../page";
import { CONSULTATION_DRAFT_KEY } from "@/lib/consultation-draft";

function mockFetch(status: number, body: unknown = { success: true }) {
  const f = vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });
  vi.stubGlobal("fetch", f);
  return f;
}

describe("RequestConsultationPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockFetch(200);
  });

  it("renders the request form for a signed-in customer without the sign-in panel", () => {
    window.localStorage.setItem("accessToken", "t");
    render(<RequestConsultationPage />);
    expect(screen.getByText(/Book a Live Consultation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Preferred Language/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request Consultation/i })).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to book a consultation/i)).not.toBeInTheDocument();
  });

  it("signed in: submits with the bearer token and shows confirmation", async () => {
    window.localStorage.setItem("accessToken", "tok");
    const user = userEvent.setup();
    render(<RequestConsultationPage />);
    await user.click(screen.getByRole("button", { name: /Request Consultation/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/crm/video-consultation/request"),
        expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
      );
    });
    await waitFor(() => expect(screen.getByText(/Request Received/i)).toBeInTheDocument());
    expect(window.sessionStorage.getItem(CONSULTATION_DRAFT_KEY)).toBeNull();
  });

  it("guest: shows a sign-in panel with a next return path before filling the form", async () => {
    render(<RequestConsultationPage />);
    expect(await screen.findByText("Sign in to book a consultation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login?next=%2Fconsultation%2Frequest");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/auth/register?next=%2Fconsultation%2Frequest");
  });

  it("guest: typed values are saved and restored; submit does not call the API", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<RequestConsultationPage />);
    await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");
    await user.type(screen.getByLabelText(/Anything else/i), "Bridal set");
    await user.click(screen.getByRole("button", { name: /Request Consultation/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(CONSULTATION_DRAFT_KEY)!)).toMatchObject({
      phone: "9876543210",
      notes: "Bridal set",
    });
    unmount();
    render(<RequestConsultationPage />);
    await waitFor(() => expect(screen.getByLabelText(/Phone Number/i)).toHaveValue("9876543210"));
    expect(screen.getByLabelText(/Anything else/i)).toHaveValue("Bridal set");
  });

  it("401 from the API shows the sign-in panel with preserved values and no redirect", async () => {
    window.localStorage.setItem("accessToken", "expired");
    mockFetch(401, { success: false });
    const user = userEvent.setup();
    render(<RequestConsultationPage />);
    await user.type(screen.getByLabelText(/Phone Number/i), "9000000000");
    await user.click(screen.getByRole("button", { name: /Request Consultation/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Sign in to book a consultation/i);
    expect(screen.getByLabelText(/Phone Number/i)).toHaveValue("9000000000");
    expect(screen.queryByText(/Request Received/i)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import VirtualTryOn from "@/components/VirtualTryOn";
import { render } from "./test-utils";

// Camera is denied in these tests: the component's camera request rejects with
// the same error a browser raises when the user blocks camera access.
beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Waits until the component has handled the rejected camera request. */
async function waitForCameraDenied() {
  await screen.findByText(/Camera access denied/);
}

/**
 * The component logs the denial with console.error. That output is expected
 * for these tests, so the spy is scoped to the test that triggers it and
 * asserts the message was logged.
 */
function expectCameraDeniedLogged() {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => {
    expect(errorSpy).toHaveBeenCalledWith(
      "Camera access denied:",
      expect.objectContaining({ name: "NotAllowedError" }),
    );
  };
}

const config = {
  productId: "prod-001",
  productName: "Celestial Solitaire Ring",
  productImage: "https://example.com/ring.jpg",
  category: "RING" as const,
  overlayUrl: null,
  overlayPositioning: {
    scale: 0.15,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  },
};

describe("VirtualTryOn", () => {
  it("renders with product name", async () => {
    const assertLogged = expectCameraDeniedLogged();
    render(<VirtualTryOn config={config} onClose={vi.fn()} />);
    expect(screen.getByText("Virtual Try-On")).toBeInTheDocument();
    expect(screen.getByText(config.productName)).toBeInTheDocument();
    await waitForCameraDenied();
    assertLogged();
  });

  it("has close button", async () => {
    const assertLogged = expectCameraDeniedLogged();
    render(<VirtualTryOn config={config} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
    await waitForCameraDenied();
    assertLogged();
  });

  it("has capture screenshot button", async () => {
    const assertLogged = expectCameraDeniedLogged();
    render(<VirtualTryOn config={config} onClose={vi.fn()} />);
    expect(screen.getByText("Capture")).toBeInTheDocument();
    await waitForCameraDenied();
    assertLogged();
  });

  it("has add to cart button", async () => {
    const assertLogged = expectCameraDeniedLogged();
    render(<VirtualTryOn config={config} onClose={vi.fn()} />);
    expect(screen.getByText("Add to Cart")).toBeInTheDocument();
    await waitForCameraDenied();
    assertLogged();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CompareBar from "@/components/CompareBar";
import ChatWidget from "@/components/ChatWidget";
import { StoreContext, type StoreState } from "@/lib/store";

vi.mock("@/lib/product-lookup", () => ({
  useProductsByIds: () => ({ products: [], loading: false }),
}));

function store(compareIds: string[]): StoreState {
  return { compareIds, removeFromCompare: vi.fn(), clearCompare: vi.fn() } as unknown as StoreState;
}

describe("CompareBar (HK-SF-06)", () => {
  it("renders nothing without compared products and clears the offset", () => {
    document.documentElement.style.setProperty("--compare-bar-h", "99px");
    const { container } = render(
      <StoreContext.Provider value={store([])}><CompareBar /></StoreContext.Provider>,
    );
    expect(container.querySelector(".compare-bar")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--compare-bar-h")).toBe("");
  });

  it("wraps its content so buttons stay on screen on narrow viewports", () => {
    const { container, getByText } = render(
      <StoreContext.Provider value={store(["a", "b"])}><CompareBar /></StoreContext.Provider>,
    );
    expect(container.querySelector(".compare-bar > div")?.className).toContain("flex-wrap");
    expect(getByText("Compare Now")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--compare-bar-h")).toMatch(/px$/);
  });

  it("chat launcher is offset above the compare bar height", () => {
    const { getByLabelText } = render(<ChatWidget />);
    const btn = getByLabelText("Open chat") as HTMLElement;
    expect(btn.getAttribute("style")).toContain("var(--compare-bar-h");
  });
});

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RatingStars from "@/components/RatingStars";
import { render } from "./test-utils";

describe("RatingStars", () => {
  it("renders display-only stars as a single labelled image, not buttons", () => {
    render(<RatingStars rating={3} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "Rated 3.0 out of 5 stars" })).toBeInTheDocument();
  });

  it("renders 5 named star buttons in interactive mode", () => {
    render(<RatingStars rating={3} interactive />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons[2]).toHaveAccessibleName("Rate 3 stars");
  });

  it("renders custom number of stars", () => {
    render(<RatingStars rating={3} maxRating={10} interactive />);
    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  it("shows review count when provided", () => {
    render(<RatingStars rating={4.5} reviewCount={42} />);
    expect(screen.getByText("(42)")).toBeInTheDocument();
  });

  it("calls onChange in interactive mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RatingStars rating={2} interactive onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[3]!); // click 4th star
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

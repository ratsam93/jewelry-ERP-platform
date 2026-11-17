import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddressForm from "@/components/AddressForm";
import { render } from "./test-utils";

const onSave = vi.fn();
const onCancel = vi.fn();

describe("AddressForm", () => {
  it("renders all required fields", () => {
    render(<AddressForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Full Name *")).toBeInTheDocument();
    expect(screen.getByText("Phone *")).toBeInTheDocument();
    expect(screen.getByText("Address Line 1 *")).toBeInTheDocument();
    expect(screen.getByText("City *")).toBeInTheDocument();
    expect(screen.getByText("State *")).toBeInTheDocument();
    expect(screen.getByText("Pincode *")).toBeInTheDocument();
  });

  it("renders state dropdown with Indian states", () => {
    render(<AddressForm onSave={onSave} onCancel={onCancel} />);
    const select = screen.getByLabelText("State");
    expect(select).toBeInTheDocument();
    // Check some states
    expect(screen.getByText("Maharashtra")).toBeInTheDocument();
    expect(screen.getByText("Karnataka")).toBeInTheDocument();
    expect(screen.getByText("Delhi")).toBeInTheDocument();
  });

  it("renders Save Address button for new address", () => {
    render(<AddressForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Save Address")).toBeInTheDocument();
  });

  it("renders Update Address button when editing", () => {
    render(
      <AddressForm
        address={{
          id: "addr-1",
          label: "Home",
          fullName: "Test User",
          phone: "+91 12345",
          addressLine1: "123 St",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: false,
        }}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Update Address")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const cancelFn = vi.fn();
    render(<AddressForm onSave={onSave} onCancel={cancelFn} />);
    await user.click(screen.getByText("Cancel"));
    expect(cancelFn).toHaveBeenCalled();
  });

  it("has default address checkbox", () => {
    render(<AddressForm onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Set as default address")).toBeInTheDocument();
  });
});

describe("AddressForm country (HK-SF-01)", () => {
  it("offers India first and saves the 2-letter ISO code", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<AddressForm onSave={save} onCancel={vi.fn()} />);
    const country = screen.getByLabelText("Country *") as HTMLSelectElement;
    expect(country.options[0].textContent).toBe("India");
    await user.type(screen.getAllByRole("textbox")[1], "Test User");
    await user.type(screen.getByPlaceholderText("+91 98765 43210"), "9876543210");
    await user.type(screen.getByPlaceholderText("Flat/House No., Building"), "12 MG Road");
    const textboxes = screen.getAllByRole("textbox");
    await user.type(textboxes[5], "Mumbai"); // city
    await user.selectOptions(screen.getByLabelText("State"), "Maharashtra");
    await user.type(textboxes[6], "400001"); // pincode
    await user.selectOptions(country, "AE");
    await user.click(screen.getByText("Save Address"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ country: "AE", city: "Mumbai" }));
  });
});

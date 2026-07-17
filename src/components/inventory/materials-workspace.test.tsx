import { Profiler } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInventoryItemAction } from "@/app/(admin)/inventory/items/actions";
import {
  MaterialsWorkspace,
  type MaterialWorkspaceItem,
} from "./materials-workspace";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(admin)/inventory/items/actions", () => ({
  createInventoryItemAction: vi.fn(),
  updateInventoryItemAction: vi.fn(),
  removeInventoryItemAction: vi.fn(),
  addInventoryStockAction: vi.fn(),
  adjustInventoryAction: vi.fn(),
  recordInventoryWasteAction: vi.fn(),
}));

const item: MaterialWorkspaceItem = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "A4 Paper",
  baseUnit: "SHEET",
  currentQuantity: "25",
  minimumQuantity: "10",
  unitCost: "0.20",
  brand: "Paper Co",
  supplier: "Supplier",
  storageLocation: "Shelf A",
  notes: "Keep dry",
  isActive: true,
  transactionCount: 1,
  recipeReferenceCount: 0,
  hasHistory: true,
  canChangeUnit: false,
};

describe("MaterialsWorkspace", () => {
  beforeEach(() => refresh.mockClear());

  it("keeps quick creation hidden until Add Material is selected", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add Material/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Opening quantity")).toHaveAttribute(
      "step",
      "1",
    );
    expect(screen.queryByLabelText("Material type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Detailed unit")).not.toBeInTheDocument();
  });

  it("keeps creation keystrokes local and does not submit or rerender the workspace", () => {
    const commits = vi.fn();
    const originalItem = structuredClone(item);
    render(
      <Profiler id="materials-workspace" onRender={commits}>
        <MaterialsWorkspace
          items={[item]}
          adminUnlocked={false}
          filter="active"
        />
      </Profiler>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Material/i }));
    const commitsAfterOpening = commits.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Premium sublimation paper" },
    });
    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "PrintX Supply" },
    });
    fireEvent.change(screen.getByLabelText("Supplier"), {
      target: { value: "Local supplier" },
    });
    fireEvent.change(screen.getByLabelText("Storage location"), {
      target: { value: "Shelf B" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Keep sealed and dry" },
    });

    expect(commits).toHaveBeenCalledTimes(commitsAfterOpening);
    expect(createInventoryItemAction).not.toHaveBeenCalled();
    expect(item).toEqual(originalItem);
  });

  it("disables autofill without marking ordinary fields as passwords", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Material/i }));
    const name = screen.getByLabelText("Name");
    const form = name.closest("form");

    expect(form).toHaveAttribute("autocomplete", "off");
    expect(name).toHaveAttribute("autocomplete", "off");
    expect(name).toHaveAttribute("data-1p-ignore", "true");
    expect(name).not.toHaveAttribute("autocomplete", "new-password");
  });

  it("keeps stock-operation fields out of the default card", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add Stock" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adjust" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record Waste" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity to add/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Adjustment quantity/),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Quantity wasted/)).not.toBeInTheDocument();
  });

  it("opens a focused Add Stock modal and previews the new balance", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Stock" }));
    expect(
      screen.getByRole("dialog", { name: /Add Stock/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity to add (units)"), {
      target: { value: "5" },
    });
    expect(screen.getByText("30 units")).toBeInTheDocument();
    expect(screen.getByLabelText("Purchase unit cost")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Reference or invoice number"),
    ).toBeInTheDocument();
  });

  it("previews signed adjustments and prevents a negative balance", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    const adjustment = screen.getByLabelText("Adjustment quantity (units)");
    fireEvent.change(adjustment, { target: { value: "-2" } });
    expect(screen.getByText("23 units")).toBeInTheDocument();
    fireEvent.change(adjustment, { target: { value: "-30" } });
    expect(
      screen.getByText("The adjustment cannot make stock negative."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm Adjustment" }),
    ).toBeDisabled();
  });

  it("opens a focused waste modal and blocks waste above available stock", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record Waste" }));
    fireEvent.change(screen.getByLabelText("Quantity wasted (units)"), {
      target: { value: "26" },
    });
    expect(
      screen.getByText("Waste cannot exceed the available stock."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog", { name: /Record Waste/ })).getByRole(
        "button",
        { name: "Record Waste" },
      ),
    ).toBeDisabled();
  });

  it("closes quick creation when Cancel is selected", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Material/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes quick creation with Escape", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add Material/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not expose direct quantity editing and locks units with history", () => {
    const { container } = render(
      <MaterialsWorkspace items={[item]} adminUnlocked filter="active" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByText(/Use Add Stock, Adjust or Record Waste/),
    ).toBeInTheDocument();
    expect(container.querySelector('input[name="currentQuantity"]')).toBeNull();
    expect(screen.queryByLabelText("Detailed unit")).not.toBeInTheDocument();
    expect(container.querySelector('input[name="baseUnit"]')).toHaveValue(
      "SHEET",
    );
  });

  it("protects destructive actions behind the More menu", () => {
    render(
      <MaterialsWorkspace
        items={[item]}
        adminUnlocked={false}
        filter="active"
      />,
    );
    expect(screen.getByText(/Unlock Admin Mode/)).not.toBeVisible();
    fireEvent.click(screen.getByText("More"));
    expect(screen.getByText(/Unlock Admin Mode/)).toBeInTheDocument();
  });

  it("shows inactive materials without operational stock actions", () => {
    render(
      <MaterialsWorkspace
        items={[{ ...item, isActive: false }]}
        adminUnlocked
        filter="inactive"
      />,
    );
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Stock" }),
    ).not.toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInventoryItem: vi.fn(),
  addInventoryStock: vi.fn(),
  adjustInventory: vi.fn(),
  recordInventoryWaste: vi.fn(),
  removeOrArchiveInventoryItem: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin-session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/inventory/service", () => ({
  INVENTORY_UNITS: [
    "PIECE",
    "SHEET",
    "ROLL",
    "METRE",
    "MILLILITRE",
    "LITRE",
    "GRAM",
    "KILOGRAM",
  ],
  CONSUMABLE_UNITS: ["UNITS", "SHEETS", "ML", "M"],
  createInventoryItem: mocks.createInventoryItem,
  removeOrArchiveInventoryItem: mocks.removeOrArchiveInventoryItem,
  restoreInventoryItem: vi.fn(),
  permanentlyDeleteArchivedInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  addInventoryStock: mocks.addInventoryStock,
  adjustInventory: mocks.adjustInventory,
  recordInventoryWaste: mocks.recordInventoryWaste,
}));

import {
  addInventoryStockAction,
  adjustInventoryAction,
  createInventoryItemAction,
  recordInventoryWasteAction,
  removeInventoryItemAction,
} from "./actions";

const initialMaterialActionState = { ok: false, message: "" };

describe("material inventory actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates materials as whole user-defined units", async () => {
    const formData = new FormData();
    formData.set("materialName", "A4 Paper");
    const result = await createInventoryItemAction(
      initialMaterialActionState,
      formData,
    );
    expect(result.ok).toBe(true);
    expect(mocks.createInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: "A4 Paper", baseUnit: "UNITS" }),
    );
  });

  it("rejects direct destructive requests when Admin Mode is locked", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("ADMIN_REQUIRED"));
    const formData = new FormData();
    formData.set("inventoryItemId", "10000000-0000-4000-8000-000000000001");
    formData.set("materialRemovalConfirmation", "Unused Material");
    const result = await removeInventoryItemAction(
      initialMaterialActionState,
      formData,
    );
    expect(result).toEqual({
      ok: false,
      message: "Unlock Admin Mode before deleting or archiving a material.",
    });
    expect(mocks.removeOrArchiveInventoryItem).not.toHaveBeenCalled();
  });

  it("validates purchase quantity and unit cost before adding stock", async () => {
    const formData = new FormData();
    formData.set("inventoryItemId", "10000000-0000-4000-8000-000000000001");
    formData.set("quantity", "0");
    formData.set("unitCost", "-1");
    const result = await addInventoryStockAction(
      initialMaterialActionState,
      formData,
    );
    expect(result.message).toBe("Inventory quantities must be whole units.");
    expect(mocks.addInventoryStock).not.toHaveBeenCalled();
  });

  it("rejects decimal stock quantities", async () => {
    const formData = new FormData();
    formData.set("inventoryItemId", "10000000-0000-4000-8000-000000000001");
    formData.set("quantity", "1.5");
    formData.set("unitCost", "1");
    const result = await addInventoryStockAction(
      initialMaterialActionState,
      formData,
    );
    expect(result.message).toBe("Inventory quantities must be whole units.");
    expect(mocks.addInventoryStock).not.toHaveBeenCalled();
  });

  it("returns a useful error when an adjustment would make stock negative", async () => {
    mocks.adjustInventory.mockRejectedValue(new Error("INSUFFICIENT_STOCK"));
    const formData = new FormData();
    formData.set("inventoryItemId", "10000000-0000-4000-8000-000000000001");
    formData.set("delta", "-30");
    formData.set("adjustmentReason", "Count correction");
    const result = await adjustInventoryAction(
      initialMaterialActionState,
      formData,
    );
    expect(result.message).toBe("This operation would make stock negative.");
  });

  it("requires a waste reason before recording waste", async () => {
    const formData = new FormData();
    formData.set("inventoryItemId", "10000000-0000-4000-8000-000000000001");
    formData.set("quantity", "1");
    const result = await recordInventoryWasteAction(
      initialMaterialActionState,
      formData,
    );
    expect(result.message).toBe("A waste reason is required.");
    expect(mocks.recordInventoryWaste).not.toHaveBeenCalled();
  });
});

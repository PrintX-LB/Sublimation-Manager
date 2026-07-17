"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-session";
import {
  addInventoryStock,
  adjustInventory,
  createInventoryItem,
  INVENTORY_UNITS,
  recordInventoryWaste,
  removeOrArchiveInventoryItem,
  updateInventoryItem,
} from "@/lib/inventory/service";
import { type InventoryUnit } from "@/lib/inventory/materials";

export type MaterialActionState = {
  ok: boolean;
  message: string;
  result?:
    | "created"
    | "updated"
    | "deleted"
    | "archived"
    | "stock-added"
    | "stock-adjusted"
    | "waste-recorded";
};

const inventoryItemIdSchema = z.string().uuid();

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function validChoice(valueToCheck: string, choices: readonly string[]) {
  return choices.includes(valueToCheck);
}

function refreshInventory() {
  revalidatePath("/inventory/items");
  revalidatePath("/inventory");
}

function materialError(error: unknown): MaterialActionState {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    ADMIN_REQUIRED:
      "Unlock Admin Mode before deleting or archiving a material.",
    INVENTORY_ITEM_NOT_FOUND: "This material could not be found.",
    INVALID_INVENTORY_ITEM:
      "Check the material name, quantities and unit cost.",
    INVALID_QUANTITY: "Enter a valid whole-unit quantity.",
    INVALID_ADJUSTMENT: "Enter a non-zero adjustment and a reason.",
    INSUFFICIENT_STOCK: "This operation would make stock negative.",
    INVENTORY_ITEM_INACTIVE: "Archived materials cannot have stock removed.",
    STOCK_CONFLICT:
      "Stock changed while this form was open. Review the balance and try again.",
    TOO_MANY_DECIMALS: "Use no more than three decimal places.",
    WHOLE_UNIT_REQUIRED: "Inventory quantities must be whole units.",
    UNIT_CHANGE_BLOCKED:
      "The unit cannot be changed because this material already has stock history.",
    UNIT_CHANGE_REFERENCED:
      "The unit cannot be changed because this material is used by a production recipe.",
    MATERIAL_CONFIRMATION_MISMATCH:
      "Type the exact material name to confirm this action.",
  };
  return {
    ok: false,
    message:
      messages[code] ?? "The material could not be updated. Please try again.",
  };
}

export async function createInventoryItemAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  try {
    await createInventoryItem({
      name: value(formData, "materialName"),
      inventoryType: "PRODUCTION_SUPPLY",
      baseUnit: "PIECE",
      openingQuantity: value(formData, "openingQuantity") || "0",
      minimumQuantity: value(formData, "minimumQuantity") || "0",
      unitCost: value(formData, "unitCost") || "0",
      brand: value(formData, "materialBrand"),
      supplier: value(formData, "materialSupplier"),
      storageLocation: value(formData, "materialStorageLocation"),
      notes: value(formData, "materialNotes"),
    });
    refreshInventory();
    return { ok: true, message: "Material created.", result: "created" };
  } catch (error) {
    return materialError(error);
  }
}

export async function updateInventoryItemAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(
    value(formData, "inventoryItemId"),
  );
  const baseUnit = value(formData, "baseUnit");
  if (!id.success)
    return { ok: false, message: "This material could not be identified." };
  if (!validChoice(baseUnit, INVENTORY_UNITS))
    return { ok: false, message: "Choose a valid detailed unit." };

  try {
    await updateInventoryItem({
      id: id.data,
      name: value(formData, "materialEditName"),
      baseUnit: baseUnit as InventoryUnit,
      minimumQuantity: value(formData, "minimumQuantity") || "0",
      unitCost: value(formData, "unitCost") || "0",
      brand: value(formData, "materialEditBrand"),
      supplier: value(formData, "materialEditSupplier"),
      storageLocation: value(formData, "materialEditStorageLocation"),
      notes: value(formData, "materialEditNotes"),
    });
    refreshInventory();
    return { ok: true, message: "Material updated.", result: "updated" };
  } catch (error) {
    return materialError(error);
  }
}

export async function removeInventoryItemAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(
    value(formData, "inventoryItemId"),
  );
  if (!id.success)
    return { ok: false, message: "This material could not be identified." };

  try {
    await requireAdmin();
    const result = await removeOrArchiveInventoryItem({
      id: id.data,
      confirmed: formData.get("materialRemovalConfirmation") === "yes",
    });
    refreshInventory();
    revalidatePath("/production/recipes");
    return {
      ok: true,
      result: result.mode,
      message:
        result.mode === "deleted"
          ? "Unused material permanently deleted."
          : "Material archived. Its history has been preserved.",
    };
  } catch (error) {
    return materialError(error);
  }
}

export async function addInventoryStockAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(
    value(formData, "inventoryItemId"),
  );
  const quantityText = value(formData, "quantity");
  const quantity = Number(quantityText);
  const unitCost = Number(value(formData, "unitCost"));
  if (!id.success)
    return { ok: false, message: "This material could not be identified." };
  if (
    !/^\d+$/.test(quantityText) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    return { ok: false, message: "Inventory quantities must be whole units." };
  if (!Number.isFinite(unitCost) || unitCost < 0)
    return { ok: false, message: "Purchase unit cost cannot be negative." };

  try {
    await addInventoryStock({
      inventoryItemId: id.data,
      quantity: value(formData, "quantity"),
      unitCost: value(formData, "unitCost"),
      supplier: value(formData, "stockSupplier"),
      reference: value(formData, "stockReference"),
      note: value(formData, "stockNotes"),
    });
    refreshInventory();
    return {
      ok: true,
      message: "Stock added successfully.",
      result: "stock-added",
    };
  } catch (error) {
    return materialError(error);
  }
}

export async function adjustInventoryAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(
    value(formData, "inventoryItemId"),
  );
  const deltaText = value(formData, "delta");
  const delta = Number(deltaText);
  if (!id.success)
    return { ok: false, message: "This material could not be identified." };
  if (!/^[+-]?\d+$/.test(deltaText) || !Number.isFinite(delta) || delta === 0)
    return {
      ok: false,
      message: "Inventory quantities must be whole units.",
    };
  if (!value(formData, "adjustmentReason"))
    return { ok: false, message: "An adjustment reason is required." };

  try {
    await adjustInventory({
      inventoryItemId: id.data,
      delta: value(formData, "delta"),
      reason: value(formData, "adjustmentReason"),
      note: value(formData, "adjustmentNotes"),
    });
    refreshInventory();
    return {
      ok: true,
      message: "Stock adjustment recorded.",
      result: "stock-adjusted",
    };
  } catch (error) {
    return materialError(error);
  }
}

export async function recordInventoryWasteAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(
    value(formData, "inventoryItemId"),
  );
  const quantityText = value(formData, "quantity");
  const quantity = Number(quantityText);
  if (!id.success)
    return { ok: false, message: "This material could not be identified." };
  if (
    !/^\d+$/.test(quantityText) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    return { ok: false, message: "Inventory quantities must be whole units." };
  if (!value(formData, "wasteReason"))
    return { ok: false, message: "A waste reason is required." };

  try {
    await recordInventoryWaste({
      inventoryItemId: id.data,
      quantity: value(formData, "quantity"),
      reason: value(formData, "wasteReason"),
      note: value(formData, "wasteNotes"),
    });
    refreshInventory();
    return { ok: true, message: "Waste recorded.", result: "waste-recorded" };
  } catch (error) {
    return materialError(error);
  }
}

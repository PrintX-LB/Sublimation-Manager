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
  restoreInventoryItem,
  permanentlyDeleteArchivedInventoryItem,
  updateInventoryItem,
  receiveStockContainers,
  convertPooledStockToContainers,
} from "@/lib/inventory/service";
import { CONSUMABLE_UNITS, consumableUnitLabel, type InventoryUnit } from "@/lib/inventory/materials";

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
    | "waste-recorded"
    | "restored";
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
    INVALID_CONTAINER: "Check the container capacity, remaining amount and cost.",
    INVALID_CONTAINER_COUNT: "Enter between 1 and 1000 containers.",
    CONTAINER_CONFLICT: "This container changed while the operation was open. Try again.",
    OPEN_CONTAINER_EXISTS: "Finish or use the current open container before adding another partially used one.",
    CONTAINERS_ALREADY_EXIST: "This material already has physical containers configured.",
    CONVERSION_WOULD_REDUCE_STOCK: "The container total is less than the current pooled balance. Use a larger capacity or more containers.",
    INVENTORY_ITEM_ALREADY_ACTIVE: "This material is already active.",
    MATERIAL_MUST_BE_ARCHIVED: "Only archived materials can be permanently deleted.",
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
    const baseUnit = value(formData, "baseUnit") || "UNITS";
    if (!validChoice(baseUnit, [...INVENTORY_UNITS, ...CONSUMABLE_UNITS]))
      return { ok: false, message: "Choose a valid detailed unit." };
    await createInventoryItem({
      name: value(formData, "materialName"),
      inventoryType: "PRODUCTION_SUPPLY",
      baseUnit: baseUnit as InventoryUnit,
      openingQuantity: value(formData, "openingQuantity") || "0",
      minimumQuantity: value(formData, "minimumQuantity") || "0",
      unitCost: value(formData, "unitCost") || "0",
      brand: value(formData, "materialBrand"),
      supplier: value(formData, "materialSupplier"),
      storageLocation: value(formData, "materialStorageLocation"),
      notes: value(formData, "materialNotes"),
      defaultContainerCapacity: value(formData, "defaultContainerCapacity") || undefined,
      containerLabel: value(formData, "containerLabel") || undefined,
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
  if (!validChoice(baseUnit, [...INVENTORY_UNITS, ...CONSUMABLE_UNITS]))
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
      defaultContainerCapacity: value(formData, "defaultContainerCapacity") || undefined,
      containerLabel: value(formData, "containerLabel") || undefined,
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

export async function restoreInventoryItemAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(value(formData, "inventoryItemId"));
  if (!id.success) return { ok: false, message: "This material could not be identified." };
  try {
    await requireAdmin();
    const result = await restoreInventoryItem({ id: id.data });
    refreshInventory();
    revalidatePath("/production/recipes");
    return { ok: true, result: "restored", message: `${result.name} restored.` };
  } catch (error) {
    return materialError(error);
  }
}

export async function permanentlyDeleteArchivedInventoryItemAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(value(formData, "inventoryItemId"));
  if (!id.success) return { ok: false, message: "This material could not be identified." };
  try {
    await requireAdmin();
    const result = await permanentlyDeleteArchivedInventoryItem({
      id: id.data,
      confirmed: formData.get("materialRemovalConfirmation") === "yes",
    });
    refreshInventory();
    revalidatePath("/production/recipes");
    return { ok: true, result: "deleted", message: `${result.name} permanently deleted.` };
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

export async function receiveStockContainersAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(value(formData, "inventoryItemId"));
  if (!id.success) return { ok: false, message: "This material could not be identified." };
  const count = value(formData, "containerCount") || "1";
  const capacity = value(formData, "containerCapacity");
  const cost = value(formData, "containerPurchaseCost");
  try {
    await receiveStockContainers({
      inventoryItemId: id.data,
      containerCount: count,
      capacity,
      purchaseCost: cost,
      receivedAt: value(formData, "containerReceivedAt") ? new Date(value(formData, "containerReceivedAt")) : undefined,
      note: value(formData, "containerNote"),
      supplierReference: value(formData, "containerSupplierReference"),
      partiallyUsed: formData.get("containerPartiallyUsed") === "yes" ? { originalCapacity: value(formData, "containerOriginalCapacity"), remainingAmount: value(formData, "containerRemainingAmount") } : undefined,
    });
    refreshInventory();
    return { ok: true, message: "Stock containers received.", result: "stock-added" };
  } catch (error) {
    return materialError(error);
  }
}

export async function convertPooledStockToContainersAction(
  _previousState: MaterialActionState,
  formData: FormData,
): Promise<MaterialActionState> {
  const id = inventoryItemIdSchema.safeParse(value(formData, "inventoryItemId"));
  if (!id.success) return { ok: false, message: "This material could not be identified." };
  try {
    await requireAdmin();
    const result = await convertPooledStockToContainers({
      inventoryItemId: id.data,
      containerCount: value(formData, "containerCount"),
      capacity: value(formData, "containerCapacity"),
      purchaseCost: value(formData, "containerPurchaseCost"),
    });
    refreshInventory();
    return {
      ok: true,
      result: "stock-added",
      message: `${result.name}: ${result.containerCount} containers × ${result.capacity.toString()} ${consumableUnitLabel(result.unit)} converted to ${result.total.toString()} ${consumableUnitLabel(result.unit)} total stock.`,
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

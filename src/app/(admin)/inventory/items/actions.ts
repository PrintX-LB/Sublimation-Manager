"use server";

import { revalidatePath } from "next/cache";
import { createInventoryItem, addInventoryStock, adjustInventory, recordInventoryWaste } from "@/lib/inventory/service";
import { INVENTORY_TYPES, INVENTORY_UNITS } from "@/lib/inventory/service";

function value(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function validChoice(valueToCheck: string, choices: readonly string[]) { return choices.includes(valueToCheck); }

export async function createInventoryItemAction(formData: FormData) {
  const inventoryType = value(formData, "inventoryType"); const baseUnit = value(formData, "baseUnit");
  if (!validChoice(inventoryType, INVENTORY_TYPES) || !validChoice(baseUnit, INVENTORY_UNITS)) throw new Error("Select a valid inventory type and unit.");
  await createInventoryItem({ name: value(formData, "name"), inventoryType: inventoryType as (typeof INVENTORY_TYPES)[number], baseUnit: baseUnit as (typeof INVENTORY_UNITS)[number], openingQuantity: value(formData, "openingQuantity") || "0", minimumQuantity: value(formData, "minimumQuantity") || "0", unitCost: value(formData, "unitCost") || "0", sku: value(formData, "sku"), brand: value(formData, "brand"), supplier: value(formData, "supplier"), storageLocation: value(formData, "storageLocation"), notes: value(formData, "notes") });
  revalidatePath("/inventory/items"); revalidatePath("/inventory");
}

export async function addInventoryStockAction(formData: FormData) {
  await addInventoryStock({ inventoryItemId: value(formData, "inventoryItemId"), quantity: value(formData, "quantity"), unitCost: value(formData, "unitCost"), supplier: value(formData, "supplier"), reference: value(formData, "reference"), note: value(formData, "note") });
  revalidatePath("/inventory/items");
}

export async function adjustInventoryAction(formData: FormData) {
  await adjustInventory({ inventoryItemId: value(formData, "inventoryItemId"), delta: value(formData, "delta"), reason: value(formData, "reason"), note: value(formData, "note") });
  revalidatePath("/inventory/items");
}

export async function recordInventoryWasteAction(formData: FormData) {
  await recordInventoryWaste({ inventoryItemId: value(formData, "inventoryItemId"), quantity: value(formData, "quantity"), reason: value(formData, "reason"), note: value(formData, "note") });
  revalidatePath("/inventory/items");
}

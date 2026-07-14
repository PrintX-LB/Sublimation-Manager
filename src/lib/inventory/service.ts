import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const INVENTORY_TYPES = ["BLANK_PRODUCT", "PRODUCTION_SUPPLY"] as const;
export const INVENTORY_UNITS = ["PIECE", "SHEET", "ROLL", "METRE", "MILLILITRE", "LITRE", "GRAM", "KILOGRAM"] as const;
export const INVENTORY_TRANSACTION_TYPES = ["PURCHASE", "ORDER_CONSUMPTION", "PRODUCTION_INCIDENT", "WASTE", "MANUAL_ADJUSTMENT", "CORRECTION", "RETURN", "INITIAL_BALANCE"] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];
const wholeUnits = new Set<InventoryUnit>(["PIECE", "SHEET"]);

function amount(value: string | Prisma.Decimal) { try { return new Prisma.Decimal(value.toString()); } catch { throw new Error("INVALID_QUANTITY"); } }
function validateQuantity(value: Prisma.Decimal, unit: string) {
  if (!value.isFinite() || value.isNegative()) throw new Error("INVALID_QUANTITY");
  if (wholeUnits.has(unit as InventoryUnit) && !value.mod(1).isZero()) throw new Error("WHOLE_UNIT_REQUIRED");
  if (value.decimalPlaces() > 3) throw new Error("TOO_MANY_DECIMALS");
}

export async function changeInventoryQuantity(tx: Prisma.TransactionClient, input: { inventoryItemId: string; delta: string | Prisma.Decimal; transactionType: InventoryTransactionType; reason: string; unit?: string; unitCost?: string | Prisma.Decimal; totalCost?: string | Prisma.Decimal; supplier?: string; orderId?: string; orderItemId?: string; productionIncidentId?: string; productionAttemptId?: string; productionMaterialConsumptionId?: string; correctsTransactionId?: string; idempotencyKey?: string; note?: string; syncProductVariant?: boolean; }) {
  const delta = amount(input.delta);
  if (delta.isZero() || !input.reason.trim()) throw new Error("INVALID_ADJUSTMENT");
  const existing = input.idempotencyKey ? await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } }) : null;
  if (existing) return existing;
  const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, include: { productVariant: true } });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (!item.isActive && delta.isNegative()) throw new Error("INVENTORY_ITEM_INACTIVE");
  const unit = input.unit ?? item.baseUnit;
  if (unit !== item.baseUnit) throw new Error("UNIT_MISMATCH");
  validateQuantity(delta.abs(), unit);
  const before = new Prisma.Decimal(item.currentQuantity);
  if (delta.isNegative() && before.lessThan(delta.abs())) throw new Error("INSUFFICIENT_STOCK");
  const updated = await tx.inventoryItem.updateMany({ where: { id: item.id, ...(delta.isNegative() ? { currentQuantity: { gte: delta.abs() } } : { currentQuantity: before }) }, data: { currentQuantity: delta.isNegative() ? { decrement: delta.abs() } : { increment: delta } } });
  if (updated.count !== 1) throw new Error("STOCK_CONFLICT");
  if (item.productVariant && input.syncProductVariant !== false) {
    const variantUpdate = await tx.productVariant.updateMany({ where: { id: item.productVariant.id, ...(delta.isNegative() ? { stockQuantity: { gte: delta.abs() } } : {}) }, data: { stockQuantity: delta.isNegative() ? { decrement: delta.abs() } : { increment: delta } } });
    if (variantUpdate.count !== 1) throw new Error("STOCK_CONFLICT");
  }
  return tx.inventoryTransaction.create({ data: { inventoryItemId: item.id, quantityChange: delta, quantityBefore: before, quantityAfter: before.add(delta), unit, transactionType: input.transactionType, reason: input.reason.trim(), unitCost: input.unitCost === undefined ? undefined : amount(input.unitCost), totalCost: input.totalCost === undefined ? undefined : amount(input.totalCost), supplier: input.supplier?.trim() || undefined, orderId: input.orderId, orderItemId: input.orderItemId, productionIncidentId: input.productionIncidentId, productionAttemptId: input.productionAttemptId, productionMaterialConsumptionId: input.productionMaterialConsumptionId, correctsTransactionId: input.correctsTransactionId, idempotencyKey: input.idempotencyKey, note: input.note?.trim() || undefined } });
}

export async function createInventoryItem(input: { name: string; inventoryType: InventoryType; baseUnit: InventoryUnit; openingQuantity: string; minimumQuantity: string; unitCost: string; sku?: string; brand?: string; supplier?: string; storageLocation?: string; notes?: string; }) {
  const opening = amount(input.openingQuantity); const minimum = amount(input.minimumQuantity); const cost = amount(input.unitCost);
  validateQuantity(opening, input.baseUnit); validateQuantity(minimum, input.baseUnit);
  if (minimum.isNegative() || cost.isNegative() || !input.name.trim()) throw new Error("INVALID_INVENTORY_ITEM");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({ data: { name: input.name.trim(), inventoryType: input.inventoryType, baseUnit: input.baseUnit, currentQuantity: 0, minimumQuantity: minimum, unitCost: cost, sku: input.sku?.trim() || undefined, brand: input.brand?.trim() || undefined, supplier: input.supplier?.trim() || undefined, storageLocation: input.storageLocation?.trim() || undefined, notes: input.notes?.trim() || undefined } });
    if (!opening.isZero()) await changeInventoryQuantity(tx, { inventoryItemId: item.id, delta: opening, transactionType: "INITIAL_BALANCE", reason: "Opening balance", unitCost: cost, totalCost: opening.mul(cost) });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  });
}

export function addInventoryStock(input: { inventoryItemId: string; quantity: string; unitCost: string; supplier?: string; note?: string; reference?: string }) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: input.inventoryItemId } }); const quantity = amount(input.quantity); const unitCost = amount(input.unitCost);
    const transaction = await changeInventoryQuantity(tx, { inventoryItemId: item.id, delta: quantity, transactionType: "PURCHASE", reason: input.reference ? `Purchase ${input.reference}` : "Stock purchase", unitCost, totalCost: quantity.mul(unitCost), supplier: input.supplier, note: input.note });
    const newQuantity = new Prisma.Decimal(item.currentQuantity).add(quantity); const weightedCost = new Prisma.Decimal(item.currentQuantity).mul(item.unitCost).add(quantity.mul(unitCost)).div(newQuantity);
    await tx.inventoryItem.update({ where: { id: item.id }, data: { unitCost: weightedCost } }); return transaction;
  });
}
export function recordInventoryWaste(input: { inventoryItemId: string; quantity: string; reason: string; note?: string }) { return prisma.$transaction((tx) => changeInventoryQuantity(tx, { inventoryItemId: input.inventoryItemId, delta: new Prisma.Decimal(input.quantity).neg(), transactionType: "WASTE", reason: input.reason, note: input.note })); }
export function adjustInventory(input: { inventoryItemId: string; delta: string; reason: string; note?: string }) { return prisma.$transaction((tx) => changeInventoryQuantity(tx, { inventoryItemId: input.inventoryItemId, delta: input.delta, transactionType: "MANUAL_ADJUSTMENT", reason: input.reason, note: input.note })); }

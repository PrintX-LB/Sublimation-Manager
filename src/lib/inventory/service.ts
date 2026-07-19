import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canonicalConsumableUnit, type InventoryUnit, type ConsumableUnit } from "@/lib/inventory/materials";

export { INVENTORY_UNITS } from "@/lib/inventory/materials";

export const INVENTORY_TYPES = ["BLANK_PRODUCT", "PRODUCTION_SUPPLY"] as const;
export const INVENTORY_TRANSACTION_TYPES = [
  "PURCHASE",
  "ORDER_CONSUMPTION",
  "PRODUCTION_INCIDENT",
  "WASTE",
  "MANUAL_ADJUSTMENT",
  "CORRECTION",
  "RETURN",
  "INITIAL_BALANCE",
] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];
export type { InventoryUnit } from "@/lib/inventory/materials";
export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPES)[number];
function amount(value: string | Prisma.Decimal) {
  try {
    return new Prisma.Decimal(value.toString());
  } catch {
    throw new Error("INVALID_QUANTITY");
  }
}
function validateQuantity(value: Prisma.Decimal, unit: string) {
  if (!value.isFinite() || value.isNegative())
    throw new Error("INVALID_QUANTITY");
  const decimalUnit = ["METRE", "MILLILITRE", "M", "ML"].includes(unit);
  if (!decimalUnit && !value.mod(1).isZero()) throw new Error("WHOLE_UNIT_REQUIRED");
  if (value.decimalPlaces() > 3) throw new Error("TOO_MANY_DECIMALS");
}

export const CONTAINER_STATUSES = ["SEALED", "OPEN", "DEPLETED"] as const;
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

function containerUnit(unit: string): ConsumableUnit {
  return canonicalConsumableUnit(unit);
}

export async function receiveStockContainers(input: {
  inventoryItemId: string;
  containerCount: string;
  capacity: string;
  purchaseCost: string;
  receivedAt?: Date;
  note?: string;
  supplierReference?: string;
  partiallyUsed?: { originalCapacity: string; remainingAmount: string };
}) {
  const count = Number(input.containerCount);
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("INVALID_CONTAINER_COUNT");
  if (input.partiallyUsed && count !== 1) throw new Error("INVALID_CONTAINER_COUNT");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, include: { containers: { take: 1 } } });
    if (!item || item.inventoryType !== "PRODUCTION_SUPPLY") throw new Error("INVENTORY_ITEM_NOT_FOUND");
    if (!item.isActive) throw new Error("INVENTORY_ITEM_INACTIVE");
    const unit = containerUnit(item.baseUnit);
    if (input.partiallyUsed && item.containers.some((container) => container.status === "OPEN")) throw new Error("OPEN_CONTAINER_EXISTS");
    const capacity = new Prisma.Decimal(input.partiallyUsed?.originalCapacity ?? input.capacity);
    const remaining = new Prisma.Decimal(input.partiallyUsed?.remainingAmount ?? input.capacity);
    const cost = new Prisma.Decimal(input.purchaseCost);
    validateQuantity(capacity, unit);
    validateQuantity(remaining, unit);
    if (capacity.isZero() || remaining.isNegative() || remaining.greaterThan(capacity) || cost.isNegative()) throw new Error("INVALID_CONTAINER");
    const receivedAt = input.receivedAt ?? new Date();
    const created: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const open = remaining.lessThan(capacity);
      const container = await tx.inventoryContainer.create({ data: {
        inventoryItemId: item.id,
        originalCapacity: capacity,
        remainingAmount: remaining,
        purchaseCost: cost,
        receivedAt,
        openedAt: open ? receivedAt : null,
        status: remaining.isZero() ? "DEPLETED" : open ? "OPEN" : "SEALED",
        depletedAt: remaining.isZero() ? receivedAt : null,
        note: input.note?.trim() || undefined,
        supplierReference: input.supplierReference?.trim() || undefined,
      } });
      created.push(container.id);
      if (!remaining.isZero()) {
        await changeInventoryQuantity(tx, {
          inventoryItemId: item.id,
          delta: remaining,
          transactionType: "PURCHASE",
          reason: "Container received",
          unit: item.baseUnit,
          unitCost: cost.div(capacity),
          totalCost: remaining.mul(cost.div(capacity)),
          supplier: input.supplierReference,
          note: input.note,
          syncProductVariant: false,
          idempotencyKey: `container-receive:${container.id}`,
        });
      }
    }
    return tx.inventoryContainer.findMany({ where: { id: { in: created } }, orderBy: { receivedAt: "asc" } });
  });
}

/**
 * Converts an existing pooled balance into physical containers without
 * treating the conversion as a new purchase. This is intentionally explicit:
 * legacy stock such as "2 m" must not silently become two 33 m rolls.
 */
export async function convertPooledStockToContainers(input: {
  inventoryItemId: string;
  containerCount: string;
  capacity: string;
  purchaseCost: string;
}) {
  const count = Number(input.containerCount);
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error("INVALID_CONTAINER_COUNT");
  }
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      include: { containers: { take: 1 } },
    });
    if (!item || item.inventoryType !== "PRODUCTION_SUPPLY") {
      throw new Error("INVENTORY_ITEM_NOT_FOUND");
    }
    if (!item.isActive) throw new Error("INVENTORY_ITEM_INACTIVE");
    if (item.containers.length > 0) throw new Error("CONTAINERS_ALREADY_EXIST");

    const unit = containerUnit(item.baseUnit);
    const capacity = amount(input.capacity);
    const purchaseCost = amount(input.purchaseCost);
    validateQuantity(capacity, unit);
    if (capacity.isZero() || purchaseCost.isNegative()) {
      throw new Error("INVALID_CONTAINER");
    }

    const current = new Prisma.Decimal(item.currentQuantity);
    const total = capacity.mul(count);
    const delta = total.sub(current);
    if (delta.isNegative()) throw new Error("CONVERSION_WOULD_REDUCE_STOCK");

    for (let index = 0; index < count; index += 1) {
      await tx.inventoryContainer.create({
        data: {
          inventoryItemId: item.id,
          originalCapacity: capacity,
          remainingAmount: capacity,
          purchaseCost,
          status: "SEALED",
        },
      });
    }

    if (!delta.isZero()) {
      const costPerUnit = purchaseCost.div(capacity);
      await changeInventoryQuantity(tx, {
        inventoryItemId: item.id,
        delta,
        transactionType: "CORRECTION",
        reason: "Convert pooled stock to physical containers",
        unit: item.baseUnit,
        unitCost: costPerUnit,
        totalCost: delta.mul(costPerUnit),
        syncProductVariant: false,
        idempotencyKey: `container-conversion:${item.id}`,
      });
    }

    return { name: item.name, containerCount: count, capacity, total, unit };
  });
}

export async function consumeFromContainers(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    quantity: string | Prisma.Decimal;
    transactionType: InventoryTransactionType;
    reason: string;
    orderId?: string;
    orderItemId?: string;
    productionIncidentId?: string;
    productionAttemptId?: string;
    productionMaterialConsumptionId?: string;
    idempotencyKey?: string;
    note?: string;
  },
) {
  const quantity = amount(input.quantity);
  if (quantity.isZero() || quantity.isNegative()) throw new Error("INVALID_QUANTITY");
  const item = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, include: { containers: { where: { status: { not: "DEPLETED" } }, orderBy: { receivedAt: "asc" } } } });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  const existing = input.idempotencyKey
    ? await tx.inventoryTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { containerAllocations: true },
      })
    : null;
  if (existing) {
    const allocations = existing.containerAllocations ?? [];
    return {
      transaction: existing,
      allocations,
      totalCost: new Prisma.Decimal(existing.totalCost ?? 0),
    };
  }
  const unit = containerUnit(item.baseUnit);
  validateQuantity(quantity, unit);
  const ordered = [...item.containers].sort((a, b) => Number(b.status === "OPEN") - Number(a.status === "OPEN") || a.receivedAt.getTime() - b.receivedAt.getTime());
  const available = ordered.reduce((sum, container) => sum.add(container.remainingAmount), new Prisma.Decimal(0));
  if (available.lessThan(quantity)) throw new Error("INSUFFICIENT_STOCK");
  let remaining = quantity;
  const allocations = ordered.map((container) => {
    const take = Prisma.Decimal.min(remaining, container.remainingAmount);
    remaining = remaining.sub(take);
    return { container, amount: take, unitCost: new Prisma.Decimal(container.purchaseCost).div(container.originalCapacity) };
  }).filter((allocation) => !allocation.amount.isZero());
  const totalCost = allocations.reduce((sum, allocation) => sum.add(allocation.amount.mul(allocation.unitCost)), new Prisma.Decimal(0));
  const transaction = await changeInventoryQuantity(tx, {
    inventoryItemId: item.id,
    delta: quantity.neg(),
    transactionType: input.transactionType,
    reason: input.reason,
    unit: item.baseUnit,
    unitCost: quantity.isZero() ? undefined : totalCost.div(quantity),
    totalCost,
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    productionIncidentId: input.productionIncidentId,
    productionAttemptId: input.productionAttemptId,
    productionMaterialConsumptionId: input.productionMaterialConsumptionId,
    idempotencyKey: input.idempotencyKey,
    note: input.note,
    syncProductVariant: false,
  });
  for (const allocation of allocations) {
    const next = new Prisma.Decimal(allocation.container.remainingAmount).sub(allocation.amount);
    const updated = await tx.inventoryContainer.updateMany({ where: { id: allocation.container.id, remainingAmount: { gte: allocation.amount } }, data: { remainingAmount: next, status: next.isZero() ? "DEPLETED" : "OPEN", openedAt: allocation.container.openedAt ?? new Date(), depletedAt: next.isZero() ? new Date() : null } });
    if (updated.count !== 1) throw new Error("CONTAINER_CONFLICT");
    await tx.inventoryContainerAllocation.create({ data: { containerId: allocation.container.id, inventoryTransactionId: transaction.id, amount: allocation.amount, unitCost: allocation.unitCost, totalCost: allocation.amount.mul(allocation.unitCost), allocationType: "CONSUMPTION" } });
  }
  return { transaction, allocations, totalCost };
}

export async function restoreContainerConsumption(
  tx: Prisma.TransactionClient,
  input: { inventoryTransactionId: string; reason: string; idempotencyKey: string; note?: string },
) {
  const original = await tx.inventoryTransaction.findUnique({ where: { id: input.inventoryTransactionId }, include: { containerAllocations: true } });
  if (!original || !original.containerAllocations.length) throw new Error("CONTAINER_ALLOCATION_NOT_FOUND");
  const existing = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const total = original.containerAllocations.reduce((sum, allocation) => sum.add(allocation.amount), new Prisma.Decimal(0));
  const totalCost = original.containerAllocations.reduce((sum, allocation) => sum.add(allocation.totalCost), new Prisma.Decimal(0));
  const restored = await changeInventoryQuantity(tx, { inventoryItemId: original.inventoryItemId, delta: total, transactionType: "CORRECTION", reason: input.reason, note: input.note, unit: original.unit, unitCost: totalCost.div(total), totalCost: totalCost.neg(), orderId: original.orderId ?? undefined, orderItemId: original.orderItemId ?? undefined, productionIncidentId: original.productionIncidentId ?? undefined, productionAttemptId: original.productionAttemptId ?? undefined, correctsTransactionId: original.id, idempotencyKey: input.idempotencyKey, syncProductVariant: false });
  for (const allocation of original.containerAllocations) {
    const container = await tx.inventoryContainer.findUniqueOrThrow({ where: { id: allocation.containerId } });
    const next = new Prisma.Decimal(container.remainingAmount).add(allocation.amount);
    if (next.greaterThan(container.originalCapacity)) throw new Error("CONTAINER_CAPACITY_EXCEEDED");
    await tx.inventoryContainer.update({ where: { id: container.id }, data: { remainingAmount: next, status: "OPEN", openedAt: container.openedAt ?? new Date(), depletedAt: null } });
    await tx.inventoryContainerAllocation.create({ data: { containerId: container.id, inventoryTransactionId: restored.id, amount: allocation.amount, unitCost: allocation.unitCost, totalCost: allocation.totalCost, allocationType: "RESTORATION" } });
  }
  return restored;
}

export async function changeInventoryQuantity(
  tx: Prisma.TransactionClient,
  input: {
    inventoryItemId: string;
    delta: string | Prisma.Decimal;
    transactionType: InventoryTransactionType;
    reason: string;
    unit?: string;
    unitCost?: string | Prisma.Decimal;
    totalCost?: string | Prisma.Decimal;
    supplier?: string;
    orderId?: string;
    orderItemId?: string;
    productionIncidentId?: string;
    productionAttemptId?: string;
    productionMaterialConsumptionId?: string;
    correctsTransactionId?: string;
    idempotencyKey?: string;
    note?: string;
    syncProductVariant?: boolean;
  },
) {
  const delta = amount(input.delta);
  if (delta.isZero() || !input.reason.trim())
    throw new Error("INVALID_ADJUSTMENT");
  const existing = input.idempotencyKey
    ? await tx.inventoryTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      })
    : null;
  if (existing) return existing;
  const item = await tx.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { productVariant: true },
  });
  if (!item) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (!item.isActive && delta.isNegative())
    throw new Error("INVENTORY_ITEM_INACTIVE");
  const unit = input.unit ?? item.baseUnit;
  if (unit !== item.baseUnit) throw new Error("UNIT_MISMATCH");
  validateQuantity(delta.abs(), unit);
  const before = new Prisma.Decimal(item.currentQuantity);
  if (delta.isNegative() && before.lessThan(delta.abs()))
    throw new Error("INSUFFICIENT_STOCK");
  const updated = await tx.inventoryItem.updateMany({
    where: {
      id: item.id,
      ...(delta.isNegative()
        ? { currentQuantity: { gte: delta.abs() } }
        : { currentQuantity: before }),
    },
    data: {
      currentQuantity: delta.isNegative()
        ? { decrement: delta.abs() }
        : { increment: delta },
    },
  });
  if (updated.count !== 1) throw new Error("STOCK_CONFLICT");
  if (item.productVariant && input.syncProductVariant !== false) {
    const variantUpdate = await tx.productVariant.updateMany({
      where: {
        id: item.productVariant.id,
        ...(delta.isNegative() ? { stockQuantity: { gte: delta.abs() } } : {}),
      },
      data: {
        stockQuantity: delta.isNegative()
          ? { decrement: delta.abs() }
          : { increment: delta },
      },
    });
    if (variantUpdate.count !== 1) throw new Error("STOCK_CONFLICT");
  }
  return tx.inventoryTransaction.create({
    data: {
      inventoryItemId: item.id,
      quantityChange: delta,
      quantityBefore: before,
      quantityAfter: before.add(delta),
      unit,
      transactionType: input.transactionType,
      reason: input.reason.trim(),
      unitCost:
        input.unitCost === undefined ? undefined : amount(input.unitCost),
      totalCost:
        input.totalCost === undefined ? undefined : amount(input.totalCost),
      supplier: input.supplier?.trim() || undefined,
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      productionIncidentId: input.productionIncidentId,
      productionAttemptId: input.productionAttemptId,
      productionMaterialConsumptionId: input.productionMaterialConsumptionId,
      correctsTransactionId: input.correctsTransactionId,
      idempotencyKey: input.idempotencyKey,
      note: input.note?.trim() || undefined,
    },
  });
}

export async function createInventoryItem(input: {
  name: string;
  inventoryType: InventoryType;
  baseUnit: InventoryUnit;
  openingQuantity: string;
  minimumQuantity: string;
  unitCost: string;
  sku?: string;
  brand?: string;
  supplier?: string;
  storageLocation?: string;
  notes?: string;
  defaultContainerCapacity?: string;
  containerLabel?: string;
}) {
  const baseUnit = input.baseUnit;
  const opening = amount(input.openingQuantity);
  const minimum = amount(input.minimumQuantity);
  const cost = amount(input.unitCost);
  validateQuantity(opening, baseUnit);
  validateQuantity(minimum, baseUnit);
  if (minimum.isNegative() || cost.isNegative() || !input.name.trim())
    throw new Error("INVALID_INVENTORY_ITEM");
  const defaultCapacity = input.defaultContainerCapacity?.trim()
    ? amount(input.defaultContainerCapacity)
    : null;
  if (defaultCapacity && (defaultCapacity.isNegative() || defaultCapacity.isZero()))
    throw new Error("INVALID_CONTAINER");
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        name: input.name.trim(),
        inventoryType: input.inventoryType,
        baseUnit,
        currentQuantity: 0,
        minimumQuantity: minimum,
        unitCost: cost,
        sku: input.sku?.trim() || undefined,
        brand: input.brand?.trim() || undefined,
        supplier: input.supplier?.trim() || undefined,
        storageLocation: input.storageLocation?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        defaultContainerCapacity: defaultCapacity ?? undefined,
        containerLabel: input.containerLabel?.trim() || undefined,
      },
    });
    if (!opening.isZero())
      await changeInventoryQuantity(tx, {
        inventoryItemId: item.id,
        delta: opening,
        transactionType: "INITIAL_BALANCE",
        reason: "Opening balance",
        unitCost: cost,
        totalCost: opening.mul(cost),
      });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  });
}

export function addInventoryStock(input: {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
  supplier?: string;
  note?: string;
  reference?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: input.inventoryItemId },
    });
    const quantity = amount(input.quantity);
    const unitCost = amount(input.unitCost);
    const transaction = await changeInventoryQuantity(tx, {
      inventoryItemId: item.id,
      delta: quantity,
      transactionType: "PURCHASE",
      reason: input.reference
        ? `Purchase ${input.reference}`
        : "Stock purchase",
      unitCost,
      totalCost: quantity.mul(unitCost),
      supplier: input.supplier,
      note: input.note,
    });
    const newQuantity = new Prisma.Decimal(item.currentQuantity).add(quantity);
    const weightedCost = new Prisma.Decimal(item.currentQuantity)
      .mul(item.unitCost)
      .add(quantity.mul(unitCost))
      .div(newQuantity);
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { unitCost: weightedCost },
    });
    return transaction;
  });
}
export function recordInventoryWaste(input: {
  inventoryItemId: string;
  quantity: string;
  reason: string;
  note?: string;
}) {
  return prisma.$transaction((tx) =>
    changeInventoryQuantity(tx, {
      inventoryItemId: input.inventoryItemId,
      delta: new Prisma.Decimal(input.quantity).neg(),
      transactionType: "WASTE",
      reason: input.reason,
      note: input.note,
    }),
  );
}
export function adjustInventory(input: {
  inventoryItemId: string;
  delta: string;
  reason: string;
  note?: string;
}) {
  return prisma.$transaction((tx) =>
    changeInventoryQuantity(tx, {
      inventoryItemId: input.inventoryItemId,
      delta: input.delta,
      transactionType: "MANUAL_ADJUSTMENT",
      reason: input.reason,
      note: input.note,
    }),
  );
}

export type UpdateInventoryItemInput = {
  id: string;
  name: string;
  baseUnit: InventoryUnit;
  minimumQuantity: string;
  unitCost: string;
  brand?: string;
  supplier?: string;
  storageLocation?: string;
  notes?: string;
  defaultContainerCapacity?: string;
  containerLabel?: string;
};

export async function updateInventoryItemInTransaction(
  tx: Prisma.TransactionClient,
  input: UpdateInventoryItemInput,
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: input.id },
    include: { _count: { select: { transactions: true, recipeItems: true } } },
  });
  if (!item || item.inventoryType !== "PRODUCTION_SUPPLY")
    throw new Error("INVENTORY_ITEM_NOT_FOUND");

  const minimum = amount(input.minimumQuantity);
  const cost = amount(input.unitCost);
  const defaultCapacity = input.defaultContainerCapacity?.trim()
    ? amount(input.defaultContainerCapacity)
    : null;
  validateQuantity(minimum, input.baseUnit);
  if (minimum.isNegative() || cost.isNegative() || !input.name.trim())
    throw new Error("INVALID_INVENTORY_ITEM");
  if (defaultCapacity && (defaultCapacity.isNegative() || defaultCapacity.isZero()))
    throw new Error("INVALID_CONTAINER");

  if (input.baseUnit !== undefined && input.baseUnit !== item.baseUnit)
    throw new Error("UNIT_CHANGE_BLOCKED");

  return tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      name: input.name.trim(),
      // Keep the historical internal unit unchanged. The UI exposes only
      // whole user-defined units and never permits changing this compatibility field.
      baseUnit: item.baseUnit,
      minimumQuantity: minimum,
      unitCost: cost,
      brand: input.brand?.trim() || null,
      supplier: input.supplier?.trim() || null,
      storageLocation: input.storageLocation?.trim() || null,
      notes: input.notes?.trim() || null,
      defaultContainerCapacity: defaultCapacity,
      containerLabel: input.containerLabel?.trim() || null,
    },
  });
}

export function updateInventoryItem(input: UpdateInventoryItemInput) {
  return prisma.$transaction((tx) =>
    updateInventoryItemInTransaction(tx, input),
  );
}

export async function removeOrArchiveInventoryItemInTransaction(
  tx: Prisma.TransactionClient,
  input: { id: string; confirmed: boolean },
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: input.id },
    include: { _count: { select: { transactions: true, recipeItems: true } } },
  });
  if (!item || item.inventoryType !== "PRODUCTION_SUPPLY")
    throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (!input.confirmed)
    throw new Error("MATERIAL_CONFIRMATION_MISMATCH");

  const hasHistory =
    item._count.transactions > 0 ||
    item._count.recipeItems > 0 ||
    Boolean(item.productVariantId);
  if (!hasHistory) {
    await tx.inventoryItem.delete({ where: { id: item.id } });
    return { mode: "deleted" as const, name: item.name };
  }

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { isActive: false },
  });
  return { mode: "archived" as const, name: item.name };
}

export function removeOrArchiveInventoryItem(input: {
  id: string;
  confirmed: boolean;
}) {
  return prisma.$transaction((tx) =>
    removeOrArchiveInventoryItemInTransaction(tx, input),
  );
}

export async function restoreInventoryItemInTransaction(
  tx: Prisma.TransactionClient,
  input: { id: string },
) {
  const item = await tx.inventoryItem.findUnique({ where: { id: input.id } });
  if (!item || item.inventoryType !== "PRODUCTION_SUPPLY")
    throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (item.isActive) throw new Error("INVENTORY_ITEM_ALREADY_ACTIVE");
  const restored = await tx.inventoryItem.update({
    where: { id: item.id },
    data: { isActive: true },
  });
  return { mode: "restored" as const, name: restored.name };
}

export function restoreInventoryItem(input: { id: string }) {
  return prisma.$transaction((tx) => restoreInventoryItemInTransaction(tx, input));
}

export async function permanentlyDeleteArchivedInventoryItemInTransaction(
  tx: Prisma.TransactionClient,
  input: { id: string; confirmed: boolean },
) {
  const item = await tx.inventoryItem.findUnique({
    where: { id: input.id },
    include: { _count: { select: { transactions: true, recipeItems: true, containers: true } } },
  });
  if (!item || item.inventoryType !== "PRODUCTION_SUPPLY")
    throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (item.isActive) throw new Error("MATERIAL_MUST_BE_ARCHIVED");
  if (!input.confirmed) throw new Error("MATERIAL_CONFIRMATION_MISMATCH");

  // This is an explicit Admin Mode purge. Detach immutable-history links first,
  // then remove only records owned by this archived material.
  await tx.inventoryTransaction.updateMany({
    where: { inventoryItemId: item.id },
    data: { productionMaterialConsumptionId: null, correctsTransactionId: null },
  });
  const recipeItems = await tx.productionRecipeItem.findMany({
    where: { inventoryItemId: item.id },
    select: { id: true },
  });
  if (recipeItems.length) {
    await tx.productionMaterialConsumption.deleteMany({
      where: { recipeItemId: { in: recipeItems.map((entry) => entry.id) } },
    });
    await tx.productionRecipeItem.deleteMany({
      where: { id: { in: recipeItems.map((entry) => entry.id) } },
    });
  }
  await tx.inventoryTransaction.deleteMany({ where: { inventoryItemId: item.id } });
  await tx.inventoryContainer.deleteMany({ where: { inventoryItemId: item.id } });
  await tx.inventoryItem.delete({ where: { id: item.id } });
  return { mode: "deleted" as const, name: item.name };
}

export function permanentlyDeleteArchivedInventoryItem(input: { id: string; confirmed: boolean }) {
  return prisma.$transaction((tx) => permanentlyDeleteArchivedInventoryItemInTransaction(tx, input));
}

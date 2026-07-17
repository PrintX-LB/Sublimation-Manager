import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { changeInventoryQuantity } from "@/lib/inventory/service";

export const RECIPE_ROLES = [
  "BLANK_PRODUCT",
  "PRINT_MEDIA",
  "INK",
  "TAPE",
  "PROTECTIVE_PAPER",
  "PACKAGING",
  "CLEANING",
  "OTHER",
] as const;
export const CONSUMPTION_STAGES = [
  "ORDER_ALLOCATION",
  "PRINT_SHEET_GENERATION",
  "PRODUCTION_START",
  "PRODUCTION_COMPLETION",
  "MANUAL_ONLY",
] as const;
export type RecipeRole = (typeof RECIPE_ROLES)[number];
export type ConsumptionStage = (typeof CONSUMPTION_STAGES)[number];

export type PhysicalPrintSheetSlot = {
  productVariantId: string;
  orderId: string;
  orderItemId?: string;
  productionAttemptId?: string;
};

function decimal(value: string | Prisma.Decimal) {
  try {
    return new Prisma.Decimal(value.toString());
  } catch {
    throw new Error("INVALID_RECIPE_QUANTITY");
  }
}

export async function createOrUpdateRecipe(input: {
  productVariantId: string;
  name: string;
  active?: boolean;
}) {
  if (!input.name.trim()) throw new Error("RECIPE_NAME_REQUIRED");
  return prisma.productionRecipe.upsert({
    where: { productVariantId: input.productVariantId },
    update: { name: input.name.trim(), active: input.active ?? true },
    create: {
      productVariantId: input.productVariantId,
      name: input.name.trim(),
      active: input.active ?? true,
    },
  });
}

export async function addRecipeItem(input: {
  recipeId: string;
  inventoryItemId: string;
  quantity: string;
  unit: string;
  materialRole: RecipeRole;
  consumptionStage: ConsumptionStage;
  required?: boolean;
  notes?: string;
}) {
  const quantity = decimal(input.quantity);
  if (!quantity.isFinite() || quantity.isZero() || quantity.isNegative())
    throw new Error("INVALID_RECIPE_QUANTITY");
  if (!quantity.mod(1).isZero()) throw new Error("WHOLE_UNIT_REQUIRED");
  if (
    !RECIPE_ROLES.includes(input.materialRole) ||
    !CONSUMPTION_STAGES.includes(input.consumptionStage)
  )
    throw new Error("INVALID_RECIPE_OPTION");
  return prisma.$transaction(async (tx) => {
    const inventory = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      select: { baseUnit: true, isActive: true },
    });
    if (!inventory) throw new Error("INVENTORY_ITEM_NOT_FOUND");
    if (!inventory.isActive) throw new Error("INVENTORY_ITEM_INACTIVE");
    return tx.productionRecipeItem.create({
      data: {
        recipeId: input.recipeId,
        inventoryItemId: input.inventoryItemId,
        quantity,
        unit: inventory.baseUnit,
        materialRole: input.materialRole,
        consumptionStage: input.consumptionStage,
        required: input.required ?? true,
        notes: input.notes?.trim() || undefined,
      },
    });
  });
}

export async function updateRecipeItem(input: {
  id: string;
  inventoryItemId: string;
  quantity: string;
  unit: string;
  materialRole: RecipeRole;
  consumptionStage: ConsumptionStage;
  required?: boolean;
  notes?: string;
}) {
  const quantity = decimal(input.quantity);
  if (!quantity.isFinite() || quantity.isZero() || quantity.isNegative())
    throw new Error("INVALID_RECIPE_QUANTITY");
  if (!quantity.mod(1).isZero()) throw new Error("WHOLE_UNIT_REQUIRED");
  if (
    !RECIPE_ROLES.includes(input.materialRole) ||
    !CONSUMPTION_STAGES.includes(input.consumptionStage)
  )
    throw new Error("INVALID_RECIPE_OPTION");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.productionRecipeItem.findUnique({
      where: { id: input.id },
      include: { consumptions: true },
    });
    if (!existing) throw new Error("RECIPE_ITEM_NOT_FOUND");
    const inventory = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
    });
    if (!inventory || !inventory.isActive)
      throw new Error("INVENTORY_ITEM_INACTIVE");
    const duplicate = await tx.productionRecipeItem.findFirst({
      where: {
        recipeId: existing.recipeId,
        inventoryItemId: input.inventoryItemId,
        consumptionStage: input.consumptionStage,
        id: { not: input.id },
        active: true,
      },
    });
    if (duplicate) throw new Error("DUPLICATE_RECIPE_ITEM");
    if (existing.consumptions.length) {
      return tx.productionRecipeItem.update({
        where: { id: input.id },
        data: { active: false },
      });
    }
    return tx.productionRecipeItem.update({
      where: { id: input.id },
      data: {
        inventoryItemId: input.inventoryItemId,
        quantity,
        unit: inventory.baseUnit,
        materialRole: input.materialRole,
        consumptionStage: input.consumptionStage,
        required: input.required ?? true,
        notes: input.notes?.trim() || null,
      },
    });
  });
}

export async function removeRecipeItem(id: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.productionRecipeItem.findUnique({
      where: { id },
      include: { consumptions: true },
    });
    if (!item) throw new Error("RECIPE_ITEM_NOT_FOUND");
    if (item.consumptions.length)
      return tx.productionRecipeItem.update({
        where: { id },
        data: { active: false },
      });
    await tx.productionRecipeItem.delete({ where: { id } });
    return null;
  });
}

export function setRecipeActive(recipeId: string, active: boolean) {
  return prisma.productionRecipe.update({
    where: { id: recipeId },
    data: { active },
  });
}

export function correctMaterialConsumption(input: {
  consumptionId: string;
  delta: string;
  reason: string;
  note?: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const consumption = await tx.productionMaterialConsumption.findUnique({
      where: { id: input.consumptionId },
      include: {
        inventoryTransaction: true,
        recipeItem: { include: { inventoryItem: true } },
      },
    });
    if (!consumption?.inventoryTransaction)
      throw new Error("CONSUMPTION_NOT_FOUND");
    const delta = decimal(input.delta);
    if (delta.isZero() || !input.reason.trim())
      throw new Error("INVALID_CORRECTION");
    const correction = await changeInventoryQuantity(tx, {
      inventoryItemId: consumption.recipeItem.inventoryItemId,
      delta,
      transactionType: "CORRECTION",
      reason: input.reason,
      note: input.note,
      unit: consumption.unit,
      unitCost: consumption.unitCost,
      totalCost: delta.mul(consumption.unitCost),
      orderId: consumption.orderId ?? undefined,
      orderItemId: consumption.orderItemId ?? undefined,
      productionAttemptId: consumption.productionAttemptId ?? undefined,
      productionIncidentId: consumption.productionIncidentId ?? undefined,
      correctsTransactionId: consumption.inventoryTransaction.id,
      idempotencyKey: input.idempotencyKey,
    });
    if (consumption.orderId)
      await tx.order.update({
        where: { id: consumption.orderId },
        data: {
          actualProductionCost: {
            increment: delta.mul(consumption.unitCost).neg(),
          },
        },
      });
    return correction;
  });
}

export function recipeCost(
  items: Array<{
    quantity: Prisma.Decimal;
    inventoryItem: { unitCost: Prisma.Decimal };
  }>,
) {
  return items.reduce(
    (sum, item) =>
      sum.add(
        new Prisma.Decimal(item.quantity).mul(item.inventoryItem.unitCost),
      ),
    new Prisma.Decimal(0),
  );
}

export async function consumeRecipeStage(
  tx: Prisma.TransactionClient,
  input: {
    productVariantId: string;
    stage: ConsumptionStage;
    multiplier: string | Prisma.Decimal;
    orderId?: string;
    orderItemId?: string;
    productionAttemptId?: string;
    printSheetId?: string;
    incidentId?: string;
    idempotencyPrefix: string;
    overrides?: Record<string, string | Prisma.Decimal>;
    excludeRoles?: RecipeRole[];
    orderCostMultiplierByRole?: Partial<
      Record<RecipeRole, string | Prisma.Decimal>
    >;
  },
) {
  const multiplier = decimal(input.multiplier);
  if (multiplier.isNegative() || multiplier.isZero())
    throw new Error("INVALID_RECIPE_MULTIPLIER");
  const recipe = await tx.productionRecipe.findFirst({
    where: { productVariantId: input.productVariantId, active: true },
    include: {
      items: {
        include: { inventoryItem: true },
        where: { consumptionStage: input.stage },
      },
    },
  });
  if (!recipe)
    return {
      consumed: [],
      totalCost: new Prisma.Decimal(0),
      missingRecipe: true,
    };
  const candidates = recipe.items.filter(
    (line) =>
      line.active &&
      line.materialRole !== "BLANK_PRODUCT" &&
      !input.excludeRoles?.includes(line.materialRole as RecipeRole),
  );
  const required = candidates.filter((line) => line.required);
  const shortages: string[] = [];
  for (const line of required) {
    const quantity = new Prisma.Decimal(
      input.overrides?.[line.id] ?? line.quantity,
    ).mul(multiplier);
    if (
      new Prisma.Decimal(line.inventoryItem.currentQuantity).lessThan(quantity)
    )
      shortages.push(
        `${line.inventoryItem.name}: requires ${quantity.toString()} unit(s), available ${line.inventoryItem.currentQuantity.toString()} unit(s)`,
      );
  }
  if (shortages.length)
    throw new Error(`INSUFFICIENT_RECIPE_STOCK:${shortages.join("; ")}`);
  const consumed: unknown[] = [];
  let totalCost = new Prisma.Decimal(0);
  let orderCost = new Prisma.Decimal(0);
  for (const line of candidates) {
    const quantity = new Prisma.Decimal(
      input.overrides?.[line.id] ?? line.quantity,
    ).mul(multiplier);
    const idempotencyKey = `${input.idempotencyPrefix}:${recipe.id}:${line.id}:${input.stage}`;
    const existing = await tx.productionMaterialConsumption.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      consumed.push(existing);
      continue;
    }
    if (
      new Prisma.Decimal(line.inventoryItem.currentQuantity).lessThan(quantity)
    )
      continue;
    const consumption = await tx.productionMaterialConsumption.create({
      data: {
        recipeItemId: line.id,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        productionAttemptId: input.productionAttemptId,
        printSheetId: input.printSheetId,
        productionIncidentId: input.incidentId,
        consumptionStage: input.stage,
        quantity,
        unit: line.unit,
        unitCost: line.inventoryItem.unitCost,
        materialNameSnapshot: line.inventoryItem.name,
        materialRoleSnapshot: line.materialRole,
        idempotencyKey,
      },
    });
    const transaction = await changeInventoryQuantity(tx, {
      inventoryItemId: line.inventoryItemId,
      delta: quantity.neg(),
      transactionType: input.incidentId
        ? "PRODUCTION_INCIDENT"
        : "ORDER_CONSUMPTION",
      reason: `Recipe consumption: ${recipe.name}`,
      unit: line.unit,
      unitCost: line.inventoryItem.unitCost,
      totalCost: quantity.mul(line.inventoryItem.unitCost),
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      productionIncidentId: input.incidentId,
      productionAttemptId: input.productionAttemptId,
      productionMaterialConsumptionId: consumption.id,
      idempotencyKey: `${idempotencyKey}:inventory`,
    });
    consumed.push({ consumption, transaction });
    const lineCost = quantity.mul(line.inventoryItem.unitCost);
    totalCost = totalCost.add(lineCost);
    orderCost = orderCost.add(
      lineCost.mul(
        input.orderCostMultiplierByRole?.[line.materialRole as RecipeRole] ===
          undefined
          ? 1
          : decimal(
              input.orderCostMultiplierByRole[line.materialRole as RecipeRole]!,
            ),
      ),
    );
  }
  if (input.orderId && !orderCost.isZero())
    await tx.order.update({
      where: { id: input.orderId },
      data: { actualProductionCost: { increment: orderCost } },
    });
  return { consumed, totalCost, missingRecipe: false };
}

/**
 * Consumes the materials for one physical print sheet. Slot-specific materials
 * are consumed per slot, while PRINT_MEDIA is resolved and consumed exactly once.
 */
export async function consumePhysicalPrintSheet(
  tx: Prisma.TransactionClient,
  input: {
    printSheetId: string;
    slots: PhysicalPrintSheetSlot[];
  },
) {
  if (!input.slots.length) throw new Error("PRINT_SHEET_HAS_NO_SLOTS");

  const configured = await Promise.all(
    input.slots.map(async (slot) => ({
      slot,
      recipe: await tx.productionRecipe.findFirst({
        where: { productVariantId: slot.productVariantId, active: true },
        include: {
          items: {
            where: {
              active: true,
              consumptionStage: "PRINT_SHEET_GENERATION",
            },
            include: { inventoryItem: true },
          },
        },
      }),
    })),
  );

  const warnings: string[] = [];
  for (const [index, entry] of configured.entries()) {
    if (!entry.recipe) {
      warnings.push(`Slot ${index + 1} has no active production recipe.`);
    }
  }

  // Non-paper materials remain slot-specific. PRINT_MEDIA is always excluded
  // here so it cannot be multiplied by the number of artwork slots.
  for (const [index, entry] of configured.entries()) {
    if (!entry.recipe) continue;
    await consumeRecipeStage(tx, {
      productVariantId: entry.slot.productVariantId,
      stage: "PRINT_SHEET_GENERATION",
      multiplier: "1",
      orderId: entry.slot.orderId,
      orderItemId: entry.slot.orderItemId,
      printSheetId: input.printSheetId,
      idempotencyPrefix: `sheet:${input.printSheetId}:slot:${index + 1}`,
      excludeRoles: ["PRINT_MEDIA"],
    });
  }

  const paperConfigurations = configured.flatMap((entry) =>
    (entry.recipe?.items ?? [])
      .filter((line) => line.materialRole === "PRINT_MEDIA")
      .map((line) => ({ entry, line })),
  );
  if (!paperConfigurations.length) {
    warnings.push(
      "No physical print paper is configured at PRINT_SHEET_GENERATION. No paper was deducted.",
    );
    return { warnings, paperConsumption: null };
  }

  const inventoryItemIds = new Set(
    paperConfigurations.map(({ line }) => line.inventoryItemId),
  );
  if (inventoryItemIds.size !== 1) {
    throw new Error(
      "PRINT_MEDIA_CONFIGURATION_CONFLICT:Selected slots use different physical paper inventory items.",
    );
  }

  const selected = paperConfigurations[0]!;
  if (
    !selected.line.quantity.mod(1).isZero() ||
    !selected.line.quantity.equals(1)
  ) {
    throw new Error(
      "PRINT_MEDIA_UNIT_INVALID:Physical print paper must consume exactly 1 whole unit.",
    );
  }
  if (!selected.line.inventoryItem.isActive) {
    throw new Error(
      `PRINT_MEDIA_INACTIVE:${selected.line.inventoryItem.name} is inactive.`,
    );
  }
  if (
    new Prisma.Decimal(selected.line.inventoryItem.currentQuantity).lessThan(1)
  ) {
    throw new Error(
      `INSUFFICIENT_PRINT_MEDIA:${selected.line.inventoryItem.name} requires 1 unit, available ${selected.line.inventoryItem.currentQuantity.toString()} units.`,
    );
  }

  const orderIds = new Set(input.slots.map((slot) => slot.orderId));
  const allocationOrder = input.slots.find(
    (slot) => slot.orderId !== selected.entry.slot.orderId,
  );
  const mixedOrders = orderIds.size > 1;
  const paperResult = await consumeRecipeStage(tx, {
    productVariantId: selected.entry.slot.productVariantId,
    stage: "PRINT_SHEET_GENERATION",
    multiplier: "1",
    orderId: selected.entry.slot.orderId,
    orderItemId: selected.entry.slot.orderItemId,
    printSheetId: input.printSheetId,
    idempotencyPrefix: `sheet:${input.printSheetId}:physical-paper`,
    overrides: { [selected.line.id]: "1" },
    excludeRoles: RECIPE_ROLES.filter(
      (role) => role !== "PRINT_MEDIA",
    ) as RecipeRole[],
    orderCostMultiplierByRole: mixedOrders ? { PRINT_MEDIA: "0.5" } : undefined,
  });

  // One physical sheet can serve two orders. The inventory transaction remains
  // singular; only the historical cost allocation is split between the orders.
  if (allocationOrder) {
    const allocationKey = `sheet:${input.printSheetId}:physical-paper-allocation:${allocationOrder.orderId}`;
    const existing = await tx.productionMaterialConsumption.findUnique({
      where: { idempotencyKey: allocationKey },
    });
    if (!existing) {
      const halfCost = new Prisma.Decimal(
        selected.line.inventoryItem.unitCost,
      ).div(2);
      await tx.productionMaterialConsumption.create({
        data: {
          recipeItemId: selected.line.id,
          orderId: allocationOrder.orderId,
          orderItemId: allocationOrder.orderItemId,
          printSheetId: input.printSheetId,
          consumptionStage: "PRINT_SHEET_GENERATION",
          quantity: new Prisma.Decimal(1),
          unit: "SHEET",
          unitCost: selected.line.inventoryItem.unitCost,
          materialNameSnapshot: selected.line.inventoryItem.name,
          materialRoleSnapshot: "PRINT_MEDIA",
          idempotencyKey: allocationKey,
        },
      });
      await tx.order.update({
        where: { id: allocationOrder.orderId },
        data: { actualProductionCost: { increment: halfCost } },
      });
    }
  }

  const missingPaperSlots = configured
    .map((entry, index) => ({
      index,
      hasPaper: (entry.recipe?.items ?? []).some(
        (line) => line.materialRole === "PRINT_MEDIA",
      ),
    }))
    .filter(({ hasPaper }) => !hasPaper)
    .map(({ index }) => index + 1);
  if (missingPaperSlots.length) {
    warnings.push(
      `Physical paper was resolved from another compatible slot; configure PRINT_MEDIA for slot ${missingPaperSlots.join(", ")}.`,
    );
  }

  return {
    warnings,
    paperConsumption: {
      inventoryItemId: selected.line.inventoryItemId,
      inventoryItemName: selected.line.inventoryItem.name,
      quantity: "1",
      unit: "SHEET",
      result: paperResult,
    },
  };
}

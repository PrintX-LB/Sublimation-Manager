import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToCents } from "@/lib/money";
import { calculateTotals } from "./totals";
import type { OrderInput } from "@/lib/validation/order";
import { COMMIT_STATUS, isOrderStatus, normalizeOrderStatus } from "./status";
import { changeInventoryQuantity } from "@/lib/inventory/service";
import { consumeRecipeStage } from "@/lib/production/recipes";
import {
  OTHER_MATERIAL_WASTE_OPTIONS,
  PRODUCTION_INCIDENT_REASONS,
  type ProductionIncidentReason,
} from "./production-incident-options";

export { OTHER_MATERIAL_WASTE_OPTIONS, PRODUCTION_INCIDENT_REASONS } from "./production-incident-options";

function decimal(value: string | Prisma.Decimal) {
  return new Prisma.Decimal(value.toString());
}

function amountForStock(value: Prisma.Decimal, quantity: number) {
  return value.mul(quantity);
}

async function moveStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  delta: Prisma.Decimal,
  movementType: string,
  reason: string,
  orderId?: string,
  orderItemId?: string,
  productionIncidentId?: string,
  productionAttemptId?: string,
) {
  if (delta.isZero()) return;
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { stockQuantity: true },
  });
  if (!variant) throw new Error("VARIANT_NOT_FOUND");
  const before = decimal(variant.stockQuantity);
  if (delta.isNegative() && before.lessThan(delta.abs()))
    throw new Error("INSUFFICIENT_STOCK");
  const inventoryItem = tx.inventoryItem
    ? await tx.inventoryItem.findUnique({ where: { productVariantId: variantId }, select: { id: true, baseUnit: true } })
    : null;
  if (inventoryItem) {
    await changeInventoryQuantity(tx, {
      inventoryItemId: inventoryItem.id,
      delta,
      transactionType: movementType === "production_reprint" ? "PRODUCTION_INCIDENT" : "ORDER_CONSUMPTION",
      reason,
      unit: inventoryItem.baseUnit,
      orderId,
      orderItemId,
      productionIncidentId,
      productionAttemptId,
      syncProductVariant: false,
    });
  }
  const updated = await tx.productVariant.updateMany({
    where: {
      id: variantId,
      ...(delta.isNegative() ? { stockQuantity: { gte: delta.abs() } } : {}),
    },
    data: {
      stockQuantity: delta.isNegative()
        ? { decrement: delta.abs() }
        : { increment: delta },
    },
  });
  if (updated.count !== 1) throw new Error("STOCK_CONFLICT");
  const current = await tx.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stockQuantity: true },
  });
  const after = decimal(current.stockQuantity);
  await tx.stockMovement.create({
    data: {
      productVariantId: variantId,
      orderId,
      orderItemId,
      quantityChange: delta,
      stockBefore: before,
      stockAfter: after,
      movementType,
      reason,
      productionIncidentId,
      productionAttemptId,
    },
  });
}

/**
 * Records a failed production attempt and allocates exactly one replacement
 * blank in the same SQLite transaction. The idempotency key is supplied by
 * the confirmation form and makes retries safe.
 */
export async function recordProductionIncident(input: {
  orderItemId: string;
  reason: string;
  note?: string;
  idempotencyKey: string;
  blankProductDamaged: boolean;
  otherMaterialWasted: string;
  wastedMaterials?: Array<{ inventoryItemId: string; quantity: string }>;
}) {
  if (!PRODUCTION_INCIDENT_REASONS.includes(input.reason as ProductionIncidentReason))
    throw new Error("INVALID_INCIDENT_REASON");
  if (!input.idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (typeof input.blankProductDamaged !== "boolean") throw new Error("BLANK_OUTCOME_REQUIRED");
  if (!(OTHER_MATERIAL_WASTE_OPTIONS as readonly string[]).includes(input.otherMaterialWasted))
    throw new Error("INVALID_MATERIAL_WASTE");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.productionIncident.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { failedAttempt: true, replacementAttempt: true, stockMovement: true },
    });
    if (existing) return existing;

    const item = await tx.orderItem.findUnique({
      where: { id: input.orderItemId },
      include: {
        order: { select: { id: true, orderNumber: true, status: true, actualProductionCost: true } },
        productVariant: { select: { id: true, stockPerUnit: true, productionCost: true, stockQuantity: true } },
        productionAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
      },
    });
    if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
    if (!["Ready to print", "In production"].includes(item.order.status))
      throw new Error("ORDER_NOT_IN_PRODUCTION");
    if (!item.productVariant) throw new Error("VARIANT_NOT_FOUND");

    const latest = item.productionAttempts[0];
    if (latest?.status === "Failed") throw new Error("PRODUCTION_ATTEMPT_ALREADY_FAILED");
    const incident = await tx.productionIncident.create({
      data: {
        orderItemId: item.id,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        note: input.note?.trim() || null,
        blankProductDamaged: input.blankProductDamaged,
        otherMaterialWasted: input.otherMaterialWasted,
        additionalMaterialCost: input.blankProductDamaged ? item.productVariant.productionCost : new Prisma.Decimal(0),
      },
    });
    const failedAttempt = latest
      ? await tx.productionAttempt.update({ where: { id: latest.id }, data: { status: "Failed" } })
      : await tx.productionAttempt.create({
          data: { orderItemId: item.id, attemptNumber: 1, status: "Failed" },
        });
    const replacementAttempt = await tx.productionAttempt.create({
      data: {
        orderItemId: item.id,
        attemptNumber: failedAttempt.attemptNumber + 1,
        status: "Ready to Print",
        blankConsumed: input.blankProductDamaged,
      },
    });
    let additionalCost = new Prisma.Decimal(0);
    let wasteCost = new Prisma.Decimal(0);
    const recipe = item.productVariant && tx.productionRecipe
      ? await tx.productionRecipe.findFirst({ where: { productVariantId: item.productVariant.id, active: true }, include: { items: true } })
      : null;
    const recipeMaterialIds = new Set((recipe?.items ?? []).filter((line) => line.materialRole !== "BLANK_PRODUCT").map((line) => line.inventoryItemId));
    if (input.blankProductDamaged) {
      const stockQuantity = new Prisma.Decimal(item.productVariant.stockPerUnit);
      await moveStock(
        tx,
        item.productVariant.id,
        stockQuantity.neg(),
        "production_reprint",
        `Production incident ${incident.id} for ${item.order.orderNumber}, attempt ${replacementAttempt.attemptNumber}`,
        item.order.id,
        item.id,
        incident.id,
        replacementAttempt.id,
      );
      await tx.order.update({
        where: { id: item.order.id },
        data: { actualProductionCost: { increment: item.productVariant.productionCost } },
      });
      additionalCost = additionalCost.add(item.productVariant.productionCost);
    }
    for (const [index, waste] of (input.wastedMaterials ?? []).entries()) {
      if (!recipeMaterialIds.has(waste.inventoryItemId)) throw new Error("MATERIAL_NOT_IN_RECIPE");
      const quantity = new Prisma.Decimal(waste.quantity);
      if (!quantity.isFinite() || quantity.isNegative() || quantity.isZero()) throw new Error("INVALID_WASTE_QUANTITY");
      const inventory = await tx.inventoryItem.findUnique({ where: { id: waste.inventoryItemId }, select: { baseUnit: true, unitCost: true, isActive: true } });
      if (!inventory) throw new Error("INVENTORY_ITEM_NOT_FOUND");
      const transaction = await changeInventoryQuantity(tx, { inventoryItemId: waste.inventoryItemId, delta: quantity.neg(), transactionType: "PRODUCTION_INCIDENT", reason: `Material wasted during incident ${incident.id}`, unit: inventory.baseUnit, unitCost: inventory.unitCost, totalCost: quantity.mul(inventory.unitCost), orderId: item.order.id, orderItemId: item.id, productionIncidentId: incident.id, productionAttemptId: replacementAttempt.id, idempotencyKey: `${input.idempotencyKey}:waste:${index}:${waste.inventoryItemId}` });
      additionalCost = additionalCost.add(quantity.mul(inventory.unitCost));
      wasteCost = wasteCost.add(quantity.mul(inventory.unitCost));
      void transaction;
    }
    if (!wasteCost.isZero()) {
      await tx.order.update({ where: { id: item.order.id }, data: { actualProductionCost: { increment: wasteCost } } });
    }
    return tx.productionIncident.update({
      where: { id: incident.id },
      data: { failedAttemptId: failedAttempt.id, replacementAttemptId: replacementAttempt.id, additionalMaterialCost: additionalCost },
      include: { failedAttempt: true, replacementAttempt: true, stockMovement: true },
    });
  }).catch(async (error: unknown) => {
    // A concurrent retry can win the idempotency unique index first. Return
    // that committed result instead of asking the operator to deduct again.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.productionIncident.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { failedAttempt: true, replacementAttempt: true, stockMovement: true },
      });
      if (existing) return existing;
    }
    throw error;
  });
}

async function commitItems(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    items: Array<{
      id: string;
      quantity: number;
      productVariantId: string | null;
    }>;
  },
  reason: string,
) {
  for (const item of order.items) {
    if (!item.productVariantId) continue;
    const variant = await tx.productVariant.findUnique({
      where: { id: item.productVariantId },
      select: { stockPerUnit: true },
    });
    if (!variant) throw new Error("VARIANT_NOT_FOUND");
    await moveStock(
      tx,
      item.productVariantId,
      amountForStock(decimal(variant.stockPerUnit), item.quantity).neg(),
      "order_commit",
      reason,
      order.id,
      item.id,
    );
  }
}

async function restoreItems(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    items: Array<{
      id: string;
      quantity: number;
      productVariantId: string | null;
    }>;
  },
  reason: string,
) {
  for (const item of order.items) {
    if (!item.productVariantId) continue;
    const variant = await tx.productVariant.findUnique({
      where: { id: item.productVariantId },
      select: { stockPerUnit: true },
    });
    if (!variant) throw new Error("VARIANT_NOT_FOUND");
    await moveStock(
      tx,
      item.productVariantId,
      amountForStock(decimal(variant.stockPerUnit), item.quantity),
      "order_restore",
      reason,
      order.id,
      item.id,
    );
  }
}

/** Releases a blank reservation when an order never entered production. */
export async function releaseUnconsumedOrderStock(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      stockCommitted: true,
      items: {
        select: {
          id: true,
          quantity: true,
          productVariantId: true,
          productionAttempts: { select: { status: true } },
          productionIncidents: { select: { id: true } },
        },
      },
      materialConsumptions: { select: { id: true } },
    },
  });
  if (!order?.stockCommitted || order.materialConsumptions.length) return false;
  const hasProductionActivity = order.items.some(
    (item) =>
      item.productionIncidents.length > 0 ||
      item.productionAttempts.some(
        (attempt) =>
          !["pending", "ready to print"].includes(
            attempt.status.trim().toLowerCase(),
          ),
      ),
  );
  if (hasProductionActivity) return false;
  await restoreItems(
    tx,
    order,
    "Unproduced order deleted; stock reservation released",
  );
  return true;
}

async function ensureProductionAttempts(
  tx: Prisma.TransactionClient,
  items: Array<{ id: string }>,
) {
  for (const item of items) {
    const existing = await tx.productionAttempt.findFirst({
      where: { orderItemId: item.id },
      select: { id: true },
    });
    if (!existing) {
      await tx.productionAttempt.create({
        data: {
          orderItemId: item.id,
          attemptNumber: 1,
          status: "Ready to Print",
        },
      });
    }
  }
}

export async function createOrder(input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    let customer = input.customerId
      ? await tx.customer.findFirst({
          where: { id: input.customerId, isArchived: false },
        })
      : null;
    if (!customer && input.newCustomerName) {
      const sequence = await tx.sequence.upsert({
        where: { key: "customer" },
        update: { value: { increment: 1 } },
        create: { key: "customer", value: 1 },
      });
      customer = await tx.customer.create({
        data: {
          customerNumber: `CUS-${sequence.value.toString().padStart(6, "0")}`,
          fullName: input.newCustomerName,
          phone: input.newCustomerPhone || undefined,
          email: input.newCustomerEmail || undefined,
        },
      });
    }
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const variants = await tx.productVariant.findMany({
      where: {
        id: { in: input.items.map((item) => item.variantId) },
        isActive: true,
      },
      include: { product: true },
    });
    if (
      variants.length !==
      new Set(input.items.map((item) => item.variantId)).size
    )
      throw new Error("VARIANT_NOT_FOUND");
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const lines = input.items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant) throw new Error("VARIANT_NOT_FOUND");
      return { ...item, variant, unitPrice: variant.sellingPrice.toString() };
    });
    const totals = calculateTotals(
      lines,
      input.discountType,
      input.discountValue,
      input.deliveryCharge,
    );
    const sequence = await tx.sequence.upsert({
      where: { key: "order-global" },
      update: { value: { increment: 1 } },
      create: { key: "order-global", value: 1 },
    });
    return tx.order.create({
      data: {
        orderNumber: `PX${sequence.value.toString().padStart(5, "0")}`,
        customerId: customer.id,
        status: "Draft",
        dueDate: input.dueDate
          ? new Date(`${input.dueDate}T00:00:00.000Z`)
          : undefined,
        deliveryMethod: input.deliveryMethod || undefined,
        discountType: input.discountType,
        discountValue: input.discountValue,
        deliveryCharge: input.deliveryCharge,
        subtotal: totals.subtotal,
        total: totals.total,
        customerNotes: input.customerNotes || undefined,
        internalNotes: input.internalNotes || undefined,
        isTestOrder: input.isTestOrder ?? false,
      items: {
          create: lines.map((line, index) => ({
            itemSequence: index + 1,
            productVariantId: line.variant.id,
            description: line.variant.name,
            productNameSnapshot: line.variant.product.name,
            skuSnapshot: line.variant.sku,
            productionCostSnapshot: line.variant.productionCost,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineDiscountType: line.discountType,
            lineDiscountValue: line.discountValue,
            lineTotal: calculateTotals([line], "fixed", "0", "0").total,
          })),
        },
      },
      include: { items: true },
    });
  });
}
export async function updateDraftOrder(id: string, input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { id },
      select: { id: true, stockCommitted: true, items: { select: { itemSequence: true } } },
    });
    if (!existing) throw new Error("ORDER_NOT_FOUND");
    const variants = await tx.productVariant.findMany({ where: { id: { in: input.items.map((item) => item.variantId) }, isActive: true }, include: { product: true } });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    if (variants.length !== new Set(input.items.map((item) => item.variantId)).size) throw new Error("VARIANT_NOT_FOUND");
    const lines = input.items.map((item) => { const variant = byId.get(item.variantId); if (!variant) throw new Error("VARIANT_NOT_FOUND"); return { ...item, variant, unitPrice: variant.sellingPrice.toString() }; });
    const totals = calculateTotals(lines, input.discountType, input.discountValue, input.deliveryCharge);

    // Once stock is committed, editing order details must never recreate order
    // items: stock movements reference those rows and must remain immutable.
    // The item/stock quantities are therefore preserved while editable order
    // metadata and totals are updated in the same transaction.
    if (existing.stockCommitted) {
      return tx.order.update({
        where: { id },
        data: {
          customerId: input.customerId ?? undefined,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
          deliveryMethod: input.deliveryMethod || null,
          customerNotes: input.customerNotes || null,
          internalNotes: input.internalNotes || null,
          isTestOrder: input.isTestOrder ?? false,
        },
        include: { items: true },
      });
    }

    const usedSequences = new Set<number>();
    let nextSequence = Math.max(0, ...existing.items.map((item) => item.itemSequence)) + 1;
    const itemsToUpsert = lines.map((line) => {
      const requested = line.itemSequence;
      const itemSequence = requested && Number.isInteger(requested) && requested > 0 && !usedSequences.has(requested)
        ? requested
        : nextSequence++;
      usedSequences.add(itemSequence);
      return {
        itemSequence,
        productVariantId: line.variant.id,
        description: line.variant.name,
        productNameSnapshot: line.variant.product.name,
        skuSnapshot: line.variant.sku,
        productionCostSnapshot: line.variant.productionCost,
        quantity: line.quantity,
        unitPrice: line.variant.sellingPrice,
        lineDiscountType: line.discountType,
        lineDiscountValue: line.discountValue,
        lineTotal: calculateTotals([line], "fixed", "0", "0").total,
      };
    });
    
    await tx.orderItem.deleteMany({ 
      where: { 
        orderId: id,
        itemSequence: { notIn: Array.from(usedSequences) }
      } 
    });

    for (const item of itemsToUpsert) {
      await tx.orderItem.upsert({
        where: { orderId_itemSequence: { orderId: id, itemSequence: item.itemSequence } },
        update: {
          productVariantId: item.productVariantId,
          description: item.description,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          productionCostSnapshot: item.productionCostSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineDiscountType: item.lineDiscountType,
          lineDiscountValue: item.lineDiscountValue,
          lineTotal: item.lineTotal,
        },
        create: {
          orderId: id,
          ...item
        }
      });
    }

    return tx.order.update({ where: { id }, data: { customerId: input.customerId ?? undefined, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null, deliveryMethod: input.deliveryMethod || null, discountType: input.discountType, discountValue: input.discountValue, deliveryCharge: input.deliveryCharge, subtotal: totals.subtotal, total: totals.total, customerNotes: input.customerNotes || null, internalNotes: input.internalNotes || null, isTestOrder: input.isTestOrder ?? false }, include: { items: true } });
  });
}

export async function transitionOrder(id: string, target: string) {
  if (!isOrderStatus(target)) throw new Error("INVALID_STATUS");
  const normalizedTarget = normalizeOrderStatus(target);
  if (!normalizedTarget) throw new Error("INVALID_STATUS");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    const finalStatus = ["Completed", "Cancelled"].includes(normalizedTarget);
    const finalStatusAt = finalStatus ? (order.status === normalizedTarget && order.finalStatusAt ? order.finalStatusAt : new Date()) : null;
    const completionFields = {
      finalStatusAt,
      completedAt: normalizedTarget === "Completed" ? new Date() : null,
      deliveredAt: null,
      cancelledAt: normalizedTarget === "Cancelled" ? new Date() : null,
    };
    if (["Ready to print", "In production", "Completed"].includes(normalizedTarget)) {
      await ensureProductionAttempts(tx, order.items);
    }

    if (normalizedTarget === COMMIT_STATUS && !order.stockCommitted) {
      // Claim the commit inside the same SQLite transaction. A concurrent approval
      // can then observe zero affected rows and cannot deduct stock twice.
      const claimed = await tx.order.updateMany({
        where: { id, stockCommitted: false },
        data: { stockCommitted: true, stockCommittedAt: new Date() },
      });
      if (claimed.count !== 1) {
        return tx.order.findUniqueOrThrow({
          where: { id },
          include: { items: true },
        });
      }
      await commitItems(tx, order, "Order approved");
      return tx.order.update({
        where: { id },
        data: {
          status: normalizedTarget,
          stockCommitted: true,
          ...completionFields,
        },
      });
    }
    if (normalizedTarget === "Cancelled" && order.stockCommitted) {
      await restoreItems(tx, order, "Order cancelled");
      return tx.order.update({
        where: { id },
        data: { status: normalizedTarget, stockCommitted: false, stockCommittedAt: null, ...completionFields },
      });
    }
    if (normalizedTarget === "In production" || normalizedTarget === "Completed") {
      const stage = normalizedTarget === "In production" ? "PRODUCTION_START" : "PRODUCTION_COMPLETION";
      for (const item of order.items) {
        if (!item.productVariantId) continue;
        await consumeRecipeStage(tx, {
          productVariantId: item.productVariantId,
          stage,
          multiplier: item.quantity.toString(),
          orderId: order.id,
          orderItemId: item.id,
          idempotencyPrefix: `order:${order.id}:item:${item.id}:stage:${stage}`,
        });
      }
    }
    return tx.order.update({ where: { id }, data: { status: normalizedTarget, ...completionFields } });
  });
}

export async function updateCommittedItemQuantity(
  orderId: string,
  itemId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new Error("INVALID_QUANTITY");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, stockCommitted: true },
    });
    const item = await tx.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        quantity: true,
        productVariantId: true,
        unitPrice: true,
        lineDiscountType: true,
        lineDiscountValue: true,
      },
    });
    if (!order || !item || item.orderId !== orderId)
      throw new Error("ORDER_ITEM_NOT_FOUND");
    if (order.stockCommitted && item.productVariantId) {
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.productVariantId },
        select: { stockPerUnit: true },
      });
      const difference = quantity - item.quantity;
      if (difference > 0)
        await moveStock(
          tx,
          item.productVariantId,
          amountForStock(decimal(variant.stockPerUnit), difference).neg(),
          "order_commit_adjustment",
          "Approved order quantity increased",
          orderId,
          itemId,
        );
      if (difference < 0)
        await moveStock(
          tx,
          item.productVariantId,
          amountForStock(decimal(variant.stockPerUnit), -difference),
          "order_restore_adjustment",
          "Approved order quantity decreased",
          orderId,
          itemId,
        );
    }
    const base = decimal(item.unitPrice).mul(quantity);
    const discount =
      item.lineDiscountType === "percentage"
        ? base.mul(decimal(item.lineDiscountValue)).div(100)
        : decimal(item.lineDiscountValue);
    return tx.orderItem.update({
      where: { id: itemId },
      data: {
        quantity,
        lineTotal: discount.greaterThan(base) ? 0 : base.sub(discount),
      },
    });
  });
}

export async function addPayment(input: {
  orderId: string;
  amount: string;
  method: string;
  reference?: string;
}) {
  decimalToCents(input.amount);
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    return tx.payment.create({
      data: {
        orderId: order.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference || undefined,
        paidAt: new Date(),
      },
    });
  });
}

export async function manualStockAdjustment(input: {
  variantId: string;
  delta: string;
  reason: string;
  movementType: string;
}) {
  if (!input.reason.trim()) throw new Error("REASON_REQUIRED");
  const delta = new Prisma.Decimal(input.delta);
  return prisma.$transaction((tx) =>
    moveStock(
      tx,
      input.variantId,
      delta,
      input.movementType,
      input.reason.trim(),
    ),
  );
}

export function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          productVariant: {
            include: {
              productionRecipe: { include: { items: { include: { inventoryItem: true } } } },
            },
          },
          stockMovements: true,
          productionAttempts: {
            orderBy: { attemptNumber: "asc" },
            include: {
              failedIncident: true,
              replacementIncident: true,
            },
          },
          productionIncidents: {
            orderBy: { createdAt: "asc" },
            include: { stockMovement: true },
          },
          materialConsumptions: {
            orderBy: { createdAt: "asc" },
            include: { recipeItem: { include: { inventoryItem: true } } },
          },
          artworkProject: {
            include: { versions: { orderBy: { version: "desc" } } },
          },
        },
      },
      payments: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      stockMovements: { orderBy: { createdAt: "asc" } },
      printSheets: { include: { sheet: true } },
    },
  });
}

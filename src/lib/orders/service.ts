import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToCents } from "@/lib/money";
import { calculateTotals } from "./totals";
import type { OrderInput } from "@/lib/validation/order";
import { COMMIT_STATUS, isOrderStatus } from "./status";

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
    },
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
    const year = new Date().getFullYear();
    const sequence = await tx.sequence.upsert({
      where: { key: `order-${year}` },
      update: { value: { increment: 1 } },
      create: { key: `order-${year}`, value: 1 },
    });
    return tx.order.create({
      data: {
        orderNumber: `SUB-${year}-${sequence.value.toString().padStart(6, "0")}`,
        customerId: customer.id,
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
          create: lines.map((line) => ({
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
      select: { id: true, stockCommitted: true },
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

    await tx.orderItem.deleteMany({ where: { orderId: id } });
    return tx.order.update({ where: { id }, data: { customerId: input.customerId ?? undefined, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null, deliveryMethod: input.deliveryMethod || null, discountType: input.discountType, discountValue: input.discountValue, deliveryCharge: input.deliveryCharge, subtotal: totals.subtotal, total: totals.total, customerNotes: input.customerNotes || null, internalNotes: input.internalNotes || null, isTestOrder: input.isTestOrder ?? false, items: { create: lines.map((line) => ({ productVariantId: line.variant.id, description: line.variant.name, productNameSnapshot: line.variant.product.name, skuSnapshot: line.variant.sku, productionCostSnapshot: line.variant.productionCost, quantity: line.quantity, unitPrice: line.variant.sellingPrice, lineDiscountType: line.discountType, lineDiscountValue: line.discountValue, lineTotal: calculateTotals([line], "fixed", "0", "0").total })) } }, include: { items: true } });
  });
}

export async function transitionOrder(id: string, target: string) {
  if (!isOrderStatus(target)) throw new Error("INVALID_STATUS");
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (target === COMMIT_STATUS && !order.stockCommitted) {
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
          status: target,
          stockCommitted: true,
        },
      });
    }
    if (target === "Cancelled" && order.stockCommitted) {
      await restoreItems(tx, order, "Order cancelled");
      return tx.order.update({
        where: { id },
        data: { status: target, stockCommitted: false, stockCommittedAt: null },
      });
    }
    return tx.order.update({ where: { id }, data: { status: target } });
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
      items: { include: { productVariant: true } },
      payments: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      stockMovements: { orderBy: { createdAt: "asc" } },
    },
  });
}

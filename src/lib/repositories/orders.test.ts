import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  addPayment,
  createOrder,
  getOrder,
  transitionOrder,
  updateCommittedItemQuantity,
  releaseUnconsumedOrderStock,
} from "@/lib/orders/service";
import { paymentState } from "./orders";

const created: {
  orderId?: string;
  variantId?: string;
  productId?: string;
  customerId?: string;
} = {};

async function fixture(stock = "10") {
  const category = await prisma.productCategory.create({
    data: { name: `Test ${Date.now()}-${Math.random()}` },
  });
  const product = await prisma.product.create({
    data: {
      name: `Test product ${Date.now()}`,
      categoryId: category.id,
      variants: {
        create: {
          sku: `TEST-${Date.now()}-${Math.random()}`,
          name: "Standard",
          sellingPrice: "10.00",
          productionCost: "3.00",
          stockQuantity: stock,
          stockPerUnit: "2",
        },
      },
    },
    include: { variants: true },
  });
  const customer = await prisma.customer.create({
    data: {
      customerNumber: `TEST-${Date.now()}-${Math.random()}`,
      fullName: "Order Test Customer",
    },
  });
  created.variantId = product.variants[0]!.id;
  created.productId = product.id;
  created.customerId = customer.id;
  return { variantId: created.variantId, customerId: created.customerId };
}

afterEach(async () => {
  if (created.orderId) {
    await prisma.stockMovement.deleteMany({
      where: { orderId: created.orderId },
    });
    await prisma.payment.deleteMany({ where: { orderId: created.orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId: created.orderId } });
    await prisma.order
      .delete({ where: { id: created.orderId } })
      .catch(() => undefined);
  }
  if (created.productId)
    await prisma.product
      .delete({ where: { id: created.productId } })
      .catch(() => undefined);
  if (created.customerId)
    await prisma.customer
      .delete({ where: { id: created.customerId } })
      .catch(() => undefined);
  created.orderId = undefined;
  created.variantId = undefined;
  created.productId = undefined;
  created.customerId = undefined;
});

async function draft(quantity = 2) {
  const f = await fixture();
  const order = await createOrder({
    customerId: f.customerId!,
    discountType: "fixed",
    discountValue: "0",
    deliveryCharge: "0",
    items: [
      {
        variantId: f.variantId!,
        quantity,
        discountType: "fixed",
        discountValue: "0",
      },
    ],
  });
  created.orderId = order.id;
  return { order, variantId: f.variantId! };
}

describe("SQLite order stock transactions", () => {
  it("does not deduct drafts and commits only once", async () => {
    const { variantId, order } = await draft();
    expect(order.status).toBe("Draft");
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("10");
    await transitionOrder(created.orderId!, "Approved");
    await transitionOrder(created.orderId!, "Approved");
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("6");
    expect(
      await prisma.stockMovement.count({ where: { orderId: created.orderId } }),
    ).toBe(1);
  });
  it("restores committed stock when cancelled", async () => {
    const { variantId } = await draft();
    await transitionOrder(created.orderId!, "Approved");
    await transitionOrder(created.orderId!, "Cancelled");
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("10");
  });
  it("releases a Ready to Print reservation when an unproduced order is deleted", async () => {
    const { variantId, order } = await draft(1);
    await transitionOrder(order.id, "Ready to print");
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity.toString(),
    ).toBe("8");
    await prisma.$transaction((tx) => releaseUnconsumedOrderStock(tx, order.id));
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity.toString(),
    ).toBe("10");
  });
  it("prevents approval when stock is insufficient", async () => {
    await expect(
      (async () => {
        const { variantId } = await draft(6);
        await transitionOrder(created.orderId!, "Approved");
        return variantId;
      })(),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
  });
  it("keeps historical price snapshots after a product price change", async () => {
    const { variantId } = await draft(1);
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { sellingPrice: "20.00" },
    });
    expect(
      (await getOrder(created.orderId!))!.items[0]!.unitPrice.toString(),
    ).toBe("10");
  });
  it("adjusts only the difference when an approved quantity changes", async () => {
    const { variantId, order } = await draft(2);
    await transitionOrder(order.id, "Approved");
    await updateCommittedItemQuantity(order.id, order.items[0]!.id, 3);
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("4");
    await updateCommittedItemQuantity(order.id, order.items[0]!.id, 1);
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("8");
  });
  it("cannot oversell when approvals race", async () => {
    const { variantId, order } = await draft(5);
    const results = await Promise.allSettled([
      transitionOrder(order.id, "Approved"),
      transitionOrder(order.id, "Approved"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: variantId },
        })
      ).stockQuantity.toString(),
    ).toBe("0");
    expect(
      await prisma.stockMovement.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });
  it("calculates payment states from payment records", async () => {
    await draft(1);
    expect(paymentState("10", [])).toBe("unpaid");
    await addPayment({
      orderId: created.orderId!,
      amount: "4",
      method: "cash",
    });
    expect(
      paymentState(
        "10",
        await prisma.payment.findMany({ where: { orderId: created.orderId! } }),
      ),
    ).toBe("partial");
    await addPayment({
      orderId: created.orderId!,
      amount: "6",
      method: "card",
    });
    expect(
      paymentState(
        "10",
        await prisma.payment.findMany({ where: { orderId: created.orderId! } }),
      ),
    ).toBe("paid");
  });
});

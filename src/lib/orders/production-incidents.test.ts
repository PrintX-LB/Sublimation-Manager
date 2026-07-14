import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: vi.fn() },
}));

import { prisma } from "@/lib/db/prisma";
import {
  PRODUCTION_INCIDENT_REASONS,
  recordProductionIncident,
} from "@/lib/orders/service";

function transaction(overrides: Record<string, unknown> = {}) {
  const variant = {
    id: "variant-1",
    stockPerUnit: new Prisma.Decimal("1"),
    productionCost: new Prisma.Decimal("3.25"),
    stockQuantity: new Prisma.Decimal("10"),
  };
  const tx = {
    productionIncident: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "incident-1" }),
      update: vi.fn().mockResolvedValue({
        id: "incident-1",
        failedAttempt: { attemptNumber: 1, status: "Failed" },
        replacementAttempt: { attemptNumber: 2, status: "Ready to Print" },
        stockMovement: { quantityChange: new Prisma.Decimal("-1") },
      }),
    },
    orderItem: {
      findUnique: vi.fn().mockResolvedValue({
        id: "item-1",
        order: {
          id: "order-1",
          orderNumber: "PX00001",
          status: "In production",
          actualProductionCost: new Prisma.Decimal("5"),
        },
        productVariant: variant,
        productionAttempts: [],
      }),
    },
    productionAttempt: {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: "attempt-1", attemptNumber: 1, status: "Failed" })
        .mockResolvedValueOnce({ id: "attempt-2", attemptNumber: 2, status: "Ready to Print" }),
      update: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn().mockResolvedValue(variant),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ stockQuantity: new Prisma.Decimal("9") }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
    order: { update: vi.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as Prisma.TransactionClient;
  vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx));
  return tx;
}

describe("production incidents and reprints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a failed attempt, consumes one blank and creates a replacement without changing quantity", async () => {
    const tx = transaction();
    const result = await recordProductionIncident({
      orderItemId: "item-1",
      reason: PRODUCTION_INCIDENT_REASONS[0],
      idempotencyKey: "retry-key-1",
      blankProductDamaged: true,
      otherMaterialWasted: "None",
    });

    expect(result.replacementAttempt).toMatchObject({ status: "Ready to Print" });
    expect(tx.productionAttempt.create).toHaveBeenCalledTimes(2);
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stockQuantity: { decrement: new Prisma.Decimal("1") } } }),
    );
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productionIncidentId: "incident-1", productionAttemptId: "attempt-2" }) }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { actualProductionCost: { increment: new Prisma.Decimal("3.25") } } }));
  });

  it("rejects orders that are not in an active production status", async () => {
    const tx = transaction();
    vi.mocked(tx.orderItem.findUnique).mockResolvedValueOnce({
      id: "item-1",
      order: { id: "order-1", orderNumber: "PX00001", status: "Completed", actualProductionCost: new Prisma.Decimal("5") },
      productVariant: { id: "variant-1", stockPerUnit: new Prisma.Decimal("1"), productionCost: new Prisma.Decimal("3") },
      productionAttempts: [],
    } as never);
    await expect(recordProductionIncident({ orderItemId: "item-1", reason: "Misprint", idempotencyKey: "key-2", blankProductDamaged: false, otherMaterialWasted: "None" })).rejects.toThrow("ORDER_NOT_IN_PRODUCTION");
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("creates a replacement without stock or cost changes when the blank remains usable", async () => {
    const tx = transaction();
    const result = await recordProductionIncident({
      orderItemId: "item-1",
      reason: "Misprint",
      idempotencyKey: "usable-blank",
      blankProductDamaged: false,
      otherMaterialWasted: "Sublimation paper",
    });
    expect(result.replacementAttempt).toMatchObject({ status: "Ready to Print" });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.productionIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ blankProductDamaged: false, additionalMaterialCost: new Prisma.Decimal(0) }) }));
  });

  it("returns the existing incident for a repeated idempotency key", async () => {
    const tx = transaction();
    const existing = { id: "incident-existing", replacementAttempt: { id: "attempt-2" } };
    vi.mocked(tx.productionIncident.findUnique).mockResolvedValueOnce(existing as never);
    const result = await recordProductionIncident({ orderItemId: "item-1", reason: "Misprint", idempotencyKey: "same-key", blankProductDamaged: false, otherMaterialWasted: "Sublimation paper" });
    expect(result).toBe(existing);
    expect(tx.productionAttempt.create).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("blocks a reprint when the blank stock is insufficient", async () => {
    const tx = transaction();
    vi.mocked(tx.productVariant.findUnique).mockResolvedValueOnce({ stockQuantity: new Prisma.Decimal("0") } as never);
    await expect(recordProductionIncident({ orderItemId: "item-1", reason: "Misprint", idempotencyKey: "no-stock", blankProductDamaged: true, otherMaterialWasted: "None" })).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});

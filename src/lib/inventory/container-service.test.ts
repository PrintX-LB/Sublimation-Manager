import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { consumeFromContainers } from "@/lib/inventory/service";

function container(id: string, status: "SEALED" | "OPEN", receivedAt: string, remaining: string, capacity = "100", cost = "10") {
  return {
    id,
    status,
    receivedAt: new Date(receivedAt),
    remainingAmount: new Prisma.Decimal(remaining),
    originalCapacity: new Prisma.Decimal(capacity),
    purchaseCost: new Prisma.Decimal(cost),
    openedAt: status === "OPEN" ? new Date(receivedAt) : null,
  };
}

function txFor(containers: ReturnType<typeof container>[], existing: unknown = null) {
  const transaction = {
    id: "movement-1",
    inventoryItemId: "material-1",
    totalCost: new Prisma.Decimal("0"),
    containerAllocations: [],
  };
  return {
    inventoryItem: {
      findUnique: vi.fn().mockResolvedValue({
        id: "material-1",
        inventoryType: "PRODUCTION_SUPPLY",
        baseUnit: "ML",
        currentQuantity: new Prisma.Decimal("250"),
        isActive: true,
        productVariant: null,
        containers,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryTransaction: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(transaction),
    },
    inventoryContainer: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryContainerAllocation: {
      create: vi.fn().mockResolvedValue({}),
    },
    productVariant: { updateMany: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe("container consumable allocation", () => {
  it("uses the oldest open container before sealed stock and spans containers", async () => {
    const open = container("open", "OPEN", "2026-01-02", "40");
    const sealed = container("sealed", "SEALED", "2026-01-01", "100");
    const tx = txFor([sealed, open]);
    const result = await consumeFromContainers(tx, {
      inventoryItemId: "material-1",
      quantity: "90",
      transactionType: "PRODUCTION_INCIDENT",
      reason: "Paper waste",
      idempotencyKey: "incident-1",
    });
    expect(result.allocations).toHaveLength(2);
    expect(result.totalCost).toEqual(new Prisma.Decimal("9"));
    expect(tx.inventoryContainerAllocation.create).toHaveBeenCalledTimes(2);
    expect(tx.inventoryContainer.updateMany).toHaveBeenCalledTimes(2);
  });

  it("returns the existing movement for an idempotent retry", async () => {
    const existing = {
      id: "movement-existing",
      totalCost: new Prisma.Decimal("2.50"),
      containerAllocations: [{ id: "allocation-1" }],
    };
    const tx = txFor([container("one", "OPEN", "2026-01-01", "100")], existing);
    const result = await consumeFromContainers(tx, {
      inventoryItemId: "material-1",
      quantity: "10",
      transactionType: "PRODUCTION_INCIDENT",
      reason: "Retry",
      idempotencyKey: "incident-1",
    });
    expect(result.transaction.id).toBe("movement-existing");
    expect(tx.inventoryContainer.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryContainerAllocation.create).not.toHaveBeenCalled();
  });

  it("rejects a request that exceeds all container balances", async () => {
    const tx = txFor([container("one", "SEALED", "2026-01-01", "5")]);
    await expect(consumeFromContainers(tx, {
      inventoryItemId: "material-1",
      quantity: "6",
      transactionType: "WASTE",
      reason: "Spill",
    })).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });
});

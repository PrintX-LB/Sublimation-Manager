import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  changeInventoryQuantity,
  removeOrArchiveInventoryItemInTransaction,
  updateInventoryItemInTransaction,
} from "@/lib/inventory/service";

function txFor(quantity = "10", unit = "SHEET") {
  return {
    inventoryTransaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "tx-1" }),
    },
    inventoryItem: {
      findUnique: vi.fn().mockResolvedValue({
        id: "item-1",
        baseUnit: unit,
        currentQuantity: new Prisma.Decimal(quantity),
        isActive: true,
        productVariant: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: { updateMany: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe("central inventory quantity service", () => {
  it("creates an immutable purchase transaction and returns the new balance", async () => {
    const tx = txFor();
    await changeInventoryQuantity(tx, {
      inventoryItemId: "item-1",
      delta: "25",
      transactionType: "PURCHASE",
      reason: "Supplier delivery",
      unit: "SHEET",
    });
    expect(tx.inventoryItem.updateMany).toHaveBeenCalled();
    expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantityBefore: new Prisma.Decimal("10"),
          quantityAfter: new Prisma.Decimal("35"),
          transactionType: "PURCHASE",
        }),
      }),
    );
  });

  it("rejects fractional quantities for whole-unit items", async () => {
    const tx = txFor();
    await expect(
      changeInventoryQuantity(tx, {
        inventoryItemId: "item-1",
        delta: "0.5",
        transactionType: "WASTE",
        reason: "Damaged sheet",
        unit: "SHEET",
      }),
    ).rejects.toThrow("WHOLE_UNIT_REQUIRED");
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("prevents negative stock", async () => {
    const tx = txFor("2");
    await expect(
      changeInventoryQuantity(tx, {
        inventoryItemId: "item-1",
        delta: "-3",
        transactionType: "WASTE",
        reason: "Waste",
        unit: "SHEET",
      }),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("rejects fractional quantities for legacy unit labels too", async () => {
    const tx = txFor("18.5", "METRE");
    await expect(
      changeInventoryQuantity(tx, {
        inventoryItemId: "item-1",
        delta: "1.25",
        transactionType: "PURCHASE",
        reason: "Tape delivery",
        unit: "METRE",
      }),
    ).rejects.toThrow("WHOLE_UNIT_REQUIRED");
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });
});

function materialTx({
  transactions = 0,
  recipeItems = 0,
  productVariantId = null,
}: {
  transactions?: number;
  recipeItems?: number;
  productVariantId?: string | null;
} = {}) {
  return {
    inventoryItem: {
      findUnique: vi.fn().mockResolvedValue({
        id: "10000000-0000-4000-8000-000000000001",
        name: "A4 Paper",
        inventoryType: "PRODUCTION_SUPPLY",
        baseUnit: "SHEET",
        currentQuantity: new Prisma.Decimal("10"),
        productVariantId,
        _count: { transactions, recipeItems },
      }),
      update: vi.fn().mockResolvedValue({ id: "item-1" }),
      delete: vi.fn().mockResolvedValue({ id: "item-1" }),
    },
  } as unknown as Prisma.TransactionClient;
}

const materialUpdate = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "A4 Premium Paper",
  baseUnit: "SHEET" as const,
  minimumQuantity: "5",
  unitCost: "0.25",
  supplier: "Print Supplier",
};

describe("material metadata lifecycle", () => {
  it("updates metadata without allowing direct quantity edits", async () => {
    const tx = materialTx();
    await updateInventoryItemInTransaction(tx, materialUpdate);
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          currentQuantity: expect.anything(),
        }),
      }),
    );
  });

  it("blocks unit changes when inventory history exists", async () => {
    const tx = materialTx({ transactions: 1 });
    await expect(
      updateInventoryItemInTransaction(tx, {
        ...materialUpdate,
        baseUnit: "METRE",
      }),
    ).rejects.toThrow("UNIT_CHANGE_BLOCKED");
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("permanently deletes an unused material", async () => {
    const tx = materialTx();
    const result = await removeOrArchiveInventoryItemInTransaction(tx, {
      id: materialUpdate.id,
      confirmed: true,
    });
    expect(result.mode).toBe("deleted");
    expect(tx.inventoryItem.delete).toHaveBeenCalled();
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it("requires an explicit yes confirmation", async () => {
    const tx = materialTx();
    await expect(
      removeOrArchiveInventoryItemInTransaction(tx, {
        id: materialUpdate.id,
        confirmed: false,
      }),
    ).rejects.toThrow("MATERIAL_CONFIRMATION_MISMATCH");
    expect(tx.inventoryItem.delete).not.toHaveBeenCalled();
  });

  it.each([
    { transactions: 1, recipeItems: 0, productVariantId: null },
    { transactions: 0, recipeItems: 1, productVariantId: null },
    {
      transactions: 0,
      recipeItems: 0,
      productVariantId: "20000000-0000-4000-8000-000000000001",
    },
  ])("archives a material with history or references", async (history) => {
    const tx = materialTx(history);
    const result = await removeOrArchiveInventoryItemInTransaction(tx, {
      id: materialUpdate.id,
      confirmed: true,
    });
    expect(result.mode).toBe("archived");
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: materialUpdate.id },
      data: { isActive: false },
    });
    expect(tx.inventoryItem.delete).not.toHaveBeenCalled();
  });
});

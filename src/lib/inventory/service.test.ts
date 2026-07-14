import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { changeInventoryQuantity } from "@/lib/inventory/service";

function txFor(quantity = "10", unit = "SHEET") {
  return {
    inventoryTransaction: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "tx-1" }) },
    inventoryItem: { findUnique: vi.fn().mockResolvedValue({ id: "item-1", baseUnit: unit, currentQuantity: new Prisma.Decimal(quantity), isActive: true, productVariant: null }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productVariant: { updateMany: vi.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe("central inventory quantity service", () => {
  it("creates an immutable purchase transaction and returns the new balance", async () => {
    const tx = txFor();
    await changeInventoryQuantity(tx, { inventoryItemId: "item-1", delta: "25", transactionType: "PURCHASE", reason: "Supplier delivery", unit: "SHEET" });
    expect(tx.inventoryItem.updateMany).toHaveBeenCalled();
    expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityBefore: new Prisma.Decimal("10"), quantityAfter: new Prisma.Decimal("35"), transactionType: "PURCHASE" }) }));
  });

  it("rejects fractional quantities for whole-unit items", async () => {
    const tx = txFor();
    await expect(changeInventoryQuantity(tx, { inventoryItemId: "item-1", delta: "0.5", transactionType: "WASTE", reason: "Damaged sheet", unit: "SHEET" })).rejects.toThrow("WHOLE_UNIT_REQUIRED");
    expect(tx.inventoryTransaction.create).not.toHaveBeenCalled();
  });

  it("prevents negative stock", async () => {
    const tx = txFor("2");
    await expect(changeInventoryQuantity(tx, { inventoryItemId: "item-1", delta: "-3", transactionType: "WASTE", reason: "Waste", unit: "SHEET" })).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(tx.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("supports decimal quantities for metre-based supplies", async () => {
    const tx = txFor("18.5", "METRE");
    await changeInventoryQuantity(tx, { inventoryItemId: "item-1", delta: "1.25", transactionType: "PURCHASE", reason: "Tape delivery", unit: "METRE" });
    expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityAfter: new Prisma.Decimal("19.75"), unit: "METRE" }) }));
  });
});

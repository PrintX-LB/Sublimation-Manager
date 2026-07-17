import { describe, expect, it, vi } from "vitest";
import { clearInventoryForDevelopmentReset } from "./development-reset";

describe("development inventory reset", () => {
  it("clears history before resetting configured balances", async () => {
    const calls: string[] = [];
    const tx = {
      inventoryTransaction: { updateMany: vi.fn(async () => { calls.push("detach"); return { count: 4 }; }), deleteMany: vi.fn(async () => { calls.push("transactions"); return { count: 4 }; }) },
      productionMaterialConsumption: { deleteMany: vi.fn(async () => { calls.push("consumptions"); return { count: 2 }; }) },
      stockMovement: { deleteMany: vi.fn(async () => { calls.push("movements"); return { count: 3 }; }) },
    } as unknown as Parameters<typeof clearInventoryForDevelopmentReset>[0];
    await expect(clearInventoryForDevelopmentReset(tx)).resolves.toEqual({ detached: 4, materialConsumptions: 2, stockMovements: 3, inventoryTransactions: 4 });
    expect(calls).toEqual(["detach", "consumptions", "movements", "transactions"]);
  });
});

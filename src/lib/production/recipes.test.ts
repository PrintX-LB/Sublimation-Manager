import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { recipeCost } from "@/lib/production/recipes";

describe("production recipe calculations", () => {
  it("calculates estimated material cost with Decimal arithmetic", () => {
    const result = recipeCost([
      { quantity: new Prisma.Decimal("1"), inventoryItem: { unitCost: new Prisma.Decimal("0.65") } },
      { quantity: new Prisma.Decimal("0.3"), inventoryItem: { unitCost: new Prisma.Decimal("0.08") } },
      { quantity: new Prisma.Decimal("2.5"), inventoryItem: { unitCost: new Prisma.Decimal("0.03") } },
    ]);
    expect(result.toString()).toBe("0.749");
  });
});

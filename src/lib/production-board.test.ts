import { describe, expect, it } from "vitest";
import { groupProductionOrders, sortProductionOrders } from "./production-board";

const now = new Date("2026-07-13T12:00:00Z");
const order = (status: string, priority = "Normal", dueDate: string | null = null, createdAt = "2026-07-10T00:00:00Z") => ({ status, priority, dueDate: dueDate ? new Date(dueDate) : null, createdAt: new Date(createdAt) });

describe("production board", () => {
  it("groups only supported production statuses", () => {
    const groups = groupProductionOrders([order("Ready to print"), order("Delivered"), order("Cancelled"), order("In production")]);
    expect(groups["Ready to print"]).toHaveLength(1);
    expect(groups["In production"]).toHaveLength(1);
    expect(Object.values(groups).flat()).toHaveLength(2);
  });

  it("sorts overdue, urgent, due date, then creation date", () => {
    const sorted = sortProductionOrders([order("Ready to print", "Normal", "2026-07-20"), order("Ready to print", "Urgent", "2026-07-20"), order("Ready to print", "Normal", "2026-07-12"), order("Ready to print", "Normal", null)], now);
    expect(sorted[0]!.dueDate?.toISOString()).toContain("2026-07-12");
    expect(sorted[1]!.priority).toBe("Urgent");
    expect(sorted[3]!.dueDate).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  orderItemReference,
  productionAttemptReference,
} from "./item-reference";

describe("order item production references", () => {
  it("uses the stable order number and item sequence", () => {
    expect(orderItemReference("PX00084", 1)).toBe("PX00084_1");
    expect(orderItemReference("PX00084", 2)).toBe("PX00084_2");
  });

  it("adds an attempt suffix without changing the order reference", () => {
    expect(productionAttemptReference("PX00084", 2, 3)).toBe(
      "PX00084_2 · Attempt 3",
    );
  });
});

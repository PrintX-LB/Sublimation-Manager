import { describe, expect, it } from "vitest";
import { calculateTotals } from "./totals";

describe("order totals", () => {
  it("calculates fixed and percentage discounts plus delivery", () => {
    expect(
      calculateTotals(
        [
          {
            quantity: 2,
            unitPrice: "10.00",
            discountType: "fixed",
            discountValue: "1.00",
          },
        ],
        "percentage",
        "10",
        "4.50",
      ),
    ).toEqual({
      subtotal: "20.00",
      lineDiscount: "1.00",
      orderDiscount: "1.90",
      deliveryCharge: "4.50",
      total: "21.60",
    });
  });
});

import { describe, expect, it } from "vitest";
import { orderInputSchema, formatZodIssues } from "./order";

const validOrderPayload = {
  customerId: "10000000-0000-4000-8000-000000000001",
  dueDate: "20/07/2026",
  deliveryMethod: "Collection",
  discountType: "fixed",
  discountValue: "0",
  deliveryCharge: "0",
  items: [
    {
      variantId: "20000000-0000-4000-8000-000000000002",
      quantity: 2,
      discountType: "fixed",
      discountValue: "0",
    },
  ],
};

describe("orderInputSchema", () => {
  it("passes a fully valid order payload", () => {
    const result = orderInputSchema.safeParse(validOrderPayload);
    expect(result.success).toBe(true);
  });

  it("normalizes and transforms due date from DD/MM/YYYY to YYYY-MM-DD", () => {
    const result = orderInputSchema.safeParse(validOrderPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBe("2026-07-20");
    }
  });

  it("allows empty optional due date", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      dueDate: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid due date format", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      dueDate: "20-07-2026",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = formatZodIssues(result.error.issues);
      expect(fieldErrors.dueDate?.[0]).toContain("Choose a valid due date.");
    }
  });

  it("rejects missing customer and missing new customer name", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      customerId: "",
      newCustomerName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = formatZodIssues(result.error.issues);
      expect(fieldErrors.customerId?.[0]).toContain("Choose a customer or enter a new customer name");
    }
  });

  it("rejects missing product variant ID", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      items: [
        {
          variantId: "",
          quantity: 1,
          discountType: "fixed",
          discountValue: "0",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = formatZodIssues(result.error.issues);
      expect(fieldErrors["items.0.variantId"]?.[0]).toBe("Select a product variant");
    }
  });

  it("rejects quantity less than 1", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      items: [
        {
          variantId: "20000000-0000-4000-8000-000000000002",
          quantity: 0,
          discountType: "fixed",
          discountValue: "0",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = formatZodIssues(result.error.issues);
      expect(fieldErrors["items.0.quantity"]?.[0]).toBe("Quantity must be at least 1");
    }
  });

  it("rejects invalid money inputs", () => {
    const result = orderInputSchema.safeParse({
      ...validOrderPayload,
      discountValue: "-5",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = formatZodIssues(result.error.issues);
      expect(fieldErrors.discountValue?.[0]).toBe("Use a positive currency amount");
    }
  });
});

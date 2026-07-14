import { describe, expect, it } from "vitest";
import { productSchema } from "./product";

const product = {
  name: "Ceramic mug",
  categoryId: "10000000-0000-4000-8000-000000000001",
  variants: [
    {
      name: "Standard",
      sellingPrice: "12.50",
      productionCost: "3.25",
      stockQuantity: 10,
      reorderLevel: 3,
      stockPerUnit: "1",
    },
  ],
};

describe("productSchema", () => {
  it("accepts variants without a user-facing stock code", () =>
    expect(productSchema.parse(product).variants[0]?.name).toBe("Standard"));
  it("accepts multiple variants with distinct names", () =>
    expect(
      productSchema.safeParse({
        ...product,
        variants: [product.variants[0], { ...product.variants[0], name: "Large" }],
      }).success,
    ).toBe(true));
  it("rejects imprecise prices", () =>
    expect(
      productSchema.safeParse({
        ...product,
        variants: [{ ...product.variants[0], sellingPrice: "12.999" }],
      }).success,
    ).toBe(false));
  it("rejects zero stock consumption", () =>
    expect(
      productSchema.safeParse({
        ...product,
        variants: [{ ...product.variants[0], stockPerUnit: "0" }],
      }).success,
    ).toBe(false));
});

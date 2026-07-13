import { describe, expect, it } from "vitest";
import { productSchema } from "./product";

const product = {
  name: "Ceramic mug",
  categoryId: "10000000-0000-4000-8000-000000000001",
  variants: [
    {
      sku: "mug-11",
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
  it("normalises SKUs", () =>
    expect(productSchema.parse(product).variants[0]?.sku).toBe("MUG-11"));
  it("rejects duplicate SKUs", () =>
    expect(
      productSchema.safeParse({
        ...product,
        variants: [product.variants[0], { ...product.variants[0] }],
      }).success,
    ).toBe(false));
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

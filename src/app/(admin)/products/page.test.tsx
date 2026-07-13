import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import ProductsPage from "./page";
import StockPage from "../stock/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Legacy Route Redirects", () => {
  it("redirects legacy /products to /inventory?tab=products, preserving query arguments", async () => {
    const searchParams = Promise.resolve({
      q: "t-shirt",
      page: "2",
      sort: "newest"
    });

    await ProductsPage({ searchParams });

    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining("/inventory?q=t-shirt&page=2&sort=newest&tab=products")
    );
  });

  it("redirects legacy /stock to /inventory?tab=stock, preserving query arguments", async () => {
    const searchParams = Promise.resolve({
      category: "cat-1",
      sort: "name"
    });

    await StockPage({ searchParams });

    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining("/inventory?category=cat-1&sort=name&tab=stock")
    );
  });
});

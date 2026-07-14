import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackNavigation, isSafeReturnRoute } from "./back-navigation";

const push = vi.fn();
const back = vi.fn();
let search = new URLSearchParams("returnTo=%2Forders%3Fstatus%3Dready");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back }),
  usePathname: () => "/orders/123",
  useSearchParams: () => search,
}));

describe("BackNavigation", () => {
  beforeEach(() => {
    push.mockReset();
    back.mockReset();
    search = new URLSearchParams("returnTo=%2Forders%3Fstatus%3Dready");
    Object.defineProperty(window, "history", { value: { length: 1 }, configurable: true });
  });

  it("accepts internal routes and rejects external or traversal-style routes", () => {
    expect(isSafeReturnRoute("/orders?status=ready")).toBe(true);
    expect(isSafeReturnRoute("https://example.com/orders")).toBe(false);
    expect(isSafeReturnRoute("//example.com/orders")).toBe(false);
    expect(isSafeReturnRoute("/orders\\evil")).toBe(false);
  });

  it("uses a valid return route and exposes an accessible back button", () => {
    render(<BackNavigation label="Back to Orders" fallbackRoute="/orders" />);
    const button = screen.getByRole("button", { name: "Back to Orders (back)" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(push).toHaveBeenCalledWith("/orders?status=ready");
  });

  it("uses the explicit fallback when the return route is unsafe", () => {
    search = new URLSearchParams("returnTo=https%3A%2F%2Fevil.example");
    render(<BackNavigation label="Back to Orders" fallbackRoute="/orders" />);
    fireEvent.click(screen.getByRole("button", { name: "Back to Orders (back)" }));
    expect(push).toHaveBeenCalledWith("/orders");
  });
});

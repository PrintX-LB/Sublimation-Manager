import { describe, expect, it } from "vitest";
import { decimalToCents, marginPercent, unitProfit, formatUSD } from "./money";

describe("money calculations", () => {
  it("parses decimal values without floating point", () =>
    expect(decimalToCents("12.50")).toBe(1250n));
  it("calculates unit profit", () =>
    expect(unitProfit("12.50", "4.25")).toBe("8.25"));
  it("calculates margin", () =>
    expect(marginPercent("20.00", "5.00")).toBe("75.0"));
  it("handles a zero selling price", () =>
    expect(marginPercent("0", "0")).toBe("0.0"));
  it("preserves the sign for small negative margins", () =>
    expect(marginPercent("200.00", "201.00")).toBe("-0.5"));
  it("formats value to USD currency strings", () => {
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(1250)).toBe("$1,250.00");
    expect(formatUSD("16.00")).toBe("$16.00");
    expect(formatUSD(1250n)).toBe("$12.50");
  });
});

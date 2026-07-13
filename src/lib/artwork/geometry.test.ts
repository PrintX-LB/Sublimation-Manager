import { describe, expect, it } from "vitest";
import { clampZoom, mmToPixels, rotatePoint } from "./geometry";
describe("artwork geometry", () => {
  it("converts millimetres to print pixels", () =>
    expect(mmToPixels(25.4, 300)).toBe(300));
  it("rotates points", () => expect(rotatePoint(1, 0, 90).x).toBeCloseTo(0));
  it("clamps zoom", () => expect(clampZoom(99)).toBe(8));
});

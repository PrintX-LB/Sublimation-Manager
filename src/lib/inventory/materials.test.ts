import { describe, expect, it } from "vitest";
import { materialUnitForType } from "./materials";

describe("quick material type mapping", () => {
  it.each([
    ["PAPER_SHEETS", "SHEET"],
    ["INK_LIQUID", "MILLILITRE"],
    ["TAPE_LENGTH", "METRE"],
    ["PACKAGING_PIECES", "PIECE"],
    ["OTHER", "PIECE"],
  ] as const)("maps %s to %s", (type, unit) => {
    expect(materialUnitForType(type)).toBe(unit);
  });
});

import { describe, expect, it } from "vitest";
import { formatInventoryQuantity, materialUnitForType, containerLabelFor } from "./materials";

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

describe("inventory quantity formatting", () => {
  it.each([
    ["1", "UNITS", "1 unit"],
    ["2", "UNITS", "2 units"],
    ["1", "SHEETS", "1 sheet"],
    ["100", "SHEET", "100 sheets"],
    ["1", "ML", "1 ml"],
    ["100", "MILLILITRE", "100 ml"],
    ["1", "M", "1 m"],
    ["50", "METRE", "50 m"],
  ])("formats %s %s as %s", (value, unit, expected) => {
    expect(formatInventoryQuantity(value, unit)).toBe(expected);
  });

  it.each([
    ["ML", "Bottle"],
    ["M", "Roll"],
    ["SHEETS", "Pack"],
    ["UNITS", "Container"],
  ])("maps %s to the physical container label %s", (unit, expected) => {
    expect(containerLabelFor(unit)).toBe(expected);
  });
});

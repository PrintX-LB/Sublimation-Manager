import { describe, expect, it } from "vitest";
import { A4_SHEET, MUG_DESIGN, SHEET_LAYOUT, mmToPixels, nextSheetFilename, sheetLayout, threeUpMugLayout, isThreeUpMugTemplate } from "./production-sheet";

describe("A4 production sheets", () => {
  it("calculates exact A4 and mug dimensions at 300 DPI", () => {
    expect(SHEET_LAYOUT.widthPx).toBe(2480);
    expect(SHEET_LAYOUT.heightPx).toBe(3508);
    expect(SHEET_LAYOUT.designWidthPx).toBe(2480);
    expect(SHEET_LAYOUT.designHeightPx).toBe(1122);
    expect(mmToPixels(A4_SHEET.heightMm - MUG_DESIGN.heightMm * 2)).toBe(1264);
  });
  it("fits both designs and strips within the page", () => {
    const layout = sheetLayout();
    expect(layout.strip2Y + SHEET_LAYOUT.stripHeightPx).toBe(SHEET_LAYOUT.heightPx);
  });
  it("centers three 200×90 mm transfers with equal A4 margins", () => {
    const layout = threeUpMugLayout();
    expect(isThreeUpMugTemplate(200, 90)).toBe(true);
    expect(layout.widthPx).toBe(mmToPixels(200));
    expect(layout.heightPx).toBe(mmToPixels(90));
    expect(layout.leftPx).toBe(mmToPixels(5));
    expect(layout.labelHeightPx).toBe(mmToPixels(4));
    expect(layout.topMarginPx).toBe(mmToPixels(7.5));
    expect(Math.abs(layout.topMarginPx * 2 + layout.stridePx * 3 - SHEET_LAYOUT.heightPx)).toBeLessThanOrEqual(1);
  });
  it("versions filename collisions", () => {
    expect(nextSheetFilename("A4_PX00001_mugs_1-2.png", ["A4_PX00001_mugs_1-2.pdf"])).toBe("A4_PX00001_mugs_1-2-v2.pdf");
  });
});

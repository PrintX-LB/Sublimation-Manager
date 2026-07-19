import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeThreeUpMugSheet, cutMarksSvg, mirrorArtworkForSheet } from "./production-sheet-render";

describe("production sheet artwork rendering", () => {
  it("mirrors only the artwork bitmap and preserves its dimensions", async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: { create: { width: 1, height: 2, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } } }, left: 0, top: 0 }])
      .png()
      .toBuffer();

    const mirrored = await mirrorArtworkForSheet(source);
    const result = await sharp(mirrored).raw().toBuffer({ resolveWithObject: true });

    expect(result.info.width).toBe(4);
    expect(result.info.height).toBe(2);
    // The blue left edge must be on the right edge after the flip.
    expect(Array.from(result.data.subarray((result.info.width - 1) * 4, result.info.width * 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(result.data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("renders four corner groups per occupied transfer without full-length lines", () => {
    const one = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 1);
    const two = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 2);
    expect(one?.toString()).toContain('width="2480"');
    expect((one?.toString().match(/<line /g) ?? []).length).toBe(8);
    expect((two?.toString().match(/<line /g) ?? []).length).toBe(16);
    expect(cutMarksSvg({ mode: "NONE" }, 2)).toBeNull();
  });

  it("keeps full-outline compatibility and converts physical settings at DPI", () => {
    const outline = cutMarksSvg({ mode: "FULL_OUTLINE", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 2, 600)?.toString() ?? "";
    expect((outline.match(/<line /g) ?? []).length).toBe(8);
    expect(outline).toContain('stroke-width="7"');
  });

  it("renders a three-up 200×90 sheet at the exact A4 pixel dimensions", async () => {
    const artwork = await sharp({ create: { width: 2362, height: 1063, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    const sheet = await composeThreeUpMugSheet([artwork, artwork, artwork], ["PX000123-1", "PX000123-2", "PX000123-3"], { mode: "NONE" });
    const metadata = await sharp(sheet).metadata();
    expect(metadata.width).toBe(2480);
    expect(metadata.height).toBe(3508);
  });
});

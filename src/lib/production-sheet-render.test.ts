import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mirrorArtworkForSheet } from "./production-sheet-render";

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
});

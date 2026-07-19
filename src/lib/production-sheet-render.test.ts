import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { SHEET_LAYOUT } from "./production-sheet";
import { artworkPathForCutMarks, composeThreeUpMugSheet, cutMarksSvg, mirrorArtworkForSheet, stripLegacyArtworkContour } from "./production-sheet-render";

describe("production sheet artwork rendering", () => {
  it("uses editable artwork for corner marks and no marks, and print-ready only for full outlines", () => {
    const version = { editedPath: "uploads/edit.png", printReadyPath: "uploads/ready.png" };
    expect(artworkPathForCutMarks(version, "CORNER_MARKS")).toBe(version.editedPath);
    expect(artworkPathForCutMarks(version, "NONE")).toBe(version.editedPath);
    expect(artworkPathForCutMarks(version, "FULL_OUTLINE")).toBe(version.printReadyPath);
  });

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

  it("removes legacy full-height neutral edge strokes before sheet compositing", async () => {
    const source = await sharp({
      create: { width: 100, height: 80, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        { input: { create: { width: 2, height: 80, channels: 4, background: { r: 205, g: 205, b: 205, alpha: 1 } } }, left: 0, top: 0 },
        { input: { create: { width: 2, height: 80, channels: 4, background: { r: 205, g: 205, b: 205, alpha: 1 } } }, left: 98, top: 0 },
      ])
      .png()
      .toBuffer();
    const cleaned = await stripLegacyArtworkContour(source);
    const result = await sharp(cleaned).raw().toBuffer({ resolveWithObject: true });
    expect(result.data[3]).toBe(0);
    expect(result.data[(result.info.width - 1) * 4 + 3]).toBe(0);
    expect(result.data[(40 * result.info.width + 50) * 4 + 3]).toBe(255);
  });

  it("renders four corner groups per occupied transfer without full-length lines", () => {
    const one = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 1);
    const two = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 2);
    expect(one?.toString()).toContain('width="2480"');
    expect((one?.toString().match(/<line /g) ?? []).length).toBe(8);
    expect((two?.toString().match(/<line /g) ?? []).length).toBe(16);
    expect(cutMarksSvg({ mode: "NONE" }, 2)).toBeNull();
  });

  it("keeps corner vertical segments limited to the configured corner length", () => {
    const svg = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 8, offsetMm: 3, thicknessMm: 0.3 }, 1)?.toString() ?? "";
    const verticalSegments = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)]
      .map((match) => ({ x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }))
      .filter((segment) => segment.x1 === segment.x2)
      .map((segment) => Math.abs(segment.y2 - segment.y1));
    expect(verticalSegments).toHaveLength(4);
    expect(Math.max(...verticalSegments)).toBeLessThanOrEqual(Math.round((8 / 25.4) * 300));
  });

  it("clamps oversized corner marks on the vertical axis", () => {
    const svg = cutMarksSvg({ mode: "CORNER_MARKS", lengthMm: 200, offsetMm: 0, thicknessMm: 0.3 }, 1)?.toString() ?? "";
    const verticalSegments = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)]
      .map((match) => ({ x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }))
      .filter((segment) => segment.x1 === segment.x2)
      .map((segment) => Math.abs(segment.y2 - segment.y1));
    expect(Math.max(...verticalSegments)).toBe(SHEET_LAYOUT.designHeightPx / 2);
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

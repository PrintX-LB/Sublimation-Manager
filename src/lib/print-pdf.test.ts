import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createExactSizePdf } from "./print-pdf";

describe("exact-size print PDF", () => {
  it("writes the requested physical MediaBox and embeds the rendered image", async () => {
    const image = await sharp({
      create: { width: 100, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();
    const pdf = (await createExactSizePdf(image, { widthMm: 210, heightMm: 297 })).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595.2756 841.8898]");
    expect(pdf).toContain("/Subtype /Image");
  });
});

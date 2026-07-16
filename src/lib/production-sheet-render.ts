import sharp from "sharp";
import { A4_SHEET, SHEET_LAYOUT, sheetLayout } from "@/lib/production-sheet";

/**
 * Prepare one printable artwork layer for a sublimation sheet.
 *
 * The sheet itself must remain readable, so only the artwork bitmap is
 * flipped. The caller composites metadata/production strips separately.
 */
export async function mirrorArtworkForSheet(input: Buffer): Promise<Buffer> {
  return sharp(input).flop().png().toBuffer();
}

/** Composites already-rendered artwork and optional production strips onto the canonical A4 sheet. */
export async function composeA4PrintSheet(artwork: [Buffer, Buffer], strips?: [Buffer, Buffer]) {
  const layout = sheetLayout();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: artwork[0], left: 0, top: layout.design1Y },
    { input: artwork[1], left: 0, top: layout.design2Y },
  ];
  if (strips) {
    composites.push({ input: strips[0], left: 0, top: layout.strip1Y }, { input: strips[1], left: 0, top: layout.strip2Y });
  }
  return sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
}

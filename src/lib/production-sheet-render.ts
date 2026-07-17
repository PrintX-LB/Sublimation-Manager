import sharp from "sharp";
import { A4_SHEET, SHEET_LAYOUT, sheetLayout } from "@/lib/production-sheet";

export type CutMarkMode = "NONE" | "CORNER_MARKS" | "FULL_OUTLINE";

export interface CutMarkSettings {
  mode: CutMarkMode;
  lengthMm: number;
  offsetMm: number;
  thicknessMm: number;
}

const safeNumber = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

export function normalizeCutMarkSettings(input?: Partial<CutMarkSettings> | null): CutMarkSettings {
  const mode = input?.mode === "NONE" || input?.mode === "CORNER_MARKS" || input?.mode === "FULL_OUTLINE"
    ? input.mode
    : "FULL_OUTLINE";
  return {
    mode,
    lengthMm: safeNumber(input?.lengthMm ?? 8, 8) || 8,
    offsetMm: safeNumber(input?.offsetMm ?? 3, 3),
    thicknessMm: safeNumber(input?.thicknessMm ?? 0.3, 0.3) || 0.3,
  };
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

/** Render production-only cut marks. Artwork is composited separately and is never mirrored here. */
export function cutMarksSvg(
  settingsInput: Partial<CutMarkSettings> | null | undefined,
  occupiedSlots: number,
  dpi: number = A4_SHEET.dpi,
) {
  const settings = normalizeCutMarkSettings(settingsInput);
  if (settings.mode === "NONE" || occupiedSlots < 1) return null;
  const layout = sheetLayout();
  const length = Math.min(mmToPixels(settings.lengthMm, dpi), SHEET_LAYOUT.designWidthPx / 2);
  const offset = mmToPixels(settings.offsetMm, dpi);
  const stroke = mmToPixels(settings.thicknessMm, dpi);
  const marks: string[] = [];
  for (let slot = 0; slot < Math.min(occupiedSlots, 2); slot += 1) {
    const top = (slot === 0 ? layout.design1Y : layout.design2Y) + offset;
    const bottom = (slot === 0 ? layout.design1Y : layout.design2Y) + SHEET_LAYOUT.designHeightPx - offset;
    const left = offset;
    const right = SHEET_LAYOUT.designWidthPx - offset;
    if (settings.mode === "FULL_OUTLINE") {
      marks.push(line(left, top, right, top), line(right, top, right, bottom), line(right, bottom, left, bottom), line(left, bottom, left, top));
    } else {
      marks.push(
        line(left, top, left + length, top), line(left, top, left, top + length),
        line(right, top, right - length, top), line(right, top, right, top + length),
        line(left, bottom, left + length, bottom), line(left, bottom, left, bottom - length),
        line(right, bottom, right - length, bottom), line(right, bottom, right, bottom - length),
      );
    }
  }
  return Buffer.from(`<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.heightPx}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="square">${marks.join("")}</g></svg>`);
}

export function mmToPixels(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

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
export async function composeA4PrintSheet(
  artwork: [Buffer, Buffer],
  strips?: [Buffer, Buffer],
  cutMarks?: Partial<CutMarkSettings> | null,
  occupiedSlots = 2,
) {
  const layout = sheetLayout();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: artwork[0], left: 0, top: layout.design1Y },
    { input: artwork[1], left: 0, top: layout.design2Y },
  ];
  if (strips) {
    composites.push({ input: strips[0], left: 0, top: layout.strip1Y }, { input: strips[1], left: 0, top: layout.strip2Y });
  }
  const marks = cutMarksSvg(cutMarks, occupiedSlots, A4_SHEET.dpi);
  if (marks) composites.push({ input: marks, left: 0, top: 0 });
  return sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
}

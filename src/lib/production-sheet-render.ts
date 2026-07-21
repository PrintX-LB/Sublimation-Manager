import sharp from "sharp";
import { A4_SHEET, SHEET_LAYOUT, sheetLayout, threeUpMugLayout } from "@/lib/production-sheet";

export type CutMarkMode = "NONE" | "CORNER_MARKS" | "FULL_OUTLINE";

export interface CutMarkSettings {
  mode: CutMarkMode;
  lengthMm: number;
  offsetMm: number;
  thicknessMm: number;
}

export type ArtworkSize = { width: number; height: number };

export function artworkPathForCutMarks(
  version: { editedPath: string | null; printReadyPath: string | null },
  mode: CutMarkMode,
) {
  return mode === "FULL_OUTLINE" ? version.printReadyPath : version.editedPath;
}

export async function stripLegacyArtworkContour(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const edgeBand = Math.max(3, Math.floor(info.width * 0.08));
  const candidates = new Set<number>();
  for (let x = 0; x < info.width; x += 1) {
    if (x >= edgeBand && x < info.width - edgeBand) continue;
    let neutral = 0;
    for (let y = 0; y < info.height; y += 1) {
      const offset = (y * info.width + x) * 4;
      const r = data[offset] ?? 255;
      const g = data[offset + 1] ?? 255;
      const b = data[offset + 2] ?? 255;
      const a = data[offset + 3] ?? 0;
      if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) <= 4 && r >= 80 && r <= 245) neutral += 1;
    }
    if (neutral / info.height >= 0.7) candidates.add(x);
  }
  for (const x of candidates) {
    for (let y = 0; y < info.height; y += 1) {
      const offset = (y * info.width + x) * 4;
      data[offset + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

const safeNumber = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

export function normalizeCutMarkSettings(input?: Partial<CutMarkSettings> | null): CutMarkSettings {
  const mode = input?.mode === "NONE" || input?.mode === "CORNER_MARKS" || input?.mode === "FULL_OUTLINE"
    ? input.mode
    : "CORNER_MARKS";
  return {
    mode,
    lengthMm: safeNumber(input?.lengthMm ?? 8, 8) || 8,
    offsetMm: safeNumber(input?.offsetMm ?? 3, 3),
    thicknessMm: safeNumber(input?.thicknessMm ?? 0.3, 0.3) || 0.3,
  };
}

export function mmToPixels(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

export function cutMarksSvg(
  settingsInput: Partial<CutMarkSettings> | null | undefined,
  occupiedSlots: number,
  dpi: number = A4_SHEET.dpi,
  artworkSizes?: [ArtworkSize?, ArtworkSize?],
) {
  const settings = normalizeCutMarkSettings(settingsInput);
  if (settings.mode === "NONE" || occupiedSlots < 1) return null;
  const layout = sheetLayout();
  const gap = mmToPixels(settings.offsetMm, dpi);
  const length = Math.min(
    mmToPixels(settings.lengthMm, dpi),
    SHEET_LAYOUT.designWidthPx / 4,
    SHEET_LAYOUT.designHeightPx / 4,
  );
  const stroke = mmToPixels(settings.thicknessMm, dpi);
  const marks: string[] = [];

  for (let slot = 0; slot < Math.min(occupiedSlots, 2); slot += 1) {
    const size = artworkSizes?.[slot] ?? { width: SHEET_LAYOUT.designWidthPx, height: SHEET_LAYOUT.designHeightPx };
    const leftEdge = SHEET_LAYOUT.sideMarginPx + Math.round((SHEET_LAYOUT.designWidthPx - size.width) / 2);
    const rightEdge = leftEdge + size.width;
    const slotTop = slot === 0 ? layout.design1Y : layout.design2Y;
    const topEdge = slotTop + Math.round((SHEET_LAYOUT.designHeightPx - size.height) / 2);
    const bottomEdge = topEdge + size.height;

    if (settings.mode === "FULL_OUTLINE") {
      marks.push(
        line(leftEdge, topEdge, rightEdge, topEdge),
        line(rightEdge, topEdge, rightEdge, bottomEdge),
        line(rightEdge, bottomEdge, leftEdge, bottomEdge),
        line(leftEdge, bottomEdge, leftEdge, topEdge),
      );
    } else {
      // Corner marks drawn INWARD from the design corners
      marks.push(
        line(leftEdge, topEdge, leftEdge + length, topEdge),
        line(leftEdge, topEdge, leftEdge, topEdge + length),
      );
      marks.push(
        line(rightEdge, topEdge, rightEdge - length, topEdge),
        line(rightEdge, topEdge, rightEdge, topEdge + length),
      );
      marks.push(
        line(leftEdge, bottomEdge, leftEdge + length, bottomEdge),
        line(leftEdge, bottomEdge, leftEdge, bottomEdge - length),
      );
      marks.push(
        line(rightEdge, bottomEdge, rightEdge - length, bottomEdge),
        line(rightEdge, bottomEdge, rightEdge, bottomEdge - length),
      );
    }
  }
  return Buffer.from(`<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.heightPx}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="square">${marks.join("")}</g></svg>`);
}

function threeUpIdentifiersSvg(labels: string[], dpi: number) {
  const layout = threeUpMugLayout(dpi);
  const fontSize = Math.round((8 / 72) * dpi);
  const inset = mmToPixels(2.5, dpi);
  const text = labels.map((label, index) => {
    const top = layout.topMarginPx + index * layout.stridePx;
    const bottom = top + layout.heightPx;
    const estimatedWidth = label.length * fontSize * 0.58;
    const safeLabel = escapeXml(label);
    if (estimatedWidth <= layout.widthPx * 0.55) {
      const x = layout.leftPx + inset;
      const y = bottom + Math.round(layout.labelHeightPx * 0.72);
      return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="black">${safeLabel}</text>`;
    }
    const x = layout.leftPx - inset;
    const y = top + Math.round(layout.heightPx / 2);
    return `<text x="${x}" y="${y}" transform="rotate(-90 ${x} ${y})" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="black">${safeLabel}</text>`;
  }).join("");
  return Buffer.from(`<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.heightPx}" xmlns="http://www.w3.org/2000/svg"><g>${text}</g></svg>`);
}

function threeUpCutMarksSvg(settingsInput: Partial<CutMarkSettings> | null | undefined, occupiedSlots: number, dpi: number) {
  const settings = normalizeCutMarkSettings(settingsInput);
  if (settings.mode === "NONE") return null;
  const layout = threeUpMugLayout(dpi);
  const gap = mmToPixels(settings.offsetMm, dpi);
  const length = Math.min(mmToPixels(settings.lengthMm, dpi), layout.widthPx / 4, layout.heightPx / 4);
  const stroke = mmToPixels(settings.thicknessMm, dpi);
  const marks: string[] = [];
  for (let index = 0; index < Math.min(occupiedSlots, layout.maxSlots); index += 1) {
    const leftEdge = layout.leftPx;
    const rightEdge = leftEdge + layout.widthPx;
    const topEdge = layout.topMarginPx + index * layout.stridePx;
    const bottomEdge = topEdge + layout.heightPx;
    if (settings.mode === "FULL_OUTLINE") {
      marks.push(line(leftEdge, topEdge, rightEdge, topEdge), line(rightEdge, topEdge, rightEdge, bottomEdge), line(rightEdge, bottomEdge, leftEdge, bottomEdge), line(leftEdge, bottomEdge, leftEdge, topEdge));
    } else {
      marks.push(
        line(leftEdge, topEdge, leftEdge + length, topEdge), line(leftEdge, topEdge, leftEdge, topEdge + length),
        line(rightEdge, topEdge, rightEdge - length, topEdge), line(rightEdge, topEdge, rightEdge, topEdge + length),
        line(leftEdge, bottomEdge, leftEdge + length, bottomEdge), line(leftEdge, bottomEdge, leftEdge, bottomEdge - length),
        line(rightEdge, bottomEdge, rightEdge - length, bottomEdge), line(rightEdge, bottomEdge, rightEdge, bottomEdge - length),
      );
    }
  }
  return Buffer.from(`<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.heightPx}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="square">${marks.join("")}</g></svg>`);
}

export async function composeThreeUpMugSheet(artwork: Buffer[], identifiers: string[], cutMarks?: Partial<CutMarkSettings> | null) {
  const layout = threeUpMugLayout(A4_SHEET.dpi);
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [index, input] of artwork.slice(0, layout.maxSlots).entries()) {
    const metadata = await sharp(input).metadata();
    const width = metadata.width ?? layout.widthPx;
    const height = metadata.height ?? layout.heightPx;
    composites.push({ input, left: layout.leftPx + Math.round((layout.widthPx - width) / 2), top: layout.topMarginPx + index * layout.stridePx + Math.round((layout.heightPx - height) / 2) });
  }
  const labels = threeUpIdentifiersSvg(identifiers.slice(0, layout.maxSlots), A4_SHEET.dpi);
  composites.push({ input: labels, left: 0, top: 0 });
  const marks = threeUpCutMarksSvg(cutMarks, artwork.length, A4_SHEET.dpi);
  if (marks) composites.push({ input: marks, left: 0, top: 0 });
  return sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
}

export async function mirrorArtworkForSheet(input: Buffer): Promise<Buffer> {
  return sharp(await stripLegacyArtworkContour(input)).flop().png().toBuffer();
}

export async function composeA4PrintSheet(
  artwork: [Buffer, Buffer],
  strips?: [Buffer, Buffer],
  cutMarks?: Partial<CutMarkSettings> | null,
  occupiedSlots = 2,
) {
  const layout = sheetLayout();
  const artworkSizes = await Promise.all(
    artwork.map(async (input) => {
      const metadata = await sharp(input).metadata();
      return { width: metadata.width ?? SHEET_LAYOUT.designWidthPx, height: metadata.height ?? SHEET_LAYOUT.designHeightPx };
    }),
  ) as [ArtworkSize, ArtworkSize];
  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: artwork[0], left: SHEET_LAYOUT.sideMarginPx + Math.round((SHEET_LAYOUT.designWidthPx - artworkSizes[0].width) / 2), top: layout.design1Y + Math.round((SHEET_LAYOUT.designHeightPx - artworkSizes[0].height) / 2) },
    { input: artwork[1], left: SHEET_LAYOUT.sideMarginPx + Math.round((SHEET_LAYOUT.designWidthPx - artworkSizes[1].width) / 2), top: layout.design2Y + Math.round((SHEET_LAYOUT.designHeightPx - artworkSizes[1].height) / 2) },
  ];
  if (strips) {
    composites.push({ input: strips[0], left: 0, top: layout.strip1Y }, { input: strips[1], left: 0, top: layout.strip2Y });
  }
  const marks = cutMarksSvg(cutMarks, occupiedSlots, A4_SHEET.dpi, artworkSizes);
  if (marks) composites.push({ input: marks, left: 0, top: 0 });
  return sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
}

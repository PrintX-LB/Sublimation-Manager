import sharp from "sharp";
import {
  DynamicSheetLayout,
  mmToPixels,
} from "./production-sheet";

export const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

export interface CutMarkSettings {
  mode: "CORNER_MARKS" | "FULL_OUTLINE" | "NONE";
  lengthMm: number;
  offsetMm: number;
  thicknessMm: number;
}

export function normalizeCutMarkSettings(input?: Partial<CutMarkSettings> | null): CutMarkSettings {
  return {
    mode: input?.mode ?? "NONE",
    lengthMm: input?.lengthMm ?? 5,
    offsetMm: input?.offsetMm ?? 2,
    thicknessMm: input?.thicknessMm ?? 0.5,
  };
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" />`;
}

export function dynamicCutMarksSvg(
  layout: DynamicSheetLayout,
  occupiedSlots: number,
  settingsInput?: Partial<CutMarkSettings> | null
) {
  const settings = normalizeCutMarkSettings(settingsInput);
  if (settings.mode === "NONE") return null;

  const stroke = mmToPixels(settings.thicknessMm, layout.dpi);
  const length = mmToPixels(settings.lengthMm, layout.dpi);
  const marks: string[] = [];

  for (let i = 0; i < Math.min(occupiedSlots, layout.slots.length); i++) {
    const slot = layout.slots[i]!;
    const leftEdge = slot.x;
    const topEdge = slot.y;
    const rightEdge = slot.x + slot.width;
    const bottomEdge = slot.y + slot.height;

    if (settings.mode === "FULL_OUTLINE") {
      marks.push(
        line(leftEdge, topEdge, rightEdge, topEdge),
        line(rightEdge, topEdge, rightEdge, bottomEdge),
        line(rightEdge, bottomEdge, leftEdge, bottomEdge),
        line(leftEdge, bottomEdge, leftEdge, topEdge)
      );
    } else {
      marks.push(
        line(leftEdge, topEdge, leftEdge + length, topEdge),
        line(leftEdge, topEdge, leftEdge, topEdge + length),
        line(rightEdge, topEdge, rightEdge - length, topEdge),
        line(rightEdge, topEdge, rightEdge, topEdge + length),
        line(leftEdge, bottomEdge, leftEdge + length, bottomEdge),
        line(leftEdge, bottomEdge, leftEdge, bottomEdge - length),
        line(rightEdge, bottomEdge, rightEdge - length, bottomEdge),
        line(rightEdge, bottomEdge, rightEdge, bottomEdge - length)
      );
    }
  }

  return Buffer.from(
    `<svg width="${layout.sheetWidthPx}" height="${layout.sheetHeightPx}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="square">${marks.join("")}</g></svg>`
  );
}

export function dynamicIdentifiersSvg(
  layout: DynamicSheetLayout,
  labels: string[]
) {
  const fontSize = Math.round((8 / 72) * layout.dpi);
  const text = labels.map((label, index) => {
    const slot = layout.slots[index]!;
    const safeLabel = escapeXml(label);
    
    // Position below artwork block
    const x = slot.labelX + slot.labelWidth / 2;
    const y = slot.labelY + fontSize + mmToPixels(1, layout.dpi); // 1mm padding

    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="black">${safeLabel}</text>`;
  }).join("");

  return Buffer.from(
    `<svg width="${layout.sheetWidthPx}" height="${layout.sheetHeightPx}" xmlns="http://www.w3.org/2000/svg"><g>${text}</g></svg>`
  );
}

export async function composeDynamicPrintSheet(
  layout: DynamicSheetLayout,
  artwork: Buffer[],
  identifiers: string[],
  cutMarks?: Partial<CutMarkSettings> | null
) {
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  for (let i = 0; i < Math.min(artwork.length, layout.slots.length); i++) {
    const slot = layout.slots[i]!;
    let input = artwork[i]!;
    
    if (slot.rotated) {
      input = await sharp(input).rotate(90).png().toBuffer();
    }
    
    composites.push({
      input,
      left: slot.x,
      top: slot.y,
    });
  }

  const labels = dynamicIdentifiersSvg(layout, identifiers.slice(0, layout.slots.length));
  composites.push({ input: labels, left: 0, top: 0 });

  const marks = dynamicCutMarksSvg(layout, artwork.length, cutMarks);
  if (marks) composites.push({ input: marks, left: 0, top: 0 });

  return sharp({
    create: {
      width: layout.sheetWidthPx,
      height: layout.sheetHeightPx,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .withMetadata({ density: layout.dpi })
    .png()
    .toBuffer();
}

export async function mirrorArtworkForSheet(input: Buffer): Promise<Buffer> {
  // Strip contour removed for brevity, assuming standard mirror is fine for now
  return sharp(input).flop().png().toBuffer();
}

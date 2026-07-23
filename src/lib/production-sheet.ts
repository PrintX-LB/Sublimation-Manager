export const A4_SHEET = { widthMm: 210, heightMm: 297, dpi: 300 } as const;
export const A3_SHEET = { widthMm: 297, heightMm: 420, dpi: 300 } as const;

// Legacy constants (kept for backward compatibility during transition if needed, though mostly replaced)
export const MUG_DESIGN = { widthMm: 205, heightMm: 95 } as const;
export const THREE_UP_MUG_DESIGN = { widthMm: 200, heightMm: 90, maxSlots: 3 } as const;

export function mmToPixels(mm: number, dpi: number = A4_SHEET.dpi) {
  return Math.round((mm / 25.4) * dpi);
}

// Legacy SHEET_LAYOUT
export const SHEET_LAYOUT = {
  widthPx: mmToPixels(A4_SHEET.widthMm),
  heightPx: mmToPixels(A4_SHEET.heightMm),
  designWidthPx: mmToPixels(MUG_DESIGN.widthMm),
  designHeightPx: mmToPixels(MUG_DESIGN.heightMm),
  sideMarginPx: mmToPixels((A4_SHEET.widthMm - MUG_DESIGN.widthMm) / 2),
  topMarginPx: mmToPixels(10),
  stripHeightPx: mmToPixels(Math.max(0, A4_SHEET.heightMm - (MUG_DESIGN.heightMm * 2) - 20) / 2),
} as const;

export function sheetLayout() {
  const { designHeightPx, stripHeightPx, topMarginPx } = SHEET_LAYOUT;
  const design1Y = topMarginPx;
  const strip1Y = design1Y + designHeightPx;
  const design2Y = strip1Y + stripHeightPx;
  const strip2Y = design2Y + designHeightPx;
  return { design1Y, strip1Y, design2Y, strip2Y, topMarginPx };
}

export function isThreeUpMugTemplate(widthMm: number, heightMm: number) {
  return Math.abs(widthMm - THREE_UP_MUG_DESIGN.widthMm) < 0.01 && Math.abs(heightMm - THREE_UP_MUG_DESIGN.heightMm) < 0.01;
}

export function threeUpMugLayout(dpi: number = A4_SHEET.dpi) {
  const widthPx = mmToPixels(THREE_UP_MUG_DESIGN.widthMm, dpi);
  const heightPx = mmToPixels(THREE_UP_MUG_DESIGN.heightMm, dpi);
  const labelHeightPx = mmToPixels(4, dpi);
  const stridePx = heightPx + labelHeightPx;
  const leftPx = Math.round((mmToPixels(A4_SHEET.widthMm, dpi) - widthPx) / 2);
  const topMarginPx = Math.floor((mmToPixels(A4_SHEET.heightMm, dpi) - stridePx * THREE_UP_MUG_DESIGN.maxSlots) / 2);
  return { widthPx, heightPx, labelHeightPx, stridePx, leftPx, topMarginPx, gapPx: labelHeightPx, maxSlots: THREE_UP_MUG_DESIGN.maxSlots };
}

export function nextSheetFilename(base: string, existing: string[]) {
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(?:png|jpe?g|webp|pdf)$/i, "") || "print_sheet";
  const first = `${safe}.pdf`;
  if (!existing.includes(first)) return first;
  let version = 2;
  while (existing.includes(`${safe}-v${version}.pdf`)) version += 1;
  return `${safe}-v${version}.pdf`;
}

// ── Dynamic Layout Engine ──────────────────────────────────────────────────

export interface DynamicLayoutSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  labelX: number;
  labelY: number;
  labelRotation: number;
  labelWidth: number;
}

export interface DynamicSheetLayout {
  sheetWidthPx: number;
  sheetHeightPx: number;
  slots: DynamicLayoutSlot[];
  maxSlots: number;
  rotated: boolean;
  dpi: number;
}

export function calculateDynamicLayout(
  templateWidthMm: number,
  templateHeightMm: number,
  sheetSize: { widthMm: number; heightMm: number; dpi: number } = A4_SHEET,
  gapMm = 2,
  labelHeightMm = 4
): DynamicSheetLayout {
  const W = sheetSize.widthMm;
  const H = sheetSize.heightMm;
  const dpi = sheetSize.dpi;

  // Portrait testing
  const w1 = templateWidthMm;
  const h1 = templateHeightMm + labelHeightMm;
  const cols1 = Math.floor((W + gapMm) / (w1 + gapMm)) || 0;
  const rows1 = Math.floor((H + gapMm) / (h1 + gapMm)) || 0;
  const slots1 = cols1 * rows1;

  // Landscape testing (rotated template)
  const w2 = templateHeightMm;
  const h2 = templateWidthMm + labelHeightMm;
  const cols2 = Math.floor((W + gapMm) / (w2 + gapMm)) || 0;
  const rows2 = Math.floor((H + gapMm) / (h2 + gapMm)) || 0;
  const slots2 = cols2 * rows2;

  // Choose the orientation that yields more slots, preferring non-rotated if equal
  const rotate = slots2 > slots1;
  const maxSlots = rotate ? slots2 : slots1;
  const cols = rotate ? cols2 : cols1;
  const rows = rotate ? rows2 : rows1;

  const activeW = rotate ? templateHeightMm : templateWidthMm;
  const activeH = rotate ? templateWidthMm : templateHeightMm;
  const blockW = activeW;
  const blockH = activeH + labelHeightMm;

  const slots: DynamicLayoutSlot[] = [];

  if (maxSlots > 0) {
    const gridWidth = cols * blockW + (cols - 1) * gapMm;
    const gridHeight = rows * blockH + (rows - 1) * gapMm;
    const startX = (W - gridWidth) / 2;
    const startY = (H - gridHeight) / 2;

    for (let i = 0; i < maxSlots; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const xMm = startX + c * (blockW + gapMm);
      const yMm = startY + r * (blockH + gapMm);

      const labelXMm = xMm;
      const labelYMm = yMm + activeH; // below the artwork

      slots.push({
        x: mmToPixels(xMm, dpi),
        y: mmToPixels(yMm, dpi),
        width: mmToPixels(activeW, dpi),
        height: mmToPixels(activeH, dpi),
        rotated: rotate,
        labelX: mmToPixels(labelXMm, dpi),
        labelY: mmToPixels(labelYMm, dpi),
        labelRotation: 0,
        labelWidth: mmToPixels(activeW, dpi),
      });
    }
  }

  return {
    sheetWidthPx: mmToPixels(W, dpi),
    sheetHeightPx: mmToPixels(H, dpi),
    slots,
    maxSlots,
    rotated: rotate,
    dpi,
  };
}

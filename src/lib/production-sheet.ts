export const A4_SHEET = { widthMm: 210, heightMm: 297, dpi: 300 } as const;
export const MUG_DESIGN = { widthMm: 205, heightMm: 95 } as const;
export const THREE_UP_MUG_DESIGN = { widthMm: 200, heightMm: 90, maxSlots: 3 } as const;

export function mmToPixels(mm: number, dpi: number = A4_SHEET.dpi) {
  return Math.round((mm / 25.4) * dpi);
}

const SIDE_MARGIN_MM = (A4_SHEET.widthMm - MUG_DESIGN.widthMm) / 2; // = 2.5mm
const TOP_MARGIN_MM = 10;
const TOTAL_STRIP_SPACE_MM = A4_SHEET.heightMm - (MUG_DESIGN.heightMm * 2) - (TOP_MARGIN_MM * 2);
const STRIP_HEIGHT_MM = Math.max(0, TOTAL_STRIP_SPACE_MM / 2);

export const SHEET_LAYOUT = {
  widthPx: mmToPixels(A4_SHEET.widthMm),
  heightPx: mmToPixels(A4_SHEET.heightMm),
  designWidthPx: mmToPixels(MUG_DESIGN.widthMm),
  designHeightPx: mmToPixels(MUG_DESIGN.heightMm),
  sideMarginPx: mmToPixels(SIDE_MARGIN_MM),
  topMarginPx: mmToPixels(TOP_MARGIN_MM),
  stripHeightPx: mmToPixels(STRIP_HEIGHT_MM),
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
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.(?:png|jpe?g|webp|pdf)$/i, "") || "A4_print_sheet";
  const first = `${safe}.pdf`;
  if (!existing.includes(first)) return first;
  let version = 2;
  while (existing.includes(`${safe}-v${version}.pdf`)) version += 1;
  return `${safe}-v${version}.pdf`;
}

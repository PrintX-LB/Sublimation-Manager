import { mmToPixels } from "@/lib/production-sheet";

export type PairingAttempt = {
  id: string; attemptNumber: number; status: string; createdAt: Date; orderNumber: string; orderId: string; orderItemId?: string; itemSequence?: number; customerName: string; productName: string; variantName: string; dueDate: Date | null; priority: string; artworkVersionId: string; artworkPath: string; templateName: string; compatibilityKey: string; assigned: boolean;
};

export function templateCompatibilityKey(input: { widthMm: number | { toString(): string }; heightMm: number | { toString(): string }; dpi: number; name: string; mirror?: boolean; contour?: boolean; cutMarkMode?: string }) {
  const width = mmToPixels(Number(input.widthMm), input.dpi); const height = mmToPixels(Number(input.heightMm), input.dpi);
  const mark = input.cutMarkMode === "CORNER_MARKS"
    ? "CORNER_MARKS"
    : input.cutMarkMode === "FULL_OUTLINE" || input.contour
      ? "CONTOUR"
      : "NO_CONTOUR";
  return `${input.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${width}X${height}_${input.dpi}DPI_${input.mirror === false ? "DIRECT" : "MIRRORED"}_${mark}`;
}

export function isCompatible(a: PairingAttempt, b: PairingAttempt) { return a.compatibilityKey === b.compatibilityKey; }

const priorityRank: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
export function pairingSort(a: PairingAttempt, b: PairingAttempt) {
  const now = Date.now(); const overdue = (item: PairingAttempt) => item.dueDate ? item.dueDate.getTime() < now : false;
  const rank = (item: PairingAttempt) => (overdue(item) ? 0 : 1) * 10 + (priorityRank[item.priority] ?? 2);
  return rank(a) - rank(b) || (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.createdAt.getTime() - b.createdAt.getTime() || a.orderNumber.localeCompare(b.orderNumber) || a.attemptNumber - b.attemptNumber || a.id.localeCompare(b.id);
}

export function suggestPairs(items: PairingAttempt[]) {
  const remaining = [...items].sort(pairingSort); const pairs: Array<[PairingAttempt, PairingAttempt]> = []; const unpaired: PairingAttempt[] = [];
  while (remaining.length) {
    const first = remaining.shift()!; const partnerIndex = remaining.findIndex((candidate) => isCompatible(first, candidate));
    if (partnerIndex < 0) { unpaired.push(first); continue; }
    const [partner] = remaining.splice(partnerIndex, 1); if (partner) pairs.push([first, partner]);
  }
  return { pairs, unpaired: [...unpaired, ...remaining].sort(pairingSort) };
}

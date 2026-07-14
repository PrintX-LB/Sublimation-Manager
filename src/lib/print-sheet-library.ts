import { Prisma } from "@prisma/client";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { getPrintSheetBuilderFolder } from "@/lib/order-storage";

export const PRINT_SHEET_STATUSES = ["GENERATED", "READY_TO_PRINT", "PRINTED", "CANCELLED", "SUPERSEDED", "ERROR"] as const;
export type PrintSheetStatus = (typeof PRINT_SHEET_STATUSES)[number];

/** Allocates a readable sheet number. SQLite serializes the write transaction; the unique constraint is the final guard. */
export async function nextPrintSheetNumber(tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const sequenceKey = "print-sheet-number";
  const existingSequence = await tx.sequence.findUnique({ where: { key: sequenceKey } });
  let nextValue: number;
  if (existingSequence) {
    const updated = await tx.sequence.update({ where: { key: sequenceKey }, data: { value: { increment: 1 } } });
    nextValue = updated.value;
  } else {
    const rows = await tx.printSheet.findMany({ where: { sheetNumber: { not: null } }, select: { sheetNumber: true } });
    const max = rows.reduce((highest, row) => {
      const match = row.sheetNumber?.match(/^PS(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    const created = await tx.sequence.create({ data: { key: sequenceKey, value: max + 1 } });
    nextValue = created.value;
  }
  return `PS${String(nextValue).padStart(5, "0")}`;
}

export async function resolvePrintSheetPath(storagePath: string) {
  const base = path.resolve(await getPrintSheetBuilderFolder());
  const resolved = path.resolve(process.cwd(), storagePath);
  const allowed = resolved === base || resolved.startsWith(`${base}${path.sep}`);
  if (!allowed) throw new Error("INVALID_PRINT_SHEET_PATH");
  return { base, resolved };
}

export async function printSheetFileExists(storagePath: string) {
  try { await access((await resolvePrintSheetPath(storagePath)).resolved); return true; } catch { return false; }
}

export async function copyPrintSheetFile(sourcePath: string, targetPath: string) {
  const source = await resolvePrintSheetPath(sourcePath);
  const target = await resolvePrintSheetPath(targetPath);
  await mkdir(path.dirname(target.resolved), { recursive: true });
  await writeFile(target.resolved, await readFile(source.resolved), { flag: "wx" });
}

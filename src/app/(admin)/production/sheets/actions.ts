"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readdir, unlink, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { orderItemReference } from "@/lib/orders/item-reference";
import { resolveStoredArtworkPath } from "@/lib/order-storage";
import {
  copyPrintSheetFile,
  nextPrintSheetNumber,
  resolvePrintSheetPath,
} from "@/lib/print-sheet-library";
import { nextSheetFilename } from "@/lib/production-sheet";
import { consumePhysicalPrintSheet } from "@/lib/production/recipes";
import {
  composeA4PrintSheet,
  mirrorArtworkForSheet,
} from "@/lib/production-sheet-render";
import { createExactSizePdf } from "@/lib/print-pdf";
import { A4_SHEET } from "@/lib/production-sheet";

function sheetId(formData: FormData) {
  const value = String(formData.get("sheetId") ?? "").trim();
  if (!value) throw new Error("SHEET_REQUIRED");
  return value;
}
async function lifecycle(
  sheetIdValue: string,
  status: "PRINTED" | "CANCELLED",
) {
  await prisma.$transaction(async (tx) => {
    const sheet = await tx.printSheet.findUnique({
      where: { id: sheetIdValue },
    });
    if (!sheet) throw new Error("SHEET_NOT_FOUND");
    if (status === "PRINTED" && sheet.status === "CANCELLED")
      throw new Error("CANCELLED_SHEET_CANNOT_BE_PRINTED");
    if (status === "CANCELLED" && sheet.status === "PRINTED")
      throw new Error("PRINTED_SHEET_CANNOT_BE_CANCELLED");
    if (sheet.status === status) return;
    await tx.printSheet.update({
      where: { id: sheetIdValue },
      data: {
        status,
        printedAt: status === "PRINTED" ? new Date() : sheet.printedAt,
        cancelledAt: status === "CANCELLED" ? new Date() : sheet.cancelledAt,
      },
    });
    await tx.printSheetEvent.create({
      data: {
        sheetId: sheetIdValue,
        eventType: status === "PRINTED" ? "MARKED_PRINTED" : "CANCELLED",
        note:
          status === "PRINTED"
            ? "Physical sheet marked as printed."
            : "Sheet cancelled; inventory was not reversed.",
      },
    });
  });
}

async function releaseSheetAttempts(sheetIdValue: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.printSheet.findUnique({
      where: { id: sheetIdValue },
      include: { slots: true },
    });
    if (!sheet) throw new Error("SHEET_NOT_FOUND");
    if (sheet.status === "PRINTED")
      throw new Error("PRINTED_SHEET_USE_INCIDENT_REPRINT");
    const active = sheet.slots.filter(
      (slot) => slot.assignmentState === "ACTIVE" && slot.productionAttemptId,
    );
    if (!active.length) return 0;
    await tx.printSheetSlot.updateMany({
      where: { sheetId: sheet.id, assignmentState: "ACTIVE" },
      data: {
        assignmentState: "RELEASED",
        releasedAt: new Date(),
        releaseReason: reason,
      },
    });
    await tx.productionAttempt.updateMany({
      where: {
        id: {
          in: active.flatMap((slot) =>
            slot.productionAttemptId ? [slot.productionAttemptId] : [],
          ),
        },
        status: { not: "Failed" },
      },
      data: { status: "Ready to Print" },
    });
    await tx.printSheetEvent.create({
      data: { sheetId: sheet.id, eventType: "ATTEMPTS_RELEASED", note: reason },
    });
    return active.length;
  });
}
export async function markPrintSheetPrintedAction(formData: FormData) {
  const value = sheetId(formData);
  await lifecycle(value, "PRINTED");
  revalidatePath("/production/sheets");
  revalidatePath(`/production/sheets/${value}`);
  redirect(`/production/sheets/${value}?saved=printed`);
}
export async function cancelPrintSheetAction(formData: FormData) {
  const value = sheetId(formData);
  await lifecycle(value, "CANCELLED");
  revalidatePath("/production/sheets");
  revalidatePath(`/production/sheets/${value}`);
  redirect(`/production/sheets/${value}?saved=cancelled`);
}

/**
 * Removes a generated sheet from history without reversing immutable stock or
 * material-consumption records. Active production assignments are safely
 * returned to the queue before the sheet record is removed.
 */
export async function deleteGeneratedPrintSheetAction(formData: FormData) {
  const value = sheetId(formData);
  const sheet = await prisma.printSheet.findUnique({
    where: { id: value },
    include: { slots: true },
  });
  if (!sheet) throw new Error("SHEET_NOT_FOUND");
  const file = await resolvePrintSheetPath(sheet.storagePath);

  await prisma.$transaction(async (tx) => {
    const activeAttemptIds = sheet.slots
      .filter((slot) => slot.assignmentState === "ACTIVE" && slot.productionAttemptId)
      .map((slot) => slot.productionAttemptId!);
    if (activeAttemptIds.length) {
      await tx.productionAttempt.updateMany({
        where: { id: { in: activeAttemptIds }, status: { not: "Failed" } },
        data: { status: "Ready to Print" },
      });
    }

    // Preserve immutable inventory/material history while removing the sheet
    // relationship that would otherwise prevent a safe delete.
    await tx.productionMaterialConsumption.updateMany({
      where: { printSheetId: value },
      data: { printSheetId: null },
    });
    await tx.printSheet.updateMany({
      where: { sourceSheetId: value },
      data: { sourceSheetId: null },
    });
    await tx.printSheet.delete({ where: { id: value } });
  });

  // The database is authoritative. A missing file is already a successful
  // history deletion; an undeletable file can be cleaned up separately.
  await unlink(file.resolved).catch(() => undefined);
  revalidatePath("/production/sheets");
  revalidatePath("/production/sheets/queue");
  redirect("/production/sheets?view=history&deleted=1");
}

export async function cancelPrintSheetAndReleaseAction(formData: FormData) {
  const value = sheetId(formData);
  await prisma.$transaction(async (tx) => {
    const sheet = await tx.printSheet.findUnique({
      where: { id: value },
      include: { slots: true },
    });
    if (!sheet) throw new Error("SHEET_NOT_FOUND");
    if (sheet.status === "PRINTED")
      throw new Error("PRINTED_SHEET_CANNOT_BE_CANCELLED");
    await tx.printSheet.update({
      where: { id: value },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    const activeIds = sheet.slots
      .filter(
        (slot) => slot.assignmentState === "ACTIVE" && slot.productionAttemptId,
      )
      .map((slot) => slot.productionAttemptId!);
    if (activeIds.length) {
      await tx.printSheetSlot.updateMany({
        where: { sheetId: value, assignmentState: "ACTIVE" },
        data: {
          assignmentState: "RELEASED",
          releasedAt: new Date(),
          releaseReason: "Cancelled and released by operator",
        },
      });
      await tx.productionAttempt.updateMany({
        where: { id: { in: activeIds }, status: { not: "Failed" } },
        data: { status: "Ready to Print" },
      });
    }
    await tx.printSheetEvent.create({
      data: {
        sheetId: value,
        eventType: "CANCELLED",
        note: "Sheet cancelled and attempts released; inventory was not restored.",
      },
    });
    if (activeIds.length)
      await tx.printSheetEvent.create({
        data: {
          sheetId: value,
          eventType: "ATTEMPTS_RELEASED",
          note: "Attempts released as part of cancellation.",
        },
      });
  });
  revalidatePath("/production/sheets");
  revalidatePath("/production/sheets/queue");
  revalidatePath(`/production/sheets/${value}`);
  redirect(`/production/sheets/${value}?saved=cancelled-released`);
}

export async function releaseAttemptsBackToQueueAction(formData: FormData) {
  const value = sheetId(formData);
  const reason =
    String(formData.get("releaseReason") ?? "Released by operator").trim() ||
    "Released by operator";
  await releaseSheetAttempts(value, reason);
  revalidatePath("/production/sheets");
  revalidatePath("/production/sheets/queue");
  revalidatePath(`/production/sheets/${value}`);
  redirect(`/production/sheets/${value}?saved=released`);
}

export async function recreatePrintSheetFileAction(formData: FormData) {
  const value = sheetId(formData);
  const sheet = await prisma.printSheet.findUnique({
    where: { id: value },
    include: {
      slots: {
        include: {
          order: { include: { customer: true } },
          orderItem: true,
          artworkVersion: true,
        },
      },
    },
  });
  if (!sheet) throw new Error("SHEET_NOT_FOUND");
  const source = await resolvePrintSheetPath(sheet.storagePath);
  const folder = path.dirname(source.resolved);
  const existing = await readdir(folder).catch(() => [] as string[]);
  const filename = nextSheetFilename(
    `${sheet.sheetNumber ?? "sheet"}_recreated`,
    existing,
  );
  const targetPath = path
    .relative(process.cwd(), path.join(folder, filename))
    .replaceAll(path.sep, "/");
  let sourceAvailable = true;
  try {
    await import("node:fs/promises").then(({ access }) =>
      access(source.resolved),
    );
  } catch {
    sourceAvailable = false;
  }
  if (sourceAvailable) {
    if (path.extname(source.resolved).toLowerCase() === ".pdf") {
      await copyPrintSheetFile(sheet.storagePath, targetPath);
    } else {
      await writeFile(path.join(folder, filename), await createExactSizePdf(await readFile(source.resolved), A4_SHEET), { flag: "wx" });
    }
  }
  else {
    if (sheet.slots.length !== 2) throw new Error("SHEET_SLOTS_INVALID");
    const artwork: Buffer[] = [];
    for (const slot of sheet.slots.sort(
      (a, b) => a.slotNumber - b.slotNumber,
    )) {
      const relative =
        slot.artworkVersion.printReadyPath || slot.artworkVersion.editedPath;
      const resolved = await resolveStoredArtworkPath(relative);
      if (!resolved) throw new Error("INVALID_ARTWORK_PATH");
      artwork.push(
        await mirrorArtworkForSheet(await sharp(resolved).png().toBuffer()),
      );
    }
    const strips = sheet.slots
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .map((slot, index) =>
        Buffer.from(
      `<svg width="${sheet.widthPx}" height="${Math.round(sheet.heightPx / 3.1)}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${sheet.widthPx - 4}" height="${Math.round(sheet.heightPx / 3.1) - 4}" fill="none" stroke="black" stroke-width="3"/><g fill="black" font-family="Arial" font-size="36"><text x="34" y="65">${orderItemReference(slot.order.orderNumber, slot.orderItem?.itemSequence ?? 1)}</text><text x="34" y="115">${slot.order.customer.fullName}</text><text x="34" y="165">${slot.orderItem?.productNameSnapshot ?? "Artwork"}</text><text x="34" y="215">Transfer ${index + 1} of 2</text></g></svg>`,
        ),
      );
    await writeFile(
      path.join(folder, filename),
      await createExactSizePdf(await composeA4PrintSheet(
        [artwork[0]!, artwork[1]!],
        [strips[0]!, strips[1]!],
        { mode: sheet.cutMarkMode as "NONE" | "CORNER_MARKS" | "FULL_OUTLINE", lengthMm: Number(sheet.cutMarkLengthMm), offsetMm: Number(sheet.cutMarkOffsetMm), thicknessMm: Number(sheet.cutMarkThicknessMm) },
        sheet.slots.length,
      ), A4_SHEET),
      { flag: "wx" },
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.printSheet.update({
      where: { id: value },
      data: { storagePath: targetPath, filename },
    });
    await tx.printSheetEvent.create({
      data: {
        sheetId: value,
        eventType: "FILE_RECREATED",
        note: "File recreated without material consumption.",
      },
    });
  });
  revalidatePath("/production/sheets");
  revalidatePath(`/production/sheets/${value}`);
  redirect(`/production/sheets/${value}?saved=recreated`);
}

export async function regeneratePhysicalPrintSheetAction(formData: FormData) {
  const value = sheetId(formData);
  const source = await prisma.printSheet.findUnique({
    where: { id: value },
    include: { slots: { include: { orderItem: true } } },
  });
  if (!source) throw new Error("SHEET_NOT_FOUND");
  if (source.status === "CANCELLED")
    throw new Error("CANCELLED_SHEET_CANNOT_BE_REGENERATED");
  const requestKey = String(
    formData.get("regenerationRequestKey") ??
      `physical:${source.id}:${source.updatedAt.toISOString()}`,
  ).trim();
  const prior = await prisma.printSheet.findUnique({
    where: { regenerationRequestKey: requestKey },
    select: { id: true },
  });
  if (prior) {
    revalidatePath("/production/sheets");
    redirect(`/production/sheets/${prior.id}`);
  }
  const folder = path.dirname(
    (await resolvePrintSheetPath(source.storagePath)).resolved,
  );
  const existing = await readdir(folder).catch(() => [] as string[]);
  const filename = nextSheetFilename(
    `${source.sheetNumber ?? "sheet"}_regeneration`,
    existing,
  );
  const storagePath = path
    .relative(process.cwd(), path.join(folder, filename))
    .replaceAll(path.sep, "/");
  if (path.extname(source.storagePath).toLowerCase() === ".pdf") {
    await copyPrintSheetFile(source.storagePath, storagePath);
  } else {
    await writeFile(path.join(folder, filename), await createExactSizePdf(await readFile((await resolvePrintSheetPath(source.storagePath)).resolved), A4_SHEET), { flag: "wx" });
  }
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.printSheet.findUnique({
      where: { regenerationRequestKey: requestKey },
    });
    if (existing) return existing;
    const number = await nextPrintSheetNumber(tx);
    const next = await tx.printSheet.create({
      data: {
        sheetNumber: number,
        filename,
        storagePath,
        widthPx: source.widthPx,
        heightPx: source.heightPx,
        dpi: source.dpi,
        status: "READY_TO_PRINT",
        sourceSheetId: source.id,
        regenerationNumber: source.regenerationNumber + 1,
        regenerationRequestKey: requestKey,
        slots: {
          create: source.slots.map((slot) => ({
            slotNumber: slot.slotNumber,
            artworkVersionId: slot.artworkVersionId,
            orderId: slot.orderId,
            orderItemId: slot.orderItemId,
            productionAttemptId: undefined,
            assignmentState: "ACTIVE",
          })),
        },
      },
    });
    await tx.printSheetSlot.updateMany({
      where: { sheetId: source.id, assignmentState: "ACTIVE" },
      data: {
        assignmentState: "SUPERSEDED",
        releasedAt: new Date(),
        releaseReason: `Superseded by ${number}`,
        supersedingSheetId: next.id,
      },
    });
    for (const slot of source.slots) {
      if (slot.productionAttemptId) {
        await tx.printSheetSlot.update({
          where: {
            sheetId_slotNumber: {
              sheetId: next.id,
              slotNumber: slot.slotNumber,
            },
          },
          data: { productionAttemptId: slot.productionAttemptId },
        });
      }
    }
    const materialResult = await consumePhysicalPrintSheet(tx, {
      printSheetId: next.id,
      slots: source.slots.map((slot) => ({
        productVariantId: slot.orderItem?.productVariantId ?? "",
        orderId: slot.orderId,
        orderItemId: slot.orderItemId ?? undefined,
        productionAttemptId: slot.productionAttemptId ?? undefined,
      })),
    });
    await tx.printSheet.update({
      where: { id: source.id },
      data: { updatedAt: new Date(), regenerationNumber: { increment: 1 } },
    });
    await tx.printSheetEvent.create({
      data: {
        sheetId: next.id,
        eventType: "REGENERATED_PHYSICAL",
        relatedSheetId: source.id,
        note: materialResult.warnings.length
          ? `New physical sheet created. ${materialResult.warnings.join(" ")}`
          : "New physical sheet created and print-stage materials consumed once.",
      },
    });
    return next;
  });
  revalidatePath("/production/sheets");
  redirect(`/production/sheets/${created.id}`);
}

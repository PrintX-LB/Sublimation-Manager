"use server";
import { revalidatePath } from "next/cache";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { orderItemReference } from "@/lib/orders/item-reference";
import {
  A4_SHEET,
  SHEET_LAYOUT,
  nextSheetFilename,
  sheetLayout,
} from "@/lib/production-sheet";
import { getPrintSheetBuilderFolder } from "@/lib/order-storage";
import { cutMarksSvg, mirrorArtworkForSheet, normalizeCutMarkSettings } from "@/lib/production-sheet-render";
import { consumePhysicalPrintSheet } from "@/lib/production/recipes";
import { nextPrintSheetNumber } from "@/lib/print-sheet-library";

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
function stripSvg(lines: string[]) {
  return `<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.stripHeightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${SHEET_LAYOUT.widthPx - 4}" height="${SHEET_LAYOUT.stripHeightPx - 4}" fill="none" stroke="black" stroke-width="3"/><g fill="black" font-family="Arial" font-size="36">${lines.map((line, i) => `<text x="34" y="${65 + i * 50}">${escapeXml(line)}</text>`).join("")}</g></svg>`;
}

import { transitionOrder } from "@/lib/orders/service";

export async function generateManualSheetAction(formData: FormData) {
  const firstId = String(formData.get("slot1") ?? "");
  const secondId = String(formData.get("slot2") ?? "");
  const attemptIds = [
    String(formData.get("attempt1") ?? "").trim(),
    String(formData.get("attempt2") ?? "").trim(),
  ];
  const includeStrips = String(formData.get("includeStrips") ?? "on") === "on";
  const includeContour =
    String(formData.get("includeContour") ?? "off") === "on";
  const requestedCutMarkMode = String(formData.get("cutMarkMode") ?? "").trim();
  const cutMarkLengthMm = Number(formData.get("cutMarkLengthMm") ?? 8);
  const cutMarkOffsetMm = Number(formData.get("cutMarkOffsetMm") ?? 3);
  const cutMarkThicknessMm = Number(formData.get("cutMarkThicknessMm") ?? 0.3);
  if (!Number.isFinite(cutMarkLengthMm) || cutMarkLengthMm <= 0 || !Number.isFinite(cutMarkOffsetMm) || cutMarkOffsetMm < 0 || !Number.isFinite(cutMarkThicknessMm) || cutMarkThicknessMm <= 0)
    throw new Error("INVALID_CUT_MARK_SETTINGS");
  const requested = String(formData.get("filename") ?? "").trim();
  const generationRequestKey = String(
    formData.get("generationRequestKey") ?? "",
  ).trim();
  if (!firstId) throw new Error("SELECT_ARTWORK_VERSION");
  if (!generationRequestKey || generationRequestKey.length > 120) {
    throw new Error("GENERATION_REQUEST_KEY_REQUIRED");
  }
  const physicalRequestKey = `generation:${generationRequestKey}`;
  const prior = await prisma.printSheet.findUnique({
    where: { regenerationRequestKey: physicalRequestKey },
  });
  if (prior) {
    return {
      sheetId: prior.id,
      storagePath: prior.storagePath,
      updated: [] as string[],
      alreadyReady: [] as string[],
      skipped: [] as string[],
      warnings: [] as string[],
    };
  }
  const selected = await prisma.artworkVersion.findMany({
    where: { id: { in: [firstId, ...(secondId ? [secondId] : [])] } },
    include: {
      project: {
        include: {
          orderItem: {
            include: {
              order: { include: { customer: true } },
              productVariant: { include: { product: { include: { printTemplate: true } } } },
            },
          },
        },
      },
    },
  });
  const first = selected.find((version) => version.id === firstId);
  const second = secondId
    ? selected.find((version) => version.id === secondId)
    : undefined;
  if (!first || (secondId && !second))
    throw new Error("ARTWORK_VERSION_NOT_FOUND");
  const entries = second ? [first, second] : [first];
  const template = entries[0]?.project.orderItem.productVariant?.product.printTemplate;
  const cutMarks = normalizeCutMarkSettings({
    mode: (requestedCutMarkMode || (includeContour ? "FULL_OUTLINE" : "NONE")) as "NONE" | "CORNER_MARKS" | "FULL_OUTLINE",
    lengthMm: Number.isFinite(cutMarkLengthMm) ? cutMarkLengthMm : Number(template?.cutMarkLengthMm ?? 8),
    offsetMm: Number.isFinite(cutMarkOffsetMm) ? cutMarkOffsetMm : Number(template?.cutMarkOffsetMm ?? 3),
    thicknessMm: Number.isFinite(cutMarkThicknessMm) ? cutMarkThicknessMm : Number(template?.cutMarkThicknessMm ?? 0.3),
  });
  for (const version of entries) {
    const item = version.project.orderItem;
    if (item.order.status === "Cancelled")
      throw new Error("CANCELLED_ORDER_ARTWORK");
    if (
      version.widthPx !== SHEET_LAYOUT.designWidthPx ||
      version.heightPx !== SHEET_LAYOUT.designHeightPx
    )
      throw new Error("ARTWORK_DIMENSIONS_INVALID");
    // Ensure we are transition editing with valid saved/exported version files
    const pathRelative =
      (includeContour ? version.printReadyPath : version.editedPath) ||
      version.printReadyPath;
    if (!pathRelative || !pathRelative.trim()) {
      throw new Error("INVALID_ARTWORK_PATH");
    }
  }
  const buffers = await Promise.all(
    entries.map(async (version) => {
      const relative =
        (includeContour ? version.printReadyPath : version.editedPath) ||
        version.printReadyPath;
      const resolved = path.resolve(process.cwd(), relative);
      const uploadsRoot = path.resolve(process.cwd(), "uploads");
      if (!resolved.startsWith(`${uploadsRoot}${path.sep}`))
        throw new Error("INVALID_ARTWORK_PATH");
      const metadata = await sharp(resolved).metadata();
      if (
        metadata.width !== SHEET_LAYOUT.designWidthPx ||
        metadata.height !== SHEET_LAYOUT.designHeightPx
      )
        throw new Error("ARTWORK_DIMENSIONS_INVALID");
      return mirrorArtworkForSheet(await sharp(resolved).png().toBuffer());
    }),
  );
  if (!second)
    buffers.push(
      await sharp({
        create: {
          width: SHEET_LAYOUT.designWidthPx,
          height: SHEET_LAYOUT.designHeightPx,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        },
      })
        .png()
        .toBuffer(),
    );
  const printSheetsBase = await getPrintSheetBuilderFolder();

  // Choose save sub-folder structure
  const isMixed = Boolean(
    second &&
    first.project.orderItem.orderId !== second.project.orderItem.orderId,
  );
  const subPath = isMixed
    ? path.join("mixed-orders")
    : path.join(first.project.orderItem.order.orderNumber);

  const baseFolder = path.join(
    printSheetsBase,
    String(new Date().getFullYear()),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    subPath,
  );

  await mkdir(baseFolder, { recursive: true });
  const existing = await readdir(baseFolder).catch(() => [] as string[]);
  const defaultName = `A4_${first.project.orderItem.order.orderNumber}_${second?.project.orderItem.order.orderNumber ?? "single"}.png`;
  const filename = nextSheetFilename(requested || defaultName, existing);
  const layout = sheetLayout();
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [
    { input: buffers[0]!, left: 0, top: layout.design1Y },
    { input: buffers[1]!, left: 0, top: layout.design2Y },
  ];
  if (includeStrips)
    entries.forEach((version, index) => {
      const item = version.project.orderItem;
      const svg = stripSvg([
        orderItemReference(item.order.orderNumber, item.itemSequence),
        item.order.customer.fullName,
        `${item.productNameSnapshot} · ${item.productVariant?.name ?? "Standard"}`,
        `Transfer ${index + 1} of 2`,
        `Due: ${item.order.dueDate?.toLocaleDateString("en-GB") ?? "Not set"}`,
        `Artwork v${version.version}`,
      ]);
      overlays.push({
        input: Buffer.from(svg),
        left: 0,
        top: index === 0 ? layout.strip1Y : layout.strip2Y,
      });
  const marks = cutMarksSvg(cutMarks, entries.length, A4_SHEET.dpi);
  if (marks) overlays.push({ input: marks, left: 0, top: 0 });
    });
  const output = await sharp({
    create: {
      width: SHEET_LAYOUT.widthPx,
      height: SHEET_LAYOUT.heightPx,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(overlays)
    .withMetadata({ density: A4_SHEET.dpi })
    .png()
    .toBuffer();
  const absolute = path.join(baseFolder, filename);
  await writeFile(absolute, output, { flag: "wx" });
  const relative = path
    .relative(process.cwd(), absolute)
    .replaceAll(path.sep, "/");
  let transactionResult;
  try {
    transactionResult = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.printSheet.findUnique({
        where: { regenerationRequestKey: physicalRequestKey },
      });
      if (duplicate) {
        return {
          sheet: duplicate,
          materialWarnings: [] as string[],
          duplicate: true,
        };
      }
      const requestedAttempts = attemptIds.filter(Boolean);
      if (requestedAttempts.length) {
        for (const [index, attemptId] of requestedAttempts.entries()) {
          const attempt = await tx.productionAttempt.findUnique({
            where: { id: attemptId },
            include: {
              failedIncident: true,
              replacementIncident: true,
              printSheetSlots: true,
            },
          });
          if (
            !attempt ||
            attempt.status !== "Ready to Print" ||
            attempt.failedIncident ||
            attempt.replacementIncident ||
            attempt.printSheetSlots.some(
              (slot) => slot.assignmentState === "ACTIVE",
            )
          )
            throw new Error("STALE_QUEUE_ATTEMPT");
          if (attempt.orderItemId !== entries[index]?.project.orderItem.id)
            throw new Error("ATTEMPT_ARTWORK_MISMATCH");
        }
      }
      const sheetNumber = await nextPrintSheetNumber(tx);
      const created = await tx.printSheet.create({
        data: {
          sheetNumber,
          filename,
          storagePath: relative,
          widthPx: SHEET_LAYOUT.widthPx,
          heightPx: SHEET_LAYOUT.heightPx,
          dpi: A4_SHEET.dpi,
          status: "READY_TO_PRINT",
          cutMarkMode: cutMarks.mode,
          cutMarkLengthMm: cutMarks.lengthMm,
          cutMarkOffsetMm: cutMarks.offsetMm,
          cutMarkThicknessMm: cutMarks.thicknessMm,
          regenerationRequestKey: physicalRequestKey,
          slots: {
            create: entries.map((version, index) => ({
              slotNumber: index + 1,
              artworkVersionId: version.id,
              orderId: version.project.orderItem.orderId,
              orderItemId: version.project.orderItem.id,
              productionAttemptId: attemptIds[index] || undefined,
            })),
          },
        },
      });
      const materialResult = await consumePhysicalPrintSheet(tx, {
        printSheetId: created.id,
        slots: entries.map((version, index) => ({
          productVariantId: version.project.orderItem.productVariantId ?? "",
          orderId: version.project.orderItem.orderId,
          orderItemId: version.project.orderItem.id,
          productionAttemptId: attemptIds[index] || undefined,
        })),
      });
      await tx.printSheetEvent.create({
        data: {
          sheetId: created.id,
          eventType: "GENERATED",
          note: "A4 sheet generated from the Print Sheet Builder.",
        },
      });
      return {
        sheet: created,
        materialWarnings: materialResult.warnings,
        duplicate: false,
      };
    });
  } catch (error) {
    await unlink(absolute).catch(() => undefined);
    throw error;
  }
  if (transactionResult.duplicate) {
    await unlink(absolute).catch(() => undefined);
  }
  const sheet = transactionResult.sheet;

  // Transition unique orders to Ready to Print
  const uniqueOrders = Array.from(
    new Set(entries.map((v) => v.project.orderItem.orderId)),
  ).map(
    (id) =>
      entries.find((v) => v.project.orderItem.orderId === id)!.project.orderItem
        .order,
  );

  const updated: string[] = [];
  const alreadyReady: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [...transactionResult.materialWarnings];

  for (const order of uniqueOrders) {
    const currentStatus = order.status.toLowerCase();
    if (
      ["ready to print", "in production", "completed"].includes(currentStatus)
    ) {
      alreadyReady.push(order.orderNumber);
      continue;
    }
    // Only attempt transition if status allows it
    if (currentStatus !== "draft") {
      skipped.push(order.orderNumber);
      warnings.push(
        `${order.orderNumber} was not moved because its current status (${order.status}) does not allow this transition.`,
      );
      continue;
    }

    try {
      await transitionOrder(order.id, "Ready to print");
      updated.push(order.orderNumber);
    } catch (err) {
      skipped.push(order.orderNumber);
      warnings.push(
        `${order.orderNumber} failed to transition: ${err instanceof Error ? err.message : "validation failed"}`,
      );
    }
  }

  try {
    revalidatePath("/production/sheet-builder");
    revalidatePath("/production/sheets");
    revalidatePath(`/orders/${first.project.orderItem.orderId}`);
    if (second) revalidatePath(`/orders/${second.project.orderItem.orderId}`);
  } catch (revalError) {
    console.warn("revalidatePath skipped in test environment:", revalError);
  }

  return {
    sheetId: sheet.id,
    storagePath: sheet.storagePath,
    updated,
    alreadyReady,
    skipped,
    warnings,
  };
}

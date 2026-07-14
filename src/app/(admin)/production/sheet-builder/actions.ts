"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { A4_SHEET, SHEET_LAYOUT, nextSheetFilename, sheetLayout } from "@/lib/production-sheet";
import { getPrintSheetBuilderFolder } from "@/lib/order-storage";
import { mirrorArtworkForSheet } from "@/lib/production-sheet-render";
import { consumeRecipeStage } from "@/lib/production/recipes";
import { nextPrintSheetNumber } from "@/lib/print-sheet-library";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
function stripSvg(lines: string[]) { return `<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.stripHeightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${SHEET_LAYOUT.widthPx - 4}" height="${SHEET_LAYOUT.stripHeightPx - 4}" fill="none" stroke="black" stroke-width="3"/><g fill="black" font-family="Arial" font-size="36">${lines.map((line, i) => `<text x="34" y="${65 + i * 50}">${escapeXml(line)}</text>`).join("")}</g></svg>`; }

import { transitionOrder } from "@/lib/orders/service";

export async function generateManualSheetAction(formData: FormData) {
  const firstId = String(formData.get("slot1") ?? "");
  const secondId = String(formData.get("slot2") ?? "");
  const attemptIds = [String(formData.get("attempt1") ?? "").trim(), String(formData.get("attempt2") ?? "").trim()];
  const includeStrips = String(formData.get("includeStrips") ?? "on") === "on";
  const includeContour = String(formData.get("includeContour") ?? "off") === "on";
  const requested = String(formData.get("filename") ?? "").trim();
  if (!firstId) throw new Error("SELECT_ARTWORK_VERSION");
  const selected = await prisma.artworkVersion.findMany({ where: { id: { in: [firstId, ...(secondId ? [secondId] : [])] } }, include: { project: { include: { orderItem: { include: { order: { include: { customer: true } }, productVariant: true } } } } } });
  const first = selected.find((version) => version.id === firstId);
  const second = secondId ? selected.find((version) => version.id === secondId) : undefined;
  if (!first || (secondId && !second)) throw new Error("ARTWORK_VERSION_NOT_FOUND");
  const entries = second ? [first, second] : [first];
  for (const version of entries) {
    const item = version.project.orderItem;
    if (item.order.status === "Cancelled") throw new Error("CANCELLED_ORDER_ARTWORK");
    if (version.widthPx !== SHEET_LAYOUT.designWidthPx || version.heightPx !== SHEET_LAYOUT.designHeightPx) throw new Error("ARTWORK_DIMENSIONS_INVALID");
    // Ensure we are transition editing with valid saved/exported version files
    const pathRelative = (includeContour ? version.printReadyPath : version.editedPath) || version.printReadyPath;
    if (!pathRelative || !pathRelative.trim()) {
      throw new Error("INVALID_ARTWORK_PATH");
    }
  }
  const buffers = await Promise.all(entries.map(async (version) => {
    const relative = (includeContour ? version.printReadyPath : version.editedPath) || version.printReadyPath;
    const resolved = path.resolve(process.cwd(), relative);
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    if (!resolved.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error("INVALID_ARTWORK_PATH");
    const metadata = await sharp(resolved).metadata();
    if (metadata.width !== SHEET_LAYOUT.designWidthPx || metadata.height !== SHEET_LAYOUT.designHeightPx) throw new Error("ARTWORK_DIMENSIONS_INVALID");
    return mirrorArtworkForSheet(await sharp(resolved).png().toBuffer());
  }));
  if (!second) buffers.push(await sharp({ create: { width: SHEET_LAYOUT.designWidthPx, height: SHEET_LAYOUT.designHeightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer());
  const printSheetsBase = await getPrintSheetBuilderFolder();
  
  // Choose save sub-folder structure
  const isMixed = Boolean(second && first.project.orderItem.orderId !== second.project.orderItem.orderId);
  const subPath = isMixed
    ? path.join("mixed-orders")
    : path.join(first.project.orderItem.order.orderNumber);

  const baseFolder = path.join(
    printSheetsBase,
    String(new Date().getFullYear()),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    subPath
  );

  await mkdir(baseFolder, { recursive: true });
  const existing = await readdir(baseFolder).catch(() => [] as string[]);
  const defaultName = `A4_${first.project.orderItem.order.orderNumber}_${second?.project.orderItem.order.orderNumber ?? "single"}.png`;
  const filename = nextSheetFilename(requested || defaultName, existing);
  const layout = sheetLayout();
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [{ input: buffers[0]!, left: 0, top: layout.design1Y }, { input: buffers[1]!, left: 0, top: layout.design2Y }];
  if (includeStrips) entries.forEach((version, index) => { const item = version.project.orderItem; const svg = stripSvg([item.order.orderNumber, item.order.customer.fullName, `${item.productNameSnapshot} · ${item.productVariant?.name ?? "Standard"}`, `Transfer ${index + 1} of 2`, `Due: ${item.order.dueDate?.toLocaleDateString("en-GB") ?? "Not set"}`, `Artwork v${version.version}`]); overlays.push({ input: Buffer.from(svg), left: 0, top: index === 0 ? layout.strip1Y : layout.strip2Y }); });
  const output = await sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(overlays).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
  const absolute = path.join(baseFolder, filename);
  await writeFile(absolute, output, { flag: "wx" });
  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
  const sheet = await prisma.$transaction(async (tx) => {
    const requestedAttempts = attemptIds.filter(Boolean);
    if (requestedAttempts.length) {
      for (const [index, attemptId] of requestedAttempts.entries()) {
        const attempt = await tx.productionAttempt.findUnique({ where: { id: attemptId }, include: { failedIncident: true, replacementIncident: true, printSheetSlots: true } });
        if (!attempt || attempt.status !== "Ready to Print" || attempt.failedIncident || attempt.replacementIncident || attempt.printSheetSlots.some((slot) => slot.assignmentState === "ACTIVE")) throw new Error("STALE_QUEUE_ATTEMPT");
        if (attempt.orderItemId !== entries[index]?.project.orderItem.id) throw new Error("ATTEMPT_ARTWORK_MISMATCH");
      }
    }
    const sheetNumber = await nextPrintSheetNumber(tx);
    const created = await tx.printSheet.create({ data: { sheetNumber, filename, storagePath: relative, widthPx: SHEET_LAYOUT.widthPx, heightPx: SHEET_LAYOUT.heightPx, dpi: A4_SHEET.dpi, status: "READY_TO_PRINT", slots: { create: entries.map((version, index) => ({ slotNumber: index + 1, artworkVersionId: version.id, orderId: version.project.orderItem.orderId, orderItemId: version.project.orderItem.id, productionAttemptId: attemptIds[index] || undefined })) } } });
    await tx.printSheetEvent.create({ data: { sheetId: created.id, eventType: "GENERATED", note: "A4 sheet generated from the Print Sheet Builder." } });
    return created;
  });
  // Consume recipe materials once for this physical sheet. PRINT_MEDIA is
  // intentionally allocated once per generated A4 sheet, not once per slot;
  // the first slot receives the physical paper cost in V1.
  await prisma.$transaction(async (tx) => {
    const sameOrder = !second || first.project.orderItem.orderId === second.project.orderItem.orderId;
    for (const [index, version] of entries.entries()) {
      const item = version.project.orderItem;
      await consumeRecipeStage(tx, {
        productVariantId: item.productVariantId ?? "",
        stage: "PRINT_SHEET_GENERATION",
        multiplier: "1",
        orderId: item.orderId,
        orderItemId: item.id,
        printSheetId: sheet.id,
        idempotencyPrefix: `sheet:${sheet.id}:slot:${index + 1}`,
        excludeRoles: index > 0 ? ["PRINT_MEDIA"] : undefined,
        orderCostMultiplierByRole: sameOrder ? undefined : { PRINT_MEDIA: "0.5" },
      });
      if (index === 1 && !sameOrder && item.productVariantId) {
        const recipe = await tx.productionRecipe.findFirst({ where: { productVariantId: item.productVariantId, active: true }, include: { items: { include: { inventoryItem: true }, where: { consumptionStage: "PRINT_SHEET_GENERATION", materialRole: "PRINT_MEDIA", active: true } } } });
        let allocatedCost = new Prisma.Decimal(0);
        for (const line of recipe?.items ?? []) {
          const key = `sheet:${sheet.id}:slot:${index + 1}:media:${line.id}`;
          const existing = await tx.productionMaterialConsumption.findUnique({ where: { idempotencyKey: key } });
          if (existing) continue;
          const cost = line.quantity.mul(line.inventoryItem.unitCost).div(2);
          allocatedCost = allocatedCost.add(cost);
          await tx.productionMaterialConsumption.create({ data: { recipeItemId: line.id, orderId: item.orderId, orderItemId: item.id, printSheetId: sheet.id, consumptionStage: "PRINT_SHEET_GENERATION", quantity: line.quantity, unit: line.unit, unitCost: line.inventoryItem.unitCost, materialNameSnapshot: line.inventoryItem.name, materialRoleSnapshot: line.materialRole, idempotencyKey: key } });
        }
        if (!allocatedCost.isZero()) await tx.order.update({ where: { id: item.orderId }, data: { actualProductionCost: { increment: allocatedCost } } });
      }
    }
  });
  
  // Transition unique orders to Ready to Print
  const uniqueOrders = Array.from(new Set(entries.map((v) => v.project.orderItem.orderId)))
    .map((id) => entries.find((v) => v.project.orderItem.orderId === id)!.project.orderItem.order);

  const updated: string[] = [];
  const alreadyReady: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  for (const order of uniqueOrders) {
    const currentStatus = order.status.toLowerCase();
    if (["ready to print", "in production", "completed"].includes(currentStatus)) {
      alreadyReady.push(order.orderNumber);
      continue;
    }
    // Only attempt transition if status allows it
    if (currentStatus !== "draft") {
      skipped.push(order.orderNumber);
      warnings.push(`${order.orderNumber} was not moved because its current status (${order.status}) does not allow this transition.`);
      continue;
    }

    try {
      await transitionOrder(order.id, "Ready to print");
      updated.push(order.orderNumber);
    } catch (err) {
      skipped.push(order.orderNumber);
      warnings.push(`${order.orderNumber} failed to transition: ${err instanceof Error ? err.message : "validation failed"}`);
    }
  }

  try {
    revalidatePath("/production/sheet-builder");
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

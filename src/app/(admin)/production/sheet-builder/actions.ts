"use server";
import { revalidatePath } from "next/cache";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { A4_SHEET, SHEET_LAYOUT, nextSheetFilename, sheetLayout } from "@/lib/production-sheet";
import { getPrintSheetBuilderFolder } from "@/lib/order-storage";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
function stripSvg(lines: string[]) { return `<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.stripHeightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${SHEET_LAYOUT.widthPx - 4}" height="${SHEET_LAYOUT.stripHeightPx - 4}" fill="none" stroke="black" stroke-width="3"/><g fill="black" font-family="Arial" font-size="36">${lines.map((line, i) => `<text x="34" y="${65 + i * 50}">${escapeXml(line)}</text>`).join("")}</g></svg>`; }

import { transitionOrder } from "@/lib/orders/service";

export async function generateManualSheetAction(formData: FormData) {
  const firstId = String(formData.get("slot1") ?? "");
  const secondId = String(formData.get("slot2") ?? "");
  const includeStrips = String(formData.get("includeStrips") ?? "on") === "on";
  const includeContour = String(formData.get("includeContour") ?? "off") === "on";
  const requested = String(formData.get("filename") ?? "").trim();
  if (!firstId || !secondId) throw new Error("SELECT_TWO_ARTWORK_VERSIONS");
  const selected = await prisma.artworkVersion.findMany({ where: { id: { in: [firstId, secondId] } }, include: { project: { include: { orderItem: { include: { order: { include: { customer: true } }, productVariant: true } } } } } });
  const first = selected.find((version) => version.id === firstId);
  const second = selected.find((version) => version.id === secondId);
  if (!first || !second) throw new Error("ARTWORK_VERSION_NOT_FOUND");
  const entries = [first, second];
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
    return sharp(resolved).png().toBuffer();
  }));
  const printSheetsBase = await getPrintSheetBuilderFolder();
  
  // Choose save sub-folder structure
  const isMixed = first.project.orderItem.orderId !== second.project.orderItem.orderId;
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
  const defaultName = `A4_${first.project.orderItem.order.orderNumber}_${second.project.orderItem.order.orderNumber}.png`;
  const filename = nextSheetFilename(requested || defaultName, existing);
  const layout = sheetLayout();
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [{ input: buffers[0]!, left: 0, top: layout.design1Y }, { input: buffers[1]!, left: 0, top: layout.design2Y }];
  if (includeStrips) entries.forEach((version, index) => { const item = version.project.orderItem; const svg = stripSvg([item.order.orderNumber, item.order.customer.fullName, `${item.productNameSnapshot} · ${item.productVariant?.name ?? "Standard"}`, `Transfer ${index + 1} of 2`, `Due: ${item.order.dueDate?.toLocaleDateString("en-GB") ?? "Not set"}`, `Artwork v${version.version}`]); overlays.push({ input: Buffer.from(svg), left: 0, top: index === 0 ? layout.strip1Y : layout.strip2Y }); });
  const output = await sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(overlays).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
  const absolute = path.join(baseFolder, filename);
  await writeFile(absolute, output, { flag: "wx" });
  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");
  const sheet = await prisma.printSheet.create({ data: { filename, storagePath: relative, widthPx: SHEET_LAYOUT.widthPx, heightPx: SHEET_LAYOUT.heightPx, dpi: A4_SHEET.dpi, slots: { create: entries.map((version, index) => ({ slotNumber: index + 1, artworkVersionId: version.id, orderId: version.project.orderItem.orderId })) } } });
  
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
    revalidatePath(`/orders/${second.project.orderItem.orderId}`);
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

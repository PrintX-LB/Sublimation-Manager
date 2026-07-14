"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { A4_SHEET, SHEET_LAYOUT, nextSheetFilename, sheetLayout } from "@/lib/production-sheet";
import { getPrintSheetBuilderFolder } from "@/lib/order-storage";
import { mirrorArtworkForSheet } from "@/lib/production-sheet-render";
import { nextPrintSheetNumber } from "@/lib/print-sheet-library";

function text(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

function stripSvg(lines: string[]) {
  const lineHeight = 50;
  return `<svg width="${SHEET_LAYOUT.widthPx}" height="${SHEET_LAYOUT.stripHeightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="2" y="2" width="${SHEET_LAYOUT.widthPx - 4}" height="${SHEET_LAYOUT.stripHeightPx - 4}" fill="none" stroke="black" stroke-width="3"/><g fill="black" font-family="Arial, sans-serif" font-size="36">${lines.map((line, index) => `<text x="34" y="${65 + index * lineHeight}">${text(line)}</text>`).join("")}</g></svg>`;
}

export async function createA4PrintSheetAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const firstVersionId = String(formData.get("firstVersionId") ?? "");
  const secondVersionId = String(formData.get("secondVersionId") ?? "");
  const includeStrips = String(formData.get("includeStrips") ?? "on") === "on";
  const includeContour = String(formData.get("includeContour") ?? "off") === "on";
  const filenameInput = String(formData.get("filename") ?? "").trim();
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: { include: { productVariant: true, artworkProject: { include: { versions: true } } } } } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const versions = order.items.flatMap((item) => (item.artworkProject?.versions ?? []).map((version) => ({ version, item })));
  const selected = [firstVersionId, secondVersionId].map((id) => versions.find((entry) => entry.version.id === id)).filter((entry): entry is (typeof versions)[number] => Boolean(entry));
  if (selected.length !== 2) throw new Error("SELECT_TWO_ARTWORK_VERSIONS");
  const first = selected[0];
  const second = selected[1];
  if (!first || !second) throw new Error("SELECT_TWO_ARTWORK_VERSIONS");

  const printSheetsBase = await getPrintSheetBuilderFolder();
  const orderFolder = path.join(
    printSheetsBase,
    String(new Date().getFullYear()),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    order.orderNumber
  );

  const sourceRelative = first.version.printReadyPath || first.version.editedPath;
  const sourceResolved = path.resolve(process.cwd(), sourceRelative);
  if (path.basename(path.dirname(path.dirname(sourceResolved))) !== order.orderNumber) throw new Error("INVALID_ARTWORK_PATH");
  await mkdir(orderFolder, { recursive: true });
  const existing = await readdir(orderFolder).catch(() => [] as string[]);
  const filename = nextSheetFilename(filenameInput || `A4_${order.orderNumber}_mugs_1-2.png`, existing);
  const images = await Promise.all(selected.map(async ({ version }) => {
    const relative = (includeContour ? version.printReadyPath : version.editedPath) || version.printReadyPath || version.editedPath;
    const resolved = path.resolve(process.cwd(), relative);
    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    if (!resolved.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error("INVALID_ARTWORK_PATH");
    const metadata = await sharp(resolved).metadata();
    if (metadata.width !== SHEET_LAYOUT.designWidthPx || metadata.height !== SHEET_LAYOUT.designHeightPx) throw new Error("ARTWORK_DIMENSIONS_INVALID");
    return { input: await mirrorArtworkForSheet(await sharp(resolved).png().toBuffer()), width: SHEET_LAYOUT.designWidthPx, height: SHEET_LAYOUT.designHeightPx };
  }));
  const firstImage = images[0];
  const secondImage = images[1];
  if (!firstImage || !secondImage) throw new Error("SELECT_TWO_ARTWORK_VERSIONS");
  const layout = sheetLayout();
  const composites: Array<{ input: Buffer; left: number; top: number }> = [
    { input: firstImage.input, left: 0, top: layout.design1Y },
    { input: secondImage.input, left: 0, top: layout.design2Y },
  ];
  if (includeStrips) {
    const stripLines = selected.map(({ item }, index) => stripSvg([order.orderNumber, order.customer.fullName, `${item.productNameSnapshot} · ${item.productVariant?.name ?? "Standard"}`, `Transfer ${index + 1} of 2`, `Due: ${order.dueDate?.toLocaleDateString("en-GB") ?? "Not set"}`, `Artwork v${selected[index]?.version.version ?? "?"}`]));
    const stripOne = stripLines[0];
    const stripTwo = stripLines[1];
    if (!stripOne || !stripTwo) throw new Error("SELECT_TWO_ARTWORK_VERSIONS");
    composites.push({ input: Buffer.from(stripOne), left: 0, top: layout.strip1Y }, { input: Buffer.from(stripTwo), left: 0, top: layout.strip2Y });
  }
  const output = await sharp({ create: { width: SHEET_LAYOUT.widthPx, height: SHEET_LAYOUT.heightPx, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).withMetadata({ density: A4_SHEET.dpi }).png().toBuffer();
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(orderFolder, filename), output, { flag: "wx" }));
  const relative = path.relative(process.cwd(), path.join(orderFolder, filename)).replaceAll(path.sep, "/");
  const sheet = await prisma.$transaction(async (tx) => {
    const sheetNumber = await nextPrintSheetNumber(tx);
    const created = await tx.printSheet.create({ data: { sheetNumber, filename, storagePath: relative, widthPx: SHEET_LAYOUT.widthPx, heightPx: SHEET_LAYOUT.heightPx, dpi: A4_SHEET.dpi, status: "READY_TO_PRINT", slots: { create: selected.map(({ version, item }, index) => ({ slotNumber: index + 1, artworkVersionId: version.id, orderId, orderItemId: item.id })) } } });
    await tx.printSheetEvent.create({ data: { sheetId: created.id, eventType: "GENERATED", note: "A4 sheet generated from the order workspace." } });
    return created;
  });
  await prisma.orderFile.create({ data: { orderId, originalFilename: filename, storagePath: relative, mimeType: "image/png", sizeBytes: output.length } });
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}/sheet?created=${encodeURIComponent(sheet.id)}`);
}

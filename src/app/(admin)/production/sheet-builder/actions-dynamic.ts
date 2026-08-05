import path from "node:path";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { getPrintSheetBuilderFolder, resolveStoredArtworkPath } from "@/lib/order-storage";
import { createExactSizePdf } from "@/lib/print-pdf";
import { artworkPathForCutMarks } from "@/lib/production-sheet-render";
import { nextSheetFilename, A4_SHEET, A3_SHEET, calculateDynamicLayout } from "@/lib/production-sheet";
import { composeDynamicPrintSheet, normalizeCutMarkSettings, mirrorArtworkForSheet } from "@/lib/production-sheet-dynamic";

export async function generateDynamicSheetAction(formData: FormData) {
  const slotIds = formData.getAll("slot").map(String).filter(Boolean);
  if (formData.has("slot1")) slotIds.push(String(formData.get("slot1")));
  if (formData.has("slot2")) slotIds.push(String(formData.get("slot2")));
  if (formData.has("slot3")) slotIds.push(String(formData.get("slot3")));

  const attemptIds = formData.getAll("attempt").map(String).filter(Boolean);
  if (formData.has("attempt1")) attemptIds.push(String(formData.get("attempt1")));
  if (formData.has("attempt2")) attemptIds.push(String(formData.get("attempt2")));
  if (formData.has("attempt3")) attemptIds.push(String(formData.get("attempt3")));

  const paperSizeName = String(formData.get("paperSize") ?? "A4");
  const sheetDef = paperSizeName === "A3" ? A3_SHEET : A4_SHEET;

  const requested = String(formData.get("filename") ?? "").trim();
  const generationRequestKey = String(formData.get("generationRequestKey") ?? "").trim();

  if (slotIds.length === 0 && attemptIds.length === 0) throw new Error("NO_ARTWORK_PROVIDED");
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

  // Load versions directly if slotIds are provided, otherwise from attempts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entries: Array<any> = [];
  if (slotIds.length > 0) {
    entries = await prisma.artworkVersion.findMany({
      where: { id: { in: slotIds } },
      include: {
        project: {
          include: {
            template: true,
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
    // Order them by slotIds
    entries = slotIds.map((id) => entries.find((e) => e.id === id)).filter(Boolean);
  } else {
    const attempts = await prisma.productionAttempt.findMany({
      where: { id: { in: attemptIds } },
      include: {
        orderItem: {
          include: {
            order: { include: { customer: true } },
            productVariant: { include: { product: { include: { printTemplate: true } } } },
            artworkProject: {
              include: {
                template: true,
                versions: { orderBy: { version: "desc" } },
              },
            },
          },
        },
      },
    });
    const orderedAttempts = attemptIds.map((id) => attempts.find((a) => a.id === id));
    entries = orderedAttempts.map((attempt) => {
      if (!attempt) return null;
      const version = attempt.orderItem.artworkProject?.activeVersionId
        ? attempt.orderItem.artworkProject.versions.find((v) => v.id === attempt.orderItem.artworkProject?.activeVersionId)
        : attempt.orderItem.artworkProject?.versions[0];
      if (!version) return null;
      return {
        ...version,
        project: {
          ...attempt.orderItem.artworkProject,
          orderItem: attempt.orderItem,
        },
      };
    }).filter(Boolean);
  }

  if (entries.length === 0) throw new Error("ARTWORK_VERSION_NOT_FOUND");

  const template = entries[0]?.project?.template ?? entries[0]?.project?.orderItem.productVariant?.product.printTemplate;
  const cutMarks = normalizeCutMarkSettings({
    mode: (template?.cutMarkMode as "CORNER_MARKS" | "FULL_OUTLINE" | "NONE") ?? "CORNER_MARKS",
    lengthMm: template?.cutMarkLengthMm !== undefined ? Number(template.cutMarkLengthMm) : undefined,
    offsetMm: template?.cutMarkOffsetMm !== undefined ? Number(template.cutMarkOffsetMm) : undefined,
    thicknessMm: template?.cutMarkThicknessMm !== undefined ? Number(template.cutMarkThicknessMm) : undefined,
  });

  const templateWidthMm = template ? Number(template.widthMm) : (entries[0].widthPx * 25.4 / sheetDef.dpi);
  const templateHeightMm = template ? Number(template.heightMm) : (entries[0].heightPx * 25.4 / sheetDef.dpi);
  
  const layout = calculateDynamicLayout(templateWidthMm, templateHeightMm, sheetDef);
  if (layout.maxSlots === 0 || entries.length > layout.maxSlots) {
    throw new Error("ARTWORK_DIMENSIONS_INVALID");
  }

  const buffers = await Promise.all(
    entries.map(async (version) => {
      const relative = artworkPathForCutMarks(version, cutMarks.mode);
      const resolved = await resolveStoredArtworkPath(relative);
      if (!resolved) throw new Error("INVALID_ARTWORK_PATH");
      return await mirrorArtworkForSheet(await sharp(resolved).png().toBuffer());
    }),
  );

  const orderCopies = new Map<string, number>();
  const identifiers = entries.map((version) => {
    const orderNumber = version.project?.orderItem.order.orderNumber ?? "Unknown";
    const copyNumber = (orderCopies.get(orderNumber) ?? 0) + 1;
    orderCopies.set(orderNumber, copyNumber);
    return entries.filter((candidate) => candidate.project?.orderItem.order.orderNumber === orderNumber).length > 1
      ? `${orderNumber}-${copyNumber}`
      : orderNumber;
  });

  const previewPng = await composeDynamicPrintSheet(layout, buffers, identifiers, cutMarks);
  const output = await createExactSizePdf(previewPng, sheetDef);

  const printSheetsBase = await getPrintSheetBuilderFolder();
  const isMixed = entries.some((e) => e.project?.orderItem.orderId !== entries[0].project?.orderItem.orderId);
  const subPath = isMixed
    ? path.join("mixed-orders")
    : path.join(entries[0].project?.orderItem.order.orderNumber ?? "unknown");

  const baseFolder = path.join(
    printSheetsBase,
    String(new Date().getFullYear()),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    subPath,
  );

  await mkdir(baseFolder, { recursive: true });
  const existing = await readdir(baseFolder).catch(() => [] as string[]);
  const defaultName = `${paperSizeName}_${entries[0].project?.orderItem.order.orderNumber ?? "sheet"}.pdf`;
  const filename = nextSheetFilename(requested || defaultName, existing);
  
  const absolute = path.join(baseFolder, filename);
  await writeFile(absolute, output, { flag: "wx" });
  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, "/");

  const transactionResult = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.printSheet.findUnique({
      where: { regenerationRequestKey: physicalRequestKey },
    });
    if (duplicate) return { sheet: duplicate, duplicate: true };

    const sheetNumber = `PX${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;
    const created = await tx.printSheet.create({
      data: {
        sheetNumber,
        filename,
        storagePath: relative,
        widthPx: layout.sheetWidthPx,
        heightPx: layout.sheetHeightPx,
        dpi: layout.dpi,
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
            orderId: version.project?.orderItem.orderId ?? "",
            orderItemId: version.project?.orderItem.id ?? "",
          })),
        },
      },
      include: {
        slots: true,
      },
    });

    for (const [index] of entries.entries()) {
      if (!attemptIds[index]) continue;
      const slot = created.slots.find((s) => s.slotNumber === index + 1);
      if (slot) {
        await tx.productionAttempt.update({
          where: { id: attemptIds[index] },
          data: {
            orderItem: {
              update: {
                printSheetSlots: {
                  connect: { id: slot.id },
                },
              },
            },
          },
        });
      }
    }
    return { sheet: created, duplicate: false };
  });

  return {
    sheetId: transactionResult.sheet.id,
    storagePath: transactionResult.sheet.storagePath,
  };
}

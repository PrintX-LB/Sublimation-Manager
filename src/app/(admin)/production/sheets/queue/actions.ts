"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { generateManualSheetAction } from "../../sheet-builder/actions";
import { templateCompatibilityKey } from "@/lib/production/sheet-pairing";
import { A4_SHEET, SHEET_LAYOUT } from "@/lib/production-sheet";

export async function generateQueueSheetAction(formData: FormData) {
  const attempt1 = String(formData.get("attempt1") ?? "").trim();
  const attempt2 = String(formData.get("attempt2") ?? "").trim();
  if (!attempt1) throw new Error("SELECT_QUEUE_ATTEMPT");
  const ids = [attempt1, ...(attempt2 ? [attempt2] : [])];
  const attempts = await prisma.productionAttempt.findMany({
    where: { id: { in: ids } },
    include: {
      failedIncident: true,
      replacementIncident: true,
      printSheetSlots: { include: { sheet: { select: { status: true } } } },
      orderItem: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              dueDate: true,
              customer: { select: { fullName: true } },
            },
          },
          productVariant: {
            select: {
              name: true,
              product: {
                select: {
                  printTemplate: {
                    select: {
                      name: true,
                      widthMm: true,
                      heightMm: true,
                      dpi: true,
                    },
                  },
                },
              },
            },
          },
          artworkProject: {
            include: {
              template: {
                select: {
                  name: true,
                  widthMm: true,
                  heightMm: true,
                  dpi: true,
                },
              },
              versions: {
                orderBy: { version: "desc" },
                select: {
                  id: true,
                  printReadyPath: true,
                  editedPath: true,
                  widthPx: true,
                  heightPx: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const ordered = ids.map((id) =>
    attempts.find((attempt) => attempt.id === id),
  );
  if (!ordered[0] || (attempt2 && !ordered[1]))
    throw new Error("QUEUE_ATTEMPT_NOT_FOUND");
  for (const attempt of ordered) {
    if (
      !attempt ||
      attempt.status !== "Ready to Print" ||
      attempt.failedIncident ||
      attempt.replacementIncident ||
      attempt.orderItem.order.status === "Cancelled" ||
      attempt.printSheetSlots.some(
        (slot) =>
          slot.assignmentState === "ACTIVE" &&
          !["CANCELLED", "SUPERSEDED"].includes(slot.sheet.status),
      )
    )
      throw new Error("STALE_QUEUE_ATTEMPT");
    const version = attempt.orderItem.artworkProject?.activeVersionId
      ? attempt.orderItem.artworkProject.versions.find(
          (candidate) =>
            candidate.id === attempt.orderItem.artworkProject?.activeVersionId,
        )
      : attempt.orderItem.artworkProject?.versions[0];
    const template =
      attempt.orderItem.artworkProject?.template ??
      attempt.orderItem.productVariant?.product.printTemplate;
    if (!version)
      throw new Error("QUEUE_ARTWORK_INVALID");
    const templateWidthPx = template
      ? Math.round((Number(template.widthMm) * template.dpi) / 25.4)
      : version.widthPx;
    const templateHeightPx = template
      ? Math.round((Number(template.heightMm) * template.dpi) / 25.4)
      : version.heightPx;
    if (
      templateWidthPx < 1 ||
      templateHeightPx < 1 ||
      templateWidthPx > SHEET_LAYOUT.designWidthPx ||
      templateHeightPx > SHEET_LAYOUT.designHeightPx ||
      version.widthPx !== templateWidthPx ||
      version.heightPx !== templateHeightPx
    )
      throw new Error("QUEUE_ARTWORK_INVALID");
  }
  const keyFor = (attempt: NonNullable<(typeof ordered)[number]>) => {
    const template =
      attempt.orderItem.artworkProject?.template ??
      attempt.orderItem.productVariant?.product.printTemplate;
    if (!template) {
      const version = attempt.orderItem.artworkProject?.activeVersionId
        ? attempt.orderItem.artworkProject.versions.find(
            (candidate) => candidate.id === attempt.orderItem.artworkProject?.activeVersionId,
          )
        : attempt.orderItem.artworkProject?.versions[0];
      if (!version) throw new Error("QUEUE_ARTWORK_INVALID");
      return templateCompatibilityKey({
        name: "Legacy artwork",
        widthMm: (version.widthPx * 25.4) / A4_SHEET.dpi,
        heightMm: (version.heightPx * 25.4) / A4_SHEET.dpi,
        dpi: A4_SHEET.dpi,
      });
    }
    return templateCompatibilityKey({
      name: template.name,
      widthMm: Number(template.widthMm),
      heightMm: Number(template.heightMm),
      dpi: template.dpi,
    });
  };
  if (ordered[1] && keyFor(ordered[0]!) !== keyFor(ordered[1]))
    throw new Error("QUEUE_INCOMPATIBLE");
  const firstVersion = ordered[0]!.orderItem.artworkProject?.activeVersionId
    ? ordered[0]!.orderItem.artworkProject.versions.find(
        (candidate) =>
          candidate.id ===
          ordered[0]!.orderItem.artworkProject?.activeVersionId,
      )
    : ordered[0]!.orderItem.artworkProject?.versions[0];
  const secondVersion = ordered[1]
    ? ordered[1].orderItem.artworkProject?.activeVersionId
      ? ordered[1].orderItem.artworkProject.versions.find(
          (candidate) =>
            candidate.id ===
            ordered[1]!.orderItem.artworkProject?.activeVersionId,
        )
      : ordered[1].orderItem.artworkProject?.versions[0]
    : undefined;
  if (!firstVersion) throw new Error("QUEUE_ARTWORK_INVALID");
  const generation = new FormData();
  generation.set("slot1", firstVersion.id);
  if (secondVersion) generation.set("slot2", secondVersion.id);
  generation.set("attempt1", attempt1);
  if (attempt2) generation.set("attempt2", attempt2);
  generation.set("includeStrips", "on");
  generation.set("includeContour", "on");
  generation.set("cutMarkMode", "CORNER_MARKS");
  generation.set(
    "generationRequestKey",
    String(formData.get("generationRequestKey") ?? ""),
  );
  await generateManualSheetAction(generation);
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  if (String(formData.get("bulk") ?? "") === "1") return;
  redirect("/production/sheets?view=automatic&generated=1");
}

export async function generateAllQueueSheetsAction(formData: FormData) {
  const raw = String(formData.get("batch") ?? "");
  let batches: Array<{ attempt1: string; attempt2?: string }>;
  try {
    batches = JSON.parse(raw) as Array<{ attempt1: string; attempt2?: string }>;
  } catch {
    throw new Error("QUEUE_BATCH_INVALID");
  }
  if (!Array.isArray(batches) || batches.length === 0 || batches.length > 200) throw new Error("QUEUE_BATCH_INVALID");
  for (const batch of batches) {
    const request = new FormData();
    request.set("attempt1", batch.attempt1);
    if (batch.attempt2) request.set("attempt2", batch.attempt2);
    request.set("bulk", "1");
    request.set("generationRequestKey", `bulk-${String(formData.get("generationRequestKey") ?? "")}-${batch.attempt1}`);
    await generateQueueSheetAction(request);
  }
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  redirect("/production/sheets?view=automatic&generated=1");
}

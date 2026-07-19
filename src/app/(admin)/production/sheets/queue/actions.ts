"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { generateManualSheetAction } from "../../sheet-builder/actions";
import { templateCompatibilityKey } from "@/lib/production/sheet-pairing";
import { A4_SHEET, SHEET_LAYOUT, isThreeUpMugTemplate } from "@/lib/production-sheet";

function sourceAttemptId(reference: string) {
  return reference.split(":copy:", 1)[0] ?? reference;
}

export async function generateQueueSheetAction(formData: FormData) {
  const attempt1 = sourceAttemptId(String(formData.get("attempt1") ?? "").trim());
  const attempt2 = sourceAttemptId(String(formData.get("attempt2") ?? "").trim());
  const attempt3 = sourceAttemptId(String(formData.get("attempt3") ?? "").trim());
  if (!attempt1) throw new Error("SELECT_QUEUE_ATTEMPT");
  const ids = [attempt1, ...(attempt2 ? [attempt2] : []), ...(attempt3 ? [attempt3] : [])];

  const attempts = await prisma.productionAttempt.findMany({
    where: { id: { in: ids } },
    include: {
      failedIncident: true,
      replacementIncident: true,
      orderItem: {
        include: {
          printSheetSlots: { include: { sheet: { select: { status: true } } } },
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

  const firstAttemptObj = attempts.find((a) => a.id === attempt1);
  const template = firstAttemptObj?.orderItem.artworkProject?.template ??
                   firstAttemptObj?.orderItem.productVariant?.product.printTemplate;
  const isThreeUp = template
    ? isThreeUpMugTemplate(Number(template.widthMm), Number(template.heightMm))
    : false;
  const maxSlots = isThreeUp ? 3 : 2;

  const expandedAttemptIds: string[] = [];
  for (const id of ids) {
    const attemptObj = attempts.find((a) => a.id === id);
    if (!attemptObj) continue;
    const activeCopies = attemptObj.orderItem.printSheetSlots.filter(
      (slot) =>
        slot.assignmentState === "ACTIVE" &&
        !["CANCELLED", "SUPERSEDED"].includes(slot.sheet.status),
    ).length;
    const remaining = Math.max(1, attemptObj.orderItem.quantity - activeCopies);
    for (let i = 0; i < remaining; i++) {
      if (expandedAttemptIds.length < maxSlots) {
        expandedAttemptIds.push(id);
      }
    }
  }

  const requestedCopies = new Map<string, number>();
  for (const id of expandedAttemptIds) requestedCopies.set(id, (requestedCopies.get(id) ?? 0) + 1);

  const ordered = expandedAttemptIds.map((id) =>
    attempts.find((attempt) => attempt.id === id),
  );
  if (!ordered[0] || (expandedAttemptIds[1] && !ordered[1]))
    throw new Error("QUEUE_ATTEMPT_NOT_FOUND");

  const validated = new Set<string>();
  for (const attempt of ordered) {
    if (attempt && validated.has(attempt.id)) continue;
    if (attempt) validated.add(attempt.id);
    if (
      !attempt ||
      attempt.status !== "Ready to Print" ||
      attempt.failedIncident ||
      attempt.replacementIncident ||
      attempt.orderItem.order.status === "Cancelled"
    )
      throw new Error("STALE_QUEUE_ATTEMPT");
    if (attempt) {
      const activeCopies = attempt.orderItem.printSheetSlots.filter(
        (slot) =>
          slot.assignmentState === "ACTIVE" &&
          !["CANCELLED", "SUPERSEDED"].includes(slot.sheet.status),
      ).length;
      if (activeCopies + (requestedCopies.get(attempt.id) ?? 0) > Math.max(1, attempt.orderItem.quantity)) {
        throw new Error("STALE_QUEUE_ATTEMPT");
      }
    }
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
  for (const candidate of ordered.slice(1)) {
    if (candidate && keyFor(ordered[0]!) !== keyFor(candidate)) throw new Error("QUEUE_INCOMPATIBLE");
  }
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
  const thirdVersion = ordered[2]
    ? ordered[2].orderItem.artworkProject?.activeVersionId
      ? ordered[2].orderItem.artworkProject.versions.find((candidate) => candidate.id === ordered[2]!.orderItem.artworkProject?.activeVersionId)
      : ordered[2].orderItem.artworkProject?.versions[0]
    : undefined;
  if (!firstVersion) throw new Error("QUEUE_ARTWORK_INVALID");
  const generation = new FormData();
  generation.set("slot1", firstVersion.id);
  if (secondVersion) generation.set("slot2", secondVersion.id);
  if (thirdVersion) generation.set("slot3", thirdVersion.id);
  generation.set("attempt1", expandedAttemptIds[0] || "");
  if (expandedAttemptIds[1]) generation.set("attempt2", expandedAttemptIds[1]);
  if (expandedAttemptIds[2]) generation.set("attempt3", expandedAttemptIds[2]);
  generation.set("includeStrips", thirdVersion ? "off" : "on");
  generation.set("includeContour", "off");
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
  let batches: Array<{ attempt1: string; attempt2?: string; attempt3?: string }>;
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
    if (batch.attempt3) request.set("attempt3", batch.attempt3);
    request.set("bulk", "1");
    request.set("generationRequestKey", `bulk-${String(formData.get("generationRequestKey") ?? "")}-${batch.attempt1}`);
    await generateQueueSheetAction(request);
  }
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  redirect("/production/sheets?view=automatic&generated=1");
}
